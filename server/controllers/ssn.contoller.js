import prisma from "../config/db.js";
import analyzeStance, { sendSessionFollowUp } from "../services/ai.service.js";

const analyzeSession = async (req, res) => {
    try {
        const file = req.file;
        const { question } = req.body;
        const userId = req.user.userId;

        if (!file) {
            return res.status(400).json({ message: "Image is required" });
        }

        const athlete = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                fullName: true,
                sport: true,
                level: true,
                role: true,
            },
        });

        if (!athlete) {
            return res.status(404).json({ message: "User not found" });
        }

        const analyzeReport = await analyzeStance(file.path, question, athlete);

        const sessionStoring = await prisma.session.create({
            data: {
                imageUrl: file.path,
                userId,
                overallScore: analyzeReport.overallScore,
                strengths: analyzeReport.strengths,
                areasToImprove: analyzeReport.areasToImprove,
                priorityFix: analyzeReport.priorityFix,
                drillSuggestion: analyzeReport.drillSuggestion,
                confidenceLevel: analyzeReport.confidenceLevel,
                aiRawResponse: {
                    ...analyzeReport,
                    question: question?.trim() || null,
                },
            },
        });

        return res.status(201).json({
            message: "Session created successfully",
            session: sessionStoring,
        });
    } catch (err) {
        console.error("analyzeSession error:", err);
        return res.status(500).json({
            error: err.message || "Failed to analyze session",
        });
    }
};

const listSessions = async (req, res) => {
    try {
        const sessions = await prisma.session.findMany({
            where: { userId: req.user.userId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                imageUrl: true,
                overallScore: true,
                priorityFix: true,
                confidenceLevel: true,
                createdAt: true,
            },
        });
        return res.json({ sessions });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const getSession = async (req, res) => {
    try {
        const session = await prisma.session.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.userId,
            },
            include: {
                chats: { orderBy: { createdAt: "asc" } },
            },
        });

        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }

        return res.json({ session });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const sessionFollowUp = async (req, res) => {
    try {
        const { message } = req.body;
        if (!message?.trim()) {
            return res.status(400).json({ message: "message is required" });
        }

        const session = await prisma.session.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.userId,
            },
            include: {
                chats: { orderBy: { createdAt: "asc" } },
                user: {
                    select: {
                        fullName: true,
                        sport: true,
                        level: true,
                        role: true,
                    },
                },
            },
        });

        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }

        await prisma.chatMessage.create({
            data: {
                role: "USER",
                message: message.trim(),
                sessionId: session.id,
            },
        });

        const reply = await sendSessionFollowUp({
            imagePath: session.imageUrl,
            athleteProfile: session.user,
            sessionAnalysis: {
                overallScore: session.overallScore,
                strengths: session.strengths,
                areasToImprove: session.areasToImprove,
                priorityFix: session.priorityFix,
                drillSuggestion: session.drillSuggestion,
                confidenceLevel: session.confidenceLevel,
            },
            chatHistory: session.chats,
            userMessage: message.trim(),
        });

        const assistantMessage = await prisma.chatMessage.create({
            data: {
                role: "ASSISTANT",
                message: reply,
                sessionId: session.id,
            },
        });

        return res.json({
            message: "Follow-up sent",
            reply: assistantMessage,
        });
    } catch (err) {
        console.error("sessionFollowUp error:", err);
        return res.status(500).json({
            error: err.message || "Failed to process follow-up",
        });
    }
};

export { analyzeSession, listSessions, getSession, sessionFollowUp };
export default analyzeSession;
