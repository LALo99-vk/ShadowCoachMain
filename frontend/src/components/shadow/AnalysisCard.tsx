import { motion } from "framer-motion";

export interface AnalysisData {
  overallScore: number;
  strengths: string[];
  areasToImprove: string[];
  priorityFix: string;
  drillSuggestion: string;
  confidenceLevel: string;
}

const Section = ({
  title,
  delay,
  children,
}: {
  title: string;
  delay: number;
  children: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8, ease: "easeOut", delay }}
    className="py-6"
  >
    <div className="text-[10px] uppercase tracking-command text-smoke mb-3">{title}</div>
    {children}
    <div className="hairline mt-6" />
  </motion.div>
);

export function AnalysisCard({ data }: { data: AnalysisData }) {
  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="text-[10px] uppercase tracking-command text-smoke"
      >
        Shadow Report
      </motion.div>

      <div className="hairline mt-4" />

      <Section title="Overall Score" delay={0.0}>
        <div className="flex items-baseline gap-3">
          <div className="text-6xl font-bold text-white tracking-tight">
            {data.overallScore}
          </div>
          <div className="text-sm uppercase tracking-command text-smoke">/ 100</div>
        </div>
      </Section>

      <Section title="Strengths" delay={0.2}>
        <ul className="space-y-2">
          {data.strengths.map((s, i) => (
            <li key={i} className="text-white text-sm flex gap-3">
              <span className="text-smoke">—</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Weaknesses" delay={0.4}>
        <ul className="space-y-2">
          {data.areasToImprove.map((s, i) => (
            <li key={i} className="text-white text-sm flex gap-3">
              <span className="text-smoke">—</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Priority Fix" delay={0.6}>
        <p className="text-white text-base uppercase tracking-display leading-relaxed">
          {data.priorityFix}
        </p>
        <p className="mt-2 text-[11px] uppercase tracking-command text-smoke">
          One correction. No exceptions.
        </p>
      </Section>

      <Section title="Drill" delay={0.8}>
        <p className="text-white text-sm leading-relaxed">{data.drillSuggestion}</p>
      </Section>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.8 }}
        className="flex items-center justify-between pt-2"
      >
        <span className="text-[10px] uppercase tracking-command text-smoke">Confidence</span>
        <span className="text-sm uppercase tracking-command text-white">
          {data.confidenceLevel}
        </span>
      </motion.div>
    </div>
  );
}
