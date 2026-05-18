import genAI from "../configs/googleAI.js";
import OpenAI from "openai";
import { Groq } from "groq-sdk";

// Initialize additional providers
const openRouter = process.env.OPENROUTER_API_KEY ? new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": "http://localhost:3000", 
        "X-Title": "AI Site Builder",
    }
}) : null;

const groq = process.env.GROQ_API_KEY ? new Groq({
    apiKey: process.env.GROQ_API_KEY,
}) : null;

type AIProvider = 'google' | 'openrouter' | 'groq';

interface ModelConfig {
    name: string;
    provider: AIProvider;
}

const AI_MODELS: ModelConfig[] = [
    
    { name: "gemini-2.5-flash", provider: 'google' },          
    { name: "gemini-2.5-flash-lite", provider: 'google' },      
    { name: "gemini-2.5-pro", provider: 'google' },             
    { name: "gemini-3.1-flash-lite", provider: 'google' },      
    { name: "gemini-flash-latest", provider: 'google' },        

    
    { name: "openrouter/auto", provider: 'openrouter' },
    { name: "google/gemini-2.5-flash", provider: 'openrouter' },
    { name: "google/gemini-2.5-pro", provider: 'openrouter' },
    { name: "google/gemini-3.1-flash-lite", provider: 'openrouter' },
    { name: "meta-llama/llama-3.3-70b-instruct", provider: 'openrouter' },

    
    { name: "llama-3.3-70b-versatile", provider: 'groq' },
    { name: "llama-3.1-8b-instant", provider: 'groq' },
];

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeoutMs + 10000);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
};

export const isFallbackableModelError = (error: any) => {
    const message = (error?.message || "").toLowerCase();
    const status = error?.status || error?.response?.status;
    
    console.error("AI Error details:", {
        message: error?.message,
        status: status,
    });

    if (
        message.includes("api_key") || 
        message.includes("unauthorized") || 
        message.includes("invalid") ||
        message.includes("permission") ||
        status === 401 ||
        status === 403
    ) {
        return false;
    }

    return (
        message.includes("rate limit") ||
        message.includes("quota") ||
        message.includes("429") ||
        message.includes("500") ||
        message.includes("503") ||
        message.includes("busy") ||
        message.includes("timeout") ||
        message.includes("deadline") ||
        message.includes("not found")
    );
};

export const createChatCompletionWithFallback = async (
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    timeoutMs: number
) => {
    let lastError: any;

    for (const modelConfig of AI_MODELS) {
        try {
            console.log(`Trying AI Provider: ${modelConfig.provider}, Model: ${modelConfig.name}`);
            let text = "";

            if (modelConfig.provider === 'google') {
                const systemMessage = messages.find(m => m.role === "system")?.content || "";
                const history = messages
                    .filter(m => m.role !== "system")
                    .map(m => ({
                        role: m.role === "assistant" ? "model" : "user",
                        parts: [{ text: m.content }]
                    }));
                const userPrompt = history.pop()?.parts[0].text || "";

                const model = genAI.getGenerativeModel({ 
                    model: modelConfig.name,
                    systemInstruction: systemMessage ? { role: "system", parts: [{ text: systemMessage }] } : undefined
                });

                const result = await withTimeout(
                    model.generateContent({
                        contents: [...history, { role: "user", parts: [{ text: userPrompt }] }]
                    }),
                    timeoutMs,
                    `Google AI timeout for ${modelConfig.name}`
                );
                text = (await result.response).text();

            } else if (modelConfig.provider === 'openrouter') {
                if (!openRouter) {
                    console.warn("OpenRouter API Key is missing. Skipping...");
                    continue;
                }
                const response = await withTimeout(
                    openRouter.chat.completions.create({
                        model: modelConfig.name,
                        messages: messages.map(m => ({ role: m.role, content: m.content })),
                    }),
                    timeoutMs,
                    `OpenRouter timeout for ${modelConfig.name}`
                );
                text = response.choices[0]?.message?.content || "";

            } else if (modelConfig.provider === 'groq') {
                if (!groq) {
                    console.warn("Groq API Key is missing. Skipping...");
                    continue;
                }
                const response = await withTimeout(
                    groq.chat.completions.create({
                        model: modelConfig.name,
                        messages: messages.map(m => ({ role: m.role, content: m.content })),
                    }),
                    timeoutMs,
                    `Groq timeout for ${modelConfig.name}`
                );
                text = response.choices[0]?.message?.content || "";
            }

            if (!text) {
                console.warn(`Model ${modelConfig.name} returned empty text. Trying next...`);
                continue;
            }

            return { choices: [{ message: { content: text } }] };

        } catch (error: any) {
            lastError = error;
            console.error(`Error with ${modelConfig.provider}/${modelConfig.name}:`, error.message);
            
            // If it's a 404, we should also try to fallback because model names might differ between regions/versions
            if (isFallbackableModelError(error) || error?.status === 404) {
                console.warn(`Falling back from ${modelConfig.name} due to error: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            throw error;
        }
    }
    throw lastError || new Error("All AI providers and models failed to generate content.");
};

export const sanitizeGeneratedCode = (code: string) =>
    code.replace(/```[a-z]*\n?/gi, "").replace(/```$/g, "").trim();
