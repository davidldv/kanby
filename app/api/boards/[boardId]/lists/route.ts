import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { jsonError, jsonOk, readJsonBody } from "@/lib/http";
import { positionAfter } from "@/lib/position";
import { publishBoardEvent } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ boardId: z.string().min(1) });

const CreateListSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

export async function POST(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid board id", 400);

  const body = await readJsonBody(req);
  const parsed = CreateListSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request body", 400, parsed.error.flatten());

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const last = await tx.list.findFirst({
      where: { boardId: params.data.boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const list = await tx.list.create({
      data: {
        boardId: params.data.boardId,
        title: parsed.data.title,
        position: positionAfter(last?.position),
      },
      select: { id: true, boardId: true, title: true, position: true, createdAt: true, updatedAt: true },
    });

    await tx.activityEvent.create({
      data: {
        boardId: params.data.boardId,
        entityType: "LIST",
        entityId: list.id,
        type: "list.created",
        actorUserId: actor.actorUserId ?? null,
        actorName: actor.actorName,
        actorClientId: actor.actorClientId,
        data: { before: null, after: list },
      },
    });

    await tx.board.update({
      where: { id: params.data.boardId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return { list };
  });

  publishBoardEvent(params.data.boardId, "board.changed", { reason: "list.created", listId: result.list.id });

  const res = jsonOk(result, { status: 201 });
  if (actor.setClientIdHeader) res.headers.set("x-client-id", actor.setClientIdHeader);
  return res;
}
