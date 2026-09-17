import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Pencil, Eye, EyeOff, Trash2, Plus, Star, BookOpen, Users,
  MoreVertical, Printer, Download, Copy, Calendar, RefreshCw,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import {
  Book, createBook, deleteBook, getBookStats, listBooks,
  listHeadings, replaceSourceLinks, updateBook, uploadImage,
} from '../lib/supabase';
import { useAdmin, useTrackView } from '../lib/context';
import { RichEditor } from '../components/Editor';
import { docToMarkdown, docToPlainText, ImageCarousel, ImageLightboxProvider, useImageLightbox } from '../lib/richtext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SkeletonCard() {
  return (
    <div className="bk-skeleton-card">
      <div className="skeleton-pulse bk-skeleton__cover" />
      <div className="skeleton-pulse" style={{ width: '70%', height: 12, marginTop: 8, marginBottom: 4 }} />
      <div className="skeleton-pulse" style={{ width: '50%', height: 10 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Three-dot dropdown menu
// ---------------------------------------------------------------------------

function ThreeDotMenu({ book }: { book: Book }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => setOpen(false);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const openMenu = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuW = 210; const menuH = 130;
    const vw = window.innerWidth; const vh = window.innerHeight;
    const style: React.CSSProperties = { position: 'fixed', zIndex: 9999 };
    style.left = rect.right + menuW > vw ? Math.max(4, rect.right - menuW) : rect.left;
    style.top = rect.bottom + menuH > vh ? rect.top - menuH - 4 : rect.bottom + 4;
    setMenuStyle(style);
    setOpen((v) => !v);
  };

  const printAsPdf = async () => {
    setOpen(false);
    const headings = await listHeadings(book.id);
    openBookPrintWindow(book, headings);
  };
  const downloadMarkdown = async () => {
    setOpen(false);
    const headings = await listHeadings(book.id);
    downloadBlob(buildBookMarkdown(book, headings), `${sanitizeFilename(book.title)}.md`, 'text/markdown');
  };
  const copyMarkdown = async () => {
    setOpen(false);
    const headings = await listHeadings(book.id);
    try { await navigator.clipboard.writeText(buildBookMarkdown(book, headings)); alert('Copied!'); }
    catch { alert('Copy failed — try Download.'); }
  };

  return (
    <>
      <button ref={btnRef} className="bk-three-dot__btn" onClick={openMenu} title="More options" onMouseDown={(e) => e.stopPropagation()}>
        <MoreVertical size={15} />
      </button>
      {open && createPortal(
        <div className="bk-three-dot__menu" style={menuStyle} onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={printAsPdf}><Printer size={13} /> Print as PDF</button>
          <button onClick={downloadMarkdown}><Download size={13} /> Download as Markdown</button>
          <button onClick={copyMarkdown}><Copy size={13} /> Copy as Markdown</button>
        </div>,
        document.body
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// PDF & Markdown generation
// ---------------------------------------------------------------------------

function sanitizeFilename(s: string) {
  return s.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').slice(0, 80);
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

function buildBookMarkdown(book: Book, headings: any[]): string {
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
  lines.push('---');
  lines.push('');
  headings.forEach((h) => {
    if (h.page_number) lines.push(`*Page ${h.page_number}*`);
    lines.push(docToMarkdown(h.content));
    lines.push('');
    lines.push('---');
    lines.push('');
  });
  return lines.join('\n');
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineToHtml(nodes: any[] = []): string {
  return nodes.map((n: any) => {
    if (n.type !== 'text') return '';
    let t = escHtml(n.text || '');
    const m = n.marks || [];
    if (m.some((x: any) => x.type === 'bold')) t = `<strong>${t}</strong>`;
    if (m.some((x: any) => x.type === 'italic')) t = `<em>${t}</em>`;
    if (m.some((x: any) => x.type === 'underline')) t = `<u>${t}</u>`;
    if (m.some((x: any) => x.type === 'code')) t = `<code>${t}</code>`;
    const lnk = m.find((x: any) => x.type === 'link');
    if (lnk?.attrs?.href) t = `<a href="${lnk.attrs.href}">${t}</a>`;
    return t;
  }).join('');
}

function nodeToHtml(n: any): string {
  if (!n) return '';
  switch (n.type) {
    case 'doc': return (n.content || []).map(nodeToHtml).join('');
    case 'paragraph': return `<p>${inlineToHtml(n.content) || '&#8203;'}</p>`;
    case 'heading': { const lv = n.attrs?.level || 1; return `<h${lv}>${inlineToHtml(n.content)}</h${lv}>`; }
    case 'blockquote': return `<blockquote>${(n.content || []).map(nodeToHtml).join('')}</blockquote>`;
    case 'bulletList': return `<ul>${(n.content || []).map((li: any) => `<li>${(li.content || []).map(nodeToHtml).join('')}</li>`).join('')}</ul>`;
    case 'orderedList': return `<ol>${(n.content || []).map((li: any) => `<li>${(li.content || []).map(nodeToHtml).join('')}</li>`).join('')}</ol>`;
    case 'horizontalRule': return '<hr>';
    case 'annotatedImage': {
      const src = n.attrs?.src; if (!src) return '';
      return `<figure class="doc-img"><img src="${src}" alt="${escHtml(n.attrs?.alt || '')}" /></figure>`;
    }
    default:
      if (Array.isArray(n.content)) return n.content.map(nodeToHtml).join('');
      return '';
  }
}

function docToRichHtml(doc: any): string {
  return doc ? nodeToHtml(doc) : '';
}

function extractDocImages(doc: any): string[] {
  const imgs: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (n.type === 'annotatedImage' && n.attrs?.src) imgs.push(n.attrs.src);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return imgs;
}

function openBookPrintWindow(book: Book, headings: any[]) {
  const PDF_FINDINGS_START_PAGE = 4;

  const tocRows = headings.map((h, i) => {
    const title = docToPlainText(h.content).slice(0, 90);
    return `<tr>
      <td class="toc-sl">${i + 1}</td>
      <td class="toc-title">${escHtml(title)}${title.length >= 90 ? '&hellip;' : ''}</td>
      <td class="toc-book-pg">${escHtml(String(h.page_number || '&mdash;'))}</td>
      <td class="toc-pdf-pg">${PDF_FINDINGS_START_PAGE + i}</td>
    </tr>`;
  }).join('');

  const metaRows = [
    book.author ? `<tr><td>Author</td><td>${escHtml(book.author)}</td></tr>` : '',
    book.publisher ? `<tr><td>Publisher</td><td>${escHtml(book.publisher)}</td></tr>` : '',
    book.base_language ? `<tr><td>Language</td><td>${escHtml(book.base_language)}</td></tr>` : '',
    `<tr><td>Total Entries</td><td>${headings.length}</td></tr>`,
  ].filter(Boolean).join('');

  const sourceLinksHtml = book.source_links?.length
    ? `<div style="margin-top:0.8rem"><strong style="font-size:9pt;text-transform:uppercase;letter-spacing:0.06em;">Sources</strong><ul class="source-list">${
        book.source_links.map(l => `<li><a href="${escHtml(l.url)}">${escHtml(l.label)}</a></li>`).join('')
      }</ul></div>` : '';

  const detailImgsHtml = book.detail_image_urls?.length
    ? `<div style="margin-top:0.8rem"><strong style="font-size:9pt;text-transform:uppercase;letter-spacing:0.06em;">Images</strong><div class="detail-imgs">${
        book.detail_image_urls.map(u => `<img src="${u}" alt="" class="detail-img" />`).join('')
      }</div></div>` : '';

  const headingsHtml = headings.map(h => {
    const richHtml = docToRichHtml(h.content);
    const extraImgs = extractDocImages(h.content);
    const extraImgsHtml = extraImgs.length
      ? `<div class="heading-imgs">${extraImgs.map(src => `<img src="${src}" alt="" class="heading-img" />`).join('')}</div>`
      : '';
    return `<div class="finding">
      ${h.page_number ? `<div class="finding-page">Page ${escHtml(String(h.page_number))}</div>` : ''}
      <div class="finding-content">${richHtml}</div>
      ${extraImgsHtml}
    </div>`;
  }).join('');

  const title = escHtml(book.title);
  const coverImg = book.cover_image_url ? `<img src="${book.cover_image_url}" alt="" />` : '';
  const authorLine = book.author ? `<p class="cv-author">${escHtml(book.author)}</p>` : '';
  const pubLine = book.publisher ? `<p class="cv-meta">${escHtml(book.publisher)}</p>` : '';
  const langLine = book.base_language ? `<p class="cv-meta">Language: ${escHtml(book.base_language)}</p>` : '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const printDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
@page { margin: 2cm 2.5cm; size: A4; }
body { font-family: 'Hind Siliguri','Lora',Georgia,serif; font-size: 11pt; line-height: 1.72; color: #1a1a1a; }
h1,h2,h3,h4 { font-family: 'Lora',Georgia,serif; font-weight: 600; line-height: 1.3; }
p { margin: 0.35em 0; } strong { font-weight: 700; } em { font-style: italic; }
u { text-decoration: underline; } code { font-family: monospace; background: #f0f0f0; padding: 0.1em 0.3em; font-size: 0.9em; }
blockquote { border-left: 3px solid #a4501f; margin: 0.5em 0; padding: 0.2em 0.8em; color: #555; }
ul,ol { padding-left: 1.4em; margin: 0.3em 0; } li { margin: 0.15em 0; }
hr { border: none; border-top: 1px solid #ddd; margin: 0.5em 0; }
a { color: #a4501f; }
figure.doc-img { margin: 0.6em 0; } figure.doc-img img { max-width: 100%; display: block; }
.cover { min-height: 96vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; padding: 2cm; }
.cover img { max-width: 200px; max-height: 280px; object-fit: contain; margin-bottom: 1.8rem; box-shadow: 0 8px 24px rgba(0,0,0,.2); }
.cover h1 { font-size: 24pt; margin-bottom: 0.5rem; }
.cv-author { font-size: 13pt; color: #555; margin-bottom: 0.3rem; }
.cv-meta { font-size: 9pt; color: #777; font-style: italic; margin-top: 0.25rem; }
.ornament { font-size: 18pt; color: #a4501f; margin: 1rem 0; }
.meta-page { page-break-after: always; padding-top: 0.8cm; }
.meta-page h2 { font-size: 13pt; border-bottom: 1px solid #ccc; padding-bottom: 0.3rem; margin-bottom: 0.7rem; }
.meta-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
.meta-table td { padding: 0.3rem 0.5rem; border-bottom: 1px solid #eee; vertical-align: top; }
.meta-table td:first-child { font-weight: 600; width: 28%; color: #555; }
.source-list { list-style: disc; padding-left: 1.3em; font-size: 9.5pt; margin-top: 0.3rem; }
.detail-imgs { display: flex; flex-wrap: wrap; gap: 0.7rem; margin-top: 0.5rem; }
.detail-img { width: 180px; height: 180px; object-fit: cover; border-radius: 4px; }
.toc-section { page-break-after: always; padding-top: 0.8cm; }
.toc-section h2 { font-size: 13pt; border-bottom: 1px solid #ccc; padding-bottom: 0.3rem; margin-bottom: 0.7rem; }
.toc-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
.toc-table th { background: #f5f5f5; padding: 0.4rem 0.5rem; text-align: left; border: 1px solid #ddd; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; }
.toc-table td { padding: 0.32rem 0.5rem; border: 1px solid #eee; vertical-align: top; }
.toc-sl { width: 5%; text-align: center; color: #999; }
.toc-title { width: 65%; }
.toc-book-pg,.toc-pdf-pg { width: 15%; text-align: center; color: #666; font-style: italic; }
.toc-table tr:nth-child(even) td { background: #fafafa; }
.finding { padding: 0.65cm 0; border-bottom: 1px solid #e2e2e2; page-break-inside: avoid; }
.finding:last-child { border-bottom: none; }
.finding-page { font-size: 7.5pt; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 0.35rem; }
.finding-content { font-size: 11pt; line-height: 1.72; }
.finding-content h1 { font-size: 15pt; margin: 0.4em 0 0.2em; }
.finding-content h2 { font-size: 13pt; margin: 0.3em 0 0.2em; }
.finding-content h3 { font-size: 11.5pt; margin: 0.25em 0 0.15em; }
.heading-imgs { display: flex; flex-wrap: wrap; gap: 0.7rem; margin-top: 0.8rem; }
.heading-img { max-width: 100%; width: 300px; height: auto; object-fit: contain; display: block; border-radius: 3px; }
.citation-footer { page-break-before: always; padding-top: 0.8cm; border-top: 1px solid #ccc; font-size: 8pt; color: #888; }
.citation-footer p { margin-bottom: 0.25rem; }
@media print { button { display: none !important; } }
</style></head><body>
<div class="cover">${coverImg}<h1>${title}</h1>${authorLine}${pubLine}${langLine}<div class="ornament">&#9670;</div><p class="cv-meta">Printed from Sir&#257;jan Mun&#299;r&#257;</p></div>
<div class="meta-page"><h2>Book Details</h2><table class="meta-table">${metaRows}</table>${sourceLinksHtml}${detailImgsHtml}</div>
<div class="toc-section"><h2>Table of Contents</h2><table class="toc-table"><thead><tr><th class="toc-sl">#</th><th class="toc-title">Heading / Finding</th><th class="toc-book-pg">Book Page</th><th class="toc-pdf-pg">PDF Page</th></tr></thead><tbody>${tocRows}</tbody></table></div>
<div class="findings"><h2 style="font-size:14pt;border-bottom:1px solid #ccc;padding-bottom:0.4rem;margin-bottom:0.6cm;">Findings</h2>${headingsHtml}</div>
<div class="citation-footer"><p>Printed from <strong>Sir&#257;jan Mun&#299;r&#257;</strong> &mdash; ${origin}/book/${book.slug}</p><p>Printed on ${printDate}</p></div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}


// ---------------------------------------------------------------------------
// Book form
// ---------------------------------------------------------------------------

interface BookFormState {
  title: string; author: string; publisher: string; base_language: string;
  cover_image_url: string; detail_image_urls: string[];
  description: any; visibility: boolean; featured: boolean;
  source_links: { label: string; url: string }[];
}

const EMPTY_FORM: BookFormState = {
  title: '', author: '', publisher: '', base_language: '',
  cover_image_url: '', detail_image_urls: [],
  description: null, visibility: true, featured: false, source_links: [],
};

function BookForm({ initial, onSave, onCancel }: {
  initial: (Book & { source_links?: any[] }) | null; onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState<BookFormState>(() =>
    initial
      ? {
          title: initial.title, author: initial.author || '',
          publisher: initial.publisher || '', base_language: initial.base_language || '',
          cover_image_url: initial.cover_image_url || '',
          detail_image_urls: initial.detail_image_urls || [],
          description: initial.description, visibility: initial.visibility,
          featured: initial.featured || false,
          source_links: (initial.source_links || []).map((l: any) => ({ label: l.label, url: l.url })),
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);

  const uploadCover = async (file: File) => {
    const url = await uploadImage(file, 'covers');
    setForm((f) => ({ ...f, cover_image_url: url }));
  };
  const uploadDetail = async (file: File) => {
    const url = await uploadImage(file, 'book-details');
    setForm((f) => ({ ...f, detail_image_urls: [...f.detail_image_urls, url] }));
  };

  const save = async () => {
    if (!form.title.trim()) return alert('Title is required.');
    setSaving(true);
    try {
      const { source_links, ...bookFields } = form;
      let bookId = initial?.id;
      if (initial) {
        await updateBook(initial.id, bookFields);
      } else {
        const created = await createBook(bookFields);
        bookId = created.id;
      }
      if (bookId) await replaceSourceLinks(bookId, source_links.filter((l) => l.label && l.url));
      onSave();
    } catch (e: any) {
      alert(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="split-detail book-form">
      <button className="link-btn detail-close" onClick={onCancel}>← Close</button>
      <h3>{initial ? 'Edit book' : 'New book'}</h3>
      <label>Cover image <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} /></label>
      {form.cover_image_url && <img src={form.cover_image_url} alt="cover preview" className="cover-preview" />}
      <label>Title * <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>Author <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></label>
      <label>Publisher <input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} /></label>
      <label>Language <input value={form.base_language} onChange={(e) => setForm({ ...form, base_language: e.target.value })} placeholder="Bangla / English / …" /></label>
      <label>Detail images <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadDetail(e.target.files[0])} /></label>
      <div className="detail-thumbs">
        {form.detail_image_urls.map((u, i) => (
          <div key={i} className="thumb">
            <img src={u} alt="" />
            <button onClick={() => setForm((f) => ({ ...f, detail_image_urls: f.detail_image_urls.filter((_, j) => j !== i) }))}>✕</button>
          </div>
        ))}
      </div>
      <label>Description</label>
      <RichEditor content={form.description} onChange={(doc) => setForm({ ...form, description: doc })} placeholder="Write a description…" imagePathPrefix="book-description" />
      <label>Source links</label>
      {form.source_links.map((l, i) => (
        <div key={i} className="source-link-row">
          <input placeholder="Label" value={l.label} onChange={(e) => { const arr = [...form.source_links]; arr[i] = { ...arr[i], label: e.target.value }; setForm({ ...form, source_links: arr }); }} />
          <input placeholder="https://…" value={l.url} onChange={(e) => { const arr = [...form.source_links]; arr[i] = { ...arr[i], url: e.target.value }; setForm({ ...form, source_links: arr }); }} />
          <button onClick={() => setForm({ ...form, source_links: form.source_links.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button className="secondary" onClick={() => setForm({ ...form, source_links: [...form.source_links, { label: '', url: '' }] })}>+ Add source link</button>
      <label className="check"><input type="checkbox" checked={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.checked })} /> Visible to guests</label>
      <label className="check"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> Featured</label>
      <div className="modal-actions">
        <button className="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured book card
// ---------------------------------------------------------------------------

function FeaturedBookCard({ book, isAdmin, onEdit, onToggleFeatured, onToggleVisibility, onDelete }: {
  book: Book; isAdmin: boolean;
  onEdit: () => void; onToggleFeatured: () => void; onToggleVisibility: () => void; onDelete: () => void;
}) {
  const openLightbox = useImageLightbox();
  const [stats, setStats] = useState<{ headingCount: number; viewCount: number } | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const descText = book.description ? docToPlainText(book.description) : '';
  const descLong = descText.length > 180;

  useEffect(() => { getBookStats(book.id).then(setStats); }, [book.id]);

  const images = [book.cover_image_url, ...(book.detail_image_urls || [])].filter(Boolean) as string[];

  return (
    <div className={`bk-feat-card ${!book.visibility && isAdmin ? 'bk-feat-card--hidden' : ''}`}>
      {/* Carousel */}
      <div className="bk-feat-card__carousel">
        <ImageCarousel images={images} onImageClick={openLightbox} />
        {!book.visibility && isAdmin && <div className="bk-feat-card__hidden-badge">Hidden</div>}
      </div>

      <div className="bk-feat-card__body">
        <p className="bk-feat-card__label"><Star size={11} fill="currentColor" /> Featured</p>
        <h2 className="bk-feat-card__title"><Link to={`/book/${book.slug}`}>{book.title}</Link></h2>
        {book.author && <p className="muted bk-feat-card__author">{book.author}</p>}

        {descText && (
          <div className="bk-feat-card__desc">
            <p>{descExpanded || !descLong ? descText : `${descText.slice(0, 180)}…`}</p>
            {descLong && (
              <button className="link-btn" onClick={() => setDescExpanded((v) => !v)}>
                {descExpanded ? 'Read less ↑' : 'Read more ↓'}
              </button>
            )}
          </div>
        )}

        <div className="bk-feat-card__stats">
          <span><BookOpen size={14} /> <strong>{stats?.headingCount ?? '—'}</strong> findings</span>
          <span><Users size={14} /> <strong>{stats?.viewCount ?? '—'}</strong> visits</span>
          {book.created_at && <span><Calendar size={13} /> {fmtDate(book.created_at)}</span>}
        </div>

        <div className="bk-feat-card__actions">
          <Link to={`/book/${book.slug}`} className="col-open-btn">Read <ChevronRight size={13} /></Link>
          <ThreeDotMenu book={book} />
          {isAdmin && (
            <div className="col-admin-actions">
              <button onClick={onEdit}><Pencil size={12} /> Edit</button>
              <button onClick={onToggleFeatured}><Star size={12} fill="currentColor" /> Unfeature</button>
              <button onClick={onToggleVisibility}>{book.visibility ? <EyeOff size={12} /> : <Eye size={12} />} {book.visibility ? 'Hide' : 'Show'}</button>
              <button className="danger" onClick={onDelete}><Trash2 size={12} /> Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured books carousel
// ---------------------------------------------------------------------------

function FeaturedCarousel({ featured, isAdmin, onEdit, onToggleFeatured, onToggleVisibility, onDelete }: {
  featured: Book[]; isAdmin: boolean;
  onEdit: (b: Book) => void; onToggleFeatured: (b: Book) => void;
  onToggleVisibility: (b: Book) => void; onDelete: (b: Book) => void;
}) {
  const [idx, setIdx] = useState(0);
  const total = featured.length;
  if (total === 0) return null;
  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  return (
    <div className="col-featured-section">
      <div className="col-featured-header">
        <h2 className="col-section-title">Featured Books</h2>
        {total > 1 && (
          <div className="col-carousel-nav">
            <button onClick={prev} className="col-carousel-btn" aria-label="Previous"><ChevronLeft size={16} /></button>
            <span className="col-carousel-count">{idx + 1} / {total}</span>
            <button onClick={next} className="col-carousel-btn" aria-label="Next"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      <div className="col-carousel-track">
        {featured.map((book, i) => (
          <div
            key={book.id}
            className={`col-carousel-slide ${i === idx ? 'col-carousel-slide--active' : i === (idx - 1 + total) % total ? 'col-carousel-slide--prev' : 'col-carousel-slide--next'}`}
            aria-hidden={i !== idx}
          >
            <FeaturedBookCard
              book={book}
              isAdmin={isAdmin}
              onEdit={() => onEdit(book)}
              onToggleFeatured={() => onToggleFeatured(book)}
              onToggleVisibility={() => onToggleVisibility(book)}
              onDelete={() => onDelete(book)}
            />
          </div>
        ))}
      </div>

      {total > 1 && (
        <div className="col-carousel-dots">
          {featured.map((_, i) => (
            <button key={i} className={`col-carousel-dot ${i === idx ? 'col-carousel-dot--active' : ''}`} onClick={() => setIdx(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Book grid card (non-featured)
// ---------------------------------------------------------------------------

function BookGridCard({ book, isAdmin, onEdit, onToggleFeatured, onToggleVisibility, onDelete }: {
  book: Book; isAdmin: boolean;
  onEdit: () => void; onToggleFeatured: () => void; onToggleVisibility: () => void; onDelete: () => void;
}) {
  const [stats, setStats] = useState<{ headingCount: number; viewCount: number } | null>(null);
  useEffect(() => { getBookStats(book.id).then(setStats); }, [book.id]);

  return (
    <div className={`bk-grid-card ${!book.visibility ? 'bk-grid-card--hidden' : ''}`}>
      <div className="bk-grid-card__cover-wrap">
        <Link to={`/book/${book.slug}`}>
          {book.cover_image_url
            ? <img src={book.cover_image_url} alt={book.title} className="bk-grid-card__cover" />
            : <div className="bk-grid-card__cover bk-grid-card__cover--placeholder" />
          }
        </Link>
        <div className="bk-grid-card__overlay">
          <Link to={`/book/${book.slug}`} className="bk-grid-card__read-btn">Read</Link>
          <ThreeDotMenu book={book} />
        </div>
        {!book.visibility && <span className="bk-grid-card__hidden-chip">Hidden</span>}
      </div>

      <div className="bk-grid-card__body">
        <p className="bk-grid-card__title"><Link to={`/book/${book.slug}`}>{book.title}</Link></p>
        {book.author && <p className="bk-grid-card__author">{book.author}</p>}

        {stats && (
          <div className="bk-grid-card__stats">
            <span><BookOpen size={10} /> {stats.headingCount}</span>
            <span><Users size={10} /> {stats.viewCount}</span>
          </div>
        )}

        {book.created_at && (
          <p className="bk-grid-card__date"><Calendar size={10} /> {fmtDate(book.created_at)}</p>
        )}

        {isAdmin && (
          <div className="card-admin-actions bk-grid-card__admin">
            <button onClick={onEdit} title="Edit"><Pencil size={12} /></button>
            <button onClick={onToggleFeatured} title={book.featured ? 'Unfeature' : 'Feature'}><Star size={12} fill={book.featured ? 'currentColor' : 'none'} /></button>
            <button onClick={onToggleVisibility} title={book.visibility ? 'Hide' : 'Show'}>{book.visibility ? <EyeOff size={12} /> : <Eye size={12} />}</button>
            <button className="danger" onClick={onDelete} title="Delete"><Trash2 size={12} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bookshelf main
// ---------------------------------------------------------------------------

export default function Bookshelf() {
  const { isAdmin } = useAdmin();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Book | null | 'new'>(null);
  useTrackView('site', 'bookshelf');

  const reload = useCallback(() => {
    setLoading(true);
    listBooks({ includeHidden: isAdmin })
      .then(setBooks)
      .finally(() => setLoading(false));
  }, [isAdmin]);

  useEffect(reload, [reload]);

  const toggleVisibility = async (b: Book) => { await updateBook(b.id, { visibility: !b.visibility }); reload(); };
  const toggleFeatured = async (b: Book) => { await updateBook(b.id, { featured: !b.featured }); reload(); };
  const remove = async (b: Book) => {
    if (!confirm(`Delete "${b.title}"? This cannot be undone.`)) return;
    await deleteBook(b.id); reload();
  };

  const featured = books.filter((b) => b.featured && (b.visibility || isAdmin));
  const rest = books.filter((b) => !b.featured);

  return (
    <ImageLightboxProvider>
      <div className="page bookshelf-page">
        <style>{BOOKSHELF_CSS}</style>

        <div className="page-head">
          <h1>Bookshelf</h1>
          {isAdmin && <button className="primary icon-row" onClick={() => setEditing('new')}><Plus size={16} /> New book</button>}
        </div>

        <div className={`split-view ${editing ? 'has-detail' : ''}`}>
          <div className="split-list">
            {/* Featured carousel */}
            {loading ? (
              <div className="bk-skeleton-feat-row">
                <SkeletonCard /><SkeletonCard />
              </div>
            ) : (
              featured.length > 0 && (
                <FeaturedCarousel
                  featured={featured}
                  isAdmin={isAdmin}
                  onEdit={setEditing}
                  onToggleFeatured={toggleFeatured}
                  onToggleVisibility={toggleVisibility}
                  onDelete={remove}
                />
              )
            )}

            {/* Book grid */}
            {rest.length > 0 && (
              <div className="bk-grid-section">
                {featured.length > 0 && <h2 className="col-section-title col-section-title--secondary">All Books</h2>}
                {loading ? (
                  <div className="bk-grid">
                    {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
                  </div>
                ) : (
                  <div className="bk-grid">
                    {rest.map((b) => (
                      <BookGridCard
                        key={b.id}
                        book={b}
                        isAdmin={isAdmin}
                        onEdit={() => setEditing(b)}
                        onToggleFeatured={() => toggleFeatured(b)}
                        onToggleVisibility={() => toggleVisibility(b)}
                        onDelete={() => remove(b)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {!loading && books.length === 0 && <p className="muted">No books yet.</p>}
          </div>

          {editing && (
            <BookForm
              initial={editing === 'new' ? null : editing}
              onSave={() => { setEditing(null); reload(); }}
              onCancel={() => setEditing(null)}
            />
          )}
        </div>
      </div>
    </ImageLightboxProvider>
  );
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const BOOKSHELF_CSS = `
/* ── Skeleton ─────────────── */
.bk-skeleton-card {
  display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; overflow: hidden; padding-bottom: 0.7rem;
}
.bk-skeleton__cover {
  width: 100%; aspect-ratio: 3/4;
  background: var(--border); animation: skeletonPulse 1.4s ease-in-out infinite;
}
.bk-skeleton-feat-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 2rem; }
@media(max-width:600px){ .bk-skeleton-feat-row{grid-template-columns:1fr;} }

/* ── Three-dot menu ──────── */
.bk-three-dot { position: relative; display: inline-block; }
.bk-three-dot__btn {
  width: 30px; height: 30px; border-radius: 50%;
  border: 1px solid var(--border); background: var(--bg);
  display: grid; place-items: center; color: var(--muted);
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.bk-three-dot__btn:hover { border-color: var(--accent); color: var(--accent); background: var(--surface); }
.bk-three-dot__menu {
  position: absolute; right: 0; top: 110%; z-index: 100;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.14);
  min-width: 190px; overflow: hidden;
  animation: menuFadeIn 0.12s ease;
}
@keyframes menuFadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
.bk-three-dot__menu button {
  display: flex; align-items: center; gap: 0.5rem;
  width: 100%; padding: 0.6rem 0.9rem;
  font-size: 0.84rem; color: var(--fg);
  border-bottom: 1px solid var(--border);
  text-align: left; transition: background 0.1s, color 0.1s;
}
.bk-three-dot__menu button:last-child { border-bottom: none; }
.bk-three-dot__menu button:hover { background: color-mix(in srgb, var(--accent) 8%, var(--bg)); color: var(--accent); }

/* ── Featured book card ───── */
.bk-feat-card {
  display: grid; grid-template-columns: 1fr 1.25fr;
  gap: 0; border: 1px solid var(--border); border-radius: 12px;
  background: var(--surface); overflow: hidden;
  transition: box-shadow 0.25s, border-color 0.2s;
  height: 100%;
}
.bk-feat-card:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); box-shadow: 0 8px 28px rgba(0,0,0,0.1); }
.bk-feat-card--hidden { opacity: 0.6; }
.bk-feat-card__carousel { position: relative; min-height: 240px; overflow: hidden; background: var(--border); }
.bk-feat-card__hidden-badge {
  position: absolute; top: 0.5rem; left: 0.5rem;
  background: rgba(0,0,0,0.6); color: #fff;
  font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
  padding: 0.2rem 0.5rem; border-radius: 4px;
}
.bk-feat-card__body {
  padding: 1.25rem 1.4rem;
  display: flex; flex-direction: column; gap: 0.55rem;
}
.bk-feat-card__label {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--accent);
}
.bk-feat-card__title { margin: 0; font-size: 1.3rem; }
.bk-feat-card__title a { text-decoration: none; color: var(--fg); }
.bk-feat-card__title a:hover { color: var(--accent); }
.bk-feat-card__author { margin: 0; font-size: 0.88rem; }
.bk-feat-card__desc { font-size: 0.88rem; color: var(--muted); line-height: 1.65; }
.bk-feat-card__desc p { margin: 0 0 0.2rem; }
.bk-feat-card__stats {
  display: flex; gap: 1rem; flex-wrap: wrap;
  font-size: 0.8rem; color: var(--muted);
}
.bk-feat-card__stats span { display: flex; align-items: center; gap: 0.3rem; }
.bk-feat-card__stats strong { color: var(--fg); }
.bk-feat-card__actions { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-top: auto; }

@media(max-width:640px){
  .bk-feat-card { grid-template-columns: 1fr; }
  .bk-feat-card__carousel { min-height: 180px; }
}

/* ── Book grid ───────────── */
.bk-grid-section { margin-top: 0.5rem; }
.bk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 1.25rem;
}
@media(max-width:480px){ .bk-grid { grid-template-columns: repeat(2, 1fr); } }

.bk-grid-card { display: flex; flex-direction: column; }
.bk-grid-card--hidden .bk-grid-card__cover-wrap { opacity: 0.5; }
.bk-grid-card__cover-wrap { position: relative; }
.bk-grid-card__cover-wrap:hover .bk-grid-card__overlay { opacity: 1; }
.bk-grid-card__cover {
  width: 100%; aspect-ratio: 3/4; object-fit: cover;
  border-radius: 6px; display: block;
  background: var(--border);
}
.bk-grid-card__cover--placeholder { background: var(--border); }
.bk-grid-card__overlay {
  position: absolute; inset: 0; border-radius: 6px;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  opacity: 0; transition: opacity 0.2s;
}
.bk-grid-card__read-btn {
  background: var(--accent); color: #fff;
  padding: 0.35rem 0.85rem; border-radius: 5px;
  font-size: 0.8rem; font-weight: 600; text-decoration: none;
}
.bk-grid-card__hidden-chip {
  position: absolute; top: 0.3rem; right: 0.3rem;
  background: rgba(0,0,0,0.6); color: #fff;
  font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 0.15rem 0.35rem; border-radius: 3px;
}
.bk-grid-card__body { padding-top: 0.4rem; }
.bk-grid-card__title { font-size: 0.88rem; font-weight: 600; margin: 0 0 0.1rem; }
.bk-grid-card__title a { text-decoration: none; color: var(--fg); }
.bk-grid-card__title a:hover { color: var(--accent); }
.bk-grid-card__author { font-size: 0.74rem; color: var(--muted); margin: 0 0 0.2rem; }
.bk-grid-card__stats { display: flex; gap: 0.7rem; font-size: 0.72rem; color: var(--muted); margin-bottom: 0.2rem; }
.bk-grid-card__stats span { display: flex; align-items: center; gap: 0.2rem; }
.bk-grid-card__date { font-size: 0.66rem; color: var(--muted); display: flex; align-items: center; gap: 0.2rem; margin-bottom: 0.2rem; }
.bk-grid-card__admin { font-size: 0.7rem; }
`;