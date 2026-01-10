type BoardEvent = {
  boardId: string;
  type: string;
  at: string;
  payload?: unknown;
};

type Subscriber = (event: BoardEvent) => void;

declare global {
  // eslint-disable-next-line no-var
  var __kanbyRealtime: {
    subscribersByBoard: Map<string, Set<Subscriber>>;
  } | undefined;
}

function store() {
  if (!globalThis.__kanbyRealtime) {
    globalThis.__kanbyRealtime = {
      subscribersByBoard: new Map(),
    };
  }
  return globalThis.__kanbyRealtime;
}

export function subscribeToBoard(boardId: string, cb: Subscriber): () => void {
  const s = store();
  const set = s.subscribersByBoard.get(boardId) ?? new Set<Subscriber>();
  set.add(cb);
  s.subscribersByBoard.set(boardId, set);

  return () => {
    const current = s.subscribersByBoard.get(boardId);
    if (!current) return;
    current.delete(cb);
    if (current.size === 0) s.subscribersByBoard.delete(boardId);
  };
}

export function publishBoardEvent(boardId: string, type: string, payload?: unknown) {
  const s = store();
  const subs = s.subscribersByBoard.get(boardId);
  if (!subs || subs.size === 0) return;

  const event: BoardEvent = {
    boardId,
    type,
    at: new Date().toISOString(),
    payload,
  };

  for (const cb of subs) {
    try {
      cb(event);
    } catch {
      // ignore subscriber errors
    }
  }
}
