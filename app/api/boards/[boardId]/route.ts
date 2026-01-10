import { z } from "zod";
import { prisma } from "@/lib/prisma";
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

  const board = await prisma.board.update({
    where: { id: params.data.boardId },
    data: { name: parsed.data.name },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });

  publishBoardEvent(board.id, "board.changed", { reason: "board.renamed" });

  return jsonOk({ board });
}
