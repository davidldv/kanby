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
    <div className="min-h-screen bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Kanby</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Collaborative Kanban with realtime updates, activity timeline, and per-card undo.
          </p>
        </header>

        <Panel className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                htmlFor="boardName"
              >
                New board
              </label>
              <Input
                id="boardName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Portfolio Sprint"
              />
            </div>
            <Button onClick={() => void createBoard()}>Create board</Button>
          </div>
        </Panel>

        {error ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}
          </div>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Boards</h2>
          {loading ? <div className="text-sm text-zinc-500">Loading…</div> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {boards.map((b) => (
              <Link
                key={b.id}
                href={`/boards/${b.id}`}
                className="rounded-lg border border-zinc-200 bg-white p-4 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <div className="font-medium text-zinc-900 dark:text-zinc-50">{b.name}</div>
                <div className="mt-1 text-xs text-zinc-500">Updated {new Date(b.updatedAt).toLocaleString()}</div>
              </Link>
            ))}
            {!loading && boards.length === 0 ? (
              <div className="text-sm text-zinc-500">No boards yet. Create one above.</div>
            ) : null}
          </div>
        </section>

        <footer className="pt-6 text-xs text-zinc-500">
          <span>Tip: open this in two tabs to see live updates.</span>
        </footer>
      </div>
    </div>
  );
}
