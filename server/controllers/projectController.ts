import { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import openai from "../configs/openai.js";


export const makeRevision = async (req: Request, res: Response) => {
    const userId = req.userId
    try {
        const { projectId } = req.params
        const normalizedProjectId = Array.isArray(projectId) ? projectId[0] : projectId
        const {message} = req.body
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

        if(!message || message.trim() === "") {
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

        const promptEnhanceResponse = await openai.chat.completions.create({
            model: "z-ai/glm-4.5-air:free",
            messages: [
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
            ]
        })

        const enhancedPrompt = promptEnhanceResponse.choices[0].message.content;

        await prisma.conversation.create({
            data: {
                role: "assistant",
                content: `Enhanced prompt: ${enhancedPrompt}`,
                projectId: normalizedProjectId
            }
        })

        await prisma.conversation.create({
            data: {
                role: "assistant",
                content: 'Now generating your website...',
                projectId: normalizedProjectId
            }
        })

        const codeGenerationResponse = await openai.chat.completions.create({
            model: "z-ai/glm-4.5-air:free",
            messages: [
                {
                    role: "system", content: `
                    You are an expert web developer. 

                    CRITICAL REQUIREMENTS:
                    - Return ONLY the complete updated HTML code with the requested changes.
                    - Use Tailwind CSS for ALL styling (NO custom CSS).
                    - Use Tailwind utility classes for all styling changes.
                    - Include all JavaScript in <script> tags before closing </body>
                    - Make sure it's a complete, standalone HTML document with Tailwind CSS
                    - Return the HTML Code Only, nothing else

                    Apply the requested changes while maintaining the Tailwind CSS styling approach.`
                },
                { role: "user", content: `Here is the current website code: "${currentProject.current_code}" The user wants this change: "${enhancedPrompt}"` },
            ]
        })

        const code = codeGenerationResponse.choices[0].message.content || '';

        const version = await prisma.version.create({
            data: {
                code: code.replace(/```[a-z]*\n?/gi, '').replace(/```$/g, '').trim(),
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
                id: normalizedProjectId},
            data: {
                current_code: code.replace(/```[a-z]*\n?/gi, '').replace(/```$/g, '').trim(),
                current_version_index: version.id
            }
        })

        res.status(200).json({ message: "Changes made successfully" });
    } catch (error: any) {
        await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                credits: { increment: 5 }
            }
        })
        console.error(error.message || error.code);
        res.status(500).json({ message: error.message });
    }
}
