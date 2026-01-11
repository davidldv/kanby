"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Panel } from "@/components/Card";
import { Input } from "@/components/Input";
import { apiFetch } from "@/lib/client/kanbyClient";

type BoardSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export default function Home() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");

  const refresh = async () => {
    try {
      const data = await apiFetch<{ boards: BoardSummary[] }>("/api/boards");
      setBoards(data.boards);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load boards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const createBoard = async () => {
    const name = newName.trim() || "My Board";
    setNewName("");

    const data = await apiFetch<{ board: { id: string } }>("/api/boards", {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    window.location.href = `/boards/${data.board.id}`;
  };

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Kanby
              <span className="ml-2 bg-linear-to-r from-teal-400 via-emerald-400 to-amber-300 bg-clip-text text-transparent">
                Studio
              </span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-(--muted)">
              Cozy Kanban with live updates, an activity timeline, and undo per card.
            </p>
          </div>
        </header>

        <Panel className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                className="mb-1 block text-xs font-medium text-(--muted)"
                htmlFor="boardName"
              >
                New board
              </label>
              <Input
                id="boardName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Project Sprint"
              />
            </div>
            <Button onClick={() => void createBoard()} className="cursor-pointer shadow-[0_18px_50px_-30px_rgba(20,184,166,0.8)]">
              Create board
            </Button>
          </div>
          <div className="mt-3 text-xs text-(--muted-2)">
            Tip: open two tabs to see realtime updates.
          </div>
        </Panel>

        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 shadow-[0_12px_40px_-28px_rgba(245,158,11,0.35)]">
            {error}
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Boards</h2>
            <div className="text-xs text-(--muted-2)">{boards.length} total</div>
          </div>
          {loading ? <div className="text-sm text-(--muted)">Loading…</div> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {boards.map((b) => (
              <Link
                key={b.id}
                href={`/boards/${b.id}`}
                className="group rounded-xl border border-(--border) bg-(--surface) p-4 shadow-[0_18px_50px_-36px_rgba(2,6,23,0.45)] backdrop-blur transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium text-foreground">{b.name}</div>
                  <span className="mt-0.5 inline-flex h-6 items-center rounded-full border border-(--border) bg-(--surface-2) px-2 text-[11px] text-(--muted)">
                    Open
                  </span>
                </div>
                <div className="mt-1 text-xs text-(--muted-2)">
                  Updated {new Date(b.updatedAt).toLocaleString()}
                </div>
                <div className="mt-3 h-px w-full bg-(--border) opacity-60" />
                <div className="mt-3 text-xs text-(--muted)">
                  Drag cards · See activity · Undo changes
                </div>
              </Link>
            ))}
            {!loading && boards.length === 0 ? (
              <Panel className="p-5 sm:col-span-2">
                <div className="text-sm font-medium text-foreground">No boards yet</div>
                <div className="mt-1 text-sm text-(--muted)">Create one above to start dragging cards and undoing changes.</div>
              </Panel>
            ) : null}
          </div>
        </section>

        <footer className="pt-2 text-xs text-(--muted-2)">
          Built with Next.js + Prisma + SSE.
        </footer>
      </div>
    </div>
  );
}
