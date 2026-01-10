import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { error: { message, details } },
    {
      status,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

export async function readJsonBody(req: Request): Promise<unknown> {
  // NextRequest.json() throws if body is empty/invalid JSON.
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
