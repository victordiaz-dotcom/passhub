// Cache temporal por sesión: evita repetir lecturas al volver enseguida a una
// vista. Nunca se escribe en localStorage ni se usa como fuente de permisos.
const entries = new Map<string, { value: unknown; storedAt: number }>();
const inFlight = new Map<string, Promise<unknown>>();
const freshForMs = 15_000;
const keepForMs = 120_000;
const maxEntries = 40;

export function readViewCache<T>(key: string): { value: T; fresh: boolean } | null {
  const entry = entries.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.storedAt;
  if (age > keepForMs) {
    entries.delete(key);
    return null;
  }
  return { value: entry.value as T, fresh: age < freshForMs };
}

export function writeViewCache<T>(key: string, value: T) {
  entries.delete(key);
  entries.set(key, { value, storedAt: Date.now() });
  if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
}

export function coalesceViewRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;
  const promise = request();
  inFlight.set(key, promise);
  const cleanup = () => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  };
  void promise.then(cleanup, cleanup);
  return promise;
}

export function clearViewCache(prefix?: string) {
  if (!prefix) {
    entries.clear();
    inFlight.clear();
    return;
  }
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
  for (const key of inFlight.keys()) if (key.startsWith(prefix)) inFlight.delete(key);
}
