"use client";

import Link from "next/link";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  DragEndEvent,
  DragStartEvent,
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
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
  onDelete,
}: {
  card: ApiBoard["lists"][number]["cards"][number];
  listId: string;
  onDelete: () => void;
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
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={
        "group w-full cursor-grab touch-none rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2 text-left text-sm shadow-[0_14px_44px_-36px_rgba(2,6,23,0.55)] transition-[transform,filter,opacity,box-shadow] hover:-translate-y-px hover:shadow-[0_22px_64px_-46px_rgba(2,6,23,0.75)] hover:brightness-105 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) " +
        (isDragging ? "opacity-30" : "")
      }
      aria-label={`Card: ${card.title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-foreground">{card.title}</div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 rounded-md p-0 opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete task"
          aria-label="Delete task"
        >
          ×
        </Button>
      </div>
      {card.dueAt ? (
        <div className="mt-1 text-xs text-(--muted-2)">Due {new Date(card.dueAt).toLocaleDateString()}</div>
      ) : null}
    </div>
  );
}

export default function BoardClient({ boardId }: { boardId: string }) {
  const [state, setState] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityRefreshToken, setActivityRefreshToken] = useState(0);

  const [isEditingBoardName, setIsEditingBoardName] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState<string>("");
  const [savingBoardName, setSavingBoardName] = useState(false);
  const [boardDeleteOpen, setBoardDeleteOpen] = useState(false);
  const [deletingBoard, setDeletingBoard] = useState(false);

  const [activeCard, setActiveCard] = useState<{
    card: ApiBoard["lists"][number]["cards"][number];
    listId: string;
  } | null>(null);

  const [deleteDialog, setDeleteDialog] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListTitle, setEditingListTitle] = useState<string>("");
  const [listDeleteDialog, setListDeleteDialog] = useState<{
    id: string;
    title: string;
    cardCount: number;
  } | null>(null);
  const [deletingList, setDeletingList] = useState(false);

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
      const message = e instanceof Error ? e.message : "Failed to load board";
      // If the board was deleted (or never existed), show the not-found state.
      if (typeof message === "string" && message.includes("API 404:")) {
        setState(null);
      }
      setError(message);
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

  const startEditBoardName = () => {
    if (!state) return;
    setEditingBoardName(state.name);
    setIsEditingBoardName(true);
  };

  const cancelEditBoardName = () => {
    setIsEditingBoardName(false);
    setEditingBoardName("");
  };

  const saveBoardName = async () => {
    if (!state || savingBoardName) return;
    const next = editingBoardName.trim();
    if (!next) {
      cancelEditBoardName();
      return;
    }

    if (next === state.name) {
      cancelEditBoardName();
      return;
    }

    setSavingBoardName(true);
    try {
      await apiFetch<{ board: { id: string; name: string } }>(`/api/boards/${boardId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: next }),
      });
      setState({ ...state, name: next });
      cancelEditBoardName();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename board");
    } finally {
      setSavingBoardName(false);
    }
  };

  const confirmDeleteBoard = async () => {
    if (deletingBoard) return;
    setDeletingBoard(true);
    try {
      await apiFetch(`/api/boards/${boardId}`, { method: "DELETE" });
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete board");
    } finally {
      setDeletingBoard(false);
      setBoardDeleteOpen(false);
    }
  };

  const allCardIds = useMemo(() => {
    if (!state) return [];
    return Object.values(state.cardsByList).flat().map((c) => c.id);
  }, [state]);

  const handleDragStart = (event: DragStartEvent) => {
    if (!state) return;

    const activeId = String(event.active.id);
    const activeData = event.active.data.current as { type?: string; listId?: string } | undefined;
    if (activeData?.type !== "card" || !activeData.listId) return;

    const listId = activeData.listId;
    const card = (state.cardsByList[listId] ?? []).find((c) => c.id === activeId);
    if (!card) return;
    setActiveCard({ card, listId });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCard(null);
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

  const requestDeleteCard = (cardId: string, title: string) => {
    setDeleteDialog({ id: cardId, title });
  };

  const confirmDeleteCard = async () => {
    if (!deleteDialog) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/cards/${deleteDialog.id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setDeleting(false);
      setDeleteDialog(null);
    }
  };

  const startEditList = (listId: string, title: string) => {
    setEditingListId(listId);
    setEditingListTitle(title);
  };

  const cancelEditList = () => {
    setEditingListId(null);
    setEditingListTitle("");
  };

  const saveListTitle = async () => {
    if (!editingListId) return;
    const title = editingListTitle.trim();
    if (!title) return;
    await apiFetch(`/api/boards/${boardId}/lists/${editingListId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    cancelEditList();
    await refresh();
  };

  const requestDeleteList = (listId: string, title: string, cardCount: number) => {
    setListDeleteDialog({ id: listId, title, cardCount });
  };

  const confirmDeleteList = async () => {
    if (!listDeleteDialog) return;
    setDeletingList(true);
    try {
      await apiFetch(`/api/boards/${boardId}/lists/${listDeleteDialog.id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setDeletingList(false);
      setListDeleteDialog(null);
      if (editingListId === listDeleteDialog?.id) cancelEditList();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <Panel className="p-4">
            <div className="text-sm text-(--muted)">Loading board…</div>
          </Panel>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen px-6 py-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <Link
            className="text-sm text-(--muted) hover:text-foreground hover:underline"
            href="/"
          >
            ← Back
          </Link>
          <Panel className="p-4">
            <div className="font-medium text-foreground">Board not found</div>
            {error ? <div className="mt-2 text-sm text-(--muted)">{error}</div> : null}
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-(--border) bg-(--surface) backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              className="text-sm text-(--muted) hover:text-foreground hover:underline"
              href="/"
            >
              Boards
            </Link>
            <span className="text-(--muted-2)">/</span>

            {isEditingBoardName ? (
              <Input
                value={editingBoardName}
                onChange={(e) => setEditingBoardName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveBoardName();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEditBoardName();
                  }
                }}
                onBlur={() => void saveBoardName()}
                className="h-8 w-56 px-2 py-1 text-sm font-semibold"
                aria-label="Board name"
                autoFocus
              />
            ) : (
              <h1
                className="text-lg font-semibold text-foreground cursor-text"
                onDoubleClick={startEditBoardName}
                title="Double-click to rename"
              >
                {state.name}
              </h1>
            )}

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 rounded-md p-0 cursor-pointer"
                onClick={() => (isEditingBoardName ? cancelEditBoardName() : startEditBoardName())}
                title={isEditingBoardName ? "Cancel rename" : "Rename board"}
                aria-label={isEditingBoardName ? "Cancel rename" : "Rename board"}
                disabled={savingBoardName}
              >
                {isEditingBoardName ? "×" : "✎"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 rounded-md p-0 cursor-pointer"
                onClick={() => setBoardDeleteOpen(true)}
                title="Delete board"
                aria-label="Delete board"
              >
                🗑
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-(--muted)" htmlFor="actorName">
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
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 shadow-[0_12px_40px_-28px_rgba(245,158,11,0.35)]">
            {error}
          </div>
        ) : null}

        <div className="space-y-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragCancel={() => setActiveCard(null)}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto pb-4">
              {state.lists.map((list) => {
                const cards = state.cardsByList[list.id] ?? [];
                const isEditing = editingListId === list.id;

                return (
                  <section key={list.id} className="w-72 shrink-0" aria-label={`List ${list.title}`}>
                    <Panel className="relative overflow-hidden p-3 transition-shadow hover:shadow-[0_22px_64px_-46px_rgba(2,6,23,0.55)]">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-(--accent)/45 to-transparent"
                      />

                      <div className="mb-3 flex items-center justify-between gap-2" id={listDroppableId(list.id)}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-(--accent)/90 shadow-[0_0_0_4px_rgba(20,184,166,0.12)]" />
                          {isEditing ? (
                            <Input
                              value={editingListTitle}
                              onChange={(e) => setEditingListTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void saveListTitle();
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelEditList();
                                }
                              }}
                              onBlur={() => void saveListTitle()}
                              className="h-8 px-2 py-1 text-sm font-semibold"
                              aria-label="List title"
                              autoFocus
                            />
                          ) : (
                            <h2
                              className="truncate text-sm font-semibold text-foreground cursor-text"
                              onDoubleClick={() => startEditList(list.id, list.title)}
                              title="Double-click to rename"
                            >
                              {list.title}
                            </h2>
                          )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="inline-flex h-6 items-center rounded-full border border-(--border) bg-(--surface-2) px-2 text-xs text-(--muted)">
                            {cards.length}
                          </span>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 rounded-md p-0 cursor-pointer"
                            onClick={() => (isEditing ? cancelEditList() : startEditList(list.id, list.title))}
                            title={isEditing ? "Cancel rename" : "Rename list"}
                            aria-label={isEditing ? "Cancel rename" : "Rename list"}
                          >
                            {isEditing ? "×" : "✎"}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 rounded-md p-0 cursor-pointer"
                            onClick={() => requestDeleteList(list.id, list.title, cards.length)}
                            title="Delete list"
                            aria-label="Delete list"
                          >
                            🗑
                          </Button>
                        </div>
                      </div>

                      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                        <ListDropZone listId={list.id}>
                          {cards.map((card) => (
                            <SortableCard
                              key={card.id}
                              card={card}
                              listId={list.id}
                              onDelete={() => requestDeleteCard(card.id, card.title)}
                            />
                          ))}
                          {cards.length === 0 ? (
                            <div
                              className="rounded-xl border border-dashed border-(--border) bg-(--surface-2)/35 px-3 py-7 text-center text-xs text-(--muted)"
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
                <Panel className="relative overflow-hidden p-3 transition-shadow hover:shadow-[0_22px_64px_-46px_rgba(2,6,23,0.45)] border-dashed">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-(--accent-2)/40 to-transparent"
                  />
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-(--border) bg-(--surface-2) text-sm text-foreground">
                      +
                    </span>
                    Add list
                  </h2>
                  <CreateListForm onCreate={(title) => void createList(title)} />
                </Panel>
              </section>
            </div>

            <DragOverlay>
              {activeCard ? (
                <div
                  className="w-66 rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2 text-left text-sm shadow-[0_24px_70px_-42px_rgba(2,6,23,0.85)] ring-1 ring-(--ring)"
                  aria-label={`Dragging card: ${activeCard.card.title}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-foreground">{activeCard.card.title}</div>
                  </div>
                  {activeCard.card.dueAt ? (
                    <div className="mt-1 text-xs text-(--muted-2)">
                      Due {new Date(activeCard.card.dueAt).toLocaleDateString()}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <ActivityPanel
            boardId={boardId}
            refreshToken={activityRefreshToken}
            scrollAreaClassName="max-h-72 overflow-y-auto pr-1"
          />
        </div>
      </main>

      <ConfirmDialog
        open={!!deleteDialog}
        title="Delete task?"
        description={
          deleteDialog
            ? `“${deleteDialog.title}” will be removed. You can restore it from Activity.`
            : undefined
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirming={deleting}
        onCancel={() => (deleting ? null : setDeleteDialog(null))}
        onConfirm={() => void confirmDeleteCard()}
      />

      <ConfirmDialog
        open={!!listDeleteDialog}
        title="Delete list?"
        description={
          listDeleteDialog
            ? `“${listDeleteDialog.title}” and ${listDeleteDialog.cardCount} task(s) will be removed.`
            : undefined
        }
        confirmLabel="Delete list"
        cancelLabel="Cancel"
        confirming={deletingList}
        onCancel={() => (deletingList ? null : setListDeleteDialog(null))}
        onConfirm={() => void confirmDeleteList()}
      />

      <ConfirmDialog
        open={boardDeleteOpen}
        title="Delete board?"
        description="This will remove the board and all its lists and tasks."
        confirmLabel="Delete board"
        cancelLabel="Cancel"
        confirming={deletingBoard}
        onCancel={() => (deletingBoard ? null : setBoardDeleteOpen(false))}
        onConfirm={() => void confirmDeleteBoard()}
      />

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
      <Button type="submit" className="cursor-pointer" size="sm">Add</Button>
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
      <Button type="submit" size="sm" className="w-9 cursor-pointer">+</Button>
    </form>
  );
}
