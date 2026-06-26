import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "brand" | "ghost" | "outline" | "dark";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  brand: "brand-gradient text-white hover:opacity-90 shadow-lg shadow-brand-600/20",
  ghost: "text-white/70 hover:text-white hover:bg-ink-800",
  outline: "border border-ink-600 text-white hover:bg-ink-800",
  dark: "bg-ink-800 text-white hover:bg-ink-700",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm rounded-xl",
  md: "h-11 px-5 text-sm rounded-2xl",
  lg: "h-12 px-6 text-base rounded-2xl",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "brand", size = "md", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
