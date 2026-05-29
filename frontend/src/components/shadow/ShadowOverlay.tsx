import { AnimatePresence, motion } from "framer-motion";
import { Silhouette } from "./Silhouette";

interface Props {
  active: boolean;
}

export function ShadowOverlay({ active }: Props) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-50 pointer-events-none overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1.2, ease: "easeInOut" } }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        >
          {/* Step 1 — Darkening */}
          <motion.div
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          />

          {/* Step 3 — Smoke from edges */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.4, ease: "easeOut" }}
            style={{
              background:
                "radial-gradient(ellipse 70% 50% at 10% 100%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(ellipse 70% 50% at 90% 0%, rgba(255,255,255,0.08), transparent 60%), radial-gradient(ellipse 80% 30% at 50% 110%, rgba(255,255,255,0.12), transparent 70%)",
              filter: "blur(40px)",
            }}
          />

          {/* Step 2 — The silhouette rises */}
          <motion.div
            className="absolute inset-x-0 bottom-0 flex justify-center"
            initial={{ y: 200, opacity: 0 }}
            animate={{ y: 0, opacity: 0.18 }}
            transition={{ duration: 1.8, ease: "easeOut", delay: 0.2 }}
          >
            <Silhouette className="h-[85vh] w-auto" />
          </motion.div>

          {/* Step 5 — The text */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.2 }}
          >
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold uppercase tracking-command text-white">
                {"ANALYZING STANCE".split("").map((ch, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.4 + i * 0.06, duration: 0.4 }}
                  >
                    {ch === " " ? "\u00A0" : ch}
                  </motion.span>
                ))}
              </div>
              {/* The breath line */}
              <motion.div
                className="mt-8 mx-auto h-px bg-white origin-left"
                initial={{ scaleX: 0, width: 240 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 3.5, ease: "easeInOut", delay: 1.8 }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
