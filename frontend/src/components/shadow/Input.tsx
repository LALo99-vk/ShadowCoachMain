import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  variant?: "underline" | "bordered";
  label?: string;
  /** When false, text is shown as typed (default). When true, styled uppercase. */
  uppercase?: boolean;
}

export const ShadowInput = forwardRef<HTMLInputElement, Props>(function ShadowInput(
  { variant = "underline", label, uppercase = false, className, ...rest },
  ref,
) {
  const base = cn(
    "w-full bg-transparent text-white placeholder:text-[#5a5a5a] tracking-display text-sm py-3 px-1 outline-none transition-all duration-300",
    uppercase && "uppercase",
  );
  const styles =
    variant === "underline"
      ? "border-0 border-b border-white/30 focus:border-white"
      : "border border-white/30 focus:border-white px-4";
  return (
    <label className="block">
      {label && (
        <span className="block text-[10px] uppercase tracking-command text-smoke mb-2">
          {label}
        </span>
      )}
      <input ref={ref} className={cn(base, styles, className)} {...rest} />
    </label>
  );
});

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: string[];
  uppercase?: boolean;
}

export function ShadowSelect({ label, options, uppercase = false, className, ...rest }: SelectProps) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[10px] uppercase tracking-command text-smoke mb-2">
          {label}
        </span>
      )}
      <select
        className={cn(
          "w-full bg-black text-white tracking-display text-sm py-3 px-1 border-0 border-b border-white/30 focus:border-white outline-none appearance-none",
          uppercase && "uppercase",
          className,
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-black text-white">
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
