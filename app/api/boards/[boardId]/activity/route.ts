import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ boardId: z.string().min(1) });

export async function GET(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid board id", 400);

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit") ?? "50";
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 200);

  const events = await prisma.activityEvent.findMany({
    where: { boardId: params.data.boardId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      boardId: true,
      entityType: true,
      entityId: true,
      type: true,
      actorUserId: true,
      actorName: true,
      actorClientId: true,
      data: true,
      createdAt: true,
    },
  });

  return jsonOk({ events });
}
