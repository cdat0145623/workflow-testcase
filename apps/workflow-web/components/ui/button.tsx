import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "default" | "sm" | "icon";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "default", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "border-emerald-500 bg-emerald-500 text-slate-950 hover:bg-emerald-400",
        variant === "secondary" && "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700",
        variant === "ghost" && "border-transparent bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white",
        variant === "danger" && "border-red-700 bg-red-950 text-red-100 hover:bg-red-900",
        size === "default" && "min-h-11 px-4",
        size === "sm" && "min-h-9 px-3 text-xs",
        size === "icon" && "size-11 p-0",
        className,
      )}
      {...props}
    />
  );
});
