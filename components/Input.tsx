import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-lg border border-(--border) bg-(--surface-2) px-3 py-2 text-sm text-foreground placeholder:text-(--muted-2) shadow-[0_1px_0_rgba(255,255,255,0.08)_inset] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) " +
        className
      }
    />
  );
}
