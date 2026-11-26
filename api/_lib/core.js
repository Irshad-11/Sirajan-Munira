// ============================================================================
// Shared server-side logic for the AI-integration endpoints.
// Plain ESM JavaScript (no build step) so it runs unchanged as a Vercel
// Serverless Function AND inside the Vite dev server (see vite.config.ts).
//
// Data is read straight from Supabase's REST API with the public anon key, so
// Row Level Security applies: hidden books are never exported.
// ============================================================================
import { createHash } from 'node:crypto';

const env = (k) => process.env[k] || process.env['VITE_' + k] || '';
export const supaUrl = () => env('SUPABASE_URL').replace(/\/+$/, '');
const anonKey = () => env('SUPABASE_ANON_KEY');

const MAX_BODY_BYTES = Number(process.env.AI_MAX_BODY_BYTES) || 3_800_000; // Vercel responses cap at ~4.5 MB

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------
async function rest(path, { headers = {}, method = 'GET', body } = {}) {
  if (!supaUrl() || !anonKey()) throw new HttpError(500, 'Server is missing SUPABASE_URL / SUPABASE_ANON_KEY (or the VITE_ equivalents).');
  const res = await fetch(`${supaUrl()}/rest/v1/${path}`, {
    method,
    headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}`, ...headers },
    body,
  });
  if (!res.ok) throw new HttpError(502, `Database request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function restJson(path) { return (await rest(path)).json(); }

async function restAll(path, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const res = await rest(path, { headers: { Range: `${from}-${from + pageSize - 1}`, 'Range-Unit': 'items' } });
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

async function restCount(path) {
  const res = await rest(path, { method: 'HEAD', headers: { Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' } });
  const cr = res.headers.get('content-range') || '';
  const n = Number(cr.split('/')[1]);
  return Number.isFinite(n) ? n : 0;
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Rich text → plain blocks
// ---------------------------------------------------------------------------
function inlineText(nodes = []) {
  return nodes.map((n) => (n.type === 'text' ? n.text || '' : n.type === 'hardBreak' ? '\n' : inlineText(n.content || []))).join('');
}

/** Flattens a TipTap document to ordered text blocks. */
export function docToBlocks(doc) {
  const blocks = [];
  const walk = (node, ctx = {}) => {
    if (!node) return;
    switch (node.type) {
      case 'doc': (node.content || []).forEach((c) => walk(c, ctx)); break;
      case 'heading': blocks.push({ type: 'heading', level: node.attrs?.level || 1, text: inlineText(node.content).trim() }); break;
      case 'paragraph': { const t = inlineText(node.content).trim(); if (t) blocks.push({ type: ctx.quote ? 'quote' : ctx.list ? 'list_item' : 'paragraph', text: t }); break; }
      case 'blockquote': (node.content || []).forEach((c) => walk(c, { ...ctx, quote: true })); break;
      case 'bulletList': case 'orderedList': (node.content || []).forEach((c) => walk(c, { ...ctx, list: true })); break;
      case 'listItem': (node.content || []).forEach((c) => walk(c, ctx)); break;
      case 'accordion':
        if (node.attrs?.title) blocks.push({ type: 'accordion_title', text: String(node.attrs.title) });
        (node.content || []).forEach((c) => walk(c, ctx)); break;
      case 'annotatedImage': if (node.attrs?.alt) blocks.push({ type: 'image', text: `[Image: ${node.attrs.alt}]` }); break;
      default: (node.content || []).forEach((c) => walk(c, ctx));
    }
  };
  walk(doc);
  return blocks;
}

export const normalize = (s) => String(s || '').normalize('NFC').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
const sha = (s, n = 12) => createHash('sha256').update(s).digest('hex').slice(0, n);

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
export function siteUrlOf(req) {
  const h = req.headers || {};
  const host = h['x-forwarded-host'] || h.host;
  if (host) {
    const proto = h['x-forwarded-proto'] || (/^(localhost|127\.|\[::1\])/.test(host) ? 'http' : 'https');
    return `${String(proto).split(',')[0]}://${String(host).split(',')[0]}`;
  }
  return (process.env.SITE_URL || 'https://sirajan-munira.vercel.app').replace(/\/+$/, '');
}

const HEADING_SELECT = 'id,book_id,level,content,page_number,sort_order,importance_level,title_text,updated_at';

function buildFinding(row, book, site, idx) {
  const blocks = docToBlocks(row.content);
  const firstHeading = blocks[0]?.type === 'heading' ? blocks[0] : null;
  const title = normalize(row.title_text) || firstHeading?.text || blocks[0]?.text || '(untitled)';
  const body = firstHeading ? blocks.slice(1) : blocks;
  const passages = body.map((b, i) => ({
    passage_id: `${row.id}.p${i + 1}`,
    order: i + 1,
    type: b.type,
    text: b.text,
  }));
  return {
    heading_id: row.id,
    level: row.level,
    order: idx + 1,
    title,
    pdf_page_number: row.page_number ?? null,
    importance_level: row.importance_level ?? null,
    permalink: `${site}/book/${book.slug}#${row.id}`,
    updated_at: row.updated_at,
    passages,
  };
}

function pickPdf(links) {
  const pdf = links.find((l) => /\.pdf(\?|#|$)/i.test(l.url)) || links.find((l) => /pdf/i.test(l.label));
  return pdf ? pdf.url : null;
}

export async function loadBook(slug, site) {
  const books = await restJson(`books?slug=eq.${enc(slug)}&visibility=eq.true&select=*,source_links(label,url,sort_order)&limit=1`);
  const b = books[0];
  if (!b) throw new HttpError(404, `No public book with slug "${slug}".`);
  const rows = await restAll(`headings?book_id=eq.${b.id}&select=${HEADING_SELECT}&order=sort_order.asc,created_at.asc,id.asc`);
  const links = (b.source_links || []).sort((a, z) => a.sort_order - z.sort_order).map(({ label, url }) => ({ label, url }));
  const findings = rows.map((r, i) => buildFinding(r, b, site, i));
  const lastUpdated = [b.updated_at, ...rows.map((r) => r.updated_at)].filter(Boolean).sort().pop() || null;
  const version = sha(rows.map((r) => `${r.id}|${r.updated_at}|${sha(JSON.stringify(r.content), 8)}|${r.page_number}`).join('\n') + `|${b.title}|${b.author}`);
  return {
    book: {
      id: b.id, slug: b.slug, title: b.title, author: b.author ?? null, publisher: b.publisher ?? null,
      base_language: b.base_language ?? null,
      website_url: `${site}/book/${b.slug}`,
      original_source_pdf_url: pickPdf(links),
      source_links: links,
    },
    version: { content_version: version, last_updated: lastUpdated },
    findings,
  };
}

const lite = (m) => ({ ...m.book, findings_count: m.findings.length, content_version: m.version.content_version, last_updated: m.version.last_updated });

export function bookUrls(site, slug) {
  const base = `${site}/book/${slug}`;
  return { website: base, txt: `${base}.txt`, json: `${base}.json`, download: `${base}/download` };
}

// ---------------------------------------------------------------------------
// Citations (website finding vs original book — always separate)
// ---------------------------------------------------------------------------
export function citationFor(model, f) {
  const b = model.book;
  const site = [
    `Website finding: "${f.title}"`, `in "${b.title}" (Sirājan Munīrā, Bengali findings)`, b.author ? `by ${b.author}` : null,
    `Passage ID ${f.heading_id}`, f.pdf_page_number ? `original PDF p. ${f.pdf_page_number}` : 'original PDF page not recorded',
    `content version ${model.version.content_version}`, f.permalink,
  ].filter(Boolean).join(', ');
  const original = [
    `Original book: ${b.title}`, b.author ? `author: ${b.author}` : null, b.publisher ? `publisher: ${b.publisher}` : null,
    f.pdf_page_number ? `PDF page ${f.pdf_page_number}` : 'PDF page not recorded', b.original_source_pdf_url ? `PDF: ${b.original_source_pdf_url}` : null,
  ].filter(Boolean).join(', ');
  return { website_finding: site, original_book: original };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------
const NOTE = 'These are Bengali research FINDINGS written by the Sirājan Munīrā editors from the original Arabic/Urdu books. They are NOT the original text and NOT a certified translation.';

export function renderBookJson(model, site) {
  const out = {
    schema: 'sirajan-munira/book@1',
    notice: NOTE,
    book: { ...model.book, urls: bookUrls(site, model.book.slug) },
    version: model.version,
    stats: { findings_count: model.findings.length, passages_count: model.findings.reduce((n, f) => n + f.passages.length, 0) },
    findings: model.findings.map((f) => ({
      ...f,
      text: f.passages.map((p) => p.text).join('\n\n'),
      citation: citationFor(model, f),
    })),
  };
  return JSON.stringify(out, null, 1);
}

export function renderBookTxt(model, site, { from = 0, limit = Infinity } = {}) {
  const { book: b, version, findings } = model;
  const u = bookUrls(site, b.slug);
  const head = [
    `BOOK: ${b.title}`,
    b.author ? `AUTHOR: ${b.author}` : null,
    b.publisher ? `PUBLISHER: ${b.publisher}` : null,
    b.base_language ? `ORIGINAL LANGUAGE: ${b.base_language}` : null,
    `WEBSITE: ${u.website}`,
    `ORIGINAL SOURCE PDF: ${b.original_source_pdf_url || 'not available'}`,
    ...b.source_links.map((l) => `SOURCE LINK: ${l.label} — ${l.url}`),
    `JSON: ${u.json}`,
    `CONTENT VERSION: ${version.content_version}  (last updated ${version.last_updated || 'unknown'})`,
    `TOTAL FINDINGS: ${findings.length}`,
    `NOTICE: ${NOTE}`,
    '', '='.repeat(72), '',
  ].filter((x) => x !== null);

  const parts = [];
  let bytes = Buffer.byteLength(head.join('\n'));
  let next = null;
  const end = Math.min(findings.length, from + limit);
  let i = from;
  for (; i < end; i++) {
    const f = findings[i];
    const block = [
      `## [${f.order}/${findings.length}] ${f.title}`,
      `HEADING ID: ${f.heading_id}`,
      `PDF PAGE: ${f.pdf_page_number ?? 'not recorded'}`,
      `LINK: ${f.permalink}`,
      '',
      ...f.passages.map((p) => `[${p.passage_id}] ${p.type === 'quote' ? '> ' : p.type === 'list_item' ? '- ' : ''}${p.text}`),
      '', '-'.repeat(72), '',
    ].join('\n');
    const size = Buffer.byteLength(block);
    if (bytes + size > MAX_BODY_BYTES && i > from) break;
    parts.push(block);
    bytes += size;
  }
  if (i < findings.length) next = i;
  const range = `SHOWING FINDINGS ${from + 1}–${i} of ${findings.length}`;
  const foot = next !== null
    ? `\n${range}\nPARTIAL OUTPUT: the file was split to stay within size limits. CONTINUE WITH: ${u.txt}?from=${next}\n`
    : from > 0 ? `\n${range}\nEND OF BOOK.\n` : `\nEND OF BOOK (all ${findings.length} findings included).\n`;
  return { text: [...head, ...(from > 0 || next !== null ? [range, ''] : []), ...parts].join('\n') + foot, next };
}

export async function loadCollection(id, site) {
  const cats = await restJson(`categories?id=eq.${enc(id)}&visibility=eq.true&select=id,name,description&limit=1`);
  const c = cats[0];
  if (!c) throw new HttpError(404, 'No public collection with that id.');
  const links = await restAll(`category_headings?category_id=eq.${c.id}&select=heading_id`);
  const ids = links.map((l) => l.heading_id);
  const findings = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const rows = await restJson(`headings?id=in.(${chunk.join(',')})&select=${HEADING_SELECT},books!inner(id,slug,title,author,visibility)`);
    for (const r of rows) {
      const bk = r.books;
      if (!bk) continue;
      const f = buildFinding(r, bk, site, 0);
      findings.push({ ...f, book: { slug: bk.slug, title: bk.title, author: bk.author ?? null } });
    }
  }
  findings.sort((a, z) => a.book.title.localeCompare(z.book.title) || (Number(a.pdf_page_number) || 0) - (Number(z.pdf_page_number) || 0));
  findings.forEach((f, i) => { f.order = i + 1; });
  return { collection: { id: c.id, name: c.name, description: c.description ?? null, website_url: `${site}/collections/${c.id}` }, findings };
}

export function renderCollectionTxt(m) {
  const { collection: c, findings } = m;
  const out = [`COLLECTION (topic): ${c.name}`, c.description ? `DESCRIPTION: ${c.description}` : null, `WEBSITE: ${c.website_url}`,
    `TOTAL FINDINGS: ${findings.length}`, `NOTICE: ${NOTE}`, '', '='.repeat(72), ''].filter((x) => x !== null);
  for (const f of findings) {
    out.push(`## [${f.order}/${findings.length}] ${f.title}`, `BOOK: ${f.book.title}${f.book.author ? ` — ${f.book.author}` : ''}`,
      `HEADING ID: ${f.heading_id}`, `PDF PAGE: ${f.pdf_page_number ?? 'not recorded'}`, `LINK: ${f.permalink}`, '',
      ...f.passages.map((p) => `[${p.passage_id}] ${p.text}`), '', '-'.repeat(72), '');
  }
  return out.join('\n');
}

export async function renderLlms(site) {
  const books = await restJson('books?visibility=eq.true&select=id,slug,title,author,updated_at,source_links(label,url)&order=created_at.desc');
  const counts = await Promise.all(books.map((b) => restCount(`headings?book_id=eq.${b.id}&select=id`).catch(() => null)));
  const cats = await restJson('categories?visibility=eq.true&select=id,name,description&order=name.asc').catch(() => []);
  const ccounts = await Promise.all(cats.map((c) => restCount(`category_headings?category_id=eq.${c.id}&select=heading_id`).catch(() => null)));
  const ai = `${site}/ai-integration`;
  const L = [];
  L.push('# Sirājan Munīrā', '',
    `> ${NOTE} Every finding carries the original book's PDF page number and a permanent link to its heading on the website. Prefer the TXT/JSON URLs below: they are plain files, need no JavaScript, and contain the complete findings of a book.`, '',
    'IMPORTANT RULES FOR AI AGENTS',
    '- Never present a finding as the original Arabic/Urdu text or as a certified translation.',
    '- Always cite: book title, finding heading, passage/heading ID, PDF page number and the website permalink.',
    '- If you could not read the full file (fetch/size limits), say so. Never claim a complete search you did not perform.', '',
    '## Start here',
    `- [Skill / usage instructions (read this first)](${ai}/SKILL.md): how to discover, read, search, cite and verify`,
    `- [Search documentation](${ai}/SEARCH.md): exact, partial, keyword and semantic search; server-side search API`,
    `- [Citation guidelines](${ai}/CITATION.md): how to cite a finding and the original book separately`,
    `- [Human guide and copyable prompts](${ai}): for people setting this up in ChatGPT, Claude or Gemini`, '',
    '## APIs (plain HTTP GET, no JavaScript needed)',
    `- Search: ${ai}/search?q=<query>&mode=auto|exact|keyword|semantic&book=<slug>&limit=20`,
    `- Verify a quotation: ${ai}/verify?text=<quoted bengali text>&book=<slug>`, '',
    `## Books (${books.length})`);
  books.forEach((b, i) => {
    const u = bookUrls(site, b.slug);
    const pdf = pickPdf(b.source_links || []);
    L.push(`- [${b.title}](${u.website})${b.author ? ` — ${b.author}` : ''}${counts[i] != null ? ` — ${counts[i]} findings` : ''}`,
      `  - TXT (complete findings): ${u.txt}`, `  - JSON (structured): ${u.json}`, `  - Download: ${u.download}?format=txt  |  ${u.download}?format=json`,
      `  - Original source PDF: ${pdf || 'not available'}`);
  });
  if (cats.length) {
    L.push('', `## Topic collections (${cats.length}) — findings grouped by topic across books`);
    cats.forEach((c, i) => L.push(`- [${c.name}](${site}/collections/${c.id})${ccounts[i] != null ? ` — ${ccounts[i]} findings` : ''}`,
      `  - TXT: ${site}/collections/${c.id}.txt`, `  - JSON: ${site}/collections/${c.id}.json`));
  }
  L.push('', '## Optional', `- [Website home](${site}/)`, `- [Human search page](${site}/search)`, '');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Search (server-side, over ALL findings in scope — not limited by AI fetch size)
// ---------------------------------------------------------------------------
const likeEsc = (s) => s.replace(/[\\%_*]/g, (m) => (m === '*' ? '' : '\\' + m));
const WORD_RE = /[\p{L}\p{N}ঀ-৿]+/gu;
const words = (s) => (normalize(s).toLowerCase().match(WORD_RE) || []);

function rowToHit(row, bookMap, site, matchType, extra = {}) {
  const bk = bookMap.get(row.book_id) || {};
  const blocks = docToBlocks(row.content);
  const title = normalize(row.title_text) || (blocks[0]?.type === 'heading' ? blocks[0].text : blocks[0]?.text) || '(untitled)';
  return {
    match_type: matchType,
    heading_id: row.id,
    title,
    book: { slug: bk.slug, title: bk.title, author: bk.author ?? null },
    pdf_page_number: row.page_number ?? null,
    permalink: `${site}/book/${bk.slug}#${row.id}`,
    blocks, ...extra,
  };
}

function snippetFrom(blocks, needles, max = 320) {
  const body = blocks.filter((b) => b.type !== 'heading');
  const low = needles.map((n) => n.toLowerCase());
  const hit = body.find((b) => low.some((n) => b.text.toLowerCase().includes(n))) || body[0];
  if (!hit) return '';
  const t = hit.text;
  const at = Math.max(0, Math.min(...low.map((n) => { const i = t.toLowerCase().indexOf(n); return i < 0 ? 1e9 : i; })));
  const start = at > 1e8 ? 0 : Math.max(0, at - 80);
  return (start ? '…' : '') + t.slice(start, start + max) + (start + max < t.length ? '…' : '');
}

export async function searchFindings(site, { q, mode = 'auto', book, limit = 20, offset = 0 }) {
  q = normalize(q);
  if (q.length < 2) throw new HttpError(400, 'Query "q" must be at least 2 characters.');
  limit = Math.min(50, Math.max(1, Number(limit) || 20));
  offset = Math.max(0, Number(offset) || 0);
  mode = ['auto', 'exact', 'keyword', 'semantic'].includes(mode) ? mode : 'auto';

  const books = await restJson('books?visibility=eq.true&select=id,slug,title,author');
  const bookMap = new Map(books.map((b) => [b.id, b]));
  let scope = null;
  if (book) {
    scope = books.find((b) => b.slug === book);
    if (!scope) throw new HttpError(404, `No public book with slug "${book}".`);
  }
  const scopeQ = scope ? `&book_id=eq.${scope.id}` : '';
  const cols = 'id,book_id,content,page_number,title_text';
  const fetchRows = (filter, n) => restJson(`headings?select=${cols}&${filter}${scopeQ}&order=sort_order.asc&limit=${n}`);
  const hits = new Map();   // heading_id → hit (best match type wins: exact > keyword > semantic)
  const rank = { exact: 3, keyword_all: 2, keyword_any: 1, semantic: 0 };
  const put = (h) => { const o = hits.get(h.heading_id); if (!o || rank[h.match_type] > rank[o.match_type] || (h.match_type === 'semantic' && o.match_type === 'semantic')) hits.set(h.heading_id, { ...o, ...h }); };
  const notes = [];
  const complete = { exact: false, keyword: false, semantic: false };
  const FETCH = 400;

  if (mode === 'auto' || mode === 'exact') {
    const rows = await fetchRows(`search_text=ilike.*${enc(likeEsc(q))}*`, FETCH);
    const nq = normalize(q).toLowerCase();
    for (const r of rows) {
      const plain = normalize(docToBlocks(r.content).map((b) => b.text).join(' ')).toLowerCase();
      const title = normalize(r.title_text).toLowerCase();
      if (plain.includes(nq) || title.includes(nq)) put(rowToHit(r, bookMap, site, 'exact', { snippet_needles: [q] }));
    }
    complete.exact = rows.length < FETCH;
  }
  const terms = [...new Set(words(q))];
  if ((mode === 'auto' || mode === 'keyword') && terms.length) {
    const andF = `and=(${terms.map((t) => `search_text.ilike.*${enc(likeEsc(t))}*`).join(',')})`;
    const rows = await fetchRows(andF, FETCH);
    rows.forEach((r) => put(rowToHit(r, bookMap, site, 'keyword_all', { snippet_needles: terms })));
    complete.keyword = rows.length < FETCH;
    if (!rows.length && terms.length > 1) {
      const orF = `or=(${terms.map((t) => `search_text.ilike.*${enc(likeEsc(t))}*`).join(',')})`;
      (await fetchRows(orF, FETCH)).forEach((r) => put(rowToHit(r, bookMap, site, 'keyword_any', { snippet_needles: terms })));
      notes.push('No finding contains all words; showing findings that contain at least one (keyword_any).');
    }
  }
  const semantic = { used: false, ok: false };
  if (mode === 'auto' || mode === 'semantic') {
    semantic.used = true;
    try {
      const res = await fetch(`${supaUrl()}/functions/v1/semantic-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
        body: JSON.stringify({ query: q, threshold: 0.55, limit: scope ? 50 : 40, offset: 0, includeCollections: false }),
      });
      if (!res.ok) throw new Error(`semantic-search responded ${res.status}`);
      const data = await res.json();
      for (const s of data.results || []) {
        if (s.kind && s.kind !== 'heading') continue;
        if (scope && s.book_slug !== scope.slug) continue;
        put({
          match_type: 'semantic', heading_id: s.heading_id || s.id, title: s.title,
          book: { slug: s.book_slug, title: s.book_title, author: s.book_author ?? null },
          pdf_page_number: s.page_number ?? null, permalink: `${site}/book/${s.book_slug}#${s.heading_id || s.id}`,
          similarity: typeof s.similarity === 'number' ? Math.round(s.similarity * 1000) / 1000 : null, snippet: s.snippet || '',
        });
      }
      semantic.ok = true;
      notes.push('semantic matches are meaning-based and are NOT exact text matches; confirm with /verify before quoting.');
    } catch (e) {
      notes.push(`Semantic search unavailable (${e.message}); exact/keyword results are still complete.`);
    }
  }

  const order = { exact: 0, keyword_all: 1, keyword_any: 2, semantic: 3 };
  const all = [...hits.values()].sort((a, z) => order[a.match_type] - order[z.match_type] || (z.similarity || 0) - (a.similarity || 0));
  const page = all.slice(offset, offset + limit).map(({ blocks, snippet_needles, ...h }) => ({
    ...h, snippet: h.snippet || (blocks ? snippetFrom(blocks, snippet_needles || [q]) : ''),
  }));
  return {
    query: q, mode, scope: scope ? { book: scope.slug } : 'all public books',
    total_matches: all.length, offset, returned: page.length,
    counts_by_match_type: all.reduce((m, h) => ((m[h.match_type] = (m[h.match_type] || 0) + 1), m), {}),
    coverage: {
      exact_and_keyword: 'Executed in the database over EVERY finding in scope (not limited by file size or AI context).',
      exact_complete: mode === 'semantic' ? null : complete.exact, keyword_complete: mode === 'semantic' ? null : complete.keyword,
      semantic: semantic.used ? (semantic.ok ? 'ran (top matches above threshold only; not exhaustive)' : 'unavailable') : 'not requested',
    },
    notes, results: page,
    next_offset: offset + limit < all.length ? offset + limit : null,
  };
}

// ---------------------------------------------------------------------------
// Exact text verification (against published Bengali findings only)
// ---------------------------------------------------------------------------
function lcsDiff(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const missing = [], matchedB = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { matchedB.push(j); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) missing.push(a[i++]); else j++;
  }
  while (i < n) missing.push(a[i++]);
  // Site words that sit INSIDE the matched stretch but are absent from the quote.
  const extra = [];
  if (matchedB.length) {
    const set = new Set(matchedB);
    for (let k = matchedB[0]; k <= matchedB[matchedB.length - 1]; k++) if (!set.has(k)) extra.push(b[k]);
  }
  return { common: dp[0][0], missing, extra };
}

export async function verifyText(site, { text, book }) {
  const q = normalize(text);
  if (q.length < 4) throw new HttpError(400, 'Parameter "text" is too short to verify.');
  const books = await restJson('books?visibility=eq.true&select=id,slug,title,author');
  const bookMap = new Map(books.map((b) => [b.id, b]));
  let scope = null;
  if (book) { scope = books.find((b) => b.slug === book); if (!scope) throw new HttpError(404, `No public book with slug "${book}".`); }
  const scopeQ = scope ? `&book_id=eq.${scope.id}` : '';
  const cols = 'id,book_id,content,page_number,title_text';
  const qw = words(q);
  const nq = qw.join(' ');

  // Candidates: any finding containing the longest window of the quote that exists somewhere.
  let candidates = [];
  for (const size of [Math.min(qw.length, 10), 6, 4, 3].filter((n, i, a) => n >= 1 && a.indexOf(n) === i)) {
    const win = qw.slice(0, size).join(' ');
    const mid = qw.slice(Math.max(0, Math.floor(qw.length / 2) - Math.floor(size / 2))).slice(0, size).join(' ');
    for (const w of [...new Set([win, mid])]) {
      const rows = await restJson(`headings?select=${cols}&search_text=ilike.*${enc(likeEsc(w))}*${scopeQ}&limit=30`);
      candidates.push(...rows);
    }
    if (candidates.length) break;
  }
  const seen = new Set();
  candidates = candidates.filter((r) => !seen.has(r.id) && seen.add(r.id));

  let best = null;
  for (const r of candidates) {
    const blocks = docToBlocks(r.content);
    const units = [...blocks.map((b) => b.text), blocks.map((b) => b.text).join(' ')];
    for (const u of units) {
      const uw = words(u);
      const exact = uw.join(' ').includes(nq);
      const d = exact ? { common: qw.length, missing: [], extra: [] } : lcsDiff(qw, uw.length > 400 ? uw.slice(0, 400) : uw);
      const ratio = d.common / qw.length;
      if (!best || (exact && !best.exact) || (!best.exact && ratio > best.ratio)) best = { r, exact, ratio, d, blocks };
    }
  }
  const verdict = !best ? 'no_match' : best.exact ? 'exact_match' : best.ratio >= 0.6 ? 'partial_match' : 'no_match';
  const base = {
    verdict,
    checked_against: 'Bengali findings published on this website only. NOT compared with the original Arabic/Urdu PDF.',
    note: 'Whitespace/zero-width characters are ignored; punctuation and diacritics differences are ignored for word comparison. Semantic similarity is never treated as a match.',
    candidates_examined: candidates.length,
  };
  if (verdict === 'no_match') return { ...base, matched: null };
  const b = bookMap.get(best.r.book_id) || {};
  return {
    ...base,
    word_overlap: Math.round(best.ratio * 100) / 100,
    differences: best.exact ? null : { quote_words_not_in_site_text: best.d.missing.slice(0, 40), site_words_not_in_your_quote: best.d.extra.slice(0, 40) },
    matched: {
      heading_id: best.r.id,
      title: normalize(best.r.title_text) || best.blocks[0]?.text,
      book: { slug: b.slug, title: b.title, author: b.author ?? null },
      pdf_page_number: best.r.page_number ?? null,
      permalink: `${site}/book/${b.slug}#${best.r.id}`,
      original_text: best.blocks.filter((x) => x.type !== 'heading').map((x) => x.text).join('\n\n'),
    },
  };
}
