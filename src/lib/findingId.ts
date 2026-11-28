import { listFindingIndex } from './supabase';

const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const hexOnly = (s: string) => s.toLowerCase().replace(/[^0-9a-f]/g, '');

/** All finding ids in any pasted text (a bare id, "K<id>", a permalink, /f/<id>.txt, a whole AI answer). Unique, in order. */
export function extractIds(text: string): { ids: string[]; duplicates: number } {
  const all = (text.match(UUID_G) || []).map((x) => x.toLowerCase());
  const ids = [...new Set(all)];
  return { ids, duplicates: all.length - ids.length };
}

/** Things that look like an id but are not a valid one (typos, cut-off, partial). */
export function brokenCandidates(text: string): string[] {
  const valid = new Set(extractIds(text).ids);
  const rest = text.replace(UUID_G, ' ');
  const out: string[] = [];
  for (const tok of rest.match(/[0-9A-Za-z]+(?:-[0-9A-Za-z]+){3,5}/g) || []) {
    const h = hexOnly(tok);
    if (h.length >= 20 && h.length <= 36 && !valid.has(tok.toLowerCase())) out.push(h);
  }
  if (!out.length && !valid.size) {
    const t = text.trim();
    const h = hexOnly(t);
    if (t.length <= 48 && h.length >= 6 && h.length <= 36 && /^[0-9a-zA-Z\s-]+$/.test(t)) out.push(h);
  }
  return [...new Set(out)];
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = new Int16Array(n + 1), cur = new Int16Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

export interface Suggestion { id: string; score: number }

/** Closest valid ids to a mistyped one: partial/prefix matches first, then by edit distance. */
export async function suggestIds(candidateHex: string, limit = 4): Promise<Suggestion[]> {
  const rows = await listFindingIndex();
  const c = candidateHex.toLowerCase();
  const scored: Suggestion[] = [];
  for (const r of rows) {
    const h = r.id.replace(/-/g, '');
    let s: number;
    if (c.length >= 6 && c.length < 32 && (h.startsWith(c) || h.includes(c))) s = 0.99 - (h.startsWith(c) ? 0 : 0.05);
    else s = 1 - lev(c.slice(0, 34), h) / 32;
    if (s >= 0.7) scored.push({ id: r.id, score: s });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
