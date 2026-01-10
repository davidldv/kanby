import type { PropsWithChildren } from "react";

export function Panel({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={"rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 " + className}>
      {children}
    </div>
  );
}
