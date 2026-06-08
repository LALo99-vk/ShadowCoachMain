import { PDFDocument, StandardFonts } from "pdf-lib";

const MARGIN = 48;
const LINE_HEIGHT = 1.5;
const SECTION_GAP = 18;
const PARAGRAPH_GAP = 8;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

function wrapText(text, font, fontSize, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let current = "";

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        const width = font.widthOfTextAtSize(candidate, fontSize);
        if (width <= maxWidth) {
            current = candidate;
        } else {
            if (current) {
                lines.push(current);
            }
            current = word;
        }
    }

    if (current) {
        lines.push(current);
    }

    return lines.length ? lines : [""];
}

function createPageContext(pdfDoc, fonts) {
    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const newPage = () => {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
    };

    const ensureSpace = (needed) => {
        if (y - needed < MARGIN) {
            newPage();
        }
    };

    const writeLines = (text, fontSize, bold = false) => {
        const font = bold ? fonts.bold : fonts.regular;
        const lineHeight = fontSize * LINE_HEIGHT;
        const maxWidth = PAGE_WIDTH - MARGIN * 2;
        const lines = wrapText(text, font, fontSize, maxWidth);

        for (const line of lines) {
            ensureSpace(lineHeight);
            page.drawText(line, {
                x: MARGIN,
                y: y - fontSize,
                size: fontSize,
                font,
            });
            y -= lineHeight;
        }
    };

    const writeSection = (title, body) => {
        ensureSpace(SECTION_GAP);
        y -= SECTION_GAP;
        writeLines(title, 10, true);
        y -= PARAGRAPH_GAP;

        const items = Array.isArray(body) ? body : [body];
        for (const item of items) {
            const text = Array.isArray(body) ? `• ${item}` : item;
            writeLines(text, 11);
            y -= 4;
        }
    };

    return { writeLines, writeSection };
}

export async function buildReportPdfBuffer(session) {
    const pdfDoc = await PDFDocument.create();
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { writeLines, writeSection } = createPageContext(pdfDoc, {
        regular,
        bold,
    });

    writeLines("SHADOWCOACH", 20, true);
    writeLines("Shadow Report", 12);

    if (session.createdAt) {
        writeLines(new Date(session.createdAt).toLocaleString(), 9);
    }

    writeLines("OVERALL SCORE", 10, true);
    writeLines(`${session.overallScore} / 100`, 24, true);

    writeSection("STRENGTHS", session.strengths);
    writeSection("WEAKNESSES", session.areasToImprove);
    writeSection("PRIORITY FIX", session.priorityFix);
    writeSection("DRILL", session.drillSuggestion);
    writeSection("CONFIDENCE", session.confidenceLevel);

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
