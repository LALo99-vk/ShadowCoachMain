import { jsPDF } from "jspdf";
import type { AnalysisData } from "@/components/shadow/AnalysisCard";

export interface ReportPdfInput extends AnalysisData {
  createdAt?: string;
}

const MARGIN = 48;
const LINE_HEIGHT = 1.5;
const SECTION_GAP = 18;
const PARAGRAPH_GAP = 8;

function pageBottom(doc: jsPDF) {
  return doc.internal.pageSize.getHeight() - MARGIN;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > pageBottom(doc)) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function writeLines(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  bold = false,
): number {
  doc.setFontSize(fontSize);
  doc.setFont("helvetica", bold ? "bold" : "normal");

  const lineHeight = fontSize * LINE_HEIGHT;
  const lines = doc.splitTextToSize(text, maxWidth) as string[];

  for (const line of lines) {
    y = ensureSpace(doc, y, lineHeight);
    doc.text(line, x, y);
    y += lineHeight;
  }

  return y;
}

function writeSection(
  doc: jsPDF,
  title: string,
  body: string | string[],
  y: number,
  maxWidth: number,
  margin: number,
): number {
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

export function generateReportPdf(data: ReportPdfInput): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  y = writeLines(doc, "SHADOWCOACH", MARGIN, y, maxWidth, 20, true);
  y += 6;
  y = writeLines(doc, "Shadow Report", MARGIN, y, maxWidth, 12);

  if (data.createdAt) {
    y += 4;
    y = writeLines(
      doc,
      new Date(data.createdAt).toLocaleString(),
      MARGIN,
      y,
      maxWidth,
      9,
    );
  }

  y += SECTION_GAP;
  y = writeLines(doc, "OVERALL SCORE", MARGIN, y, maxWidth, 10, true);
  y += PARAGRAPH_GAP;
  y = writeLines(doc, `${data.overallScore} / 100`, MARGIN, y, maxWidth, 24, true);

  y = writeSection(doc, "STRENGTHS", data.strengths, y, maxWidth, MARGIN);
  y = writeSection(doc, "WEAKNESSES", data.areasToImprove, y, maxWidth, MARGIN);
  y = writeSection(doc, "PRIORITY FIX", data.priorityFix, y, maxWidth, MARGIN);
  y = writeSection(doc, "DRILL", data.drillSuggestion, y, maxWidth, MARGIN);
  y = writeSection(doc, "CONFIDENCE", data.confidenceLevel, y, maxWidth, MARGIN);

  return doc.output("blob");
}

export function downloadReportPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
