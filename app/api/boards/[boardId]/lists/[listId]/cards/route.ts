import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { jsonError, jsonOk, readJsonBody } from "@/lib/http";
import { positionAfter } from "@/lib/position";
import { publishBoardEvent } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ boardId: z.string().min(1), listId: z.string().min(1) });

const CreateCardSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(10_000).optional(),
  dueAt: z.string().datetime().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid params", 400);

  const body = await readJsonBody(req);
  const parsed = CreateCardSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request body", 400, parsed.error.flatten());

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const last = await tx.card.findFirst({
      where: { listId: params.data.listId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const card = await tx.card.create({
      data: {
        boardId: params.data.boardId,
        listId: params.data.listId,
        title: parsed.data.title,
        description: parsed.data.description ?? "",
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
        position: positionAfter(last?.position),
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
        boardId: params.data.boardId,
        entityType: "CARD",
        entityId: card.id,
        type: "card.created",
        actorUserId: actor.actorUserId ?? null,
        actorName: actor.actorName,
        actorClientId: actor.actorClientId,
        data: { before: null, after: card },
      },
    });

    await tx.board.update({
      where: { id: params.data.boardId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return { card };
  });

  publishBoardEvent(params.data.boardId, "board.changed", { reason: "card.created", cardId: result.card.id });

  const res = jsonOk(result, { status: 201 });
  if (actor.setClientIdHeader) res.headers.set("x-client-id", actor.setClientIdHeader);
  return res;
}
