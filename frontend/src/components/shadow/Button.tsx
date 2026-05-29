import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

type Variant = "outline" | "solid" | "ghost";

interface Props extends HTMLMotionProps<"button"> {
  variant?: Variant;
}

export function ShadowButton({ variant = "outline", className, children, ...rest }: Props) {
  const base =
    "relative inline-flex items-center justify-center px-8 py-4 text-xs font-bold uppercase tracking-command transition-colors duration-500 ease-out select-none";
  const styles: Record<Variant, string> = {
    outline:
      "border border-white text-white hover:bg-white hover:text-black",
    solid:
      "bg-white text-black hover:opacity-80",
    ghost:
      "text-white hover:text-smoke",
  };
  return (
    <motion.button
      whileTap={{ opacity: 0.7 }}
      className={cn(base, styles[variant], className)}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
