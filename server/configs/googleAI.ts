import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim().replace(/^['"]|['"]$/g, '');

if (!apiKey) {
  // We don't throw here to allow the server to start even if the key is missing initially, 
  // but we should warn the user.
  console.warn("Warning: GOOGLE_GENERATIVE_AI_API_KEY is missing in .env");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

export default genAI;
