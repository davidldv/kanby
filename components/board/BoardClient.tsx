"use client";

import Link from "next/link";
import {
  closestCorners,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Panel } from "@/components/Card";
import { apiFetch, getActorName, setActorName } from "@/lib/client/kanbyClient";
import { ActivityPanel } from "@/components/board/ActivityPanel";

type ApiBoard = {
  id: string;
  name: string;
  lists: Array<{
    id: string;
    title: string;
    position: number;
    cards: Array<{
      id: string;
      title: string;
      description: string;
      dueAt: string | null;
      position: number;
      listId: string;
      boardId: string;
    }>;
  }>;
};

type BoardState = {
  id: string;
  name: string;
  lists: Array<{ id: string; title: string }>;
  cardsByList: Record<string, Array<ApiBoard["lists"][number]["cards"][number]>>;
};

function normalizeBoard(board: ApiBoard): BoardState {
  const lists = [...board.lists]
    .sort((a, b) => a.position - b.position)
    .map((l) => ({ id: l.id, title: l.title }));

  const cardsByList: BoardState["cardsByList"] = {};
  for (const list of board.lists) {
    cardsByList[list.id] = [...list.cards].sort((a, b) => a.position - b.position);
  }

  return { id: board.id, name: board.name, lists, cardsByList };
}

function useBoardEvents(boardId: string, onEvent: () => void) {
  useEffect(() => {
    const es = new EventSource(`/api/boards/${boardId}/events`);

    const handler = () => {
      onEvent();
    };

    es.addEventListener("board", handler);

    return () => {
      es.removeEventListener("board", handler);
      es.close();
    };
  }, [boardId, onEvent]);
}

function listDroppableId(listId: string) {
  return `list:${listId}`;
}

function ListDropZone({ listId, children }: { listId: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({
    id: listDroppableId(listId),
    data: { type: "list" as const, listId },
  });

  return (
    <div ref={setNodeRef} className="space-y-2">
      {children}
    </div>
  );
}

function SortableCard({
  card,
  listId,
}: {
  card: ApiBoard["lists"][number]["cards"][number];
  listId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: {
      type: "card" as const,
      listId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={
        "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm shadow-sm hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 " +
        (isDragging ? "opacity-60" : "")
      }
      aria-label={`Card: ${card.title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-zinc-900 dark:text-zinc-50">{card.title}</div>
      </div>
      {card.dueAt ? (
        <div className="mt-1 text-xs text-zinc-500">Due {new Date(card.dueAt).toLocaleDateString()}</div>
      ) : null}
    </button>
  );
}

export default function BoardClient({ boardId }: { boardId: string }) {
  const [state, setState] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityRefreshToken, setActivityRefreshToken] = useState(0);

  const [actorName, setActorNameState] = useState<string>(getActorName());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const refresh = async () => {
    try {
      const data = await apiFetch<{ board: ApiBoard }>(`/api/boards/${boardId}`);
      setState(normalizeBoard(data.board));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load board");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useBoardEvents(boardId, () => {
    void refresh();
    setActivityRefreshToken((t) => t + 1);
  });

  const allCardIds = useMemo(() => {
    if (!state) return [];
    return Object.values(state.cardsByList).flat().map((c) => c.id);
  }, [state]);

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!state) return;

    const activeId = String(event.active.id);
    const activeData = event.active.data.current as { type?: string; listId?: string } | undefined;
    if (activeData?.type !== "card" || !activeData.listId) return;

    const fromListId = activeData.listId;

    let toListId: string | null = null;
    let overCardId: string | null = null;

    if (event.over) {
      const overId = String(event.over.id);
      const overData = event.over.data.current as { type?: string; listId?: string } | undefined;

      if (overData?.type === "card" && overData.listId) {
        toListId = overData.listId;
        overCardId = overId;
      } else if (overId.startsWith("list:")) {
        toListId = overId.slice("list:".length);
      }
    }

    if (!toListId) return;

    const fromCards = state.cardsByList[fromListId] ?? [];
    const toCards = state.cardsByList[toListId] ?? [];

    const activeIndex = fromCards.findIndex((c) => c.id === activeId);
    if (activeIndex < 0) return;

    const nextCardsByList = { ...state.cardsByList };
    const moving = fromCards[activeIndex];

    const nextFrom = fromCards.filter((c) => c.id !== activeId);
    nextCardsByList[fromListId] = nextFrom;

    let insertIndex = toCards.length;
    if (overCardId) {
      const idx = toCards.findIndex((c) => c.id === overCardId);
      if (idx >= 0) insertIndex = idx;
    }

    const nextTo = [...toCards];

    if (fromListId === toListId) {
      const current = [...fromCards];
      const overIndex = overCardId ? current.findIndex((c) => c.id === overCardId) : -1;
      if (overIndex >= 0) {
        const reordered = arrayMove(current, activeIndex, overIndex);
        nextCardsByList[toListId] = reordered;
      } else {
        nextCardsByList[toListId] = current;
      }
    } else {
      nextTo.splice(insertIndex, 0, { ...moving, listId: toListId });
      nextCardsByList[toListId] = nextTo;
    }

    const prevState = state;
    setState({ ...state, cardsByList: nextCardsByList });

    const finalTo = nextCardsByList[toListId];
    const movedIndex = finalTo.findIndex((c) => c.id === activeId);
    const beforeCardId = movedIndex > 0 ? finalTo[movedIndex - 1]?.id ?? null : null;
    const afterCardId = movedIndex < finalTo.length - 1 ? finalTo[movedIndex + 1]?.id ?? null : null;

    try {
      await apiFetch(`/api/cards/${activeId}/move`, {
        method: "POST",
        body: JSON.stringify({ toListId, beforeCardId, afterCardId }),
      });
    } catch {
      setState(prevState);
    }
  };

  const createList = async (title: string) => {
    if (!title.trim()) return;
    await apiFetch(`/api/boards/${boardId}/lists`, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    await refresh();
  };

  const createCard = async (listId: string, title: string) => {
    if (!title.trim()) return;
    await apiFetch(`/api/boards/${boardId}/lists/${listId}/cards`, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    await refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-8 dark:bg-black">
        <div className="mx-auto max-w-6xl">
          <div className="text-sm text-zinc-500">Loading board…</div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-8 dark:bg-black">
        <div className="mx-auto max-w-3xl space-y-4">
          <Link className="text-sm text-zinc-600 hover:underline" href="/">
            ← Back
          </Link>
          <Panel className="p-4">
            <div className="font-medium">Board not found</div>
            {error ? <div className="mt-2 text-sm text-zinc-500">{error}</div> : null}
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link className="text-sm text-zinc-600 hover:underline" href="/">
              Boards
            </Link>
            <span className="text-zinc-300">/</span>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{state.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500" htmlFor="actorName">
              Name
            </label>
            <Input
              id="actorName"
              value={actorName}
              onChange={(e) => {
                const next = e.target.value;
                setActorNameState(next);
                setActorName(next);
              }}
              className="w-40"
              aria-label="Your display name"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {state.lists.map((list) => {
                const cards = state.cardsByList[list.id] ?? [];

                return (
                  <section key={list.id} className="w-72 shrink-0" aria-label={`List ${list.title}`}>
                    <Panel className="p-3">
                      <div className="mb-3 flex items-center justify-between" id={listDroppableId(list.id)}>
                        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{list.title}</h2>
                        <span className="text-xs text-zinc-500">{cards.length}</span>
                      </div>

                      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                        <ListDropZone listId={list.id}>
                          {cards.map((card) => (
                            <SortableCard key={card.id} card={card} listId={list.id} />
                          ))}
                          {cards.length === 0 ? (
                            <div
                              className="rounded-md border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800"
                              aria-hidden="true"
                            >
                              Drop a card here
                            </div>
                          ) : null}
                        </ListDropZone>
                      </SortableContext>

                      <CreateCardForm onCreate={(title) => void createCard(list.id, title)} />
                    </Panel>
                  </section>
                );
              })}

              <section className="w-72 shrink-0">
                <Panel className="p-3">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Add list</h2>
                  <CreateListForm onCreate={(title) => void createList(title)} />
                </Panel>
              </section>
            </div>
          </DndContext>

          <ActivityPanel boardId={boardId} refreshToken={activityRefreshToken} />
        </div>
      </main>

      <div className="sr-only" aria-hidden="true">
        {allCardIds.length}
      </div>
    </div>
  );
}

function CreateListForm({ onCreate }: { onCreate: (title: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const next = value;
        setValue("");
        onCreate(next);
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="List title" />
      <Button type="submit">Add</Button>
    </form>
  );
}

function CreateCardForm({ onCreate }: { onCreate: (title: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const next = value;
        setValue("");
        onCreate(next);
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add a card" />
      <Button type="submit">+</Button>
    </form>
  );
}
