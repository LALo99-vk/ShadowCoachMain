import fs from "fs";
import os from "os";
import path from "path";
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

export async function createAndStoreSessionReport(session, userId) {
    const pdfBuffer = buildReportPdfBuffer(session);
    const tempPath = path.join(os.tmpdir(), `${session.id}-report.pdf`);

    try {
        fs.writeFileSync(tempPath, pdfBuffer);
        const uploaded = await uploadPdfToCloudinary(tempPath, session.id);

        const report = await prisma.sessionReport.create({
            data: {
                pdfUrl: uploaded.secure_url,
                userId,
                sessionId: session.id,
            },
        });

        return report;
    } finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}

export async function ensureSessionReport(session, userId) {
    if (session.report) {
        return session.report;
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

    const pdfBuffer = buildReportPdfBuffer(session);
    const tempPath = path.join(os.tmpdir(), `${session.id}-report.pdf`);

    try {
        fs.writeFileSync(tempPath, pdfBuffer);
        const uploaded = await uploadPdfToCloudinary(tempPath, session.id);

        if (existing) {
            if (existing.pdfUrl !== uploaded.secure_url) {
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
    } finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}
