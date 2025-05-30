import type { z } from "zod";
import {
  APICallError,
  type CoreMessage,
  type CoreTool,
  type JSONValue,
  generateObject,
  generateText,
  RetryError,
  streamText,
} from "ai";
import { env } from "@/env";
import { saveAiUsage } from "@/utils/usage";
import { Provider } from "@/utils/llms/config";
import type { UserAIFields } from "@/utils/llms/types";
import { addUserErrorMessage, ErrorType } from "@/utils/error-messages";
import {
  isAnthropicInsufficientBalanceError,
  isAWSThrottlingError,
  isIncorrectOpenAIAPIKeyError,
  isInvalidOpenAIModelError,
  isOpenAIAPIKeyDeactivatedError,
  isOpenAIRetryError,
  isServiceUnavailableError,
} from "@/utils/error";
import { sleep } from "@/utils/sleep";
import { getModel } from "@/utils/llms/model";

function getCommonOptions(provider: string, useEconomyModel?: boolean) {
  const isOpenRouter = provider === Provider.OPENROUTER;

  const options: {
    experimental_telemetry: { isEnabled: boolean };
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, JSONValue>>;
  } = { experimental_telemetry: { isEnabled: true } };

  if (isOpenRouter) {
    options.headers = {
      "HTTP-Referer": "https://www.getinboxzero.com",
      "X-Title": "Inbox Zero",
    };

    // TODO: this needs cleaning up
    if (!useEconomyModel) {
      options.providerOptions = {
        openrouter: {
          models: [
            "anthropic/claude-3.7-sonnet",
            // "google/gemini-2.0-flash-001",
          ],
          provider: {
            order: [
              "Amazon Bedrock",
              "Anthropic",
              // "Google AI Studio",
            ],
          },
        },
      };
    }
  }

  return options;
}

export async function chatCompletion({
  userAi,
  useEconomyModel,
  prompt,
  system,
  userEmail,
  usageLabel,
}: {
  userAi: UserAIFields;
  useEconomyModel?: boolean;
  prompt: string;
  system?: string;
  userEmail: string;
  usageLabel: string;
}) {
  try {
    const { provider, model, llmModel } = getModel(userAi, useEconomyModel);

    const result = await generateText({
      model: llmModel,
      prompt,
      system,
      ...getCommonOptions(provider, useEconomyModel),
    });

    if (result.usage) {
      await saveAiUsage({
        email: userEmail,
        usage: result.usage,
        provider,
        model,
        label: usageLabel,
      });
    }

    return result;
  } catch (error) {
    await handleError(error, userEmail);
    throw error;
  }
}

type ChatCompletionObjectArgs<T> = {
  userAi: UserAIFields;
  useEconomyModel?: boolean;
  schema: z.Schema<T>;
  userEmail: string;
  usageLabel: string;
} & (
  | {
      system?: string;
      prompt: string;
      messages?: never;
    }
  | {
      system?: never;
      prompt?: never;
      messages: CoreMessage[];
    }
);

export async function chatCompletionObject<T>(
  options: ChatCompletionObjectArgs<T>,
) {
  return withBackupModel(chatCompletionObjectInternal, options);
}

async function chatCompletionObjectInternal<T>({
  userAi,
  useEconomyModel,
  system,
  prompt,
  messages,
  schema,
  userEmail,
  usageLabel,
}: ChatCompletionObjectArgs<T>) {
  try {
    const { provider, model, llmModel } = getModel(userAi, useEconomyModel);

    const result = await generateObject({
      model: llmModel,
      system,
      prompt,
      messages,
      schema,
      ...getCommonOptions(provider, useEconomyModel),
    });

    if (result.usage) {
      await saveAiUsage({
        email: userEmail,
        usage: result.usage,
        provider,
        model,
        label: usageLabel,
      });
    }

    return result;
  } catch (error) {
    await handleError(error, userEmail);
    throw error;
  }
}

export async function chatCompletionStream({
  userAi,
  useEconomyModel,
  prompt,
  system,
  userEmail,
  usageLabel: label,
  onFinish,
}: {
  userAi: UserAIFields;
  useEconomyModel?: boolean;
  prompt: string;
  system?: string;
  userEmail: string;
  usageLabel: string;
  onFinish?: (text: string) => Promise<void>;
}) {
  const { provider, model, llmModel } = getModel(userAi, useEconomyModel);

  const result = streamText({
    model: llmModel,
    prompt,
    system,
    ...getCommonOptions(provider, useEconomyModel),
    onFinish: async ({ usage, text }) => {
      await saveAiUsage({
        email: userEmail,
        provider,
        model,
        usage,
        label,
      });

      if (onFinish) await onFinish(text);
    },
  });

  return result;
}

type ChatCompletionToolsArgs = {
  userAi: UserAIFields;
  useEconomyModel?: boolean;
  tools: Record<string, CoreTool>;
  maxSteps?: number;
  label: string;
  userEmail: string;
} & (
  | {
      system?: string;
      prompt: string;
      messages?: never;
    }
  | {
      system?: never;
      prompt?: never;
      messages: CoreMessage[];
    }
);

export async function chatCompletionTools(options: ChatCompletionToolsArgs) {
  return withBackupModel(chatCompletionToolsInternal, options);
}

async function chatCompletionToolsInternal({
  userAi,
  useEconomyModel,
  system,
  prompt,
  messages,
  tools,
  maxSteps,
  label,
  userEmail,
}: ChatCompletionToolsArgs) {
  try {
    const { provider, model, llmModel } = getModel(userAi, useEconomyModel);

    const result = await generateText({
      model: llmModel,
      tools,
      toolChoice: "required",
      system,
      prompt,
      messages,
      maxSteps,
      ...getCommonOptions(provider, useEconomyModel),
    });

    if (result.usage) {
      await saveAiUsage({
        email: userEmail,
        usage: result.usage,
        provider,
        model,
        label,
      });
    }

    return result;
  } catch (error) {
    await handleError(error, userEmail);
    throw error;
  }
}

// not in use atm
async function streamCompletionTools({
  userAi,
  useEconomyModel,
  prompt,
  system,
  tools,
  maxSteps,
  userEmail,
  label,
  onFinish,
}: {
  userAi: UserAIFields;
  useEconomyModel?: boolean;
  prompt: string;
  system?: string;
  tools: Record<string, CoreTool>;
  maxSteps?: number;
  userEmail: string;
  label: string;
  onFinish?: (text: string) => Promise<void>;
}) {
  const { provider, model, llmModel } = getModel(userAi, useEconomyModel);

  const result = await streamText({
    model: llmModel,
    tools,
    toolChoice: "required",
    prompt,
    system,
    maxSteps,
    ...getCommonOptions(provider, useEconomyModel),
    onFinish: async ({ usage, text }) => {
      await saveAiUsage({
        email: userEmail,
        provider,
        model,
        usage,
        label,
      });

      if (onFinish) await onFinish(text);
    },
  });

  return result;
}

// NOTE: Think we can just switch this out for p-retry that we already use in the project
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    retryIf,
    maxRetries,
    delayMs,
  }: {
    retryIf: (error: unknown) => boolean;
    maxRetries: number;
    delayMs: number;
  },
): Promise<T> {
  let attempts = 0;
  let lastError: unknown;

  while (attempts < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempts++;
      lastError = error;

      if (retryIf(error)) {
        console.warn(`Attempt ${attempts}: Operation failed. Retrying...`);
        if (attempts < maxRetries) {
          await sleep(delayMs);
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError;
}

// Helps when service is unavailable / throttled / rate limited
async function withBackupModel<T, Args extends { userAi: UserAIFields }>(
  fn: (args: Args) => Promise<T>,
  args: Args,
): Promise<T> {
  try {
    return await fn(args);
  } catch (error) {
    if (
      env.USE_BACKUP_MODEL &&
      (isServiceUnavailableError(error) || isAWSThrottlingError(error))
    ) {
      return await fn({
        ...args,
        userAi: {
          aiProvider: Provider.ANTHROPIC,
          aiModel: env.NEXT_PUBLIC_BEDROCK_ANTHROPIC_BACKUP_MODEL,
          aiApiKey: args.userAi.aiApiKey,
        },
      });
    }
    throw error;
  }
}

async function handleError(error: unknown, userEmail: string) {
  if (APICallError.isInstance(error)) {
    if (isIncorrectOpenAIAPIKeyError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.INCORRECT_OPENAI_API_KEY,
        error.message,
      );
    }

    if (isInvalidOpenAIModelError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.INVALID_OPENAI_MODEL,
        error.message,
      );
    }

    if (isOpenAIAPIKeyDeactivatedError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.OPENAI_API_KEY_DEACTIVATED,
        error.message,
      );
    }

    if (RetryError.isInstance(error) && isOpenAIRetryError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.OPENAI_RETRY_ERROR,
        error.message,
      );
    }

    if (isAnthropicInsufficientBalanceError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.ANTHROPIC_INSUFFICIENT_BALANCE,
        error.message,
      );
    }
  }
}
