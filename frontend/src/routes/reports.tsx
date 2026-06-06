import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { sessionApi } from "@/lib/api/session";
import { getApiErrorMessage } from "@/lib/api/errors";
import { requireAuth } from "@/lib/require-auth";
import { downloadBlob, reportLabel } from "@/lib/report-label";

type ReportsSearch = {
  session?: string;
};

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — SHADOWCOACH" }] }),
  validateSearch: (search: Record<string, unknown>): ReportsSearch => ({
    session: typeof search.session === "string" ? search.session : undefined,
  }),
  beforeLoad: ({ context }) => requireAuth(context.queryClient),
  component: ReportsPage,
});

function ReportsPage() {
  const { session: highlightSessionId } = Route.useSearch();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data: reports = [], isLoading, error } = useQuery({
    queryKey: ["reports"],
    queryFn: () => sessionApi.listReports(),
  });

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const clearViewer = () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(null);
    setViewingId(null);
  };

  const viewReport = async (reportId: string, sessionId: string) => {
    if (viewingId === reportId) {
      clearViewer();
      return;
    }

    setLoadingId(reportId);
    try {
      const blob = await sessionApi.fetchReportFile(sessionId);
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(URL.createObjectURL(blob));
      setViewingId(reportId);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load PDF"));
    } finally {
      setLoadingId(null);
    }
  };

  const downloadReport = async (sessionId: string) => {
    setLoadingId(sessionId);
    try {
      const blob = await sessionApi.fetchReportFile(sessionId, true);
      downloadBlob(blob, `shadow-report-${sessionId}.pdf`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to download PDF"));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <section className="min-h-[calc(100vh-6rem)] px-6 md:px-12 pb-20">
      <div className="max-w-5xl mx-auto">
        <div className="mb-12 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-command text-smoke">Library</div>
            <h1 className="mt-3 text-3xl uppercase tracking-command text-white font-bold">
              Your reports
            </h1>
            <p className="mt-3 text-[11px] uppercase tracking-command text-smoke max-w-md">
              Every saved PDF from your stance analyses. View or download anytime.
            </p>
          </div>
          <Link
            to="/analyze"
            className="border border-white px-8 py-3 text-xs uppercase tracking-command text-white hover:bg-white hover:text-black transition-colors duration-500 text-center"
          >
            New analysis
          </Link>
        </div>
        <div className="hairline mb-10" />

        {isLoading && (
          <p className="text-[11px] uppercase tracking-command text-smoke">Loading...</p>
        )}

        {!isLoading && error && (
          <p className="text-[11px] uppercase tracking-command text-red-400 mb-6">
            {getApiErrorMessage(error)}
          </p>
        )}

        {!isLoading && !error && reports.length === 0 && (
          <div className="space-y-4">
            <p className="text-[11px] uppercase tracking-command text-smoke">
              No reports yet. Run an analysis to generate your first PDF.
            </p>
            <Link
              to="/analyze"
              className="inline-block border border-white px-6 py-3 text-xs uppercase tracking-command text-white hover:bg-white hover:text-black transition-colors"
            >
              Analyze now
            </Link>
          </div>
        )}

        <div className="grid gap-6">
          {reports.map((report, i) => {
            const label = reportLabel(
              report.session.createdAt,
              report.session.overallScore,
            );
            const highlighted = highlightSessionId === report.sessionId;
            const isViewing = viewingId === report.id;
            const isLoadingReport =
              loadingId === report.id || loadingId === report.sessionId;

            return (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.5 }}
                className={
                  highlighted
                    ? "border border-white"
                    : "border border-white/10"
                }
              >
                <div className="p-4 md:p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <img
                      src={report.session.imageUrl}
                      alt="Stance"
                      className="w-20 h-20 object-cover border border-white/10 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-command text-smoke">
                        Shadow report
                      </div>
                      <h2 className="mt-1 text-sm md:text-base uppercase tracking-command text-white font-bold">
                        {label}
                      </h2>
                      <p className="mt-2 text-sm text-white line-clamp-2">
                        {report.session.priorityFix}
                      </p>
                      <p className="mt-2 text-[10px] uppercase tracking-command text-smoke">
                        {report.session.confidenceLevel} confidence ·{" "}
                        {new Date(report.createdAt).toLocaleString()}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => viewReport(report.id, report.sessionId)}
                          disabled={isLoadingReport}
                          className="border border-white px-5 py-2 text-[10px] uppercase tracking-command text-white hover:bg-white hover:text-black transition-colors duration-500 disabled:opacity-50"
                        >
                          {isLoadingReport && viewingId !== report.id
                            ? "..."
                            : isViewing
                              ? "Hide PDF"
                              : "View PDF"}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadReport(report.sessionId)}
                          disabled={isLoadingReport}
                          className="bg-white text-black px-5 py-2 text-[10px] uppercase tracking-command font-bold hover:opacity-80 transition-opacity duration-500 disabled:opacity-50"
                        >
                          {isLoadingReport && !isViewing ? "..." : "Download"}
                        </button>
                        <Link
                          to="/sessions/$sessionId"
                          params={{ sessionId: report.sessionId }}
                          className="px-5 py-2 text-[10px] uppercase tracking-command text-smoke hover:text-white transition-colors"
                        >
                          Open session →
                        </Link>
                      </div>
                    </div>
                  </div>

                  {isViewing && pdfBlobUrl && (
                    <iframe
                      src={pdfBlobUrl}
                      title={label}
                      className="mt-6 w-full h-[min(70vh,640px)] border border-white/10 bg-[#111]"
                    />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
