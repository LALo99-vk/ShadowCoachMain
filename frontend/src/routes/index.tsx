import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Silhouette } from "@/components/shadow/Silhouette";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SHADOWCOACH" },
      { name: "description", content: "Discipline reveals weakness." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <section className="relative min-h-[calc(100vh-6rem)] flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Watching silhouette in the background */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 0.08, y: 0 }}
        transition={{ duration: 2.4, ease: "easeOut" }}
        className="absolute inset-x-0 bottom-0 flex justify-center pointer-events-none"
      >
        <Silhouette className="h-[90vh] w-auto" />
      </motion.div>

      {/* Drifting mist */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2 }}
        style={{
          background:
            "radial-gradient(ellipse 60% 30% at 50% 100%, rgba(255,255,255,0.05), transparent 70%)",
        }}
      />

      <div className="relative z-10 text-center">
        <motion.h1
          initial={{ opacity: 0, letterSpacing: "0.6em" }}
          animate={{ opacity: 1, letterSpacing: "0.35em" }}
          transition={{ duration: 1.6, ease: "easeOut" }}
          className="text-5xl md:text-8xl font-bold uppercase text-white tracking-command"
        >
          Shadowcoach
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 1.2 }}
          className="mt-8 text-xs md:text-sm uppercase tracking-command text-smoke"
        >
          Discipline reveals weakness.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6, duration: 1 }}
          className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-6"
        >
          <Link
            to="/login"
            className="border border-white px-10 py-4 text-xs uppercase tracking-command text-white hover:bg-white hover:text-black transition-colors duration-500"
          >
            Enter Training
          </Link>
          <Link
            to="/analyze"
            className="border border-white px-10 py-4 text-xs uppercase tracking-command text-white hover:bg-white hover:text-black transition-colors duration-500"
          >
            Begin Analysis
          </Link>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.4, duration: 1 }}
        className="absolute bottom-8 left-0 right-0 text-center text-[10px] uppercase tracking-command text-smoke"
      >
        The shadow is watching.
      </motion.div>
    </section>
  );
}
