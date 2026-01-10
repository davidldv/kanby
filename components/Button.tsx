import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ className = "", variant = "primary", size = "md", ...props }: Props) {
  const sizeClass =
    size === "sm"
      ? "h-8 px-2.5 text-xs"
      : size === "lg"
        ? "h-11 px-4 text-sm"
        : "h-9 px-3 text-sm";

  const variantClass =
    variant === "secondary"
      ? "border border-(--border) bg-(--surface-2) text-foreground hover:brightness-105"
      : variant === "ghost"
        ? "bg-transparent text-foreground hover:bg-black/5 dark:hover:bg-white/5"
        : variant === "danger"
          ? "bg-rose-600 text-white hover:bg-rose-500"
          : "bg-(--accent) text-white shadow-[0_10px_30px_-18px_rgba(20,184,166,0.55)] hover:brightness-110";

  return (
    <button
      {...props}
      className={
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[transform,filter,background-color,box-shadow] active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) " +
        sizeClass +
        " " +
        variantClass +
        " " +
        className
      }
    />
  );
}
