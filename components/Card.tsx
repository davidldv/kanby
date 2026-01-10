import type { PropsWithChildren } from "react";

export function Panel({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={
        "rounded-xl border border-(--border) bg-(--surface) shadow-[0_16px_48px_-28px_rgba(2,6,23,0.35)] backdrop-blur supports-[backdrop-filter]:bg-(--surface) " +
        className
      }
    >
      {children}
    </div>
  );
}
