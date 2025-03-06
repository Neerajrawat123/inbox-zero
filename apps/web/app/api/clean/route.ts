import { z } from "zod";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { publishToQstash } from "@/utils/upstash";
import { getThreadMessages } from "@/utils/gmail/thread";
import { getGmailClient } from "@/utils/gmail/client";
import type { CleanGmailBody } from "@/app/api/clean/gmail/route";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { aiClean } from "@/utils/ai/clean/ai-clean";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { getAiUserWithTokens } from "@/utils/user/get";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { isCalendarEventInPast } from "@/utils/parse/calender-event";
import { GmailLabel } from "@/utils/gmail/label";
import { isNewsletterSender } from "@/utils/ai/group/find-newsletters";
import { isReceipt } from "@/utils/ai/group/find-receipts";

const logger = createScopedLogger("api/clean");

const cleanThreadBody = z.object({
  userId: z.string(),
  threadId: z.string(),
  archiveLabelId: z.string(),
  processedLabelId: z.string(),
});
export type CleanThreadBody = z.infer<typeof cleanThreadBody>;

async function cleanThread({
  userId,
  threadId,
  archiveLabelId,
  processedLabelId,
}: CleanThreadBody) {
  // 1. get thread with messages
  // 2. process thread with ai / fixed logic
  // 3. add to gmail action queue

  const user = await getAiUserWithTokens({ id: userId });

  if (!user) throw new SafeError("User not found", 404);

  if (!user.tokens) throw new SafeError("No Gmail account found", 404);
  if (!user.tokens.access_token || !user.tokens.refresh_token)
    throw new SafeError("No Gmail account found", 404);

  const gmail = getGmailClient({
    accessToken: user.tokens.access_token,
    refreshToken: user.tokens.refresh_token,
  });

  const messages = await getThreadMessages(threadId, gmail);

  logger.info("Fetched messages", {
    userId,
    threadId,
    messageCount: messages.length,
  });

  if (!messages.length) return;

  const publish = getPublish({
    userId,
    threadId,
    archiveLabelId,
    processedLabelId,
  });

  if (messages.length === 1) {
    const message = messages[0];

    // calendar invite
    const isPastCalendarEvent = isCalendarEventInPast(message);
    if (isPastCalendarEvent) {
      await publish({ archive: true });
      return;
    }

    // unsubscribe link
    const unsubscribeLink =
      findUnsubscribeLink(message.textHtml) ||
      message.headers["list-unsubscribe"];
    if (unsubscribeLink) {
      await publish({ archive: true });
      return;
    }

    // receipt
    if (isReceipt(message)) {
      await publish({ archive: false });
      return;
    }

    // newsletter
    if (isNewsletterSender(message.headers.from)) {
      await publish({ archive: true });
      return;
    }

    // promotion/social/update
    if (
      message.labelIds?.includes(GmailLabel.SOCIAL) ||
      message.labelIds?.includes(GmailLabel.PROMOTIONS) ||
      message.labelIds?.includes(GmailLabel.UPDATES) ||
      message.labelIds?.includes(GmailLabel.FORUMS)
    ) {
      await publish({ archive: true });
      return;
    }
  }

  const aiResult = await aiClean({
    user,
    messages: messages.map((m) => getEmailForLLM(m)),
  });

  await publish({ archive: aiResult.archive });
}

function getPublish({
  userId,
  threadId,
  archiveLabelId,
  processedLabelId,
}: {
  userId: string;
  threadId: string;
  archiveLabelId: string;
  processedLabelId: string;
}) {
  return async ({ archive }: { archive: boolean }) => {
    // max rate:
    // https://developers.google.com/gmail/api/reference/quota
    // 15,000 quota units per user per minute
    // modify thread = 10 units
    // => 25 modify threads per second
    // => assume user has other actions too => max 12 per second
    const actionCount = 2; // 1. remove "inbox" label. 2. label "clean". increase if we're doing multiple labellings
    const maxRatePerSecond = Math.ceil(12 / actionCount);

    const cleanGmailBody: CleanGmailBody = {
      userId,
      threadId,
      archive,
      // label: aiResult.label,
      archiveLabelId,
      processedLabelId,
    };

    logger.info("Publishing to Qstash", {
      userId,
      threadId,
      maxRatePerSecond,
    });

    await publishToQstash("/api/clean/gmail", cleanGmailBody, {
      key: `gmail-action-${userId}`,
      ratePerSecond: maxRatePerSecond,
    });

    logger.info("Published to Qstash", { userId, threadId });
  };
}

// TODO: security
export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = cleanThreadBody.parse(json);
  console.log("🚀 ~ POST ~ body:", body);

  await cleanThread(body);

  return NextResponse.json({ success: true });
});
