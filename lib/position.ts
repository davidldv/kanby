export function positionAfter(last: number | null | undefined): number {
  return (last ?? 0) + 1;
}

export function positionBetween(prev?: number | null, next?: number | null): number {
  if (prev == null && next == null) return 0;
  if (prev == null) return (next ?? 0) - 1;
  if (next == null) return prev + 1;

  const mid = (prev + next) / 2;
  // If floats collapse, fall back to nudging forward.
  if (mid === prev || mid === next) return prev + 0.0001;
  return mid;
}
