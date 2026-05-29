import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  role: "user" | "coach";
  text: string;
}

export function ChatBubble({ role, text }: Props) {
  const isUser = role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn("w-full flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[75%] px-5 py-4 text-sm leading-relaxed",
          isUser
            ? "bg-[#1a1a1a] text-white"
            : "bg-black text-white border-l border-smoke pl-5",
        )}
      >
        {!isUser && (
          <div className="text-[9px] uppercase tracking-command text-smoke mb-2">
            Shadow
          </div>
        )}
        <div className="whitespace-pre-wrap">{text}</div>
      </div>
    </motion.div>
  );
}
