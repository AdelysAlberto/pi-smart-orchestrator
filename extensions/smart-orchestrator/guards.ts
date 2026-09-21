/**
 * Result pattern and runtime type guards for functional invariants.
 * Strictly avoids exceptions for predictable error handling.
 */

export type Result<T, E = string> = {ok: true; value: T} | {ok: false; reason: E; status?: number};

export function ok<T>(value: T): {ok: true; value: T} {
  return {ok: true, value};
}

export function fail<E = string>(reason: E, status?: number): {ok: false; reason: E; status?: number} {
  return {ok: false, reason, status};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

export function readArray<T>(
  record: Record<string, unknown>,
  key: string,
  guard: (item: unknown) => item is T
): T[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  return value.every(guard) ? (value as T[]) : undefined;
}
