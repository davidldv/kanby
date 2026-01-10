import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";

export type Actor = {
  actorUserId?: string | null;
  actorName: string;
  actorClientId: string;
  // If we generated a new client id, echo it so the UI can persist it.
  setClientIdHeader?: string;
};

export function getActor(req: NextRequest): Actor {
  const actorName = (req.headers.get("x-actor-name") ?? "Anonymous").slice(0, 80);
  const actorUserId = req.headers.get("x-actor-user-id");
  const headerClientId = req.headers.get("x-client-id");

  if (headerClientId && headerClientId.trim().length > 0) {
    return {
      actorName,
      actorUserId,
      actorClientId: headerClientId,
    };
  }

  const actorClientId = nanoid();
  return {
    actorName,
    actorUserId,
    actorClientId,
    setClientIdHeader: actorClientId,
  };
}
