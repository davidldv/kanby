import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { jsonError, jsonOk, readJsonBody } from "@/lib/http";
import { publishBoardEvent } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBoardSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
  })
  .optional();

export async function GET(req: Request) {
  // TODO(auth): filter by membership
  const boards = await prisma.board.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });

  return jsonOk({ boards });
}

export async function POST(req: Request) {
  const body = await readJsonBody(req);
  const parsed = CreateBoardSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid request body", 400, parsed.error.flatten());
  }

  const name = parsed.data?.name ?? "My Board";

  // We don't have auth yet; actor is identified by client id headers.
  // If missing, we will echo a generated id in the response.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actor = getActor(req as unknown as import("next/server").NextRequest);

  const result = await prisma.$transaction(async (tx) => {
    const board = await tx.board.create({
      data: {
        name,
      },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    const defaultLists = [
      { title: "Todo", position: 1 },
      { title: "Doing", position: 2 },
      { title: "Done", position: 3 },
    ];

    const lists = await Promise.all(
      defaultLists.map((l) =>
        tx.list.create({
          data: {
            boardId: board.id,
            title: l.title,
            position: l.position,
          },
          select: { id: true, title: true, position: true, createdAt: true, updatedAt: true },
        }),
      ),
    );

    await tx.activityEvent.create({
      data: {
        boardId: board.id,
        entityType: "BOARD",
        entityId: board.id,
        type: "board.created",
        actorUserId: actor.actorUserId ?? null,
        actorName: actor.actorName,
        actorClientId: actor.actorClientId,
        data: {
          before: null,
          after: board,
        },
      },
    });

    await tx.activityEvent.createMany({
      data: lists.map((list) => ({
        boardId: board.id,
        entityType: "LIST",
        entityId: list.id,
        type: "list.created",
        actorUserId: actor.actorUserId ?? null,
        actorName: actor.actorName,
        actorClientId: actor.actorClientId,
        data: {
          before: null,
          after: list,
        },
      })),
    });

    return { board, lists };
  });

  publishBoardEvent(result.board.id, "board.changed", { reason: "board.created" });

  const res = jsonOk(result, { status: 201 });
  if (actor.setClientIdHeader) {
    res.headers.set("x-client-id", actor.setClientIdHeader);
  }
  return res;
}
