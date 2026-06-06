import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { sessionApi } from "@/lib/api/session";
import { getApiErrorMessage } from "@/lib/api/errors";
import { requireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/sessions/")({
  head: () => ({ meta: [{ title: "History — SHADOWCOACH" }] }),
  beforeLoad: ({ context }) => requireAuth(context.queryClient),
  component: SessionsPage,
});

function SessionsPage() {
  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => sessionApi.list(),
  });

  return (
    <section className="min-h-[calc(100vh-6rem)] px-6 md:px-12 pb-20">
      <div className="max-w-5xl mx-auto">
        <div className="mb-12 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-command text-smoke">Archive</div>
            <h1 className="mt-3 text-3xl uppercase tracking-command text-white font-bold">
              Coaching history
            </h1>
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

        {!isLoading && !error && sessions.length === 0 && (
          <p className="text-[11px] uppercase tracking-command text-smoke">
            No sessions yet. Upload your first stance.
          </p>
        )}

        <div className="grid gap-6">
          {sessions.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
            >
              <div className="flex items-stretch border border-white/10 hover:border-white/30 transition-colors">
                <Link
                  to="/sessions/$sessionId"
                  params={{ sessionId: s.id }}
                  className="flex-1 min-w-0 p-4 md:p-6"
                >
                  <div className="flex gap-6 items-center">
                    <img
                      src={s.imageUrl}
                      alt="Stance"
                      className="w-20 h-20 object-cover border border-white/10"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-bold text-white">{s.overallScore}</span>
                        <span className="text-[10px] uppercase tracking-command text-smoke">
                          / 100 · {s.confidenceLevel}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-white truncate">{s.priorityFix}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-command text-smoke">
                        {new Date(s.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </Link>
                <Link
                  to="/reports"
                  search={{ session: s.id }}
                  className="shrink-0 flex items-center px-4 md:px-6 text-[10px] uppercase tracking-command text-smoke hover:text-white border-l border-white/10 transition-colors"
                >
                  PDF →
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
