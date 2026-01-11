import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { jsonError, jsonOk, readJsonBody } from "@/lib/http";
import { publishBoardEvent } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ boardId: z.string().min(1) });

const PatchBoardSchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function GET(_req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid board id", 400);

  const board = await prisma.board.findUnique({
    where: { id: params.data.boardId },
    include: {
      lists: {
        orderBy: { position: "asc" },
        include: {
          cards: {
            orderBy: { position: "asc" },
          },
        },
      },
      labels: true,
    },
  });

  if (!board) return jsonError("Board not found", 404);
  return jsonOk({ board });
}

export async function PATCH(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid board id", 400);

  const body = await readJsonBody(req);
  const parsed = PatchBoardSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request body", 400, parsed.error.flatten());

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.board.findUnique({
      where: { id: params.data.boardId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    if (!before) return { notFound: true as const };

    const after = await tx.board.update({
      where: { id: before.id },
      data: { name: parsed.data.name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    await tx.activityEvent.create({
      data: {
        boardId: before.id,
        entityType: "BOARD",
        entityId: before.id,
        type: "board.renamed",
        actorUserId: actor.actorUserId ?? null,
        actorName: actor.actorName,
        actorClientId: actor.actorClientId,
        data: { before, after },
      },
    });

    return { board: after };
  });

  if ((result as { notFound?: boolean }).notFound) return jsonError("Board not found", 404);

  const board = (result as { board: { id: string } }).board;

  publishBoardEvent(board.id, "board.changed", { reason: "board.renamed" });

  const res = jsonOk({ board });
  if (actor.setClientIdHeader) res.headers.set("x-client-id", actor.setClientIdHeader);
  return res;
}

export async function DELETE(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid board id", 400);

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.board.findUnique({
      where: { id: params.data.boardId },
      select: { id: true },
    });

    if (!before) return { notFound: true as const };

    // Cascades will remove lists/cards/labels/events.
    await tx.board.delete({ where: { id: before.id }, select: { id: true } });
    return { deleted: true as const, boardId: before.id };
  });

  if ((result as { notFound?: boolean }).notFound) return jsonError("Board not found", 404);

  publishBoardEvent(params.data.boardId, "board.changed", { reason: "board.deleted" });

  const res = jsonOk(result);
  if (actor.setClientIdHeader) res.headers.set("x-client-id", actor.setClientIdHeader);
  return res;
}
