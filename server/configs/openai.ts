import OpenAI from 'openai';

const apiKey = process.env.AI_API_KEY?.trim();

if (!apiKey) {
  throw new Error("Missing AI_API_KEY in server/.env");
}

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey,
});

export default openai;