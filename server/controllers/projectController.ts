import { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { createChatCompletionWithFallback, isFallbackableModelError, sanitizeGeneratedCode } from "../lib/ai.js";
import { waitUntil } from "@vercel/functions";

export const makeRevision = async (req: Request, res: Response) => {
    const userId = req.userId
    try {
        const { projectId } = req.params
        const normalizedProjectId = Array.isArray(projectId) ? projectId[0] : projectId
        const { message } = req.body
        const user = await prisma.user.findUnique({
            where: {
                id: userId
            }
        })
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.credits < 5) {
            return res.status(403).json({ message: "Add more credits to create more revisions" });
        }

        if (!message || message.trim() === "") {
            return res.status(400).json({ message: "Please provide a valid prompt" });
        }

        const currentProject = await prisma.websiteProject.findFirst({
            where: {
                id: normalizedProjectId,
                userId: userId
            },
            include: {
                versions: true
            }
        })

        if (!currentProject) {
            return res.status(404).json({ message: "Project not found" });
        }

        await prisma.conversation.create({
            data: {
                role: "user",
                content: message,
                projectId: normalizedProjectId
            }
        })

        await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                credits: { decrement: 5 }
            }
        })

        res.status(202).json({ message: "Revision started" });

        // Run generation in background
        const revisionTask = async () => {
            let enhancedPrompt = message;
            try {
                const promptEnhanceResponse = await createChatCompletionWithFallback([
                    {
                        role: "system", content: `
                    You are a prompt enhancement specialist. The user wants to make changes to their website. Enhance their request to be more specific and actionable for a web developer.

                    Enhance this by:
                    1. Being specific about what elements to change
                    2. Mentioning design details (colors, spacing, sizes)
                    3. Clarifying the desired outcome
                    4. Using clear technical terms

                    Return ONLY the enhanced request, nothing else. Keep it concise (1-2 sentences).`
                    },
                    { role: "user", content: `User's request: "${message}"` }
                ], 30000) as any;

                enhancedPrompt = promptEnhanceResponse?.choices?.[0]?.message?.content?.trim() || message;

                if (!promptEnhanceResponse?.choices?.[0]?.message?.content) {
                    console.warn("AI returned empty enhancement, using original request");
                }

                await prisma.conversation.create({
                    data: {
                        role: "assistant",
                        content: `Enhanced prompt: ${enhancedPrompt}`,
                        projectId: normalizedProjectId
                    }
                })
            } catch (enhanceError: any) {
                console.warn("Revision prompt enhancement skipped:", enhanceError?.message || enhanceError);
                await prisma.conversation.create({
                    data: {
                        role: "assistant",
                        content: "Prompt enhancement is unavailable right now. Using your original revision request directly.",
                        projectId: normalizedProjectId
                    }
                })
            }

            try {
                await prisma.conversation.create({
                    data: {
                        role: "assistant",
                        content: 'Now generating your website...',
                        projectId: normalizedProjectId
                    }
                })

                const codeGenerationResponse = await createChatCompletionWithFallback([
                    {
                        role: "system", content: `
                        You are an expert web developer. The user wants to update their existing website code based on this request: "${enhancedPrompt}"

                        CRITICAL REQUIREMENTS:
                        - You MUST output the FULL, updated HTML ONLY.
                        - Do NOT explain the changes or use markdown code blocks.
                        - Use Tailwind CSS for all styling and ensure it remains functional.
                        - Make sure all existing features still work unless the user asked to change them.
                        - Keep the layout responsive and modern.
                        - If you use external assets, ensure they are reliable (e.g., placehold.co for images).

                        CRITICAL HARD RULES:
                        1. You MUST put ALL output ONLY into message.content.
                        2. You MUST NOT place anything in "reasoning", "analysis", "reasoning_details", or any hidden fields.
                        3. You MUST NOT include internal thoughts, explanations, analysis, comments, or markdown.
                        4. Do NOT include markdown, explanations, notes, or code fences.

                        The output should be the complete, ready-to-use HTML code.`
                    },
                    { role: "user", content: `Here is the current website code: "${currentProject.current_code || ""}" The user wants this change: "${enhancedPrompt}"` },
            ], 600000) as any;

                const cleanedCode = sanitizeGeneratedCode(codeGenerationResponse?.choices?.[0]?.message?.content || "");

                if (!cleanedCode) {
                    throw new Error("AI returned empty code. Please try again.");
                }

                const version = await prisma.version.create({
                    data: {
                        code: cleanedCode,
                        description: 'Changes made',
                        projectId: normalizedProjectId
                    }
                })

                await prisma.conversation.create({
                    data: {
                        role: "assistant",
                        content: "I've made the changes to your website. You can now preview it and request any changes.",
                        projectId: normalizedProjectId
                    }
                })

                await prisma.websiteProject.update({
                    where: {
                        id: normalizedProjectId
                    },
                    data: {
                        current_code: cleanedCode,
                        current_version_index: version.id
                    }
                })
            } catch (error: any) {
                console.error("Revision background generation failed:", error?.message || error);
                try {
                    await prisma.user.update({
                        where: { id: userId },
                        data: { credits: { increment: 5 } }
                    })
                } catch (refundError) {
                    console.error("Credit refund failed:", refundError);
                }
                await prisma.conversation.create({
                    data: {
                        role: "assistant",
                        content: isFallbackableModelError(error)
                            ? "AI providers are busy right now. Credits were refunded. Please try again."
                            : `Revision failed: ${error?.message || "Unexpected error"}. Credits were refunded.`,
                        projectId: normalizedProjectId
                    }
                })
            }
        };

        if (process.env.NODE_ENV === 'production') {
            waitUntil(revisionTask());
        } else {
            void revisionTask();
        }
    } catch (error: any) {
        console.error("Revision request failed:", error.message || error.code);
        return res.status(500).json({ message: error?.message || "Failed to start revision." });
    }
}

export const rollbackToVersion = async (req: Request, res: Response) => {
    try {
        const userId = req.userId
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const { projectId, versionId } = req.params
        const normalizedProjectId = Array.isArray(projectId) ? projectId[0] : projectId
        const normalizedVersionId = Array.isArray(versionId) ? versionId[0] : versionId

        const project = await prisma.websiteProject.findFirst({
            where: {
                id: normalizedProjectId,
                userId
            },
            include: {
                versions: true
            }
        })

        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }

        const version = await prisma.version.findUnique({
            where: { id: normalizedVersionId }
        })

        if (!version || version.projectId !== normalizedProjectId) {
            return res.status(404).json({ message: "Version not found" });
        }

        await prisma.websiteProject.update({
            where: { id: normalizedProjectId },
            data: {
                current_code: version.code,
                current_version_index: version.id
            }
        })

        await prisma.conversation.create({
            data: {
                role: "assistant",
                content: "I've rolled back to the version you requested. You can now preview it and request any changes.",
                projectId: normalizedProjectId
            }
        })

        res.status(200).json({ message: "Rolled back successfully" });
    } catch (error: any) {
        console.error(error.message || error.code);
        res.status(500).json({ message: error.message })
    }

}

export const deleteProject = async (req: Request, res: Response) => {
    try {
        const userId = req.userId
        const { projectId } = req.params
        const normalizedProjectId = Array.isArray(projectId) ? projectId[0] : projectId

        await prisma.websiteProject.delete({
            where: {
                id: normalizedProjectId,
                userId
            },
        })

        res.status(200).json({ message: "Project deleted successfully" });
    } catch (error: any) {
        console.error(error.message || error.code);
        res.status(500).json({ message: error.message })
    }

}

export const getProjectPreview = async (req: Request, res: Response) => {
    try {
        const userId = req.userId
        const { projectId } = req.params
        const normalizedProjectId = Array.isArray(projectId) ? projectId[0] : projectId

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const project = await prisma.websiteProject.findFirst({
            where: {
                id: normalizedProjectId,
                userId
            },
            include: {
                versions: true
            }
        })
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }

        res.status(200).json({ project });
    } catch (error: any) {
        console.error(error.message || error.code);
        res.status(500).json({ message: error.message })
    }

}

export const getPublishedProjects = async (req: Request, res: Response) => {
    try {
        const projects = await prisma.websiteProject.findMany({
            where: {
                isPublished: true
            },
            include: {
                user: true
            }
        })
        res.status(200).json({ projects });
    } catch (error: any) {
        console.error(error.message || error.code);
        res.status(500).json({ message: error.message })
    }

}

export const getProjectById = async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params
        const normalizedProjectId = Array.isArray(projectId) ? projectId[0] : projectId
        const project = await prisma.websiteProject.findFirst({
            where: {
                id: normalizedProjectId,
            },
        })
        if (!project || project.isPublished === false || !project?.current_code) {
            return res.status(404).json({ message: "Project not found" });
        }
        res.status(200).json({ code: project.current_code });
    } catch (error: any) {
        console.error(error.message || error.code);
        res.status(500).json({ message: error.message })
    }

}

export const saveProjectCode = async (req: Request, res: Response) => {
    try {
        const userId = req.userId
        const { projectId } = req.params
        const normalizedProjectId = Array.isArray(projectId) ? projectId[0] : projectId
        const { code } = req.body

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!code) {
            return res.status(400).json({ message: "Code is required" });
        }

        const project = await prisma.websiteProject.findFirst({
            where: {
                id: normalizedProjectId,
                userId: userId || ""
            },
        })
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }

        await prisma.websiteProject.update({
            where: {
                id: normalizedProjectId,
            },
            data: {
                current_code: code || "",
                current_version_index: ""
            }
        })

        res.status(200).json({ message: "Project saved successfully" });
    } catch (error: any) {
        console.error(error.message || error.code);
        res.status(500).json({ message: error.message })
    }

}

