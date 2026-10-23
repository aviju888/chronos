"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/modern/lib/cn";

/* ─────────────────────────────────────────────────────────
 * BUTTON — the atom Beautiful UI's components import but the
 * site doesn't publish. Rebuilt from how the components use it.
 *
 * craft: press scale on :active only (Button Press), no hover
 * animation beyond an instant color swap (Hover Restraint).
 * ───────────────────────────────────────────────────────── */

export type ButtonVariant = "primary" | "secondary" | "accent" | "ghost" | "quiet" | "success" | "danger";
export type ButtonSize = "xs" | "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-canvas shadow-hairline hover:opacity-90",
  secondary: "bg-surface text-ink shadow-btn hover:bg-hover",
  accent: "bg-accent text-accent-fg shadow-[inset_0_1px_0_oklch(100%_0_0/.18)] hover:brightness-105",
  ghost: "text-ink-2 hover:bg-hover hover:text-ink",
  quiet: "text-ink-2 hover:text-ink",
  success: "bg-green text-white shadow-[inset_0_1px_0_oklch(100%_0_0/.18)]",
  danger: "bg-red text-white shadow-[inset_0_1px_0_oklch(100%_0_0/.18)] hover:brightness-105",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "h-6 gap-1 rounded-[7px] px-2 text-[12px]",
  sm: "h-7 gap-1.5 rounded-control px-2.5 text-[12.5px]",
  md: "h-9 gap-2 rounded-[10px] px-3.5 text-[13.5px]",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none",
        "transition-[background-color,color,opacity,transform,filter] duration-100 ease-out",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
