export default function LoadingBoard() {
  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8 dark:bg-black">
      <div className="mx-auto max-w-6xl">
        <div className="h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-72 flex-shrink-0 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="h-3 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 3 }).map((__, j) => (
                  <div key={j} className="h-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
