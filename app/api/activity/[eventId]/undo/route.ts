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

    if (event.entityType !== "CARD") {
      return { unsupported: true as const, reason: "Only card events can be undone right now" };
    }

    const data = event.data as unknown;
    const record = (data && typeof data === "object" ? (data as Record<string, unknown>) : null) ?? null;
    const before = asCardState(record?.before);
    const after = asCardState(record?.after);

    if (event.type === "card.created") {
      // Undo create = delete the card.
      const deleted = await tx.card.delete({
        where: { id: event.entityId },
        select: { id: true, boardId: true, listId: true, position: true, title: true },
      }).catch(() => null);

      if (!deleted) return { notFound: true as const };

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
            before: after,
            after: null,
          },
        },
      });

      await tx.board.update({ where: { id: event.boardId }, data: { updatedAt: new Date() }, select: { id: true } });

      return { undone: true as const, effect: "deleted", cardId: event.entityId };
    }

    if (event.type === "card.moved" || event.type === "card.updated") {
      if (!before) return { invalidData: true as const };

      const card = await tx.card.findUnique({
        where: { id: event.entityId },
        select: { id: true, boardId: true },
      });

      if (!card) return { notFound: true as const };

      const updateData: {
        listId?: string;
        position?: number;
        title?: string;
        description?: string;
        dueAt?: Date | null;
      } = {};

      if (before.listId) updateData.listId = before.listId;
      if (typeof before.position === "number") updateData.position = before.position;
      if (before.title !== undefined) updateData.title = before.title;
      if (before.description !== undefined) updateData.description = before.description;
      if (before.dueAt !== undefined) {
        updateData.dueAt = before.dueAt === null ? null : new Date(before.dueAt);
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
            before: after,
            after: updated,
          },
        },
      });

      await tx.board.update({ where: { id: event.boardId }, data: { updatedAt: new Date() }, select: { id: true } });

      return { undone: true as const, effect: "reverted", card: updated };
    }

    return { unsupported: true as const, reason: `Undo not implemented for event type: ${event.type}` };
  });

  if ((result as { notFound?: boolean }).notFound) return jsonError("Event not found", 404);
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
