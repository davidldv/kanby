import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { jsonError, jsonOk } from "@/lib/http";
import { publishBoardEvent } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ boardId: z.string().min(1) });

export async function POST(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid board id", 400);

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const board = await tx.board.findUnique({ where: { id: params.data.boardId }, select: { id: true } });
    if (!board) return { notFound: true as const };

    const evt = await tx.activityEvent.create({
      data: {
        boardId: params.data.boardId,
        entityType: "BOARD",
        entityId: params.data.boardId,
        type: "activity.cleared",
        actorUserId: actor.actorUserId ?? null,
        actorName: actor.actorName,
        actorClientId: actor.actorClientId,
        data: { before: null, after: null },
      },
      select: { id: true, createdAt: true },
    });

    await tx.board.update({
      where: { id: params.data.boardId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return { cleared: true as const, eventId: evt.id, at: evt.createdAt };
  });

  if ((result as { notFound?: boolean }).notFound) return jsonError("Board not found", 404);

  publishBoardEvent(params.data.boardId, "board.changed", { reason: "activity.cleared" });

  const res = jsonOk(result);
  if (actor.setClientIdHeader) res.headers.set("x-client-id", actor.setClientIdHeader);
  return res;
}
