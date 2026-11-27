// ---------------------------------------------------------------------------
// "sirajan-collection/1" — parse, validate, resolve against the real database,
// verify AI-supplied text, and keep local / temporary collections.
// Pasted JSON is untrusted: nothing in it is fetched, rendered as HTML, or
// stored as truth. Only IDs, notes and dates are stored; titles/pages/text are
// always re-read from the database.
// ---------------------------------------------------------------------------
import { Book, Heading, getHeadingsByIds, listBooks } from './supabase';
import { docToPlainText } from './richtext';
import { bnFuzzy, bnWords } from './bn';

export const SCHEMA = 'sirajan-collection/1';
export const MAX_BYTES = 1_000_000;
export const MAX_ITEMS = 500;
export const PROD_HOST = 'sirajan-munira.vercel.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RawItem {
  id?: string; url?: string; book?: string; title?: string; pdf_page?: string | number;
  first_words?: string; match?: string; relevance?: number; note?: string;
}
export interface Msg { en: string; bn: string }
export interface ParseResult {
  ok: boolean; errors: Msg[]; notes: Msg[];
  name: string; description: string; query: string; items: RawItem[];
}

// ---------------- parsing ----------------
function posToLineCol(text: string, pos: number) {
  const before = text.slice(0, pos);
  const lines = before.split('\n');
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

/** Tiny JSON scanner: returns the offset of the first syntax error (engines no longer always report it). */
function findJsonErrorPos(t: string): number {
  let i = 0; const n = t.length;
  const ws = () => { while (i < n && /\s/.test(t[i])) i++; };
  const fail = () => { throw i; };
  const str = () => { i++; while (i < n && t[i] !== '"') { if (t[i] === '\\') i++; else if (t[i] === '\n') fail(); i++; } if (i >= n) fail(); i++; };
  const val = (d: number): void => {
    ws(); if (d > 100 || i >= n) fail();
    const c = t[i];
    if (c === '{') { i++; ws(); if (t[i] === '}') { i++; return; } for (;;) { ws(); if (t[i] !== '"') fail(); str(); ws(); if (t[i] !== ':') fail(); i++; val(d + 1); ws(); if (t[i] === ',') { i++; continue; } if (t[i] === '}') { i++; return; } fail(); } }
    else if (c === '[') { i++; ws(); if (t[i] === ']') { i++; return; } for (;;) { val(d + 1); ws(); if (t[i] === ',') { i++; continue; } if (t[i] === ']') { i++; return; } fail(); } }
    else if (c === '"') str();
    else { const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(t.slice(i, i + 40)); if (!m) fail(); i += m![0].length; }
  };
  try { val(0); ws(); if (i < n) fail(); } catch (pos) { return typeof pos === 'number' ? pos : 0; }
  return -1;
}

function jsonError(e: unknown, text: string): Msg {
  const m = String((e as Error)?.message || e);
  let pos: number | null = null;
  const p1 = /position (\d+)/.exec(m);
  const p2 = /line (\d+) column (\d+)/.exec(m);
  if (p1) pos = Number(p1[1]);
  if (pos === null && !/line (\d+)/.test(m)) { const q = findJsonErrorPos(text); if (q >= 0) pos = q; }
  let where = '';
  if (p2) where = `line ${p2[1]}, column ${p2[2]}`;
  else if (pos !== null) { const lc = posToLineCol(text, pos); where = `line ${lc.line}, column ${lc.col}`; }
  const whereBn = where.replace('line', 'লাইন').replace('column', 'কলাম');
  return {
    en: `Invalid JSON${where ? ` at ${where}` : ''}: ${m.replace(/^JSON\.parse: /, '').slice(0, 120)}`,
    bn: `JSON ঠিক নেই${whereBn ? ` (${whereBn})` : ''}। কমা, কোটেশন বা ব্র্যাকেট চেক করুন।`,
  };
}

/** Strip harmless wrappers (BOM, ``` fences, surrounding prose) and straighten smart quotes only when needed. */
function candidates(text: string): { text: string; note?: Msg }[] {
  const out: { text: string; note?: Msg }[] = [];
  const t = text.replace(/^﻿/, '').trim();
  out.push({ text: t });
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(t);
  if (fence) out.push({ text: fence[1].trim(), note: { en: 'Removed the ``` code fence.', bn: '``` কোড ফেন্স বাদ দেওয়া হয়েছে।' } });
  const firstObj = t.search(/[{[]/);
  const lastClose = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (firstObj >= 0 && lastClose > firstObj) out.push({ text: t.slice(firstObj, lastClose + 1), note: { en: 'Ignored text around the JSON.', bn: 'JSON-এর আগে-পরের লেখা বাদ দেওয়া হয়েছে।' } });
  for (const c of [...out]) {
    const fixed = c.text.replace(/[“”„‟]/g, '"').replace(/[‘’]/g, "'");
    if (fixed !== c.text) out.push({ text: fixed, note: { en: 'Converted smart quotes to normal quotes.', bn: 'স্মার্ট কোটেশন সাধারণ কোটেশনে বদলানো হয়েছে।' } });
  }
  return out;
}

export function parseCollectionJson(input: string): ParseResult {
  const res: ParseResult = { ok: false, errors: [], notes: [], name: '', description: '', query: '', items: [] };
  if (!input.trim()) { res.errors.push({ en: 'Paste the JSON first.', bn: 'আগে JSON পেস্ট করুন।' }); return res; }
  if (input.length > MAX_BYTES) { res.errors.push({ en: 'Input is larger than 1 MB.', bn: 'ইনপুট ১ MB-এর বেশি।' }); return res; }
  if (/^[\s\uFEFF]*(\[\s*){30,}/.test(input) || /^[\s\uFEFF]*(\{\s*"[^"]*"\s*:\s*){30,}/.test(input)) { res.errors.push({ en: 'JSON is nested too deeply.', bn: 'JSON অতিরিক্ত গভীর।' }); return res; }
  if (new Blob([input]).size > MAX_BYTES) { res.errors.push({ en: 'Input is larger than 1 MB.', bn: 'ইনপুট ১ MB-এর বেশি।' }); return res; }

  let data: any; let firstErr: Msg | null = null; let note: Msg | undefined;
  for (const c of candidates(input)) {
    try { data = JSON.parse(c.text); note = c.note; break; } catch (e) { firstErr ||= jsonError(e, c.text === input ? input : c.text); }
  }
  if (data === undefined) { res.errors.push(firstErr!); return res; }
  if (note) res.notes.push(note);

  let items: unknown;
  if (Array.isArray(data)) { items = data; res.notes.push({ en: 'Bare array accepted.', bn: 'শুধু অ্যারে গ্রহণ করা হয়েছে।' }); }
  else if (data && typeof data === 'object') {
    if (data.schema && data.schema !== SCHEMA) {
      if (!String(data.schema).startsWith('sirajan-collection/')) { res.errors.push({ en: `Unknown schema "${String(data.schema).slice(0, 40)}". Expected ${SCHEMA}.`, bn: `স্কিমা চেনা যায়নি। ${SCHEMA} দরকার।` }); return res; }
      res.notes.push({ en: `Schema ${String(data.schema).slice(0, 30)} read as ${SCHEMA}.`, bn: 'ভিন্ন সংস্করণ — যতটা সম্ভব পড়া হয়েছে।' });
    }
    res.name = typeof data.name === 'string' ? data.name.slice(0, 200) : '';
    res.description = typeof data.description === 'string' ? data.description.slice(0, 2000) : '';
    res.query = typeof data.query === 'string' ? data.query.slice(0, 1000) : '';
    items = data.items;
  } else { res.errors.push({ en: 'Expected a JSON object with "items" (or an array).', bn: '"items" সহ একটি JSON অবজেক্ট (বা অ্যারে) দরকার।' }); return res; }

  if (!Array.isArray(items)) { res.errors.push({ en: 'Missing "items" array.', bn: '"items" অ্যারে নেই।' }); return res; }
  if (items.length === 0) { res.errors.push({ en: '"items" is empty.', bn: '"items" খালি।' }); return res; }
  if (items.length > MAX_ITEMS) { res.errors.push({ en: `Too many items (${items.length}); the limit is ${MAX_ITEMS}.`, bn: `আইটেম অনেক বেশি (${items.length}); সীমা ${MAX_ITEMS}।` }); return res; }

  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : undefined);
  res.items = (items as any[]).map((it) => {
    if (typeof it === 'string') return { url: it.slice(0, 2000) };
    if (!it || typeof it !== 'object') return {};
    // AIs often write "permalink" (the prompt says "full permalink"); accept the usual aliases for url.
    const urlLike = it.url ?? it.permalink ?? it.link ?? it.href;
    return {
      id: str(it.id ?? it.heading_id ?? it.finding_id, 64)?.trim(), url: str(urlLike, 2000)?.trim(), book: str(it.book, 300), title: str(it.title, 500),
      pdf_page: str(it.pdf_page ?? it.page ?? it.pdf_page_number, 40), first_words: str(it.first_words, 400), match: str(it.match, 20),
      relevance: typeof it.relevance === 'number' ? it.relevance : undefined, note: str(it.note, 1000),
    };
  });
  if ((items as any[]).some((it) => it && typeof it === 'object' && !it.url && !it.id && (it.permalink || it.link || it.href))) res.notes.push({ en: 'Read "permalink" as "url".', bn: 'প্রতিটি item-এর "permalink" ফিল্ডকে লিংক হিসেবে ধরা হয়েছে।' });
  res.ok = true;
  return res;
}

// ---------------- URL handling ----------------
export function allowedHosts(): string[] {
  const h = typeof window !== 'undefined' ? [window.location.host] : [];
  return [...h, PROD_HOST];
}

/** Extract {id, slug} from a permalink of this site. Never fetches it. */
type PermalinkResult = { ok: true; id: string | null; slug: string | null } | { ok: false; reason: 'wrong_domain' | 'invalid' };
export function parsePermalink(url: string): PermalinkResult {
  let u: URL;
  try { u = new URL(url.trim(), 'https://invalid.local'); } catch { return { ok: false, reason: 'invalid' }; }
  if (u.host === 'invalid.local') return { ok: false, reason: 'invalid' };
  if (!/^https?:$/.test(u.protocol) || !allowedHosts().includes(u.host)) return { ok: false, reason: 'wrong_domain' };
  let slug: string | null = null;
  const m = /^\/book\/([^/]+)\/?$/.exec(u.pathname);
  if (m) { try { slug = decodeURIComponent(m[1]); } catch { slug = m[1]; } }
  let id: string | null = null;
  if (u.hash.length > 1) { try { id = decodeURIComponent(u.hash.slice(1)); } catch { id = u.hash.slice(1); } }
  if (id && !UUID.test(id)) id = null;
  return { ok: true, id, slug };
}

export const permalinkFor = (slug: string, id: string) => `${window.location.origin}/book/${encodeURIComponent(slug)}#${id}`;

// ---------------- live findings ----------------
export interface LiveFinding {
  id: string; bookId: string; bookSlug: string; bookTitle: string; bookAuthor: string | null; pdfUrl: string | null;
  title: string; page: string | null; plain: string; firstWords: string; sort: number;
}

const firstWordsOf = (t: string, n = 12) => t.trim().split(/\s+/).slice(0, n).join(' ');

function toLive(h: Heading, b: Book | undefined): LiveFinding {
  const blocks: any[] = Array.isArray(h.content?.content) ? h.content.content : [];
  const head = blocks[0]?.type === 'heading' ? docToPlainText({ content: [blocks[0]] }).trim() : '';
  const bodyDoc = { content: head ? blocks.slice(1) : blocks };
  const body = docToPlainText(bodyDoc).replace(/\s+/g, ' ').trim();
  const title = (h.title_text || head || body.slice(0, 80) || '(untitled)').replace(/\s+/g, ' ').trim();
  const pdf = b?.source_links?.find((l) => /\.pdf(\?|#|$)/i.test(l.url) || /pdf/i.test(l.label))?.url ?? null;
  return {
    id: h.id, bookId: h.book_id, bookSlug: b?.slug ?? '', bookTitle: b?.title ?? '', bookAuthor: b?.author ?? null, pdfUrl: pdf,
    title, page: h.page_number ?? null, plain: body, firstWords: firstWordsOf(body || title), sort: h.sort_order,
  };
}

let bookCache: { at: number; books: Book[] } | null = null;
export async function getBooks(force = false): Promise<Book[]> {
  if (!force && bookCache && Date.now() - bookCache.at < 60_000) return bookCache.books;
  const books = await listBooks({ includeHidden: false });
  bookCache = { at: Date.now(), books };
  return books;
}

/** Real data for ids; missing ids are simply absent from the map. */
export async function fetchLive(ids: string[]): Promise<Map<string, LiveFinding>> {
  const books = await getBooks();
  const bm = new Map(books.map((b) => [b.id, b]));
  const out = new Map<string, LiveFinding>();
  const uniq = [...new Set(ids.filter((i) => UUID.test(i)))];
  const parts: string[][] = [];
  for (let i = 0; i < uniq.length; i += 40) parts.push(uniq.slice(i, i + 40));
  const rows = await Promise.all(parts.map((p) => getHeadingsByIds(p)));
  rows.flat().forEach((h) => { if (bm.has(h.book_id)) out.set(h.id, toLive(h, bm.get(h.book_id))); });
  return out;
}

// ---------------- resolve + verify ----------------
export type ItemStatus = 'valid' | 'unknown_id' | 'wrong_domain' | 'duplicate' | 'mismatch' | 'invalid';
export interface Verify {
  slug?: 'ok' | 'diff'; aiSlug?: string; siteSlug?: string;
  words: 'ok' | 'mismatch' | 'none'; title: 'ok' | 'diff' | 'none'; page: 'ok' | 'diff' | 'none';
  aiWords?: string; siteWords?: string; aiTitle?: string; siteTitle?: string; aiPage?: string; sitePage?: string | null;
}
export interface ResolvedItem {
  key: number; raw: RawItem; status: ItemStatus; id: string | null; live: LiveFinding | null; verify: Verify | null; detail?: Msg;
}

/** Word-level LCS ratio (0..1) between what the AI said and what the site says. */
function wordOverlap(a: string, b: string): number {
  const x = bnWords(bnFuzzy(a)), y = bnWords(bnFuzzy(b));
  if (!x.length) return 1;
  const dp = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  return dp[0][0] / x.length;
}

export function verifyItem(raw: RawItem, live: LiveFinding): Verify {
  const v: Verify = { words: 'none', title: 'none', page: 'none' };
  if (raw.url) {
    const pl = parsePermalink(raw.url);
    if (pl.ok === true && pl.slug) {
      const norm = (x: string) => x.toLowerCase();
      const same = norm(pl.slug) === norm(live.bookSlug) || pl.slug === `book-${live.bookId.slice(0, 8)}`;
      v.slug = same ? 'ok' : 'diff'; v.aiSlug = pl.slug; v.siteSlug = live.bookSlug;
    }
  }
  if (raw.first_words?.trim()) {
    const claim = raw.first_words.replace(/\s*(…|\.\.\.)\s*$/, '');
    const site = live.plain || live.title;
    if (bnWords(claim).length < 3 && claim.trim().length < 15) { v.words = 'none'; } else {
    const ok = bnFuzzy(site).startsWith(bnFuzzy(claim)) || wordOverlap(claim, site.split(/\s+/).slice(0, claim.split(/\s+/).length + 3).join(' ')) >= 0.9;
    v.words = ok ? 'ok' : 'mismatch'; v.aiWords = claim; v.siteWords = live.firstWords;
    }
  }
  if (raw.title?.trim()) {
    v.title = wordOverlap(raw.title, live.title) >= 0.8 ? 'ok' : 'diff'; v.aiTitle = raw.title; v.siteTitle = live.title;
  }
  if (raw.pdf_page !== undefined && String(raw.pdf_page).trim()) {
    const ai = String(raw.pdf_page).trim().toLowerCase();
    const same = ai === String(live.page ?? 'not recorded').toLowerCase();
    v.page = same ? 'ok' : 'diff'; v.aiPage = String(raw.pdf_page); v.sitePage = live.page;
  }
  return v;
}

export async function resolveItems(items: RawItem[]): Promise<ResolvedItem[]> {
  const books = await getBooks();
  const prelim = items.map((raw, key) => {
    let id: string | null = null; let status: ItemStatus = 'valid'; let detail: Msg | undefined;
    const idOk = raw.id && UUID.test(raw.id) ? raw.id.toLowerCase() : null;
    if (raw.id && !idOk && !raw.url) { status = 'invalid'; detail = { en: 'id is not a valid UUID.', bn: 'id সঠিক UUID নয়।' }; }
    let urlId: string | null = null;
    if (raw.url) {
      const p = parsePermalink(raw.url);
      if (p.ok === false) { const why = (p as { reason: string }).reason; status = why === 'wrong_domain' ? 'wrong_domain' : 'invalid'; detail = why === 'wrong_domain' ? { en: 'URL is not from this site.', bn: 'এই লিংক এই সাইটের নয়।' } : { en: 'URL could not be read.', bn: 'লিংক পড়া যায়নি।' }; }
      else {
        urlId = p.id;
        if (!p.id && !idOk) { status = 'invalid'; detail = { en: 'The link has no #finding-id at the end.', bn: 'লিংকের শেষে #finding-id নেই; শুধু বইয়ের লিংক দিলে finding চেনা যায় না।' }; }
      }
    }
    if (status === 'valid') {
      if (idOk && urlId && idOk !== urlId.toLowerCase()) { status = 'mismatch'; detail = { en: 'id and URL point to different findings (the id was used).', bn: 'id ও লিংক আলাদা finding-এর — id ধরা হয়েছে।' }; }
      id = idOk || (urlId ? urlId.toLowerCase() : null);
      if (!id) { status = 'invalid'; detail = { en: 'No "url" (or "permalink") and no "id" found in this item.', bn: 'এই item-এ "url" (বা "permalink") ও "id" কোনোটাই নেই।' }; }
    }
    return { key, raw, status, id, detail };
  });
  const live = await fetchLive(prelim.map((p) => p.id).filter(Boolean) as string[]);
  const seen = new Set<string>();
  void books;
  return prelim.map((p) => {
    let status: ItemStatus = p.status as ItemStatus; let detail = p.detail;
    const lf = p.id ? live.get(p.id) ?? null : null;
    if (p.id && (status === 'valid' || status === 'mismatch')) {
      if (!lf) { status = 'unknown_id'; detail = { en: 'No finding with this ID on the site.', bn: 'এই ID-র কোনো finding সাইটে পাওয়া যায়নি; ID সম্ভবত AI নিজে বানিয়েছে বা ভুল কপি হয়েছে।' }; }
      else if (seen.has(p.id)) { status = 'duplicate'; detail = { en: 'Duplicate of an earlier item.', bn: 'আগের আইটেমের ডুপ্লিকেট।' }; }
      else seen.add(p.id);
    }
    return { key: p.key, raw: p.raw, status, id: p.id, live: lf, verify: lf && status !== 'duplicate' ? verifyItem(p.raw, lf) : null, detail };
  });
}

export const isUsable = (r: ResolvedItem) => !!r.live && (r.status === 'valid' || r.status === 'mismatch');

// ---------------- local + temporary store ----------------
export interface StoredItem { id: string; note?: string; addedAt: string; relevance?: number; match?: string }
export interface StoredCollection { id: string; name: string; description?: string; query?: string; createdAt: string; updatedAt: string; items: StoredItem[] }
const LOCAL_KEY = 'sm_local_collections_v1';
const TEMP_KEY = 'sm_temp_collection_v1';
export const TEMP_ID = 'temp';

const rid = () => 'c' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
function readJson<T>(store: Storage, key: string, fallback: T): T { try { const v = store.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function writeJson(store: Storage, key: string, v: unknown) { try { store.setItem(key, JSON.stringify(v)); return true; } catch { return false; } }

export const listLocal = (): StoredCollection[] => readJson<StoredCollection[]>(localStorage, LOCAL_KEY, []);
const saveLocalAll = (all: StoredCollection[]) => writeJson(localStorage, LOCAL_KEY, all);
export const getTemp = (): StoredCollection | null => readJson<StoredCollection | null>(sessionStorage, TEMP_KEY, null);
export const setTemp = (c: StoredCollection | null): boolean => { if (c) return writeJson(sessionStorage, TEMP_KEY, c); sessionStorage.removeItem(TEMP_KEY); return true; };
export const getStored = (id: string): StoredCollection | null => (id === TEMP_ID ? getTemp() : listLocal().find((c) => c.id === id) || null);

export function itemsFromResolved(rs: ResolvedItem[]): StoredItem[] {
  const now = new Date().toISOString();
  return rs.filter(isUsable).map((r) => ({ id: r.id!, note: r.raw.note?.trim() || undefined, addedAt: now, relevance: r.raw.relevance, match: r.raw.match }));
}

export function makeCollection(meta: { name: string; description?: string; query?: string }, items: StoredItem[]): StoredCollection {
  const now = new Date().toISOString();
  return { id: rid(), name: meta.name.trim() || 'Untitled collection', description: meta.description, query: meta.query, createdAt: now, updatedAt: now, items };
}

/** Add items to a stored collection (dedupe by id). Returns how many were new. */
export function mergeItems(c: StoredCollection, items: StoredItem[]): { c: StoredCollection; added: number } {
  const have = new Set(c.items.map((i) => i.id));
  const fresh = items.filter((i) => !have.has(i.id));
  return { c: { ...c, items: [...c.items, ...fresh], updatedAt: new Date().toISOString() }, added: fresh.length };
}

export function saveCollection(c: StoredCollection, where: 'local' | 'temp'): boolean {
  if (where === 'temp') return setTemp({ ...c, id: TEMP_ID });
  const all = listLocal();
  const i = all.findIndex((x) => x.id === c.id);
  if (i >= 0) all[i] = c; else all.unshift(c);
  return saveLocalAll(all);
}
export function deleteLocal(id: string) { if (id === TEMP_ID) setTemp(null); else saveLocalAll(listLocal().filter((c) => c.id !== id)); }
export function addToLocal(collectionId: string, ids: string[]) {
  const c = getStored(collectionId); if (!c) return 0;
  const now = new Date().toISOString();
  const { c: n, added } = mergeItems(c, ids.map((id) => ({ id, addedAt: now })));
  saveCollection(n, collectionId === TEMP_ID ? 'temp' : 'local');
  return added;
}

export function exportLocalStore(): string { return JSON.stringify({ schema: 'sirajan-local-store/1', exportedAt: new Date().toISOString(), collections: listLocal() }, null, 1); }
export function importLocalStore(text: string): { added: number; error?: string } {
  try {
    if (text.length > MAX_BYTES * 3) return { added: 0, error: 'File too large.' };
    const d = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (d?.schema !== 'sirajan-local-store/1' || !Array.isArray(d.collections)) return { added: 0, error: 'Not a local-store export.' };
    const all = listLocal(); let added = 0;
    const date = (v: unknown) => { const t = typeof v === 'string' ? new Date(v) : null; return t && !isNaN(+t) ? t.toISOString() : new Date().toISOString(); };
    for (const c of d.collections.slice(0, 200)) {
      if (!c || !Array.isArray(c.items)) continue;
      all.unshift({
        id: rid(), name: String(c.name || 'Imported').slice(0, 200), description: typeof c.description === 'string' ? c.description.slice(0, 2000) : undefined,
        query: typeof c.query === 'string' ? c.query.slice(0, 1000) : undefined, createdAt: date(c.createdAt), updatedAt: new Date().toISOString(),
        items: c.items.filter((i: any) => i && UUID.test(String(i.id))).slice(0, 5000).map((i: any) => ({ id: String(i.id).toLowerCase(), note: typeof i.note === 'string' ? i.note.slice(0, 1000) : undefined, addedAt: date(i.addedAt), relevance: typeof i.relevance === 'number' ? i.relevance : undefined, match: typeof i.match === 'string' ? i.match.slice(0, 20) : undefined })),
      });
      added++;
    }
    if (!saveLocalAll(all)) return { added: 0, error: 'Browser storage is full — nothing was imported.' };
    return { added };
  } catch (e) { return { added: 0, error: String((e as Error).message) }; }
}

// ---------------- export ----------------
export function exportJson(c: { name: string; description?: string; query?: string }, rows: { item: StoredItem; live: LiveFinding | null }[]): string {
  return JSON.stringify({
    schema: SCHEMA, name: c.name, description: c.description || undefined, query: c.query || undefined,
    items: rows.map(({ item, live }) => ({
      id: item.id, url: live ? permalinkFor(live.bookSlug, live.id) : undefined, book: live?.bookSlug, title: live?.title,
      pdf_page: live ? live.page ?? 'not recorded' : undefined, first_words: live?.firstWords, match: item.match, relevance: item.relevance, note: item.note,
    })),
  }, null, 1);
}

export function aiContext(c: { name: string; query?: string }, rows: { item: StoredItem; live: LiveFinding | null }[]): string {
  const out = [`COLLECTION: ${c.name}`, c.query ? `QUESTION: ${c.query}` : '', `FINDINGS: ${rows.filter((r) => r.live).length}`, ''];
  rows.forEach(({ item, live }, i) => {
    if (!live) return;
    out.push(`## [${i + 1}] ${live.title}`, `BOOK: ${live.bookTitle}${live.bookAuthor ? ` — ${live.bookAuthor}` : ''} | PDF PAGE: ${live.page ?? 'not recorded'}`, `LINK: ${permalinkFor(live.bookSlug, live.id)}`);
    if (item.note) out.push(`NOTE: ${item.note}`);
    out.push('', live.plain, '', '---', '');
  });
  return out.join('\n');
}
