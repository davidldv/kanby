import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { jsonError, jsonOk, readJsonBody } from "@/lib/http";
import { publishBoardEvent } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ boardId: z.string().min(1), listId: z.string().min(1) });

const PatchListSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, "At least one field is required");

export async function PATCH(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid params", 400);

  const body = await readJsonBody(req);
  const parsed = PatchListSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request body", 400, parsed.error.flatten());

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.list.findFirst({
      where: { id: params.data.listId, boardId: params.data.boardId },
      select: { id: true, boardId: true, title: true, position: true, createdAt: true, updatedAt: true },
    });

    if (!before) return { notFound: true as const };

    const after = await tx.list.update({
      where: { id: before.id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      },
      select: { id: true, boardId: true, title: true, position: true, createdAt: true, updatedAt: true },
    });

    await tx.activityEvent.create({
      data: {
        boardId: params.data.boardId,
        entityType: "LIST",
        entityId: before.id,
        type: "list.renamed",
        actorUserId: actor.actorUserId ?? null,
        actorName: actor.actorName,
        actorClientId: actor.actorClientId,
        data: { before, after },
      },
    });

    await tx.board.update({
      where: { id: params.data.boardId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return { list: after };
  });

  if ((result as { notFound?: boolean }).notFound) return jsonError("List not found", 404);

  publishBoardEvent(params.data.boardId, "board.changed", { reason: "list.renamed", listId: params.data.listId });

  const res = jsonOk(result);
  if (actor.setClientIdHeader) res.headers.set("x-client-id", actor.setClientIdHeader);
  return res;
}

export async function DELETE(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid params", 400);

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.list.findFirst({
      where: { id: params.data.listId, boardId: params.data.boardId },
      select: { id: true, boardId: true, title: true, position: true, createdAt: true, updatedAt: true },
    });

    if (!before) return { notFound: true as const };

    const cardCount = await tx.card.count({ where: { listId: before.id } });

    // Card rows will be deleted via onDelete: Cascade.
    await tx.list.delete({ where: { id: before.id }, select: { id: true } });

    await tx.activityEvent.create({
      data: {
        boardId: params.data.boardId,
        entityType: "LIST",
        entityId: before.id,
        type: "list.deleted",
        actorUserId: actor.actorUserId ?? null,
        actorName: actor.actorName,
        actorClientId: actor.actorClientId,
        data: { before: { ...before, cardCount }, after: null },
      },
    });

    await tx.board.update({
      where: { id: params.data.boardId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return { deleted: true as const, listId: before.id, boardId: before.boardId, cardCount };
  });

  if ((result as { notFound?: boolean }).notFound) return jsonError("List not found", 404);

  publishBoardEvent(params.data.boardId, "board.changed", {
    reason: "list.deleted",
    listId: params.data.listId,
  });

  const res = jsonOk(result);
  if (actor.setClientIdHeader) res.headers.set("x-client-id", actor.setClientIdHeader);
  return res;
}
