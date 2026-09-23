// ===========================================================================
// Search result cache (free: lives in the browser, no server or API cost)
//
// Two layers:
//   1. In-memory Map — instant while the app is open.
//   2. sessionStorage — survives going to a result and pressing Back, and a
//      page reload in the same tab. Cleared when the tab is closed.
//
// Entries expire after TTL_MS so newly added findings show up eventually;
// the Search page also offers a "Refresh" link that bypasses the cache.
// ===========================================================================

const PREFIX = 'sm_sc:';
const TTL_MS = 30 * 60 * 1000;   // 30 minutes
const MAX_ENTRIES = 30;          // oldest entries are dropped beyond this

interface Stored<T> { at: number; data: T; }

const memory = new Map<string, Stored<unknown>>();

function storage(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

export function cacheGet<T>(key: string): T | null {
  const now = Date.now();
  let hit = memory.get(key) as Stored<T> | undefined;
  if (!hit) {
    const raw = storage()?.getItem(PREFIX + key);
    if (raw) {
      try { hit = JSON.parse(raw) as Stored<T>; memory.set(key, hit); } catch { /* ignore */ }
    }
  }
  if (!hit) return null;
  if (now - hit.at > TTL_MS) { cacheDelete(key); return null; }
  return hit.data;
}

/** Keeps the original timestamp when `keepAge` is set (used when appending
 *  "show more" pages to an existing entry, so the TTL isn't extended). */
export function cacheSet<T>(key: string, data: T, keepAge = false) {
  const prev = keepAge ? memory.get(key) : undefined;
  const entry: Stored<T> = { at: prev?.at ?? Date.now(), data };
  memory.set(key, entry);
  const s = storage();
  if (!s) return;
  try {
    s.setItem(PREFIX + key, JSON.stringify(entry));
    prune(s);
  } catch {
    // Quota full: drop our older entries and try once more.
    try { prune(s, Math.floor(MAX_ENTRIES / 2)); s.setItem(PREFIX + key, JSON.stringify(entry)); } catch { /* memory only */ }
  }
}

export function cacheDelete(key: string) {
  memory.delete(key);
  try { storage()?.removeItem(PREFIX + key); } catch { /* ignore */ }
}

function prune(s: Storage, keep = MAX_ENTRIES) {
  const entries: { k: string; at: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k || !k.startsWith(PREFIX)) continue;
    try { entries.push({ k, at: (JSON.parse(s.getItem(k) || '{}') as Stored<unknown>).at || 0 }); } catch { entries.push({ k, at: 0 }); }
  }
  if (entries.length <= keep) return;
  entries.sort((a, b) => b.at - a.at).slice(keep).forEach((e) => s.removeItem(e.k));
}

/** Normalised cache key part for a query (case/spacing-insensitive). */
export function queryKey(q: string) {
  return q.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Drop every cached search (e.g. after the admin re-indexes). */
export function cacheClearAll() {
  memory.clear();
  const s = storage();
  if (!s) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith(PREFIX)) keys.push(k); }
    keys.forEach((k) => s.removeItem(k));
  } catch { /* ignore */ }
}