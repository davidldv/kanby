import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { jsonError, jsonOk } from "@/lib/http";
import { publishBoardEvent } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ eventId: z.string().min(1) });

type CardState = {
  id: string;
  boardId: string;
  listId: string;
  title?: string;
  description?: string;
  dueAt?: string | Date | null;
  position?: number;
};

type CardPatch = {
  listId?: string;
  title?: string;
  description?: string;
  dueAt?: string | Date | null;
  position?: number;
};

function asCardState(value: unknown): CardState | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string") return null;
  if (typeof v.boardId !== "string") return null;
  if (typeof v.listId !== "string") return null;
  return {
    id: v.id,
    boardId: v.boardId,
    listId: v.listId,
    title: typeof v.title === "string" ? v.title : undefined,
    description: typeof v.description === "string" ? v.description : undefined,
    dueAt: (v.dueAt as string | Date | null | undefined) ?? undefined,
    position: typeof v.position === "number" ? v.position : undefined,
  };
}

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function asCardPatch(value: unknown): CardPatch | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;

  const patch: CardPatch = {
    listId: typeof v.listId === "string" ? v.listId : undefined,
    title: typeof v.title === "string" ? v.title : undefined,
    description: typeof v.description === "string" ? v.description : undefined,
    dueAt: (v.dueAt as string | Date | null | undefined) ?? undefined,
    position: typeof v.position === "number" ? v.position : undefined,
  };

  if (
    patch.listId === undefined &&
    patch.title === undefined &&
    patch.description === undefined &&
    patch.dueAt === undefined &&
    patch.position === undefined
  ) {
    return null;
  }

  return patch;
}

export async function POST(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid event id", 400);

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.activityEvent.findUnique({
      where: { id: params.data.eventId },
      select: {
        id: true,
        boardId: true,
        entityType: true,
        entityId: true,
        type: true,
        data: true,
      },
    });

    if (!event) return { notFound: true as const };

    // Idempotency: if this event was already undone, treat as a no-op.
    const alreadyUndone = await tx.activityEvent.findFirst({
      where: {
        boardId: event.boardId,
        type: "card.undone",
        data: {
          path: ["revertedEventId"],
          equals: event.id,
        },
      },
      select: { id: true },
    });
    if (alreadyUndone) return { alreadyUndone: true as const };

    if (event.entityType !== "CARD") {
      return { unsupported: true as const, reason: "Only card events can be undone right now" };
    }

    const data = event.data as unknown;
    const record = (data && typeof data === "object" ? (data as Record<string, unknown>) : null) ?? null;
    const beforeState = asCardState(record?.before);
    const afterState = asCardState(record?.after);
    const beforePatch = beforeState ? (beforeState satisfies CardPatch) : asCardPatch(record?.before);

    if (event.type === "card.created") {
      // Undo create = delete the card.
      const existing = await tx.card.findUnique({
        where: { id: event.entityId },
        select: {
          id: true,
          boardId: true,
          listId: true,
          title: true,
          description: true,
          dueAt: true,
          position: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!existing) return { notFound: true as const };

      await tx.card.delete({ where: { id: event.entityId }, select: { id: true } });

      await tx.activityEvent.create({
        data: {
          boardId: event.boardId,
          entityType: "CARD",
          entityId: event.entityId,
          type: "card.undone",
          actorUserId: actor.actorUserId ?? null,
          actorName: actor.actorName,
          actorClientId: actor.actorClientId,
          data: {
            revertedEventId: event.id,
            before: existing,
            after: null,
          },
        },
      });

      await tx.board.update({ where: { id: event.boardId }, data: { updatedAt: new Date() }, select: { id: true } });

      return { undone: true as const, effect: "deleted", cardId: event.entityId };
    }

    if (event.type === "card.moved" || event.type === "card.updated") {
      if (!beforePatch) return { invalidData: true as const };

      const current = await tx.card.findUnique({
        where: { id: event.entityId },
        select: {
          id: true,
          boardId: true,
          listId: true,
          title: true,
          description: true,
          dueAt: true,
          position: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!current) return { notFound: true as const };

      const updateData: {
        listId?: string;
        position?: number;
        title?: string;
        description?: string;
        dueAt?: Date | null;
      } = {};

      if (beforePatch.listId) updateData.listId = beforePatch.listId;
      if (typeof beforePatch.position === "number") updateData.position = beforePatch.position;
      if (beforePatch.title !== undefined) updateData.title = beforePatch.title;
      if (beforePatch.description !== undefined) updateData.description = beforePatch.description;
      if (beforePatch.dueAt !== undefined) {
        updateData.dueAt = beforePatch.dueAt === null ? null : new Date(beforePatch.dueAt);
      }

      const updated = await tx.card.update({
        where: { id: event.entityId },
        data: updateData,
        select: {
          id: true,
          boardId: true,
          listId: true,
          position: true,
          title: true,
          description: true,
          dueAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.activityEvent.create({
        data: {
          boardId: event.boardId,
          entityType: "CARD",
          entityId: event.entityId,
          type: "card.undone",
          actorUserId: actor.actorUserId ?? null,
          actorName: actor.actorName,
          actorClientId: actor.actorClientId,
          data: {
            revertedEventId: event.id,
            before: current,
            after: updated,
          },
        },
      });

      await tx.board.update({ where: { id: event.boardId }, data: { updatedAt: new Date() }, select: { id: true } });

      return { undone: true as const, effect: "reverted", card: updated };
    }

    if (event.type === "card.deleted") {
      // Undo delete = recreate the card from the logged before snapshot.
      if (!beforeState) return { invalidData: true as const };

      const list = await tx.list.findUnique({
        where: { id: beforeState.listId },
        select: { id: true, boardId: true },
      });
      if (!list || list.boardId !== beforeState.boardId) {
        return { unsupported: true as const, reason: "Cannot restore: original list no longer exists" };
      }

      const existing = await tx.card.findUnique({ where: { id: beforeState.id }, select: { id: true } });
      if (existing) return { alreadyUndone: true as const };

      const created = await tx.card.create({
        data: {
          id: beforeState.id,
          boardId: beforeState.boardId,
          listId: beforeState.listId,
          title: beforeState.title ?? "Untitled",
          description: beforeState.description ?? "",
          dueAt:
            beforeState.dueAt === undefined
              ? null
              : beforeState.dueAt === null
                ? null
                : asDate(beforeState.dueAt),
          position: typeof beforeState.position === "number" ? beforeState.position : 0,
        },
        select: {
          id: true,
          boardId: true,
          listId: true,
          title: true,
          description: true,
          dueAt: true,
          position: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.activityEvent.create({
        data: {
          boardId: event.boardId,
          entityType: "CARD",
          entityId: event.entityId,
          type: "card.undone",
          actorUserId: actor.actorUserId ?? null,
          actorName: actor.actorName,
          actorClientId: actor.actorClientId,
          data: {
            revertedEventId: event.id,
            before: null,
            after: created,
          },
        },
      });

      await tx.board.update({
        where: { id: event.boardId },
        data: { updatedAt: new Date() },
        select: { id: true },
      });

      return { undone: true as const, effect: "restored", card: created };
    }

    return { unsupported: true as const, reason: `Undo not implemented for event type: ${event.type}` };
  });

  if ((result as { notFound?: boolean }).notFound) return jsonError("Event not found", 404);
  if ((result as { alreadyUndone?: boolean }).alreadyUndone) {
    return jsonOk({ undone: true as const, effect: "noop" as const, alreadyUndone: true as const });
  }
  if ((result as { invalidData?: boolean }).invalidData) return jsonError("Event payload is missing before/after", 422);
  if ((result as { unsupported?: boolean }).unsupported) {
    return jsonError((result as { reason?: string }).reason ?? "Unsupported undo", 409);
  }

  // Best-effort realtime notification for clients to refresh.
  // We don't return boardId for every undo shape, so look it up quickly.
  const evt = await prisma.activityEvent.findUnique({
    where: { id: params.data.eventId },
    select: { boardId: true },
  });
  if (evt) {
    publishBoardEvent(evt.boardId, "board.changed", { reason: "event.undone", eventId: params.data.eventId });
  }

  const res = jsonOk(result);
  if (actor.setClientIdHeader) res.headers.set("x-client-id", actor.setClientIdHeader);
  return res;
}
