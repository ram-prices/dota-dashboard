// Thin localStorage cache. OpenDota's free tier is rate-limited (60/min,
// 2000/day without a key), and a parsed match's data never changes once
// it's parsed, so caching match details "forever" avoids ever re-fetching
// the same match twice. Lists (recent matches, win/loss, hero stats) do
// change, so those get a short TTL instead.

const PREFIX = "dota-dash:";

interface Envelope<T> {
  ts: number;
  data: T;
}

function readEnvelope<T>(key: string): Envelope<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as Envelope<T>;
  } catch {
    return null;
  }
}

function writeEnvelope<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // localStorage full or unavailable (private browsing) - degrade to no caching.
  }
}

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const existing = readEnvelope<T>(key);
  if (existing && Date.now() - existing.ts < ttlMs) {
    return existing.data;
  }
  const data = await fetcher();
  writeEnvelope(key, data);
  return data;
}

export async function cachedForever<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  return cached(key, Number.POSITIVE_INFINITY, fetcher);
}

export function invalidate(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

// Removes every cached entry whose key starts with the given prefix -
// for keys parameterized by request params (e.g. "matches:123:{"limit":30}")
// where the exact param combination in use isn't worth tracking down.
export function invalidatePrefix(prefix: string): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + prefix))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

// Reads a cache entry (with when it was written) without fetching - for
// callers whose freshness rule depends on the cached value itself.
export function peekCached<T>(key: string): { ts: number; data: T } | null {
  return readEnvelope<T>(key);
}

// Overwrites a cache entry directly (with a fresh timestamp) rather than
// through cached()'s fetch-on-miss path - for when the caller already has
// the data (e.g. a locally merged match index) and just wants it to look
// as if it were just fetched.
export function writeCached<T>(key: string, data: T): void {
  writeEnvelope(key, data);
}

export function clearAllCache(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
