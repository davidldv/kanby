"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Panel } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
    case "board.deleted":
      return "Board deleted";
    case "list.created":
      return "List created";
    case "list.renamed":
      return "List renamed";
    case "list.deleted":
      return "List deleted";
    case "card.created":
      return "Card created";
    case "card.updated":
      return "Card updated";
    case "card.moved":
      return "Card moved";
    case "card.deleted":
      return "Card deleted";
    case "card.undone":
      return "Undo";
    default:
      return type;
  }
}

function canUndo(type: string): boolean {
  return type === "card.created" || type === "card.updated" || type === "card.moved" || type === "card.deleted";
}

function getRevertedEventId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const v = data as Record<string, unknown>;
  return typeof v.revertedEventId === "string" ? v.revertedEventId : null;
}

export function ActivityPanel({
  boardId,
  refreshToken,
  scrollAreaClassName,
}: {
  boardId: string;
  refreshToken: number;
  scrollAreaClassName?: string;
}) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

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

  const clear = async () => {
    setClearing(true);
    try {
      await apiFetch(`/api/boards/${boardId}/activity/clear`, { method: "POST" });
      // The server will now filter older events for this client.
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear activity");
    } finally {
      setClearing(false);
      setClearOpen(false);
    }
  };

  const rows = useMemo(() => events, [events]);
  const hasEvents = rows.length > 0;

  const undoneIds = useMemo(() => {
    const ids = new Set<string>();
    for (const evt of events) {
      if (evt.type !== "card.undone") continue;
      const reverted = getRevertedEventId(evt.data);
      if (reverted) ids.add(reverted);
    }
    return ids;
  }, [events]);

  return (
    <section aria-label="Activity" className="w-full">
      <Panel className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Activity</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="cursor-pointer"
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              Refresh
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="cursor-pointer"
              disabled={loading || clearing || !hasEvents}
              onClick={() => setClearOpen(true)}
              title={hasEvents ? "Clear activity" : "Nothing to clear"}
            >
              Clear
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-3 text-xs text-(--muted)">Loading…</div>
        ) : (
          <div className={"mt-3 space-y-3 " + (scrollAreaClassName ?? "")}>
            {rows.length === 0 ? (
              <div className="text-xs text-(--muted)">No activity yet.</div>
            ) : null}

            {rows.map((evt) => {
              const label = formatEventType(evt.type);
              const time = new Date(evt.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              const isUndone = undoneIds.has(evt.id);

              return (
                <div
                  key={evt.id}
                  className="rounded-xl border border-(--border) bg-(--surface-2)/70 p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-foreground">{label}</div>
                      <div className="mt-0.5 text-[11px] text-(--muted-2)">
                        {evt.actorName} • {time}
                      </div>
                    </div>

                    {canUndo(evt.type) ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="cursor-pointer"
                        disabled={undoingId === evt.id || isUndone}
                        onClick={() => void undo(evt.id)}
                        title="Undo this change"
                      >
                        {isUndone ? "Undone" : "Undo"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={clearOpen}
        title="Clear activity?"
        description="This clears the activity feed for you on this device. New actions will appear again as they happen."
        confirmLabel="Clear activity"
        cancelLabel="Cancel"
        confirming={clearing}
        onCancel={() => (clearing ? null : setClearOpen(false))}
        onConfirm={() => void clear()}
      />
    </section>
  );
}
