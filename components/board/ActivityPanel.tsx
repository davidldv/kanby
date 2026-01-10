"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Panel } from "@/components/Card";
import { apiFetch } from "@/lib/client/kanbyClient";

type ActivityEvent = {
  id: string;
  boardId: string;
  entityType: string;
  entityId: string;
  type: string;
  actorUserId: string | null;
  actorName: string;
  actorClientId: string;
  data: unknown;
  createdAt: string;
};

function formatEventType(type: string): string {
  switch (type) {
    case "board.created":
      return "Board created";
    case "board.renamed":
      return "Board renamed";
    case "list.created":
      return "List created";
    case "card.created":
      return "Card created";
    case "card.updated":
      return "Card updated";
    case "card.moved":
      return "Card moved";
    case "card.undone":
      return "Undo";
    default:
      return type;
  }
}

function canUndo(type: string): boolean {
  return type === "card.created" || type === "card.updated" || type === "card.moved";
}

export function ActivityPanel({
  boardId,
  refreshToken,
}: {
  boardId: string;
  refreshToken: number;
}) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await apiFetch<{ events: ActivityEvent[] }>(
        `/api/boards/${boardId}/activity?limit=50`,
      );
      setEvents(data.events);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, refreshToken]);

  const undo = async (eventId: string) => {
    setUndoingId(eventId);
    try {
      await apiFetch(`/api/activity/${eventId}/undo`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setUndoingId(null);
    }
  };

  const rows = useMemo(() => events, [events]);

  return (
    <aside aria-label="Activity" className="lg:sticky lg:top-6">
      <Panel className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Activity</h2>
          <Button
            className="border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-3 text-xs text-zinc-500">Loading…</div>
        ) : (
          <div className="mt-3 space-y-3">
            {rows.length === 0 ? (
              <div className="text-xs text-zinc-500">No activity yet.</div>
            ) : null}

            {rows.map((evt) => {
              const label = formatEventType(evt.type);
              const time = new Date(evt.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div key={evt.id} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-zinc-900 dark:text-zinc-50">{label}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {evt.actorName} • {time}
                      </div>
                    </div>

                    {canUndo(evt.type) ? (
                      <Button
                        className="border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 hover:bg-zinc-50 disabled:hover:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900 dark:disabled:hover:bg-zinc-950"
                        disabled={undoingId === evt.id}
                        onClick={() => void undo(evt.id)}
                        title="Undo this change"
                      >
                        Undo
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </aside>
  );
}
