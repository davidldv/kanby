import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { jsonError, jsonOk, readJsonBody } from "@/lib/http";
import { publishBoardEvent } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ cardId: z.string().min(1) });

const PatchCardSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(10_000).optional(),
    dueAt: z.union([z.string().datetime(), z.null()]).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, "At least one field is required");

export async function PATCH(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid card id", 400);

  const body = await readJsonBody(req);
  const parsed = PatchCardSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request body", 400, parsed.error.flatten());

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.card.findUnique({
      where: { id: params.data.cardId },
      select: {
        id: true,
        boardId: true,
        listId: true,
        title: true,
        description: true,
        dueAt: true,
        position: true,
      },
    });

    if (!before) return { notFound: true as const };

    const updateData: {
      title?: string;
      description?: string;
      dueAt?: Date | null;
    } = {};

    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.dueAt !== undefined) {
      updateData.dueAt = parsed.data.dueAt === null ? null : new Date(parsed.data.dueAt);
    }

    const after = await tx.card.update({
      where: { id: params.data.cardId },
      data: updateData,
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
        boardId: before.boardId,
        entityType: "CARD",
        entityId: before.id,
        type: "card.updated",
        actorUserId: actor.actorUserId ?? null,
        actorName: actor.actorName,
        actorClientId: actor.actorClientId,
        data: {
          before,
          after,
        },
      },
    });

    await tx.board.update({
      where: { id: before.boardId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return { card: after };
  });

  if ((result as { notFound?: boolean }).notFound) return jsonError("Card not found", 404);

  if ((result as { card?: { boardId: string } }).card) {
    publishBoardEvent((result as { card: { boardId: string } }).card.boardId, "board.changed", {
      reason: "card.updated",
      cardId: params.data.cardId,
    });
  }

  const res = jsonOk(result);
  if (actor.setClientIdHeader) res.headers.set("x-client-id", actor.setClientIdHeader);
  return res;
}

export async function DELETE(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid card id", 400);

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.card.findUnique({
      where: { id: params.data.cardId },
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

    if (!before) return { notFound: true as const };

    await tx.card.delete({ where: { id: before.id }, select: { id: true } });

    await tx.activityEvent.create({
      data: {
        boardId: before.boardId,
        entityType: "CARD",
        entityId: before.id,
        type: "card.deleted",
        actorUserId: actor.actorUserId ?? null,
        actorName: actor.actorName,
        actorClientId: actor.actorClientId,
        data: { before, after: null },
      },
    });

    await tx.board.update({
      where: { id: before.boardId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return { deleted: true as const, cardId: before.id, boardId: before.boardId };
  });

  if ((result as { notFound?: boolean }).notFound) return jsonError("Card not found", 404);

  if ((result as { boardId?: string }).boardId) {
    publishBoardEvent((result as { boardId: string }).boardId, "board.changed", {
      reason: "card.deleted",
      cardId: params.data.cardId,
    });
  }

  const res = jsonOk(result);
  if (actor.setClientIdHeader) res.headers.set("x-client-id", actor.setClientIdHeader);
  return res;
}
