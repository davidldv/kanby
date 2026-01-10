import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { jsonError, jsonOk, readJsonBody } from "@/lib/http";
import { positionBetween } from "@/lib/position";
import { publishBoardEvent } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ cardId: z.string().min(1) });

const MoveCardSchema = z.object({
  toListId: z.string().min(1),
  beforeCardId: z.string().min(1).nullable().optional(),
  afterCardId: z.string().min(1).nullable().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid card id", 400);

  const body = await readJsonBody(req);
  const parsed = MoveCardSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request body", 400, parsed.error.flatten());

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const card = await tx.card.findUnique({
      where: { id: params.data.cardId },
      select: { id: true, boardId: true, listId: true, position: true },
    });

    if (!card) return { notFound: true as const };

    const before = { listId: card.listId, position: card.position };

    const beforeNeighbor = parsed.data.beforeCardId
      ? await tx.card.findUnique({
          where: { id: parsed.data.beforeCardId },
          select: { id: true, listId: true, position: true },
        })
      : null;

    const afterNeighbor = parsed.data.afterCardId
      ? await tx.card.findUnique({
          where: { id: parsed.data.afterCardId },
          select: { id: true, listId: true, position: true },
        })
      : null;

    if (beforeNeighbor && beforeNeighbor.listId !== parsed.data.toListId) {
      return { invalidNeighbors: true as const };
    }
    if (afterNeighbor && afterNeighbor.listId !== parsed.data.toListId) {
      return { invalidNeighbors: true as const };
    }

    // If no neighbors were provided, append to end.
    let nextPos: number;
    if (!beforeNeighbor && !afterNeighbor) {
      const last = await tx.card.findFirst({
        where: { listId: parsed.data.toListId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      nextPos = positionBetween(last?.position ?? null, null);
    } else {
      nextPos = positionBetween(beforeNeighbor?.position ?? null, afterNeighbor?.position ?? null);
    }

    const updated = await tx.card.update({
      where: { id: card.id },
      data: {
        listId: parsed.data.toListId,
        position: nextPos,
      },
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
        boardId: card.boardId,
        entityType: "CARD",
        entityId: card.id,
        type: "card.moved",
        actorUserId: actor.actorUserId ?? null,
        actorName: actor.actorName,
        actorClientId: actor.actorClientId,
        data: {
          before,
          after: { listId: updated.listId, position: updated.position },
        },
      },
    });

    await tx.board.update({
      where: { id: card.boardId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return { card: updated };
  });

  if ((result as { notFound?: boolean }).notFound) return jsonError("Card not found", 404);
  if ((result as { invalidNeighbors?: boolean }).invalidNeighbors) {
    return jsonError("beforeCardId/afterCardId must be in the destination list", 409);
  }

  if ((result as { card?: { boardId: string } }).card) {
    publishBoardEvent((result as { card: { boardId: string } }).card.boardId, "board.changed", {
      reason: "card.moved",
      cardId: params.data.cardId,
    });
  }

  const res = jsonOk(result);
  if (actor.setClientIdHeader) res.headers.set("x-client-id", actor.setClientIdHeader);
  return res;
}
