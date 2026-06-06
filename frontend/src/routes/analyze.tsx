import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadBox } from "@/components/shadow/UploadBox";
import { ShadowOverlay } from "@/components/shadow/ShadowOverlay";
import { AnalysisCard, type AnalysisData } from "@/components/shadow/AnalysisCard";
import { ReportPdfActions } from "@/components/shadow/ReportPdfActions";
import { sessionApi } from "@/lib/api/session";
import { getApiErrorMessage } from "@/lib/api/errors";
import { requireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/analyze")({
  head: () => ({ meta: [{ title: "Analyze — SHADOWCOACH" }] }),
  beforeLoad: ({ context }) => requireAuth(context.queryClient),
  component: AnalyzePage,
});

const ANALYSIS_DURATION_MS = 5200;

function AnalyzePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<
    (AnalysisData & {
      id?: string;
      createdAt?: string;
      reportPdfUrl?: string | null;
    }) | null
  >(null);

  const onAnalyze = async () => {
    if (!file || analyzing) return;
    setResult(null);
    setAnalyzing(true);

    try {
      const [response] = await Promise.all([
        sessionApi.analyze(file, question),
        new Promise((r) => setTimeout(r, ANALYSIS_DURATION_MS)),
      ]);

      setTimeout(() => setResult(response.session), 400);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Analysis complete.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Analysis failed"));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <>
      <ShadowOverlay active={analyzing} />

      <motion.section
        animate={{ opacity: analyzing ? 0.4 : 1 }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        className="min-h-[calc(100vh-6rem)] px-6 md:px-12 pb-20"
      >
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <div className="text-[10px] uppercase tracking-command text-smoke">The Arena</div>
            <h1 className="mt-3 text-3xl md:text-4xl uppercase tracking-command text-white font-bold">
              Stance Analysis
            </h1>
            <div className="hairline mt-8" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="text-[10px] uppercase tracking-command text-smoke">Offering</div>
              <UploadBox file={file} onFile={setFile} />

              <div>
                <div className="text-[10px] uppercase tracking-command text-smoke mb-3">
                  Question
                </div>
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="ASK THE SHADOW..."
                  className="w-full bg-transparent border-0 border-b border-white/30 focus:border-white py-3 text-sm uppercase tracking-display text-white placeholder:text-[#5a5a5a] outline-none transition-colors"
                />
              </div>

              <button
                onClick={onAnalyze}
                disabled={!file || analyzing}
                className="w-full bg-white text-black py-5 text-sm font-bold uppercase tracking-command hover:opacity-80 transition-opacity duration-500 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Analyze
              </button>
            </div>

            <div className="border-t lg:border-t-0 lg:border-l border-white/10 lg:pl-12 pt-12 lg:pt-0 min-h-[400px]">
              <AnimatePresence mode="wait">
                {!result ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    className="h-full min-h-[400px] flex items-center justify-center"
                  >
                    <p className="text-center text-[11px] uppercase tracking-command text-smoke max-w-xs">
                      The shadow watches.
                      <br />
                      Upload to begin.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="space-y-8"
                  >
                    <AnalysisCard data={result} />
                    <ReportPdfActions
                      data={result}
                      sessionId={result.id}
                      createdAt={result.createdAt}
                      reportPdfUrl={result.reportPdfUrl}
                    />
                    {result.id && (
                      <button
                        type="button"
                        onClick={() =>
                          navigate({
                            to: "/sessions/$sessionId",
                            params: { sessionId: result.id! },
                          })
                        }
                        className="w-full border border-white py-4 text-xs uppercase tracking-command text-white hover:bg-white hover:text-black transition-colors duration-500"
                      >
                        Continue with the shadow →
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.section>
    </>
  );
}
