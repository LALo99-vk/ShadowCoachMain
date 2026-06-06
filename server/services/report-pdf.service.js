import { jsPDF } from "jspdf";

const MARGIN = 48;
const LINE_HEIGHT = 1.5;
const SECTION_GAP = 18;
const PARAGRAPH_GAP = 8;

function pageBottom(doc) {
    return doc.internal.pageSize.getHeight() - MARGIN;
}

function ensureSpace(doc, y, needed) {
    if (y + needed > pageBottom(doc)) {
        doc.addPage();
        return MARGIN;
    }
    return y;
}

function writeLines(doc, text, x, y, maxWidth, fontSize, bold = false) {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");

    const lineHeight = fontSize * LINE_HEIGHT;
    const lines = doc.splitTextToSize(String(text), maxWidth);

    for (const line of lines) {
        y = ensureSpace(doc, y, lineHeight);
        doc.text(line, x, y);
        y += lineHeight;
    }

    return y;
}

function writeSection(doc, title, body, y, maxWidth, margin) {
    y = ensureSpace(doc, y, SECTION_GAP);
    y += SECTION_GAP;

    y = writeLines(doc, title, margin, y, maxWidth, 10, true);
    y += PARAGRAPH_GAP;

    const items = Array.isArray(body) ? body : [body];
    for (const item of items) {
        const text = Array.isArray(body) ? `• ${item}` : item;
        y = writeLines(doc, text, margin, y, maxWidth, 11);
        y += 4;
    }

    return y;
}

export function buildReportPdfBuffer(session) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - MARGIN * 2;
    let y = MARGIN;

    y = writeLines(doc, "SHADOWCOACH", MARGIN, y, maxWidth, 20, true);
    y += 6;
    y = writeLines(doc, "Shadow Report", MARGIN, y, maxWidth, 12);

    if (session.createdAt) {
        y += 4;
        y = writeLines(
            doc,
            new Date(session.createdAt).toLocaleString(),
            MARGIN,
            y,
            maxWidth,
            9
        );
    }

    y += SECTION_GAP;
    y = writeLines(doc, "OVERALL SCORE", MARGIN, y, maxWidth, 10, true);
    y += PARAGRAPH_GAP;
    y = writeLines(
        doc,
        `${session.overallScore} / 100`,
        MARGIN,
        y,
        maxWidth,
        24,
        true
    );

    y = writeSection(doc, "STRENGTHS", session.strengths, y, maxWidth, MARGIN);
    y = writeSection(
        doc,
        "WEAKNESSES",
        session.areasToImprove,
        y,
        maxWidth,
        MARGIN
    );
    y = writeSection(doc, "PRIORITY FIX", session.priorityFix, y, maxWidth, MARGIN);
    y = writeSection(doc, "DRILL", session.drillSuggestion, y, maxWidth, MARGIN);
    y = writeSection(doc, "CONFIDENCE", session.confidenceLevel, y, maxWidth, MARGIN);

    return Buffer.from(doc.output("arraybuffer"));
}
