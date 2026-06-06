import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AnalysisData } from "@/components/shadow/AnalysisCard";
import { sessionApi } from "@/lib/api/session";
import { getApiErrorMessage } from "@/lib/api/errors";
import { downloadBlob } from "@/lib/report-label";
import { downloadReportPdf, generateReportPdf } from "@/lib/report-pdf";

interface Props {
  data: AnalysisData;
  sessionId?: string;
  createdAt?: string;
  reportPdfUrl?: string | null;
}

export function ReportPdfActions({
  data,
  sessionId,
  createdAt,
}: Props) {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const loadPdfBlob = async () => {
    if (sessionId) {
      return sessionApi.fetchReportFile(sessionId);
    }

    return generateReportPdf({ ...data, createdAt });
  };

  const onDownload = async () => {
    setLoading(true);
    try {
      if (sessionId) {
        const blob = await sessionApi.fetchReportFile(sessionId, true);
        downloadBlob(blob, `shadow-report-${sessionId}.pdf`);
        return;
      }

      const blob = generateReportPdf({ ...data, createdAt });
      downloadReportPdf(blob, `shadow-report-${Date.now()}.pdf`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to download PDF"));
    } finally {
      setLoading(false);
    }
  };

  const onView = async () => {
    if (showPdf) {
      setShowPdf(false);
      return;
    }

    setLoading(true);
    try {
      const blob = await loadPdfBlob();
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(URL.createObjectURL(blob));
      setShowPdf(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load PDF"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onView}
          disabled={loading}
          className="flex-1 min-w-[140px] border border-white py-3 text-[10px] uppercase tracking-command text-white hover:bg-white hover:text-black transition-colors duration-500 disabled:opacity-50"
        >
          {showPdf ? "Hide PDF" : "View PDF"}
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={loading}
          className="flex-1 min-w-[140px] bg-white text-black py-3 text-[10px] uppercase tracking-command font-bold hover:opacity-80 transition-opacity duration-500 disabled:opacity-50"
        >
          Download PDF
        </button>
      </div>

      {showPdf && pdfBlobUrl && (
        <iframe
          src={pdfBlobUrl}
          title="Shadow report PDF"
          className="w-full h-[min(70vh,640px)] border border-white/10 bg-[#111]"
        />
      )}
    </div>
  );
}
