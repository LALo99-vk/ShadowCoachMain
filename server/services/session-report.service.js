import prisma from "../config/db.js";
import { buildReportPdfBuffer } from "./report-pdf.service.js";
import {
    uploadPdfToCloudinary,
    deletePdfFromCloudinary,
} from "./storage.service.js";

function withReport(session) {
    if (!session) return session;
    const { report, ...rest } = session;
    return {
        ...rest,
        reportPdfUrl: report?.pdfUrl ?? null,
    };
}

export function attachReportUrl(session) {
    return withReport(session);
}

export function attachReportUrls(sessions) {
    return sessions.map(withReport);
}

function isCloudinaryPdfUrl(pdfUrl) {
    return pdfUrl?.includes("res.cloudinary.com");
}

export async function createAndStoreSessionReport(session, userId) {
    const pdfBuffer = await buildReportPdfBuffer(session);
    const uploaded = await uploadPdfToCloudinary(pdfBuffer, session.id);

    return prisma.sessionReport.create({
        data: {
            pdfUrl: uploaded.secure_url,
            userId,
            sessionId: session.id,
        },
    });
}

export async function ensureSessionReport(session, userId) {
    if (session.report && isCloudinaryPdfUrl(session.report.pdfUrl)) {
        return session.report;
    }

    if (session.report) {
        return refreshStoredReport(session, userId);
    }

    return createAndStoreSessionReport(session, userId);
}

export async function deleteSessionReport(pdfUrl) {
    await deletePdfFromCloudinary(pdfUrl);
}

export function getReportPdfBuffer(session) {
    return buildReportPdfBuffer(session);
}

export async function refreshStoredReport(session, userId) {
    const existing = await prisma.sessionReport.findUnique({
        where: { sessionId: session.id },
    });

    const pdfBuffer = await buildReportPdfBuffer(session);
    const uploaded = await uploadPdfToCloudinary(pdfBuffer, session.id);

    if (existing) {
        if (
            isCloudinaryPdfUrl(existing.pdfUrl) &&
            existing.pdfUrl !== uploaded.secure_url
        ) {
            await deletePdfFromCloudinary(existing.pdfUrl);
        }

        return prisma.sessionReport.update({
            where: { id: existing.id },
            data: { pdfUrl: uploaded.secure_url },
        });
    }

    return prisma.sessionReport.create({
        data: {
            pdfUrl: uploaded.secure_url,
            userId,
            sessionId: session.id,
        },
    });
}
