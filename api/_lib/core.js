// ============================================================================
// Shared server-side logic for the AI-integration endpoints.
// Plain ESM JavaScript (no build step) so it runs unchanged as a Vercel
// Serverless Function AND inside the Vite dev server (see vite.config.ts).
//
// Data is read straight from Supabase's REST API with the public anon key, so
// Row Level Security applies: hidden books are never exported.
// ============================================================================
import { createHash } from 'node:crypto';
import { bnNormalize, bnFuzzy, bnWords, bnVariants, expandSynonyms, SYNONYM_GROUPS } from './bn.js';
export { SYNONYM_GROUPS };

const env = (k) => process.env[k] || process.env['VITE_' + k] || '';
export const supaUrl = () => env('SUPABASE_URL').replace(/\/+$/, '');
const anonKey = () => env('SUPABASE_ANON_KEY');

export const PART_BYTES = Number(process.env.AI_PART_BYTES) || 60_000; // ~60 KB: fits agent fetch tools that truncate around 50-80 KB

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

/** First ~12 words, copied exactly (whitespace-collapsed only). */
export function firstWordsOf(text, n = 12) {
  const w = String(text || '').trim().split(/\s+/).filter(Boolean);
  return w.slice(0, n).join(' ') + (w.length > n ? ' …' : '');
}

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
  const firstWords = firstWordsOf(body.length ? body[0].text : title);
  return {
    heading_id: row.id,
    level: row.level,
    order: idx + 1,
    title,
    pdf_page_number: row.page_number ?? null,
    first_words: firstWords,
    importance_level: row.importance_level ?? null,
    permalink: `${site}/book/${encodeURIComponent(book.slug)}#${row.id}`,
    updated_at: row.updated_at,
    passages,
  };
}

function pickPdf(links) {
  const pdf = links.find((l) => /\.pdf(\?|#|$)/i.test(l.url)) || links.find((l) => /pdf/i.test(l.label));
  return pdf ? pdf.url : null;
}

/** ASCII-safe alias: the slug itself when ASCII, otherwise book-<first 8 chars of id>. Old slugs keep working. */
export const aliasOf = (b) => (/^[\x21-\x7e]+$/.test(b.slug) ? b.slug : `book-${b.id.slice(0, 8)}`);

export async function resolveBook(key) {
  const k = decodeURIComponent(String(key || ''));
  const books = await restJson('books?visibility=eq.true&select=id,slug,title,author&order=created_at.desc');
  const b = books.find((x) => x.slug === k || aliasOf(x) === k || x.slug === bnNormalize(k));
  if (!b) throw new HttpError(404, `No public book "${k}".`);
  return b;
}

export async function loadBook(key, site) {
  const found = await resolveBook(key);
  const books = await restJson(`books?id=eq.${found.id}&visibility=eq.true&select=*,source_links(label,url,sort_order)&limit=1`);
  const b = books[0];
  if (!b) throw new HttpError(404, `No public book "${key}".`);
  const rows = await restAll(`headings?book_id=eq.${b.id}&select=${HEADING_SELECT}&order=sort_order.asc,created_at.asc,id.asc`);
  const links = (b.source_links || []).sort((a, z) => a.sort_order - z.sort_order).map(({ label, url }) => ({ label, url }));
  const alias = aliasOf(b);
  const findings = rows.map((r, i) => buildFinding(r, b, site, i));
  const lastUpdated = [b.updated_at, ...rows.map((r) => r.updated_at)].filter(Boolean).sort().pop() || null;
  const version = sha(rows.map((r) => `${r.id}|${r.updated_at}|${sha(JSON.stringify(r.content), 8)}|${r.page_number}`).join('\n') + `|${b.title}|${b.author}`);
  return {
    book: {
      id: b.id, slug: b.slug, alias, title: b.title, author: b.author ?? null, publisher: b.publisher ?? null,
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

export function bookUrls(site, slug, alias = slug) {
  const base = `${site}/book/${alias}`;
  return { website: `${site}/book/${encodeURIComponent(slug)}`, txt: `${base}.txt`, json: `${base}.json`, download: `${base}/download`, part: (n) => `${base}/part-${n}.txt`, index: (n = 1) => (n === 1 ? `${base}/index.tsv` : `${base}/index-${n}.tsv`), keywords: (n = 1) => (n === 1 ? `${base}/keywords.tsv` : `${base}/keywords-${n}.tsv`) };
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

const clean = (t) => String(t ?? '').replace(/[\t\r\n]+/g, ' ').trim();
const pageOf = (f) => f.pdf_page_number ?? 'not recorded';

export function renderBookJson(model, site) {
  const out = {
    schema: 'sirajan-munira/book@1',
    type: 'findings', language: 'bn',
    book: { ...model.book, urls: bookUrlsPlain(site, model.book) },
    version: model.version,
    stats: { findings_count: model.findings.length, passages_count: model.findings.reduce((n, f) => n + f.passages.length, 0) },
    findings: model.findings.map((f) => ({ ...f, text: f.passages.map((p) => p.text).join('\n\n'), citation: citationFor(model, f) })),
  };
  return JSON.stringify(out, null, 1);
}

function bookUrlsPlain(site, b) {
  const u = bookUrls(site, b.slug, b.alias);
  return { website: u.website, txt: u.txt, json: u.json, download: u.download, part_1: u.part(1), index: u.index(1), keywords: u.keywords(1) };
}

function findingBlock(f, total) {
  return [
    `## [${f.order}/${total}] ${f.title}`,
    `ID: ${f.heading_id}`,
    `PDF PAGE: ${pageOf(f)}`,
    `LINK: ${f.permalink}`,
    '',
    ...f.passages.map((p) => `${p.type === 'quote' ? '> ' : p.type === 'list_item' ? '- ' : ''}${p.text}`),
    '', '-'.repeat(60), '',
  ].join('\n');
}

/** Greedy split of text items into chunks of ~maxBytes (an oversize item gets its own chunk). */
export function chunkItems(items, maxBytes = PART_BYTES, reserve = 700) {
  const chunks = [];
  let cur = [], size = 0;
  for (const it of items) {
    const n = Buffer.byteLength(it) + 1;
    if (cur.length && size + n > maxBytes - reserve) { chunks.push(cur); cur = []; size = 0; }
    cur.push(it); size += n;
  }
  if (cur.length || !chunks.length) chunks.push(cur);
  return chunks;
}

const metaHead = (model, site, extra = []) => {
  const b = model.book, u = bookUrls(site, b.slug, b.alias);
  return [
    'TYPE: findings', `BOOK: ${b.title}`, b.author ? `AUTHOR: ${b.author}` : null, `BOOK-KEY: ${b.alias}`, 'LANGUAGE: bn',
    `WEBSITE: ${u.website}`, `ORIGINAL SOURCE PDF: ${b.original_source_pdf_url || 'not available'}`,
    ...b.source_links.filter((l) => l.url !== b.original_source_pdf_url).map((l) => `SOURCE LINK: ${l.label} — ${l.url}`),
    `CONTENT VERSION: ${model.version.content_version} (updated ${model.version.last_updated || 'unknown'})`,
    `TOTAL FINDINGS: ${model.findings.length}`, ...extra,
  ].filter((x) => x !== null);
};

export function bookPartCount(model) {
  return chunkItems(model.findings.map((f) => findingBlock(f, model.findings.length)), PART_BYTES, 1500).length;
}

/** Part N of the book text (1-based). Every part ends with an explicit END marker. */
export function renderBookPart(model, site, n) {
  const total = model.findings.length;
  const chunks = chunkItems(model.findings.map((f) => findingBlock(f, total)), PART_BYTES, 1500);
  if (!Number.isInteger(n) || n < 1 || n > chunks.length) throw new HttpError(404, `Part ${n} does not exist; this book has ${chunks.length} part(s).`);
  const u = bookUrls(site, model.book.slug, model.book.alias);
  let first = 1;
  for (let i = 0; i < n - 1; i++) first += chunks[i].length;
  const last = first + chunks[n - 1].length - 1;
  const head = [...metaHead(model, site, [`PART: ${n}/${chunks.length}`, `FINDINGS IN THIS PART: ${first}-${last}`, `INDEX: ${u.index(1)}`]), '', '='.repeat(60), ''];
  const foot = n < chunks.length
    ? `END OF PART ${n}/${chunks.length} - NEXT: ${u.part(n + 1)}`
    : `END OF BOOK - complete (${total} findings)`;
  return { text: head.join('\n') + '\n' + chunks[n - 1].join('\n') + '\n' + foot + '\n', parts: chunks.length, from: first };
}

/** Whole book as one text file (used for downloads). */
export function renderBookFull(model, site) {
  const total = model.findings.length;
  return [...metaHead(model, site), '', '='.repeat(60), ''].join('\n') + '\n' + model.findings.map((f) => findingBlock(f, total)).join('\n') + `\nEND OF BOOK - complete (${total} findings)\n`;
}

/** Which part holds finding #k (for legacy ?from=k links). */
export function partForFinding(model, k) {
  const chunks = chunkItems(model.findings.map((f) => findingBlock(f, model.findings.length)), PART_BYTES, 1500);
  let acc = 0;
  for (let i = 0; i < chunks.length; i++) { acc += chunks[i].length; if (k < acc) return i + 1; }
  return chunks.length;
}

export const shortOf = (t) => String(t || '').trim().split(/\s+/).slice(0, 2).join(' ');
const INDEX_COLS = '#no\tbook\tid\ttitle\tpdf_page\tfirst_words\tpermalink';
export function renderIndexPart(model, site, n, nextBookUrl) {
  const b = model.book, u = bookUrls(site, b.slug, b.alias), total = model.findings.length;
  const lines = model.findings.map((f) => [f.order, b.alias, f.heading_id, clean(f.title), pageOf(f), clean(f.first_words).replace(/\s*…$/, ''), f.permalink].join('\t'));
  const chunks = chunkItems(lines, PART_BYTES, 1200);
  if (!Number.isInteger(n) || n < 1 || n > chunks.length) throw new HttpError(404, `Index part ${n} does not exist; this book index has ${chunks.length} part(s).`);
  let first = 1; for (let i = 0; i < n - 1; i++) first += chunks[i].length;
  const head = ['# TYPE: finding-index (tab-separated)', `# BOOK: ${b.title} (${b.alias})`, `# SHORT: ${shortOf(b.title)}`, `# CONTENT VERSION: ${model.version.content_version}`,
    `# PART: ${n}/${chunks.length}  ROWS: ${first}-${first + chunks[n - 1].length - 1} of ${total}`, `# FULL TEXT: ${u.part(1)}   KEYWORDS: ${u.keywords(1)}`, INDEX_COLS];
  const foot = n < chunks.length ? `# END OF INDEX PART ${n}/${chunks.length} - NEXT: ${u.index(n + 1)}`
    : nextBookUrl ? `# END OF BOOK INDEX - complete (${total} findings). NEXT BOOK: ${nextBookUrl}` : `# END OF INDEX - complete (last book, ${total} findings)`;
  return [...head, ...chunks[n - 1], foot].join('\n') + '\n';
}

export function renderKeywordsPart(model, site, n, nextBookUrl) {
  const b = model.book, u = bookUrls(site, b.slug, b.alias), N = model.findings.length;
  const map = new Map();
  for (const f of model.findings) {
    const seen = new Set(bnWords([f.title, ...f.passages.map((p) => p.text)].join(' ')).filter((w) => [...w].length >= 2 && !/^\d+$/.test(w)));
    for (const w of seen) { if (!map.has(w)) map.set(w, []); map.get(w).push(f.order); }
  }
  const lines = [...map.entries()].filter(([, ids]) => N < 20 || ids.length <= N * 0.35)
    .sort((a, z) => (a[0] < z[0] ? -1 : a[0] > z[0] ? 1 : 0)).map(([w, ids]) => `${w}\t${ids.length}\t${ids.join(',')}`);
  const chunks = chunkItems(lines, PART_BYTES, 1200);
  if (!Number.isInteger(n) || n < 1 || n > chunks.length) throw new HttpError(404, `Keywords part ${n} does not exist; this book has ${chunks.length} part(s).`);
  const head = ['# TYPE: keyword-index (tab-separated): word <TAB> number-of-findings <TAB> finding numbers (#no in the index file)', `# BOOK: ${b.title} (${b.alias})`, `# SHORT: ${shortOf(b.title)}`,
    `# CONTENT VERSION: ${model.version.content_version}`, `# PART: ${n}/${chunks.length}. Words are lower-cased exact forms, sorted alphabetically. Bengali inflects (নামাজ, নামাজের, নামাজে): search by PREFIX and try spelling variants; see ${site}/synonyms.txt`,
    `# INDEX: ${u.index(1)}`, '#word\tcount\tfinding_numbers'];
  const foot = n < chunks.length ? `# END OF KEYWORDS PART ${n}/${chunks.length} - NEXT: ${u.keywords(n + 1)}`
    : nextBookUrl ? `# END OF BOOK KEYWORDS - complete (${lines.length} words). NEXT BOOK: ${nextBookUrl}` : `# END OF KEYWORDS - complete (${lines.length} words)`;
  return [...head, ...chunks[n - 1], foot].join('\n') + '\n';
}

export async function neighborBookUrl(site, bookId, kind) {
  const books = await restJson('books?visibility=eq.true&select=id,slug&order=created_at.desc');
  const i = books.findIndex((x) => x.id === bookId);
  const nx = books[i + 1];
  if (!nx) return null;
  const u = bookUrls(site, nx.slug, aliasOf(nx));
  return kind === 'keywords' ? u.keywords(1) : u.index(1);
}

export async function renderMasterIndex(site) {
  const books = await restJson('books?visibility=eq.true&select=id,slug,title,author,updated_at,source_links(label,url)&order=created_at.desc');
  const counts = await Promise.all(books.map((b) => restCount(`headings?book_id=eq.${b.id}&select=id`).catch(() => 0)));
  const total = counts.reduce((a, c) => a + c, 0);
  const rows = books.map((b, i) => {
    const u = bookUrls(site, b.slug, aliasOf(b));
    return [aliasOf(b), shortOf(b.title), clean(b.title), clean(b.author || ''), counts[i], u.index(1), u.keywords(1)].join('\t');
  });
  return ['# TYPE: book-list (tab-separated)', `# BOOKS: ${books.length}   FINDINGS: ${total}`,
    '# Each book has: index (one line per finding), full-text parts, keywords. Index files chain: the last part of a book points to the next book, so reading from the first index URL enumerates everything.',
    `# FIRST INDEX: ${books[0] ? bookUrls(site, books[0].slug, aliasOf(books[0])).index(1) : 'none'}   SYNONYMS: ${site}/synonyms.txt   RULES: ${site}/ai-integration/SKILL.md`,
    '#book\tshort\ttitle\tauthor\tfindings\tindex_url\tkeywords_url', ...rows,
    `# END OF BOOK LIST - complete (${books.length} books)`].join('\n') + '\n';
}

export function renderSynonyms(site) {
  return ['# TYPE: synonym-groups. Words on one line are interchangeable when searching. Also try ী/ি, ূ/ু spelling variants.', `# ${site}/ai-integration/search applies these automatically`,
    ...SYNONYM_GROUPS.map((g) => g.join(', ')), '# END OF FILE'].join('\n') + '\n';
}

export async function loadFinding(id, site) {
  const rows = await restJson(`headings?id=eq.${enc(id)}&select=${HEADING_SELECT},books!inner(id,slug,title,author,visibility,source_links(label,url,sort_order))&limit=1`);
  const r = rows[0];
  if (!r || !r.books?.visibility) throw new HttpError(404, 'No public finding with that id.');
  const bk = r.books;
  const f = buildFinding(r, bk, site, 0);
  const links = (bk.source_links || []).sort((a, z) => a.sort_order - z.sort_order);
  return { f, book: { slug: bk.slug, alias: aliasOf(bk), title: bk.title, author: bk.author ?? null, pdf: pickPdf(links) } };
}

export function renderFindingTxt({ f, book }) {
  return ['TYPE: finding', `BOOK: ${book.title}${book.author ? ` — ${book.author}` : ''}`, `BOOK-KEY: ${book.alias}`, 'LANGUAGE: bn', `TITLE: ${f.title}`,
    `ID: ${f.heading_id}`, `PDF PAGE: ${pageOf(f)}`, `LINK: ${f.permalink}`, `ORIGINAL SOURCE PDF: ${book.pdf || 'not available'}`, `UPDATED: ${f.updated_at}`, '', '='.repeat(60), '',
    ...f.passages.map((p) => (p.type === 'quote' ? '> ' : p.type === 'list_item' ? '- ' : '') + p.text), '', 'END OF FINDING - complete'].join('\n') + '\n';
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
      findings.push({ ...buildFinding(r, bk, site, 0), book: { slug: bk.slug, alias: aliasOf(bk), title: bk.title, author: bk.author ?? null } });
    }
  }
  findings.sort((a, z) => a.book.title.localeCompare(z.book.title) || (Number(a.pdf_page_number) || 0) - (Number(z.pdf_page_number) || 0));
  findings.forEach((f, i) => { f.order = i + 1; });
  const version = sha(findings.map((f) => `${f.heading_id}|${f.updated_at}`).join('\n'));
  return { collection: { id: c.id, name: c.name, description: c.description ?? null, website_url: `${site}/collections/${c.id}`, content_version: version }, findings };
}

/** Light by default (no body text); full=true adds the passages. */
export function collectionJson(m, site, full) {
  return JSON.stringify({
    schema: 'sirajan-collection/1', type: 'collection', name: m.collection.name, description: m.collection.description, query: null,
    content_version: m.collection.content_version, website_url: m.collection.website_url,
    items: m.findings.map((f) => ({
      id: f.heading_id, url: f.permalink, book: f.book.slug, title: f.title, pdf_page: pageOf(f), first_words: f.first_words,
      ...(full ? { text: f.passages.map((p) => p.text).join('\n\n') } : {}),
    })),
    note: full ? undefined : `Light export. Add ?full=1 for the full text, or open ${site}/f/<id>.txt for one finding.`,
  }, null, 1);
}

export function renderCollectionTxt(m, site, full) {
  const { collection: c, findings } = m;
  const out = ['TYPE: collection', `COLLECTION: ${c.name}`, c.description ? `DESCRIPTION: ${c.description}` : null, `WEBSITE: ${c.website_url}`,
    `CONTENT VERSION: ${c.content_version}`, `TOTAL FINDINGS: ${findings.length}`, full ? 'MODE: full text' : `MODE: light (add ?full=1 for full text; single finding: ${site}/f/<id>.txt)`, '', '='.repeat(60), ''].filter((x) => x !== null);
  for (const f of findings) {
    if (full) out.push(`## [${f.order}/${findings.length}] ${f.title}`, `BOOK: ${f.book.title}`, `PDF PAGE: ${pageOf(f)}`, `LINK: ${f.permalink}`, '', ...f.passages.map((p) => p.text), '', '-'.repeat(60), '');
    else out.push(`[${f.order}] ${f.title}\n  BOOK: ${f.book.title} | PDF PAGE: ${pageOf(f)}\n  FIRST WORDS: ${f.first_words}\n  LINK: ${f.permalink}`);
  }
  out.push('', `END OF COLLECTION - complete (${findings.length} findings)`);
  return out.join('\n') + '\n';
}

export async function exampleFindings(site) {
  try {
    const books = await restJson('books?visibility=eq.true&select=id,slug,title&order=created_at.desc&limit=2');
    const out = [];
    for (const b of books) {
      const rows = await restJson(`headings?book_id=eq.${b.id}&select=${HEADING_SELECT}&order=sort_order.asc&limit=4`);
      for (const r of rows) {
        const f = buildFinding(r, b, site, 0);
        if (f.passages.length && out.length < 2 && (out.length === 0 || out[0].book !== b.title)) out.push({ book: b.title, title: f.title, page: pageOf(f), words: f.first_words, link: f.permalink, id: f.heading_id, slug: b.slug });
      }
    }
    if (out.length === 1) out.push({ ...out[0] });
    return out;
  } catch { return []; }
}

export async function renderLlms(site, docs) {
  const books = await restJson('books?visibility=eq.true&select=id,slug,title,author,updated_at,source_links(label,url)&order=created_at.desc');
  const counts = await Promise.all(books.map((b) => restCount(`headings?book_id=eq.${b.id}&select=id`).catch(() => null)));
  const cats = await restJson('categories?visibility=eq.true&select=id,name,description&order=name.asc').catch(() => []);
  const ccounts = await Promise.all(cats.map((c) => restCount(`category_headings?category_id=eq.${c.id}&select=heading_id`).catch(() => null)));
  const ex = await exampleFindings(site);
  const ai = `${site}/ai-integration`;
  const totalFindings = counts.reduce((a, c) => a + (c || 0), 0);
  const version = sha(books.map((b, i) => `${b.id}|${b.updated_at}|${counts[i]}`).join('\n'), 10);
  const L = [];
  L.push('# Sirājan Munīrā', '', `> Archive of Bengali research findings from original Arabic/Urdu books. ${books.length} books, ${totalFindings} findings, each with an id and the original-PDF page.`, '', docs.answerFormat(site, ex), '', docs.tiers(site), '',
    '## Start here (static files, no query building needed)',
    `- ${site}/index.tsv — list of all books with their index / text / keyword URLs (read this first)`,
    `- ${site}/synonyms.txt — synonym groups for searching`, `- ${site}/openapi.json — API description for custom GPTs / agents`, '',
    `## Books (${books.length})`);
  books.forEach((b, i) => {
    const u = bookUrls(site, b.slug, aliasOf(b));
    L.push(`- ${b.title} (short: ${shortOf(b.title)})${b.author && b.author !== 'লেখক' ? ` — ${b.author}` : ''}${counts[i] != null ? ` — ${counts[i]} findings` : ''}`,
      `  - index: ${u.index(1)}`, `  - keywords: ${u.keywords(1)}`);
  });
  if (cats.length) {
    L.push('', `## Topic collections (${cats.length})`);
    cats.forEach((c, i) => L.push(`- ${c.name}${ccounts[i] != null ? ` — ${ccounts[i]} findings` : ''}: ${site}/collections/${c.id}.txt  (JSON: ${site}/collections/${c.id}.json)`));
  }
  L.push('', `Per book (key = folder name above): ${site}/book/<key>/part-N.txt (full text, ~60 KB parts), ${site}/book/<key>.json. One finding: ${site}/f/<id>.txt. Details and live search API: ${ai}/SKILL.md`, '', 'END OF LLMS.TXT - complete', '');
  return L.join('\n');
}

export async function renderOpenApi(site) {
  const q = (name, d, extra = {}) => ({ name, in: 'query', required: false, description: d, schema: { type: 'string', ...extra } });
  const txt = { '200': { description: 'text', content: { 'text/plain': { schema: { type: 'string' } } } } };
  return JSON.stringify({
    openapi: '3.1.0', info: { title: 'Sirājan Munīrā', version: '1.0.0', description: 'Bengali findings from original Arabic/Urdu books. Read-only.' }, servers: [{ url: site }],
    paths: {
      '/ai-integration/search': { get: { operationId: 'searchFindings', summary: 'Search findings across all books (or one book)', parameters: [{ ...q('q', 'Query (Bengali or English)'), required: true }, q('mode', 'auto|exact|keyword|semantic', { enum: ['auto', 'exact', 'keyword', 'semantic'] }), q('book', 'Book key (slug or ASCII alias)'), q('limit', 'Max results (1-50)', { type: 'integer' }), q('offset', 'Paging offset', { type: 'integer' })], responses: { '200': { description: 'JSON results with title, book, pdf_page_number, first_words, permalink' } } } },
      '/ai-integration/verify': { get: { operationId: 'verifyQuotation', summary: 'Check whether a quotation exists in a published finding', parameters: [{ ...q('text', 'Quoted text'), required: true }, q('book', 'Book key')], responses: { '200': { description: 'exact_match | partial_match | no_match' } } } },
      '/f/{id}.txt': { get: { operationId: 'getFinding', summary: 'One finding as plain text', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: txt } },
      '/index.tsv': { get: { operationId: 'listBooks', summary: 'Books with index/text/keyword URLs', responses: txt } },
      '/book/{book}/index.tsv': { get: { operationId: 'bookIndex', summary: 'One line per finding (chained, ends with END marker)', parameters: [{ name: 'book', in: 'path', required: true, schema: { type: 'string' } }], responses: txt } },
      '/book/{book}/part-{n}.txt': { get: { operationId: 'bookPart', summary: 'Book full text, part n', parameters: [{ name: 'book', in: 'path', required: true, schema: { type: 'string' } }, { name: 'n', in: 'path', required: true, schema: { type: 'integer' } }], responses: txt } },
      '/book/{book}.json': { get: { operationId: 'bookJson', summary: 'Whole book as JSON', parameters: [{ name: 'book', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'json' } } } },
    },
  }, null, 1);
}

export async function qualityReport(site) {
  const books = await restJson('books?visibility=eq.true&select=id,slug&order=created_at.desc');
  const out = [];
  const hasLink = (n) => !!n && ((n.marks || []).some((m) => m.type === 'link') || (n.content || []).some(hasLink));
  for (const bk of books) {
    const m = await loadBook(bk.slug, site);
    const rows = await restAll(`headings?book_id=eq.${bk.id}&select=id,content&order=sort_order.asc`);
    const linked = new Map(rows.map((r) => [r.id, hasLink(r.content)]));
    const issues = [];
    const seen = new Map();
    for (const f of m.findings) {
      const body = f.passages.map((p) => p.text).join(' ');
      const add = (type, detail) => issues.push({ type, heading_id: f.heading_id, title: f.title, pdf_page: pageOf(f), permalink: f.permalink, detail });
      if (!body.trim()) add('empty_body', 'No text below the title.');
      if (/(…|\.\.\.|[-,،:;])$/.test(f.title.trim()) || f.title.trim().length < 3) add('cutoff_title', `Title looks cut off: "${f.title.slice(-30)}"`);
      if (/(আরও|আরো|অনুরূপ|একই (রকম|ধরনের)|similar|more (hadith|narrations?))/i.test(body) && /(পৃষ্ঠা|পৃ\.|page|till|পর্যন্ত)/i.test(body) && !linked.get(f.heading_id)) add('see_more_without_link', 'Mentions more items / a page range but contains no link.');
      const key = bnFuzzy(body);
      if (key.length > 40) { if (seen.has(key)) add('duplicate', `Same text as ${seen.get(key)}`); else seen.set(key, f.permalink); }
      if (f.pdf_page_number == null) add('missing_page', 'PDF page not recorded.');
    }
    out.push({ book: m.book.alias, title: m.book.title, findings: m.findings.length, issues_count: issues.length, issues });
  }
  return { generated_at: new Date().toISOString(), books: out };
}

// ---------------------------------------------------------------------------
// Search (server-side, over ALL findings in scope — not limited by AI fetch size)
// ---------------------------------------------------------------------------
const likeEsc = (s) => s.replace(/[\\%_*]/g, (m) => (m === '*' ? '' : '\\' + m));
const WORD_RE = /[\p{L}\p{N}ঀ-৿]+/gu;
const words = bnWords;
const pgq = (v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
/** PostgREST `or(...)` over spelling variants (and synonyms) of a term. */
const orLike = (terms, col = 'search_text') => `or(${[...new Set(terms.flatMap((t) => bnVariants(t)))].map((v) => `${col}.ilike.${pgq('*' + likeEsc(v) + '*')}`).join(',')})`;

function rowToHit(row, bookMap, site, matchType, extra = {}) {
  const bk = bookMap.get(row.book_id) || {};
  const blocks = docToBlocks(row.content);
  const title = normalize(row.title_text) || (blocks[0]?.type === 'heading' ? blocks[0].text : blocks[0]?.text) || '(untitled)';
  return {
    match_type: matchType,
    heading_id: row.id,
    title,
    book: { slug: bk.slug, key: bk.slug ? aliasOf(bk) : null, title: bk.title, author: bk.author ?? null },
    pdf_page_number: row.page_number ?? 'not recorded',
    first_words: firstWordsOf((blocks.filter((b) => b.type !== 'heading')[0] || blocks[0] || {}).text || title),
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
    scope = books.find((b) => b.slug === book || aliasOf(b) === book);
    if (!scope) throw new HttpError(404, `No public book "${book}".`);
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
    const rows = await fetchRows(`or=${orLike([q]).slice(2)}`, FETCH);
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
    const andF = `and=(${terms.map((t) => orLike(expandSynonyms(t))).join(',')})`;
    const rows = await fetchRows(andF, FETCH);
    rows.forEach((r) => put(rowToHit(r, bookMap, site, 'keyword_all', { snippet_needles: terms })));
    complete.keyword = rows.length < FETCH;
    if (!rows.length && terms.length > 1) {
      const orF = `or=${orLike(terms.flatMap((t) => expandSynonyms(t))).slice(2)}`;
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
          pdf_page_number: s.page_number ?? 'not recorded', first_words: firstWordsOf(s.snippet || s.title || ''), permalink: `${site}/book/${s.book_slug}#${s.heading_id || s.id}`,
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
  if (book) { scope = books.find((b) => b.slug === book || aliasOf(b) === book); if (!scope) throw new HttpError(404, `No public book "${book}".`); }
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
