"use client";

const CLIENT_ID_KEY = "kanby.clientId";
const ACTOR_NAME_KEY = "kanby.actorName";

export function getActorName(): string {
  if (typeof window === "undefined") return "David";
  return (localStorage.getItem(ACTOR_NAME_KEY) ?? "David").slice(0, 80);
}

export function setActorName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTOR_NAME_KEY, name.slice(0, 80));
}

export function getClientId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CLIENT_ID_KEY);
}

export function setClientId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CLIENT_ID_KEY, id);
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  const clientId = getClientId();
  if (clientId) headers.set("x-client-id", clientId);
  headers.set("x-actor-name", getActorName());

  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
  });

  const echoedClientId = res.headers.get("x-client-id");
  if (echoedClientId && !clientId) setClientId(echoedClientId);

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const bodyText = await res.text();

    let payload: unknown = bodyText;
    if (bodyText && contentType.includes("application/json")) {
      try {
        payload = JSON.parse(bodyText) as unknown;
      } catch {
        payload = bodyText;
      }
    }

    const message = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`API ${res.status}: ${message || res.statusText}`);
  }

  return (await res.json()) as T;
}
