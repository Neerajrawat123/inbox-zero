import prisma from "@/utils/prisma";
import { extractEmailAddress } from "@/utils/email";

export async function findSenderByEmail({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const extractedEmail = extractEmailAddress(email);
  if (!extractedEmail) return null;

  const newsletter = await prisma.newsletter.findFirst({
    where: {
      userId,
      email: { contains: extractedEmail },
    },
  });

  if (!newsletter) return null;
  if (
    newsletter.email !== extractedEmail ||
    newsletter.email.endsWith(`<${extractedEmail}>`)
  )
    return null;

  return newsletter;
}
