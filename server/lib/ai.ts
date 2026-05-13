import genAI from "../configs/googleAI.js";

const AI_MODELS = [
    "gemini-flash-latest",
    "gemini-2.0-flash",
    "gemini-pro-latest"
];

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeoutMs + 10000); // Increased buffer to 10s
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
        stack: error?.stack
    });

    // Do NOT fallback on authentication or permission errors
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
    
    // Extract system message
    const systemMessage = messages.find(m => m.role === "system")?.content || "";
    
    // Filter out system messages and format history
    const history = messages
        .filter(m => m.role !== "system")
        .map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
        }));

    if (history.length === 0) {
        throw new Error("No user messages provided for AI completion");
    }

    // The last message is the current user prompt
    const userPrompt = history.pop()?.parts[0].text || "";

    for (const modelName of AI_MODELS) {
        try {
            console.log(`Trying AI Model: ${modelName}`);
            
            // In some versions of the SDK, systemInstruction is passed in the model config
            // We use a more compatible approach by prepending it to the prompt if needed,
            // but first we try the official way.
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                systemInstruction: systemMessage ? { role: "system", parts: [{ text: systemMessage }] } : undefined
            });

            // Use generateContent instead of startChat for simpler requests
            const request = {
                contents: [
                    ...history,
                    { role: "user", parts: [{ text: userPrompt }] }
                ]
            };

            const result = await withTimeout(
                model.generateContent(request),
                timeoutMs,
                `Model request timed out for ${modelName}`
            );

            const response = await result.response;
            const text = response.text();

            if (!text) {
                throw new Error(`Empty response from model ${modelName}`);
            }

            return {
                choices: [
                    {
                        message: {
                            content: text
                        }
                    }
                ]
            };
        } catch (error: any) {
            lastError = error;
            
            // Log the specific error for debugging
            console.error(`Error with model ${modelName}:`, error.message);

            if (isFallbackableModelError(error)) {
                console.warn(`Fallback triggered for model ${modelName}:`, error?.message || error);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            throw error;
        }
    }
    throw lastError || new Error("All AI models failed");
};

export const sanitizeGeneratedCode = (code: string) =>
    code.replace(/```[a-z]*\n?/gi, "").replace(/```$/g, "").trim();
