import React from 'react';

// ===========================================================================
// Highlighting helpers
//  1. highlightSegments / <Highlighted> — for text we render ourselves
//     (search result snippets).
//  2. findTextRanges / paintHighlight — for text already on the page (a
//     finding on the book page). Uses the CSS Custom Highlight API, which
//     paints ranges without touching the DOM, so React's tree is never
//     mutated behind its back. Unsupported browsers simply get the scroll +
//     flash without colouring.
// ===========================================================================

export function splitTerms(query: string): string[] {
  const terms = query
    .normalize('NFC')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return [...new Set(terms)].sort((a, b) => b.length - a.length);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface Segment { text: string; hit: boolean; }

export function highlightSegments(text: string, terms: string[]): Segment[] {
  const clean = terms.filter(Boolean);
  if (!text || !clean.length) return [{ text: text || '', hit: false }];
  const re = new RegExp(`(${clean.map(escapeRegExp).join('|')})`, 'giu');
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), hit: false });
    out.push({ text: m[0], hit: true });
    last = i + m[0].length;
    if (m[0].length === 0) break;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}

export function Highlighted({ text, terms, className }: { text: string; terms: string[]; className?: string }) {
  const segs = highlightSegments(text, terms);
  return (
    <span className={className}>
      {segs.map((s, i) => (s.hit ? <mark key={i} className="hl-term">{s.text}</mark> : <React.Fragment key={i}>{s.text}</React.Fragment>))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// In-page ranges (whitespace-insensitive, case-insensitive)
// ---------------------------------------------------------------------------

interface CharIndex { str: string; pos: { node: Text; offset: number }[]; }

function lowerUnit(ch: string) {
  const l = ch.toLowerCase();
  return l.length === 1 ? l : ch;
}

function normalizeNeedle(s: string) {
  let out = '';
  for (const ch of s.normalize('NFC').replace(/\s+/g, '')) {
    for (let i = 0; i < ch.length; i++) out += lowerUnit(ch[i]);
  }
  return out;
}

function buildIndex(root: Node): CharIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const chars: string[] = [];
  const pos: CharIndex['pos'] = [];
  let n = walker.nextNode() as Text | null;
  while (n) {
    const data = n.data;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (/\s/.test(ch)) continue;
      chars.push(lowerUnit(ch));
      pos.push({ node: n, offset: i });
    }
    n = walker.nextNode() as Text | null;
  }
  return { str: chars.join(''), pos };
}

function rangeFor(idx: CharIndex, start: number, len: number): Range {
  const r = document.createRange();
  const a = idx.pos[start];
  const b = idx.pos[start + len - 1];
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset + 1);
  return r;
}

/** Every occurrence of every term. */
export function findTermRanges(root: Element, terms: string[]): Range[] {
  const idx = buildIndex(root);
  const ranges: Range[] = [];
  for (const t of terms) {
    const needle = normalizeNeedle(t);
    if (!needle) continue;
    let from = 0;
    while (from <= idx.str.length) {
      const at = idx.str.indexOf(needle, from);
      if (at < 0) break;
      ranges.push(rangeFor(idx, at, needle.length));
      from = at + needle.length;
    }
  }
  return ranges;
}

/** One passage (e.g. the chunk that matched a semantic search).
 *  Falls back to matching its beginning and end if the middle differs. */
export function findPassageRange(root: Element, passage: string): Range | null {
  const idx = buildIndex(root);
  const needle = normalizeNeedle(passage);
  if (!needle) return null;
  const whole = idx.str.indexOf(needle);
  if (whole >= 0) return rangeFor(idx, whole, needle.length);
  const k = Math.min(40, needle.length);
  const head = idx.str.indexOf(needle.slice(0, k));
  if (head < 0) return null;
  const tail = idx.str.indexOf(needle.slice(-k), head);
  if (tail >= 0 && tail - head < needle.length * 2) return rangeFor(idx, head, tail + k - head);
  return rangeFor(idx, head, k);
}

export function highlightApiSupported(): boolean {
  return typeof CSS !== 'undefined' && !!(CSS as any).highlights && typeof (window as any).Highlight === 'function';
}

/** Paint ranges under a named highlight (see ::highlight(name) in CSS). */
export function paintHighlight(name: string, ranges: Range[]) {
  if (!highlightApiSupported()) return;
  const reg = (CSS as any).highlights;
  if (!ranges.length) { reg.delete(name); return; }
  reg.set(name, new (window as any).Highlight(...ranges));
}

export function clearHighlight(...names: string[]) {
  if (!highlightApiSupported()) return;
  const reg = (CSS as any).highlights;
  names.forEach((n) => reg.delete(n));
}