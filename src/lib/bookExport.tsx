import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Printer, Download, Copy, Check, Link2, Loader2 } from 'lucide-react';
import { Book, Heading, listHeadings } from './supabase';
import { docToMarkdown, docToPlainText, copyToClipboard } from './richtext';

// ===========================================================================
// Book export: Print / PDF, Markdown download, Markdown copy, copy link.
// Shared by the Bookshelf cards (three-dot menu) and the Book page toolbar.
// ===========================================================================

function sanitizeFilename(s: string) {
  return s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'book';
}

function downloadBlob(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildBookMarkdown(book: Book, headings: Heading[]): string {
  const lines: string[] = [];
  lines.push(`# ${book.title}`);
  if (book.author) lines.push(`**Author:** ${book.author}`);
  if (book.publisher) lines.push(`**Publisher:** ${book.publisher}`);
  if (book.base_language) lines.push(`**Language:** ${book.base_language}`);
  lines.push('');
  if (book.source_links?.length) {
    lines.push('## Sources');
    book.source_links.forEach((l) => lines.push(`- [${l.label}](${l.url})`));
    lines.push('');
  }
  lines.push('---', '');
  headings.forEach((h) => {
    if (h.page_number) lines.push(`*Page ${h.page_number}*`);
    lines.push(docToMarkdown(h.content), '', '---', '');
  });
  return lines.join('\n');
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineToHtml(nodes: any[] = []): string {
  return nodes.map((n: any) => {
    if (n.type === 'hardBreak') return '<br>';
    if (n.type !== 'text') return '';
    let t = escHtml(n.text || '');
    const m = n.marks || [];
    if (m.some((x: any) => x.type === 'bold')) t = `<strong>${t}</strong>`;
    if (m.some((x: any) => x.type === 'italic')) t = `<em>${t}</em>`;
    if (m.some((x: any) => x.type === 'underline')) t = `<u>${t}</u>`;
    if (m.some((x: any) => x.type === 'code')) t = `<code>${t}</code>`;
    const hl = m.find((x: any) => x.type === 'highlight');
    if (hl) t = `<mark style="background:${escHtml(hl.attrs?.color || '#fff3a3')}">${t}</mark>`;
    const lnk = m.find((x: any) => x.type === 'link');
    if (lnk?.attrs?.href) t = `<a href="${escHtml(lnk.attrs.href)}">${t}</a>`;
    return t;
  }).join('');
}

function nodeToHtml(n: any): string {
  if (!n) return '';
  const kids = () => (n.content || []).map(nodeToHtml).join('');
  switch (n.type) {
    case 'doc': return kids();
    case 'paragraph': return `<p>${inlineToHtml(n.content) || '&#8203;'}</p>`;
    case 'heading': { const lv = n.attrs?.level || 1; return `<h${lv}>${inlineToHtml(n.content)}</h${lv}>`; }
    case 'blockquote': return `<blockquote>${kids()}</blockquote>`;
    case 'bulletList': return `<ul>${(n.content || []).map((li: any) => `<li>${(li.content || []).map(nodeToHtml).join('')}</li>`).join('')}</ul>`;
    case 'orderedList': return `<ol>${(n.content || []).map((li: any) => `<li>${(li.content || []).map(nodeToHtml).join('')}</li>`).join('')}</ol>`;
    case 'horizontalRule': return '<hr>';
    case 'accordion': return `<div class="acc"><div class="acc-title">${escHtml(n.attrs?.title || 'Details')}</div>${kids()}</div>`;
    case 'annotatedImage': {
      const src = n.attrs?.annotationSrc || n.attrs?.src;
      if (!src) return '';
      return `<figure class="doc-img"><img src="${escHtml(src)}" alt="${escHtml(n.attrs?.alt || '')}" /></figure>`;
    }
    default: return Array.isArray(n.content) ? kids() : '';
  }
}

function buildPrintHtml(book: Book, headings: Heading[]): string {
  const FINDINGS_START_PAGE = 4;
  const tocRows = headings.map((h, i) => {
    const title = docToPlainText(h.content).slice(0, 90);
    return `<tr><td class="toc-sl">${i + 1}</td><td class="toc-title">${escHtml(title)}${title.length >= 90 ? '&hellip;' : ''}</td>` +
      `<td class="toc-pg">${h.page_number ? escHtml(String(h.page_number)) : '&mdash;'}</td><td class="toc-pg">${FINDINGS_START_PAGE + i}</td></tr>`;
  }).join('');

  const metaRows = [
    book.author ? `<tr><td>Author</td><td>${escHtml(book.author)}</td></tr>` : '',
    book.publisher ? `<tr><td>Publisher</td><td>${escHtml(book.publisher)}</td></tr>` : '',
    book.base_language ? `<tr><td>Language</td><td>${escHtml(book.base_language)}</td></tr>` : '',
    `<tr><td>Total entries</td><td>${headings.length}</td></tr>`,
  ].join('');

  const sources = book.source_links?.length
    ? `<h3>Sources</h3><ul class="source-list">${book.source_links.map((l) => `<li><a href="${escHtml(l.url)}">${escHtml(l.label)}</a></li>`).join('')}</ul>`
    : '';
  const detailImgs = book.detail_image_urls?.length
    ? `<h3>Images</h3><div class="detail-imgs">${book.detail_image_urls.map((u) => `<img src="${escHtml(u)}" alt="" />`).join('')}</div>`
    : '';
  const findings = headings.map((h) => `<section class="finding">
      ${h.page_number ? `<div class="finding-page">Page ${escHtml(String(h.page_number))}</div>` : ''}
      <div class="finding-content">${nodeToHtml(h.content)}</div></section>`).join('');

  const origin = window.location.origin;
  const printDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const title = escHtml(book.title);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{margin:2cm 2.3cm;size:A4}
body{font-family:'Lora','Hind Siliguri',Georgia,serif;font-size:11pt;line-height:1.7;color:#1a1a1a}
h1,h2,h3,h4{font-weight:600;line-height:1.3}
p{margin:.35em 0} blockquote{border-left:3px solid #a4501f;margin:.5em 0;padding:.2em .8em;color:#555}
ul,ol{padding-left:1.4em;margin:.3em 0} hr{border:none;border-top:1px solid #ddd;margin:.5em 0} a{color:#a4501f}
figure.doc-img{margin:.6em 0} figure.doc-img img{max-width:100%;height:auto;display:block}
.acc{border:1px solid #ddd;padding:.3em .6em;margin:.5em 0}.acc-title{font-weight:600}
.cover{min-height:95vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;page-break-after:always}
.cover img{max-width:60%;max-height:60vh;height:auto;margin-bottom:1.6rem}
.cover h1{font-size:24pt;margin-bottom:.4rem}.cv-author{font-size:13pt;color:#555}.cv-meta{font-size:9pt;color:#777;margin-top:.25rem}
.page{page-break-after:always;padding-top:.6cm}.page h2{font-size:13pt;border-bottom:1px solid #ccc;padding-bottom:.3rem;margin-bottom:.7rem}
.page h3{font-size:9pt;text-transform:uppercase;letter-spacing:.06em;margin:.9rem 0 .3rem}
.meta{width:100%;border-collapse:collapse;font-size:10pt}.meta td{padding:.3rem .5rem;border-bottom:1px solid #eee}.meta td:first-child{font-weight:600;width:28%;color:#555}
.source-list{font-size:9.5pt}.detail-imgs{display:flex;flex-wrap:wrap;gap:.6rem}.detail-imgs img{max-width:48%;height:auto}
.toc{width:100%;border-collapse:collapse;font-size:9.5pt}.toc th{background:#f5f5f5;padding:.35rem .5rem;text-align:left;border:1px solid #ddd;font-size:8pt;text-transform:uppercase}
.toc td{padding:.3rem .5rem;border:1px solid #eee;vertical-align:top}.toc-sl{width:6%;text-align:center;color:#999}.toc-pg{width:13%;text-align:center;color:#666}
.finding{padding:.6cm 0;border-bottom:1px solid #e2e2e2;page-break-inside:avoid}.finding:last-child{border-bottom:none}
.finding-page{font-size:7.5pt;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.12em;margin-bottom:.3rem}
.finding-content h1{font-size:15pt}.finding-content h2{font-size:13pt}.finding-content h3{font-size:11.5pt}
.citation{page-break-before:always;padding-top:.8cm;font-size:8pt;color:#777}
</style></head><body>
<div class="cover">${book.cover_image_url ? `<img src="${escHtml(book.cover_image_url)}" alt="" />` : ''}<h1>${title}</h1>
${book.author ? `<p class="cv-author">${escHtml(book.author)}</p>` : ''}${book.publisher ? `<p class="cv-meta">${escHtml(book.publisher)}</p>` : ''}
<p class="cv-meta">Printed from Sir&#257;jan Mun&#299;r&#257;</p></div>
<div class="page"><h2>Book details</h2><table class="meta">${metaRows}</table>${sources}${detailImgs}</div>
<div class="page"><h2>Table of contents</h2><table class="toc"><thead><tr><th class="toc-sl">#</th><th>Finding</th><th class="toc-pg">Book page</th><th class="toc-pg">PDF page</th></tr></thead><tbody>${tocRows}</tbody></table></div>
<div class="findings">${findings}</div>
<div class="citation"><p>Printed from <strong>Sir&#257;jan Mun&#299;r&#257;</strong> &mdash; ${escHtml(origin)}/book/${escHtml(book.slug)}</p><p>Printed on ${printDate}</p></div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Hook: shared actions + busy/notice state
// ---------------------------------------------------------------------------

export type ExportAction = 'print' | 'download' | 'copy' | 'link';

export function useBookExport(book: Book, preloaded?: Heading[] | null) {
  const [busy, setBusy] = useState<ExportAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flash = (msg: string) => {
    setNotice(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 2200);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const allHeadings = async () => preloaded ?? (await listHeadings(book.id));

  const run = async (action: ExportAction) => {
    if (busy) return;
    if (action === 'link') {
      const ok = await copyToClipboard(`${window.location.origin}/book/${book.slug}`);
      flash(ok ? 'Link copied' : 'Could not copy');
      return;
    }
    // Open the print window synchronously (inside the click) so popup
    // blockers allow it, then fill it once the findings are fetched.
    const win = action === 'print' ? window.open('', '_blank') : null;
    if (action === 'print') {
      if (!win) { flash('Allow pop-ups to print'); return; }
      win.document.write('<p style="font-family:sans-serif;padding:2rem;color:#555">Preparing the print view…</p>');
    }
    setBusy(action);
    try {
      const headings = await allHeadings();
      if (action === 'print' && win) {
        win.document.open();
        win.document.write(buildPrintHtml(book, headings));
        win.document.close();
      } else if (action === 'download') {
        downloadBlob(buildBookMarkdown(book, headings), `${sanitizeFilename(book.title)}.md`, 'text/markdown');
        flash('Markdown downloaded');
      } else if (action === 'copy') {
        const ok = await copyToClipboard(buildBookMarkdown(book, headings));
        flash(ok ? 'Markdown copied' : 'Copy failed — try Download');
      }
    } catch {
      win?.close();
      flash('Could not load the findings. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return { run, busy, notice };
}

// ---------------------------------------------------------------------------
// Toolbar (book page) — every option visible
// ---------------------------------------------------------------------------

export function BookExportBar({ book, className }: { book: Book; className?: string }) {
  const { run, busy, notice } = useBookExport(book);
  const item = (action: ExportAction, icon: React.ReactNode, label: string) => (
    <button type="button" className="bx-btn" onClick={() => run(action)} disabled={!!busy} aria-busy={busy === action}>
      {busy === action ? <Loader2 size={14} className="spin" /> : icon}
      <span>{label}</span>
    </button>
  );
  return (
    <div className={`bx-bar no-print ${className || ''}`} role="toolbar" aria-label="Book actions">
      {item('print', <Printer size={14} />, 'Print / PDF')}
      {item('download', <Download size={14} />, 'Download .md')}
      {item('copy', <Copy size={14} />, 'Copy Markdown')}
      {item('link', <Link2 size={14} />, 'Copy link')}
      <span className="bx-notice" role="status" aria-live="polite">
        {notice && <><Check size={13} /> {notice}</>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Three-dot menu (cards)
// ---------------------------------------------------------------------------

export function BookExportMenu({ book }: { book: Book }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { run, busy, notice } = useBookExport(book);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    menuRef.current?.querySelector('button')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    };
  }, [open]);

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const w = 210, h = 176;
      setStyle({
        position: 'fixed', zIndex: 9999,
        left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)),
        top: r.bottom + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4,
        width: w,
      });
    }
    setOpen((v) => !v);
  };

  const pick = (a: ExportAction) => { setOpen(false); run(a); };

  return (
    <>
      <button ref={btnRef} type="button" className="bx-dots" onClick={toggle} aria-haspopup="menu" aria-expanded={open}
        aria-label={`More options for ${book.title}`}>
        {busy ? <Loader2 size={15} className="spin" /> : <MoreVertical size={15} />}
      </button>
      {notice && <span className="bx-toast" role="status">{notice}</span>}
      {open && createPortal(
        <div ref={menuRef} className="bx-menu" style={style} role="menu">
          <button role="menuitem" onClick={() => pick('print')}><Printer size={13} /> Print / PDF</button>
          <button role="menuitem" onClick={() => pick('download')}><Download size={13} /> Download Markdown</button>
          <button role="menuitem" onClick={() => pick('copy')}><Copy size={13} /> Copy Markdown</button>
          <button role="menuitem" onClick={() => pick('link')}><Link2 size={13} /> Copy link</button>
        </div>,
        document.body
      )}
    </>
  );
}