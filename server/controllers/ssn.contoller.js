import fs from "fs";
import os from "os";
import path from "path";
import prisma from "../config/db.js";
import analyzeStance, {
    ImageValidationError,
    sendSessionFollowUp,
} from "../services/ai.service.js";
import { validateImageBuffer, extensionForMime } from "../middleware/upload.middleware.js";
import {
    uploadImageToCloudinary,
    deleteImageFromCloudinary,
} from "../services/storage.service.js";
import {
    attachReportUrl,
    attachReportUrls,
    createAndStoreSessionReport,
    ensureSessionReport,
    deleteSessionReport,
    getReportPdfBuffer,
    refreshStoredReport,
} from "../services/session-report.service.js";

function removeLocalUpload(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function writeUploadToTemp(file, detectedMime) {
    const ext = extensionForMime(detectedMime) || path.extname(file.originalname) || ".jpg";
    const localPath = path.join(
        os.tmpdir(),
        `${Date.now()}-upload${ext}`
    );
    fs.writeFileSync(localPath, file.buffer);
    return localPath;
}

const analyzeSession = async (req, res) => {
    const file = req.file;
    let localPath = null;

    try {
        const { question } = req.body;
        const userId = req.user.userId;

        if (!file?.buffer) {
            return res.status(400).json({ message: "Image is required" });
        }
        //Real image Valid format allowed size
        const fileCheck = validateImageBuffer(file.buffer);
        if (!fileCheck.ok) {
            return res.status(400).json({ message: fileCheck.message });
        }

        localPath = writeUploadToTemp(file, fileCheck.detectedType);

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
       // xontroller hands all the info of user and image to ai AI IS CALLED HERE
        const analyzeReport = await analyzeStance(localPath, question, athlete);
       
        // i send the img in local path to be stored in cloudinary for permanant storage and Temporary file will be deleted later.
        const uploadedImage = await uploadImageToCloudinary(localPath);

        const sessionStoring = await prisma.session.create({
            data: {
                imageUrl: uploadedImage.secure_url,
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

        const report = await createAndStoreSessionReport(sessionStoring, userId);

        return res.status(201).json({
            message: "Session created successfully",
            session: attachReportUrl({
                ...sessionStoring,
                report,
            }),
        });
    } catch (err) {
        console.error("analyzeSession error:", err);

        if (err instanceof ImageValidationError) {
            return res.status(400).json({ message: err.message });
        }

        const isCloudinary =
            err.message?.includes("Cloudinary") ||
            err?.cause?.http_code === 403;
        return res.status(isCloudinary ? 502 : 500).json({
            error: err.message || "Failed to analyze session",
        });
        //used finally here because the local image should delete no matter success or failure
    } finally {
        removeLocalUpload(localPath);
    }
};

const listReports = async (req, res) => {
    try {
        const reports = await prisma.sessionReport.findMany({
            where: { userId: req.user.userId },
            orderBy: { createdAt: "desc" },
            include: {
                session: {
                    select: {
                        id: true,
                        imageUrl: true,
                        overallScore: true,
                        priorityFix: true,
                        confidenceLevel: true,
                        createdAt: true,
                    },
                },
            },
        });

        return res.json({
            reports: reports.map((report) => ({
                id: report.id,
                pdfUrl: report.pdfUrl,
                createdAt: report.createdAt,
                sessionId: report.sessionId,
                session: report.session,
            })),
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
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
                chats: {
                    where: { userId: req.user.userId },
                    orderBy: { createdAt: "asc" },
                },
                report: {
                    select: { pdfUrl: true },
                },
            },
        });

        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }

        return res.json({ session: attachReportUrl(session) });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const sessionFollowUp = async (req, res) => {
    try {
        const message = req.body?.message;
        if (!message?.trim()) {
            return res.status(400).json({
                message:
                    "message is required in JSON body. Send Content-Type: application/json with { \"message\": \"your question\" }",
            });
        }

        const session = await prisma.session.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.userId,
            },
            include: {
                chats: {
                    where: { userId: req.user.userId },
                    orderBy: { createdAt: "asc" },
                },
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
                userId: req.user.userId,
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
                userId: req.user.userId,
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

const getSessionReport = async (req, res) => {
    try {
        const session = await prisma.session.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.userId,
            },
            include: {
                report: true,
            },
        });

        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }

        const report = await ensureSessionReport(session, req.user.userId);

        return res.json({
            pdfUrl: report.pdfUrl,
            sessionId: session.id,
        });
    } catch (err) {
        console.error("getSessionReport error:", err);
        return res.status(500).json({
            error: err.message || "Failed to get session report",
        });
    }
};

const streamSessionReportFile = async (req, res) => {
    try {
        const session = await prisma.session.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.userId,
            },
        });

        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }

        const buffer = getReportPdfBuffer(session);
        const filename = `shadow-report-${session.id}.pdf`;
        const download = req.query.download === "1";

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `${download ? "attachment" : "inline"}; filename="${filename}"`
        );
        res.setHeader("Content-Length", buffer.length);
        res.send(buffer);

        void refreshStoredReport(session, req.user.userId).catch((err) => {
            console.warn("refreshStoredReport failed:", err?.message || err);
        });
    } catch (err) {
        console.error("streamSessionReportFile error:", err);
        return res.status(500).json({
            error: err.message || "Failed to stream report",
        });
    }
};

const deleteSession = async (req, res) => {
    try {
        const session = await prisma.session.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.userId,
            },
            include: {
                report: true,
            },
        });

        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }

        await deleteImageFromCloudinary(session.imageUrl);

        if (session.report?.pdfUrl) {
            await deleteSessionReport(session.report.pdfUrl);
        }

        await prisma.session.delete({
            where: { id: session.id },
        });

        return res.json({ message: "Session deleted successfully" });
    } catch (err) {
        console.error("deleteSession error:", err);
        return res.status(500).json({
            error: err.message || "Failed to delete session",
        });
    }
};

export {
    analyzeSession,
    listSessions,
    listReports,
    getSession,
    getSessionReport,
    streamSessionReportFile,
    sessionFollowUp,
    deleteSession,
};
