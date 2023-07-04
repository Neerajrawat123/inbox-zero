import { z } from "zod";
import { NextResponse } from "next/server";
import { Configuration, OpenAIApi } from "openai-edge";

const classifyThreadBody = z.object({ message: z.string() });
export type ClassifyThreadBody = z.infer<typeof classifyThreadBody>;
export type ClassifyThreadResponse = Awaited<ReturnType<typeof classify>>;

const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

export const runtime = "edge";

async function classify(body: ClassifyThreadBody) {
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-16k",
    messages: [{
      role: 'system',
      content: 'The following is a conversation with an AI assistant that helps classify emails into different categories. The user will send email messages and it is your job to return the category of the email. Categories to use are: "spam", "promotions", "social", "requires_response", "receipts", "newsletter", "app_update"',
    }, {
      role: 'user',
      content: `Please classify this email using a one-word response:\n\n###\n\n${body.message}`,
    }],
  });
  const json = await response.json();
  const message: string = json?.choices?.[0]?.message?.content;

  return { message };
}

export async function POST(request: Request) {
  const json = await request.json();
  const body = classifyThreadBody.parse(json);
  const res = await classify(body);

  return NextResponse.json(res);
}
