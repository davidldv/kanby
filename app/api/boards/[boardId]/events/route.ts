import { z } from "zod";
import { subscribeToBoard } from "@/lib/realtime";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ boardId: z.string().min(1) });

function sse(data: string, event?: string) {
  // Basic SSE framing
  const lines: string[] = [];
  if (event) lines.push(`event: ${event}`);
  // SSE requires each line of data prefixed
  for (const line of data.split("\n")) {
    lines.push(`data: ${line}`);
  }
  lines.push("");
  return lines.join("\n");
}

export async function GET(req: Request, ctx: { params: Promise<unknown> }) {
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return jsonError("Invalid board id", 400);

  const boardId = params.data.boardId;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (payload: string, event?: string) => {
        controller.enqueue(encoder.encode(sse(payload, event)));
      };

      // Tell clients to retry quickly if disconnected.
      controller.enqueue(encoder.encode("retry: 1500\n\n"));
      send(JSON.stringify({ boardId, at: new Date().toISOString() }), "hello");

      const unsubscribe = subscribeToBoard(boardId, (evt) => {
        send(JSON.stringify(evt), "board");
      });

      // Keep-alive ping so proxies don't drop the connection.
      const pingId = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15_000);

      const abort = () => {
        clearInterval(pingId);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      // Close on client disconnect
      req.signal.addEventListener("abort", abort, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
