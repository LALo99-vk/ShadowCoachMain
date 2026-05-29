import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChatBubble } from "@/components/shadow/ChatBubble";
import { AnalysisCard } from "@/components/shadow/AnalysisCard";
import { sessionApi } from "@/lib/api/session";
import { getApiErrorMessage } from "@/lib/api/errors";
import { requireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/sessions/$sessionId")({
  head: () => ({ meta: [{ title: "Session — SHADOWCOACH" }] }),
  beforeLoad: ({ context }) => requireAuth(context.queryClient),
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const { data: session, isLoading, error } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => sessionApi.get(sessionId),
  });

  const followUp = useMutation({
    mutationFn: (message: string) => sessionApi.followUp(sessionId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, "Failed to send message")),
  });

  const remove = useMutation({
    mutationFn: () => sessionApi.delete(sessionId),
    onSuccess: () => {
      toast.success("Session deleted.");
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      navigate({ to: "/sessions" });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, "Failed to delete session")),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.chats.length]);

  if (isLoading) {
    return (
      <section className="min-h-[calc(100vh-6rem)] flex items-center justify-center">
        <p className="text-[11px] uppercase tracking-command text-smoke">Loading session...</p>
      </section>
    );
  }

  if (error || !session) {
    return (
      <section className="min-h-[calc(100vh-6rem)] flex flex-col items-center justify-center gap-6">
        <p className="text-[11px] uppercase tracking-command text-smoke">
          {getApiErrorMessage(error, "Session not found")}
        </p>
        <Link to="/sessions" className="border border-white px-6 py-3 text-xs uppercase tracking-command text-white">
          Back to history
        </Link>
      </section>
    );
  }

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || followUp.isPending) return;
    setInput("");
    followUp.mutate(text);
  };

  return (
    <section className="min-h-[calc(100vh-6rem)] px-6 md:px-12 pb-20">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/sessions"
            className="text-[10px] uppercase tracking-command text-smoke hover:text-white transition-colors"
          >
            ← History
          </Link>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="text-[10px] uppercase tracking-command text-smoke hover:text-red-400 transition-colors disabled:opacity-50"
          >
            Delete session
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div>
            <img
              src={session.imageUrl}
              alt="Stance"
              className="w-full max-h-80 object-contain border border-white/10 bg-[#111]"
            />
            <div className="mt-8">
              <AnalysisCard data={session} />
            </div>
          </div>

          <div className="flex flex-col border-t lg:border-t-0 lg:border-l border-white/10 lg:pl-12 pt-12 lg:pt-0 min-h-[500px]">
            <div className="text-[10px] uppercase tracking-command text-smoke mb-2">
              Consultation
            </div>
            <h2 className="text-xl uppercase tracking-command text-white font-bold mb-6">
              Speak to the shadow
            </h2>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto space-y-6 py-4 pr-1"
              style={{ maxHeight: "min(50vh, 480px)" }}
            >
              {session.chats.length === 0 && (
                <ChatBubble
                  role="coach"
                  text="Ask about your stance, drills, or the priority fix from your report."
                />
              )}
              {session.chats.map((m) => (
                <ChatBubble
                  key={m.id}
                  role={m.role === "USER" ? "user" : "coach"}
                  text={m.message}
                />
              ))}
              {followUp.isPending && (
                <p className="text-[10px] uppercase tracking-command text-smoke">Shadow thinks...</p>
              )}
            </div>

            <form onSubmit={send} className="mt-6">
              <div className="hairline mb-4" />
              <div className="flex items-center gap-4">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="SPEAK TO THE SHADOW..."
                  disabled={followUp.isPending}
                  className="flex-1 bg-[#111] px-5 py-4 text-sm uppercase tracking-display text-white placeholder:text-[#5a5a5a] outline-none focus:bg-[#1a1a1a] transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={followUp.isPending || !input.trim()}
                  aria-label="Send"
                  className="w-14 h-14 flex items-center justify-center border border-white text-white hover:bg-white hover:text-black transition-colors duration-500 disabled:opacity-30"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
