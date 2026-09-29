import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Link2, Bookmark, Copy, Pencil, FolderPlus, Trash2, Check, ChevronDown, ChevronRight,
  ChevronLeft, Plus, ListTree, MoreVertical, ArrowUp, ArrowDown, Star, Type, X, Loader2, Search as SearchIcon,
} from 'lucide-react';
import {
  Book, Category, Heading, HeadingIndexRow, addHeadingToCategory, createHeading, deleteHeading,
  findHeadingIdsInBook, getBookBySlug, getChunkText, getHeadingsByIds, listCategories,
  listCategoryIdsForHeadings, listHeadingIndex, removeHeadingFromCategory, requestIndexing,
  trackEvent, updateHeading, updateHeadingImportance,
} from '../lib/supabase';
import { useAdmin, usePrefs, useTrackView } from '../lib/context';
import {
  RichTextView, docToMarkdown, docToPlainText, firstLineOf, ImageLightboxProvider,
  useImageLightbox, copyToClipboard,
} from '../lib/richtext';
import { RichEditor } from '../components/Editor';
import { BookExportBar } from '../lib/bookExport';
import {
  clearHighlight, findPassageRange, findTermRanges, highlightApiSupported, paintHighlight, splitTerms,
} from '../lib/highlight';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 8;                 // findings fetched per batch
const LONG_CONTENT_THRESHOLD = 500;
const SITE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://sirajan-munira.vercel.app';

type HScale = 'default' | 'h1-as-h2' | 'reduced';
type SortMode = 'page' | 'importance' | 'featured';

function readHScale(): HScale {
  try { return (localStorage.getItem('sm_hscale') as HScale) || 'default'; } catch { return 'default'; }
}
function saveHScale(v: HScale) {
  try { localStorage.setItem('sm_hscale', v); } catch {}
}
function navHeight() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height') || '58', 10) || 58;
}

// ---------------------------------------------------------------------------
// Source links
// ---------------------------------------------------------------------------

function SourceLinks({ links }: { links: { label: string; url: string }[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!links.length) return null;
  const visible = showAll ? links : links.slice(0, 3);
  return (
    <div className="source-links no-print">
      <h4>Sources</h4>
      <ul>
        {visible.map((l, i) => (
          <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer" className="rt-link">{l.label}</a></li>
        ))}
      </ul>
      {links.length > 3 && (
        <button className="link-btn" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show less' : `Show more (${links.length - 3})`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category assign modal (admin)
// ---------------------------------------------------------------------------

function CategoryAssign({ heading, categories, assigned: initial, onClose, onChanged }: {
  heading: Heading; categories: Category[]; assigned: string[]; onClose: () => void; onChanged: (ids: string[]) => void;
}) {
  const [assigned, setAssigned] = useState<string[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (catId: string) => {
    setBusyId(catId); setError(null);
    try {
      let next: string[];
      if (assigned.includes(catId)) {
        await removeHeadingFromCategory(catId, heading.id);
        next = assigned.filter((c) => c !== catId);
      } else {
        await addHeadingToCategory(catId, heading.id);
        next = [...assigned, catId];
      }
      setAssigned(next);
      onChanged(next);
      requestIndexing();
    } catch {
      setError('Could not update the collection. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Assign to collections" onClick={(e) => e.stopPropagation()}>
        <h3>Assign to collections</h3>
        {categories.length === 0 && <p className="muted">No collections yet.</p>}
        <div className="category-check-list">
          {categories.map((c) => (
            <label key={c.id} className="check">
              <input type="checkbox" checked={assigned.includes(c.id)} disabled={busyId === c.id} onChange={() => toggle(c.id)} />
              <span className="dot" style={{ background: c.color }} /> {c.name}
            </label>
          ))}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Importance star picker (admin)
// ---------------------------------------------------------------------------

function ImportancePicker({ heading, onClose }: { heading: Heading; onClose: () => void }) {
  const [hovered, setHovered] = useState(0);
  const current = heading.importance_level || 0;
  const set = async (level: number) => {
    await updateHeadingImportance(heading.id, level === current ? null : level || null);
    onClose();
  };
  return (
    <div className="importance-picker">
      <p className="importance-picker__label">Importance</p>
      <div className="importance-picker__stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n}
            className={`importance-star ${(hovered || current) >= n ? 'importance-star--filled' : ''}`}
            onMouseEnter={() => setHovered(n)} onMouseLeave={() => setHovered(0)} onClick={() => set(n)}
            aria-label={`Importance ${n}${current === n ? ' (click to remove)' : ''}`}>
            <Star size={18} fill={(hovered || current) >= n ? 'currentColor' : 'none'} />
          </button>
        ))}
        {current > 0 && <button className="importance-clear" onClick={() => set(0)}>Clear</button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Three-dot menu per heading
// ---------------------------------------------------------------------------

function HeadingThreeDot({ heading, book, isAdmin, onImportanceDone }: {
  heading: Heading; book: Book; isAdmin: boolean; onImportanceDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'none' | 'importance'>('none');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false); setMode('none');
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setMode('none'); } };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const permalink = `${SITE_URL}/book/${book.slug}#${heading.id}`;
  const externalSource = book.source_links?.[0]?.url;

  const build = (type: 'markdown' | 'plain') => {
    const content = type === 'markdown' ? docToMarkdown(heading.content) : docToPlainText(heading.content);
    const lines: string[] = [content, ''];
    if (heading.page_number) lines.push(`Page: ${heading.page_number}`);
    lines.push(`Book: ${book.title}`);
    if (book.author) lines.push(`Author: ${book.author}`);
    if (externalSource) lines.push(`Source: ${externalSource}`);
    lines.push(`Link: ${permalink}`, `Via: ${SITE_URL} (Sirājan Munīrā)`);
    return lines.join('\n');
  };
  const copy = async (type: 'markdown' | 'plain') => {
    setOpen(false);
    const text = build(type);
    if (!(await copyToClipboard(text))) window.prompt('Copy this text:', text);
  };

  const toggle = () => {
    const btn = ref.current?.querySelector('.hdg-threedot__btn') as HTMLElement | null;
    if (btn) {
      const r = btn.getBoundingClientRect();
      const mW = 210, mH = isAdmin ? 130 : 90;
      setMenuStyle({
        position: 'fixed', zIndex: 9999,
        left: Math.max(4, Math.min(r.left, window.innerWidth - mW - 4)),
        top: r.bottom + mH > window.innerHeight ? r.top - mH - 4 : r.bottom + 4,
      });
    }
    setOpen((v) => !v); setMode('none');
  };

  return (
    <div className="hdg-threedot" ref={ref}>
      <button className="hdg-threedot__btn" onClick={toggle} aria-label="More options" aria-haspopup="menu" aria-expanded={open}>
        <MoreVertical size={14} />
      </button>
      {open && createPortal(
        <div ref={menuRef} className="hdg-threedot__menu" style={menuStyle} role="menu">
          {mode === 'none' ? (
            <>
              <button role="menuitem" onClick={() => copy('markdown')}><Copy size={12} /> Copy as Markdown</button>
              <button role="menuitem" onClick={() => copy('plain')}><Copy size={12} /> Copy as plain text</button>
              {isAdmin && (
                <button role="menuitem" onClick={() => setMode('importance')}>
                  <Star size={12} /> Importance level{heading.importance_level ? ` (${heading.importance_level}★)` : ''}
                </button>
              )}
            </>
          ) : (
            <div className="hdg-threedot__panel">
              <ImportancePicker heading={heading} onClose={() => { setOpen(false); setMode('none'); onImportanceDone(); }} />
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heading text-size control
// ---------------------------------------------------------------------------

function HScaleControls({ hScale, onChange }: { hScale: HScale; onChange: (v: HScale) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  const options: { label: string; value: HScale; desc: string }[] = [
    { label: 'Default', value: 'default', desc: 'Standard H1/H2 sizes' },
    { label: 'H1→H2', value: 'h1-as-h2', desc: 'Renders H1 as H2 size' },
    { label: 'Reduced', value: 'reduced', desc: 'Smaller H1 & H2 sizes' },
  ];
  return (
    <div className="hscale-control" ref={ref}>
      <button className="hscale-control__btn icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Heading text size" aria-expanded={open}>
        <Type size={14} />
        {hScale !== 'default' && <span className="hscale-indicator" />}
      </button>
      {open && (
        <div className="hscale-control__menu">
          <p className="hscale-control__label">Heading text size</p>
          {options.map((opt) => (
            <button key={opt.value} className={`hscale-option ${hScale === opt.value ? 'hscale-option--active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}>
              <span className="hscale-option__label">{opt.label}</span>
              <span className="hscale-option__desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heading block
// ---------------------------------------------------------------------------

function HeadingBlock({
  heading, book, open, panelOpen, categoryNames, forceExpanded, onToggleOpen, onChanged, onEditRequest, onAssign, hScale,
}: {
  heading: Heading; book: Book; open: boolean; panelOpen: boolean; categoryNames: string[]; forceExpanded: boolean;
  onToggleOpen: () => void; onChanged: () => void; onEditRequest: (h: Heading) => void; onAssign: (h: Heading) => void; hScale: HScale;
}) {
  const { isAdmin } = useAdmin();
  const { toggleBookmark, isBookmarked, copySettings } = usePrefs();
  const [readMore, setReadMore] = useState(false);
  const [copied, setCopied] = useState<'link' | 'content' | null>(null);
  const bookmarked = isBookmarked(heading.id);

  const plain = useMemo(() => docToPlainText(heading.content), [heading.content]);
  const isLong = plain.length > LONG_CONTENT_THRESHOLD;
  const expanded = readMore || forceExpanded;
  const permalink = `${SITE_URL}/book/${book.slug}#${heading.id}`;
  const externalSource = book.source_links?.[0]?.url;

  const flash = (k: 'link' | 'content') => { setCopied(k); setTimeout(() => setCopied(null), 1800); };

  const copyUrl = async () => {
    if (!(await copyToClipboard(permalink))) window.prompt('Copy this link:', permalink);
    flash('link');
    trackEvent('interact', 'heading', heading.id);
  };

  const copyContent = async () => {
    const parts: string[] = [docToMarkdown(heading.content), ''];
    if (copySettings.includePageNumber && heading.page_number) parts.push(`Page: ${heading.page_number}`);
    if (copySettings.includeBookTitle) parts.push(`Book: ${book.title}`);
    if (book.author) parts.push(`Author: ${book.author}`);
    if (copySettings.includeSourceLink && externalSource) parts.push(`Source: ${externalSource}`);
    parts.push(`Link: ${permalink}`, `Via: ${SITE_URL} (Sirājan Munīrā)`);
    const text = parts.join('\n');
    if (!(await copyToClipboard(text))) window.prompt('Copy this text:', text);
    flash('content');
    trackEvent('interact', 'heading', heading.id);
  };

  const remove = async () => {
    if (!confirm('Delete this heading? This cannot be undone.')) return;
    await deleteHeading(heading.id);
    onChanged();
  };

  return (
    <article id={heading.id} className={`heading-block ${bookmarked ? 'heading-block--bookmarked' : ''}`} data-hscale={hScale}>
      {categoryNames.length > 0 && (
        <div className="heading-cat-badges no-print">
          {categoryNames.map((name, i) => <span key={i} className="heading-cat-badge">{name}</span>)}
        </div>
      )}

      {!!heading.importance_level && (
        <div className="heading-importance-display no-print" aria-label={`Importance ${heading.importance_level} of 5`}>
          {Array.from({ length: heading.importance_level }).map((_, i) => (
            <Star key={i} size={11} fill="currentColor" className="heading-star" />
          ))}
        </div>
      )}

      <div className={`heading-controls no-print ${panelOpen ? 'pinned' : ''}`}>
        <button className="heading-collapse-toggle" aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open} onClick={onToggleOpen}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <button onClick={copyUrl} aria-label="Copy link to this finding">
          {copied === 'link' ? <Check size={15} /> : <Link2 size={15} />}
          {copied === 'link' ? 'Copied!' : 'Link'}
        </button>
        <button className={`icon-bookmark ${bookmarked ? 'active' : ''}`} aria-pressed={bookmarked} onClick={() => toggleBookmark(heading.id)}>
          <Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />
          {bookmarked ? 'Saved' : 'Bookmark'}
        </button>
        <button onClick={copyContent} aria-label="Copy content with citation">
          {copied === 'content' ? <Check size={15} /> : <Copy size={15} />} {copied === 'content' ? 'Copied!' : 'Copy'}
        </button>
        {isAdmin && (
          <>
            <button onClick={() => onEditRequest(heading)}><Pencil size={15} /> Edit</button>
            <button onClick={() => onAssign(heading)}><FolderPlus size={15} /> Collection</button>
            <button className="danger" onClick={remove}><Trash2 size={15} /> Delete</button>
          </>
        )}
        <HeadingThreeDot heading={heading} book={book} isAdmin={isAdmin} onImportanceDone={onChanged} />
      </div>

      {heading.page_number && <p className="heading-page-label">Page {heading.page_number}</p>}

      {open ? (
        <>
          <div className={`rt-clip ${isLong && !expanded ? 'clipped' : ''}`}>
            <RichTextView doc={heading.content} />
          </div>
          {isLong && !forceExpanded && (
            <button className="link-btn read-more-btn" onClick={() => setReadMore((v) => !v)} aria-expanded={readMore}>
              {readMore ? 'Read less' : 'Read more'}
            </button>
          )}
        </>
      ) : (
        <p className="heading-collapsed-preview">{firstLineOf(heading.content, 140)}</p>
      )}
    </article>
  );
}

function HeadingSkeleton() {
  return (
    <div className="heading-block bp-sk" aria-hidden="true">
      <div className="skeleton-pulse sk-line sm" style={{ width: 70 }} />
      <div className="skeleton-pulse sk-line lg" style={{ width: '62%', height: 20, marginBottom: 12 }} />
      <div className="skeleton-pulse sk-line" style={{ width: '96%' }} />
      <div className="skeleton-pulse sk-line" style={{ width: '91%' }} />
      <div className="skeleton-pulse sk-line" style={{ width: '74%' }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heading editor panel (admin)
// ---------------------------------------------------------------------------

type PanelState = { mode: 'add' } | { mode: 'edit'; heading: Heading } | null;

function HeadingEditorPanel({ book, panel, nextSortOrder, onClose, onSaved }: {
  book: Book; panel: PanelState; nextSortOrder: number; onClose: () => void; onSaved: (newHeadingId?: string) => void;
}) {
  const isEdit = panel?.mode === 'edit';
  const [level, setLevel] = useState<1 | 2 | 3 | 4>(isEdit ? panel!.heading.level : 1);
  const [pageNumber, setPageNumber] = useState(isEdit ? panel!.heading.page_number ?? '' : '');
  const [content, setContent] = useState<any>(
    isEdit ? panel!.heading.content : { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [] }] }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      if (isEdit) {
        await updateHeading(panel!.heading.id, { content, page_number: pageNumber || null });
        onSaved();
      } else {
        const created = await createHeading({ book_id: book.id, level, content, page_number: pageNumber || null, sort_order: nextSortOrder });
        onSaved(created.id);
      }
    } catch (e: any) {
      setError(e?.message || 'Save failed. Your text is still here — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="split-detail">
      <button className="link-btn detail-close" onClick={onClose}>← Close</button>
      <h3>{isEdit ? 'Edit heading' : 'New heading'}</h3>
      {!isEdit && (
        <label>Level
          <select value={level} onChange={(e) => setLevel(Number(e.target.value) as 1 | 2 | 3 | 4)}>
            <option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option><option value={4}>H4</option>
          </select>
        </label>
      )}
      <label>Page number <input value={pageNumber} onChange={(e) => setPageNumber(e.target.value)} placeholder="e.g. 12 or 100-104" /></label>
      <RichEditor
        content={content}
        onChange={setContent}
        imagePathPrefix={isEdit ? `headings/${panel!.heading.id}` : `headings/new-${book.id}`}
        autosaveKey={isEdit ? panel!.heading.id : undefined}
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add heading'}</button>
        <button className="secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar (uses the lightweight index — every heading is listed even before
// its body has been fetched)
// ---------------------------------------------------------------------------

function BookSidebar({
  bookId, index, currentId, onJump, onCollapseAll, onExpandAll, onCloseMobile, mobileOpen, bookmarks,
}: {
  bookId: string; index: HeadingIndexRow[]; currentId: string | null; onJump: (id: string) => void; mobileOpen: boolean;
  onCollapseAll: () => void; onExpandAll: () => void; onCloseMobile: () => void; bookmarks: string[];
}) {
  const [query, setQuery] = useState('');
  const [matchIds, setMatchIds] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  // Server-side full-text match (debounced); falls back to titles.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setMatchIds(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setMatchIds(new Set(await findHeadingIdsInBook(bookId, q)));
      } catch {
        const lq = q.toLowerCase();
        setMatchIds(new Set(index.filter((h) => h.title.toLowerCase().includes(lq)).map((h) => h.id)));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, bookId, index]);

  let filtered = showBookmarksOnly ? index.filter((h) => bookmarks.includes(h.id)) : index;
  if (matchIds) filtered = filtered.filter((h) => matchIds.has(h.id));

  return (
    <>
      {mobileOpen && <div className="book-sidebar-backdrop" onClick={onCloseMobile} />}
      <aside className="book-sidebar" aria-label="Findings in this book">
        <div className="book-sidebar-head">
          <strong className="icon-row"><ListTree size={15} /> Findings <span className="muted bp-count">{index.length}</span></strong>
          <button className="bp-sidebar-close" onClick={onCloseMobile} aria-label="Close findings list">
            <X size={15} /> <span>Close</span>
          </button>
        </div>

        <div className="book-sidebar-search">
          <SearchIcon size={13} className="muted" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search in this book…" aria-label="Search in this book" />
          {searching ? <Loader2 size={13} className="spin muted" /> : query && (
            <button className="icon-btn" onClick={() => setQuery('')} aria-label="Clear"><X size={13} /></button>
          )}
        </div>

        <div className="book-sidebar-actions">
          <button className="link-btn" onClick={onExpandAll}>Expand all</button>
          <button className="link-btn" onClick={onCollapseAll}>Collapse all</button>
          <button className={`link-btn ${showBookmarksOnly ? 'sidebar-filter-active' : ''}`} aria-pressed={showBookmarksOnly}
            onClick={() => setShowBookmarksOnly((v) => !v)}>
            <Bookmark size={11} fill={showBookmarksOnly ? 'currentColor' : 'none'} /> {showBookmarksOnly ? 'All' : 'Bookmarks'}
          </button>
        </div>
        {matchIds && <p className="muted bp-sidebar-note">{filtered.length} match{filtered.length === 1 ? '' : 'es'}</p>}

        <ul className="book-sidebar-list">
          {filtered.map((h) => {
            const isBm = bookmarks.includes(h.id);
            return (
              <li key={h.id} className={`${isBm ? 'sidebar-item--bookmarked' : ''} ${currentId === h.id ? 'sidebar-item--current' : ''}`}>
                <button onClick={() => onJump(h.id)} aria-current={currentId === h.id ? 'location' : undefined}>
                  {isBm && <Bookmark size={9} fill="currentColor" style={{ flexShrink: 0 }} />}
                  <span className="bp-sidebar-title">{h.title || 'Untitled'}</span>
                  {h.page_number && <span className="bp-sidebar-page">p.{h.page_number}</span>}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="muted" style={{ padding: '0.5rem 0', fontSize: '0.82rem' }}>
              {showBookmarksOnly && !matchIds ? 'No bookmarks in this book yet.' : 'No matches.'}
            </li>
          )}
        </ul>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Floating go-to-top / bottom
// ---------------------------------------------------------------------------

/** true only while the reader is scrolling FAST (a flick / drag through the
 *  book). Slow, normal reading scroll keeps it false. Stays true for a moment
 *  after the last fast move so the buttons can actually be tapped. */
function useFastScroll(thresholdPxPerMs = 1.6, holdMs = 2200) {
  const [fast, setFast] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let lastT = performance.now();
    let smooth = 0;
    let timer: number | undefined;
    const onScroll = () => {
      const now = performance.now();
      const dt = now - lastT;
      const y = window.scrollY;
      if (dt < 4) return;
      const v = Math.abs(y - lastY) / dt;          // px per ms
      smooth = smooth * 0.5 + v * 0.5;             // damp single-event spikes
      lastY = y; lastT = now;
      if (smooth > thresholdPxPerMs) {
        setFast(true);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setFast(false), holdMs);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.clearTimeout(timer); };
  }, [thresholdPxPerMs, holdMs]);
  return fast;
}

function FloatingScrollBtns({ motion }: { motion: boolean }) {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const total = document.body.scrollHeight - window.innerHeight;
      setShowTop(y > 300);
      setShowBottom(total - y > 300);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div className={`floating-scroll-btns no-print bp-autohide ${motion ? 'bp-autohide--on' : ''}`}>
      {showTop && <button className="floating-scroll-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Go to top"><ArrowUp size={16} /></button>}
      {showBottom && <button className="floating-scroll-btn" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} aria-label="Go to bottom"><ArrowDown size={16} /></button>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Images — shown whole, at their natural aspect ratio (never cropped, no
// fixed box). Only limited by the available width and the viewport height.
// ---------------------------------------------------------------------------

function BookCover({ src, alt }: { src: string; alt: string }) {
  const open = useImageLightbox();
  return (
    <button className="bp-cover" onClick={() => open(src, alt)} aria-label="Open cover image full size">
      <img src={src} alt={alt} />
    </button>
  );
}

function BookGallery({ images }: { images: string[] }) {
  const open = useImageLightbox();
  const [i, setI] = useState(0);
  const n = images.length;
  if (!n) return null;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  return (
    <section className="bp-gallery no-print" aria-label="Book images"
      onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}>
      <div className="bp-section-head">
        <h2>Images</h2>
        {n > 1 && <span className="muted" aria-live="polite">{i + 1} / {n}</span>}
      </div>
      <figure className="bp-gallery-main">
        <button onClick={() => open(images[i])} aria-label={`Open image ${i + 1} full size`}>
          <img key={images[i]} src={images[i]} alt={`Book image ${i + 1}`} />
        </button>
      </figure>
      {n > 1 && (
        <div className="bp-gallery-nav">
          <button className="bp-gallery-arrow" onClick={() => go(-1)} aria-label="Previous image"><ChevronLeft size={16} /></button>
          <div className="bp-gallery-thumbs">
            {images.map((src, k) => (
              <button key={k} className={`bp-thumb ${k === i ? 'active' : ''}`} onClick={() => setI(k)} aria-label={`Show image ${k + 1}`} aria-current={k === i}>
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <button className="bp-gallery-arrow" onClick={() => go(1)} aria-label="Next image"><ChevronRight size={16} /></button>
        </div>
      )}
    </section>
  );
}

function BookSkeleton() {
  return (
    <div className="page book-page" aria-busy="true" aria-label="Loading book">
      <style>{BOOK_PAGE_CSS}</style>
      <div className="bp-header">
        <div className="skeleton-pulse bp-sk-cover" />
        <div className="bp-meta" style={{ flex: 1 }}>
          <div className="skeleton-pulse sk-line" style={{ width: '55%', height: 26, marginBottom: 14 }} />
          <div className="skeleton-pulse sk-line" style={{ width: '30%' }} />
          <div className="skeleton-pulse sk-line" style={{ width: '26%' }} />
          <div className="skeleton-pulse sk-line" style={{ width: '22%', marginBottom: 18 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[96, 110, 118, 90].map((w, i) => <div key={i} className="skeleton-pulse" style={{ width: w, height: 30, borderRadius: 6 }} />)}
          </div>
        </div>
      </div>
      <div className="reading-column">
        <HeadingSkeleton /><HeadingSkeleton /><HeadingSkeleton />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlight request coming from the Search page
//   /book/:slug?chunk=123#<headingId>   → semantic: highlight that passage
//   /book/:slug?hl=word1|word2#<id>     → keyword: highlight the words
// ---------------------------------------------------------------------------

interface HighlightReq { headingId: string; kind: 'passage' | 'terms'; passage?: string; terms?: string[]; }

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BookPage() {
  return (
    <ImageLightboxProvider>
      <BookPageInner />
    </ImageLightboxProvider>
  );
}

function BookPageInner() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const { bookmarks } = usePrefs();

  const [book, setBook] = useState<Book | null>(null);
  const [bookState, setBookState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [index, setIndex] = useState<HeadingIndexRow[]>([]);
  const [indexState, setIndexState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bodies, setBodies] = useState<Record<string, Heading>>({});
  const [catMap, setCatMap] = useState<Record<string, string[]>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [shown, setShown] = useState(0);
  const [pageState, setPageState] = useState<'idle' | 'loading' | 'error'>('idle');

  const [panel, setPanel] = useState<PanelState>(null);
  const [assigning, setAssigning] = useState<Heading | null>(null);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sm_book_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const on = () => { setIsMobile(mq.matches); if (!mq.matches) setSidebarMobileOpen(false); };
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const [currentHeadingId, setCurrentHeadingId] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('page');
  const [hScale, setHScaleState] = useState<HScale>(readHScale);
  const [hl, setHl] = useState<HighlightReq | null>(null);

  const loadingRef = useRef(false);
  const shownRef = useRef(0);
  const bodiesRef = useRef<Record<string, Heading>>({});
  const pendingScrollRef = useRef<{ id: string; flash: boolean } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const initialTargetDone = useRef(false);
  const hlScrolled = useRef(false);

  useTrackView('book', book?.id ?? null);
  useEffect(() => { shownRef.current = shown; }, [shown]);
  useEffect(() => { bodiesRef.current = bodies; }, [bodies]);

  const setHScale = (v: HScale) => { setHScaleState(v); saveHScale(v); };

  // ---- Display order (all ids; bodies are loaded for the first `shown`) ----
  const order = useMemo(() => {
    if (sortMode === 'importance') {
      return [...index].sort((a, b) => (b.importance_level || 0) - (a.importance_level || 0) || a.sort_order - b.sort_order).map((h) => h.id);
    }
    if (sortMode === 'featured') return index.filter((h) => bookmarks.includes(h.id)).map((h) => h.id);
    return index.map((h) => h.id);
  }, [index, sortMode, bookmarks]);
  const orderRef = useRef<string[]>([]);
  orderRef.current = order;

  const catNameById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);

  // ---- Fetch bodies for ids that aren't cached yet ----
  const ensureBodies = useCallback(async (ids: string[], force = false) => {
    const missing = force ? ids : ids.filter((id) => !bodiesRef.current[id]);
    if (!missing.length) return;
    const [rows, cats] = await Promise.all([getHeadingsByIds(missing), listCategoryIdsForHeadings(missing)]);
    const next = { ...bodiesRef.current };
    if (force) missing.forEach((id) => delete next[id]);
    rows.forEach((h) => { next[h.id] = h; });
    bodiesRef.current = next;
    setBodies(next);
    setCatMap((m) => {
      const out = { ...m };
      missing.forEach((id) => { out[id] = cats[id] || []; });
      return out;
    });
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    const start = shownRef.current;
    const end = Math.min(orderRef.current.length, start + PAGE_SIZE);
    if (start >= end) return;
    loadingRef.current = true;
    setPageState('loading');
    try {
      await ensureBodies(orderRef.current.slice(start, end));
      shownRef.current = Math.max(shownRef.current, end);
      setShown(shownRef.current);
      setPageState('idle');
    } catch {
      setPageState('error');
    } finally {
      loadingRef.current = false;
    }
  }, [ensureBodies]);

  /** Make sure a heading (and everything before it in the current order) is
   *  loaded, then scroll to it. */
  const jumpTo = useCallback(async (id: string, opts: { flash?: boolean } = {}) => {
    setSidebarMobileOpen(false);
    setOpenMap((prev) => ({ ...prev, [id]: true }));
    let pos = orderRef.current.indexOf(id);
    if (pos < 0) {
      // Not in the current view (e.g. "Bookmarked" filter) — switch to page order.
      setSortMode('page');
      pendingScrollRef.current = { id, flash: opts.flash ?? true };
      return;
    }
    if (pos >= shownRef.current) {
      const target = Math.min(orderRef.current.length, pos + 2);
      loadingRef.current = true;
      setPageState('loading');
      try {
        await ensureBodies(orderRef.current.slice(shownRef.current, target));
        shownRef.current = Math.max(shownRef.current, target);
        setShown(shownRef.current);
        setPageState('idle');
      } catch {
        setPageState('error');
        return;
      } finally {
        loadingRef.current = false;
      }
    }
    pendingScrollRef.current = { id, flash: opts.flash ?? true };
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el && pendingScrollRef.current?.id === id) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (pendingScrollRef.current.flash) {
          el.classList.add('deep-link-highlight');
          setTimeout(() => el.classList.remove('deep-link-highlight'), 2200);
        }
        pendingScrollRef.current = null;
      }
    });
  }, [ensureBodies]);

  // After renders, finish any scroll that was waiting for its element.
  useEffect(() => {
    const p = pendingScrollRef.current;
    if (!p || loadingRef.current) return;
    const pos = orderRef.current.indexOf(p.id);
    if (pos >= 0 && pos >= shownRef.current) { jumpTo(p.id, { flash: p.flash }); return; }
    const el = document.getElementById(p.id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (p.flash) {
      el.classList.add('deep-link-highlight');
      setTimeout(() => el.classList.remove('deep-link-highlight'), 2200);
    }
    pendingScrollRef.current = null;
  });

  // ---- Initial load ----
  const loadBook = useCallback(async () => {
    if (!slug) return;
    setBookState('loading'); setIndexState('loading');
    setBodies({}); bodiesRef.current = {}; setCatMap({}); setShown(0); shownRef.current = 0;
    setIndex([]); initialTargetDone.current = false; lastHash.current = null;
    try {
      const b = await getBookBySlug(slug);
      if (!b) { setBook(null); setBookState('notfound'); return; }
      setBook(b);
      setBookState('ready');
      listCategories({ includeHidden: isAdmin }).then(setCategories).catch(() => {});
      try {
        setIndex(await listHeadingIndex(b.id));
        setIndexState('ready');
      } catch {
        setIndexState('error');
      }
    } catch {
      setBookState('error');
    }
  }, [slug, isAdmin]);

  useEffect(() => { loadBook(); }, [loadBook]);

  // First batch, or jump straight to a deep link / last reading position.
  useEffect(() => {
    if (indexState !== 'ready' || initialTargetDone.current || !slug) return;
    initialTargetDone.current = true;
    const hashId = decodeURIComponent(location.hash.slice(1));
    let target: string | null = hashId && index.some((h) => h.id === hashId) ? hashId : null;
    let flash = !!target;
    if (!target) {
      try {
        const last = localStorage.getItem(`sm_last_h_${slug}`);
        if (last && index.some((h) => h.id === last)) { target = last; flash = false; }
      } catch {}
    }
    if (target) jumpTo(target, { flash });
    else loadMore();
  }, [indexState, index, slug, location.hash, jumpTo, loadMore]);

  // Hash changed while already on this book (e.g. a link to another finding).
  const lastHash = useRef<string | null>(null);
  useEffect(() => {
    if (indexState !== 'ready') return;
    if (lastHash.current === null) { lastHash.current = location.hash; return; }
    if (location.hash === lastHash.current) return;
    lastHash.current = location.hash;
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && index.some((h) => h.id === id)) jumpTo(id);
  }, [location.hash, indexState, index, jumpTo]);

  // New sort order → start again from the top of that order.
  const firstSort = useRef(true);
  useEffect(() => {
    if (firstSort.current) { firstSort.current = false; return; }
    shownRef.current = 0;
    setShown(0);
    setPageState('idle');
    loadMore();
  }, [sortMode, loadMore]);

  // Infinite scroll: fetch the next batch as the reader nears the end.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && pageState === 'idle' && shownRef.current < orderRef.current.length) loadMore();
    }, { rootMargin: '700px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, pageState, shown, order.length]);

  // ---- Highlight from search ----
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const headingId = decodeURIComponent(location.hash.slice(1));
    const chunk = params.get('chunk');
    const terms = params.get('hl');
    hlScrolled.current = false;
    if (!headingId || (!chunk && !terms)) { setHl(null); return; }
    let cancelled = false;
    if (chunk) {
      getChunkText(chunk).then((passage) => {
        if (cancelled) return;
        setHl(passage ? { headingId, kind: 'passage', passage } : null);
      });
    } else if (terms) {
      setHl({ headingId, kind: 'terms', terms: splitTerms(terms.split('|').join(' ')) });
    }
    return () => { cancelled = true; };
  }, [location.search, location.hash]);

  useEffect(() => {
    if (!hl) { clearHighlight('sm-keyword', 'sm-passage'); return; }
    if (!bodies[hl.headingId]) return;
    const raf = requestAnimationFrame(() => {
      const root = document.querySelector(`[id="${hl.headingId}"] .rt-content`);
      if (!root) return;
      let first: Range | null = null;
      if (hl.kind === 'passage' && hl.passage) {
        const r = findPassageRange(root, hl.passage);
        paintHighlight('sm-passage', r ? [r] : []);
        clearHighlight('sm-keyword');
        first = r;
      } else if (hl.terms) {
        const rs = findTermRanges(root, hl.terms);
        paintHighlight('sm-keyword', rs);
        clearHighlight('sm-passage');
        first = rs[0] || null;
      }
      if (first && !hlScrolled.current && highlightApiSupported()) {
        hlScrolled.current = true;
        pendingScrollRef.current = null;
        const top = first.getBoundingClientRect().top + window.scrollY - navHeight() - 90;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [hl, bodies, openMap, shown]);

  useEffect(() => () => clearHighlight('sm-keyword', 'sm-passage'), []);

  const clearSearchHighlight = () => {
    setHl(null);
    navigate({ pathname: location.pathname, search: '', hash: location.hash }, { replace: true });
  };

  // ---- Scroll spy + remember position ----
  useEffect(() => {
    if (!slug || !shown) return;
    const handler = () => {
      const limit = navHeight() + 40;
      let found: string | null = null;
      for (const id of orderRef.current.slice(0, shownRef.current)) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= limit) found = id; else break;
      }
      setCurrentHeadingId(found);
      if (found) { try { localStorage.setItem(`sm_last_h_${slug}`, found); } catch {} }
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [slug, shown]);

  // ---- Admin refresh after edits ----
  const refresh = useCallback(async (newId?: string) => {
    if (!book) return;
    try {
      const idx = await listHeadingIndex(book.id);
      const loaded = orderRef.current.slice(0, shownRef.current).filter((id) => idx.some((h) => h.id === id));
      setIndex(idx);
      await ensureBodies(loaded, true);
      if (newId) setTimeout(() => jumpTo(newId), 50);
    } catch { /* keep what is on screen */ }
    requestIndexing();
  }, [book, ensureBodies, jumpTo]);

  const setDesktopCollapsed = (next: boolean) => {
    setSidebarCollapsed(next);
    try { localStorage.setItem('sm_book_sidebar_collapsed', next ? '1' : '0'); } catch {}
  };
  const openSidebar = () => { if (isMobile) setSidebarMobileOpen(true); else setDesktopCollapsed(false); };
  const closeSidebar = () => { if (isMobile) setSidebarMobileOpen(false); else setDesktopCollapsed(true); };
  const sidebarHidden = isMobile ? !sidebarMobileOpen : sidebarCollapsed;

  // Esc closes the mobile drawer; the page behind it doesn't scroll while open.
  useEffect(() => {
    if (!isMobile || !sidebarMobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [isMobile, sidebarMobileOpen]);

  const fastScroll = useFastScroll();

  const nextSortOrder = useMemo(() => (index.length ? Math.max(...index.map((h) => h.sort_order)) + 1 : 0), [index]);

  if (bookState === 'loading') return <BookSkeleton />;
  if (bookState === 'notfound') {
    return (
      <div className="page"><div className="state-block">
        <h3>Book not found</h3><p>The link may be old, or the book was removed or hidden.</p>
        <div className="state-actions"><button className="primary" onClick={() => navigate('/books')}>Go to the bookshelf</button></div>
      </div></div>
    );
  }
  if (bookState === 'error' || !book) {
    return (
      <div className="page"><div className="state-block error" role="alert">
        <h3>Couldn't load this book</h3><p>Check your connection and try again.</p>
        <div className="state-actions"><button className="primary" onClick={loadBook}>Try again</button></div>
      </div></div>
    );
  }

  const descText = book.description ? docToPlainText(book.description) : '';
  const descLong = descText.length > 250;
  const visibleIds = order.slice(0, shown).filter((id) => bodies[id]);
  const bookmarkedHere = index.filter((h) => bookmarks.includes(h.id)).length;
  const allShown = shown >= order.length;

  return (
    <div className="page book-page" data-hscale={hScale}>
      <style>{BOOK_PAGE_CSS}</style>
      <FloatingScrollBtns motion={fastScroll} />
      {sidebarHidden && indexState === 'ready' && index.length > 0 && (
        <button className={`bp-fab-findings no-print bp-autohide ${fastScroll ? 'bp-autohide--on' : ''}`} onClick={openSidebar} aria-label="Show findings list" aria-expanded={false}>
          <ListTree size={16} />
          <span className="bp-fab-label">Findings</span>
          <span className="bp-fab-count">{index.length}</span>
        </button>
      )}

      {/* Print-only cover (browser print) */}
      <div className="print-only print-cover-page">
        {book.cover_image_url && <img src={book.cover_image_url} alt="" />}
        <h1>{book.title}</h1>
        {book.author && <p>{book.author}</p>}
      </div>

      {/* ---------- Header ---------- */}
      <header className="bp-header">
        {book.cover_image_url && <BookCover src={book.cover_image_url} alt={book.title} />}
        <div className="bp-meta">
          <h1>{book.title}</h1>
          <dl className="bp-facts">
            {book.author && <div><dt>Author</dt><dd>{book.author}</dd></div>}
            {book.publisher && <div><dt>Publisher</dt><dd>{book.publisher}</dd></div>}
            {book.base_language && <div><dt>Language</dt><dd>{book.base_language}</dd></div>}
            <div><dt>Findings</dt><dd>{indexState === 'ready' ? index.length : '…'}</dd></div>
          </dl>
          <BookExportBar book={book} />
          <SourceLinks links={book.source_links || []} />
        </div>
      </header>

      {book.description && (
        <div className="book-description no-print">
          <div className={descExpanded || !descLong ? '' : 'book-desc-clipped'}>
            <RichTextView doc={book.description} />
          </div>
          {descLong && (
            <button className="link-btn read-more-btn" onClick={() => setDescExpanded((v) => !v)} aria-expanded={descExpanded}>
              {descExpanded ? 'Read less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      <BookGallery images={book.detail_image_urls || []} />

      {/* ---------- Findings ---------- */}
      <div className={`book-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${sidebarMobileOpen ? 'sidebar-mobile-open' : ''} no-print`}>
        <BookSidebar
          bookId={book.id}
          index={index}
          currentId={currentHeadingId}
          onJump={(id) => jumpTo(id)}
          onCollapseAll={() => setOpenMap(Object.fromEntries(index.map((h) => [h.id, false])))}
          onExpandAll={() => setOpenMap(Object.fromEntries(index.map((h) => [h.id, true])))}
          onCloseMobile={closeSidebar}
          mobileOpen={sidebarMobileOpen}
          bookmarks={bookmarks}
        />

        <div className="book-main">
          <div className="book-toolbar no-print">
            <div className="book-sort-tabs" role="tablist" aria-label="Order">
              {([
                { id: 'page', label: 'Page order' },
                { id: 'importance', label: 'Importance' },
                { id: 'featured', label: 'Bookmarked' },
              ] as { id: SortMode; label: string }[]).map((tab) => (
                <button key={tab.id} role="tab" aria-selected={sortMode === tab.id}
                  className={`book-sort-tab ${sortMode === tab.id ? 'book-sort-tab--active' : ''}`} onClick={() => setSortMode(tab.id)}>
                  {tab.label}
                  {tab.id === 'featured' && bookmarkedHere > 0 && <span className="book-sort-badge">{bookmarkedHere}</span>}
                </button>
              ))}
            </div>
            <div className="bp-toolbar-end">
              {indexState === 'ready' && order.length > 0 && (
                <span className="muted bp-progress" aria-live="polite">{Math.min(shown, order.length)} of {order.length}</span>
              )}
              <HScaleControls hScale={hScale} onChange={setHScale} />
            </div>
          </div>

          {hl && (
            <div className={`bp-hl-note ${hl.kind}`} role="status">
              <span>{hl.kind === 'passage' ? 'Showing the passage that matched your search.' : <>Highlighting: <strong>{hl.terms?.join(', ')}</strong></>}</span>
              <button className="link-btn" onClick={clearSearchHighlight}>Clear highlight</button>
            </div>
          )}

          {isAdmin && !panel && (
            <div className="admin-add-top no-print">
              <button className="primary icon-row" onClick={() => setPanel({ mode: 'add' })}><Plus size={15} /> New heading</button>
            </div>
          )}

          <div className={`split-view wide-detail ${panel ? 'has-detail' : ''}`}>
            <div className="split-list reading-column">
              <div className="headings-list">
                {indexState === 'loading' && <><HeadingSkeleton /><HeadingSkeleton /></>}

                {indexState === 'error' && (
                  <div className="state-block error" role="alert">
                    <h3>Couldn't load the findings</h3>
                    <div className="state-actions"><button className="primary" onClick={loadBook}>Try again</button></div>
                  </div>
                )}

                {indexState === 'ready' && index.length === 0 && (
                  <div className="state-block"><h3>No findings yet</h3><p>{isAdmin ? 'Add the first heading with “New heading”.' : 'Findings for this book will appear here.'}</p></div>
                )}

                {indexState === 'ready' && sortMode === 'featured' && order.length === 0 && index.length > 0 && (
                  <div className="state-block"><p>No bookmarks in this book yet. Use the Bookmark button on any finding.</p></div>
                )}

                {visibleIds.map((id) => {
                  const h = bodies[id];
                  return (
                    <HeadingBlock
                      key={id}
                      heading={h}
                      book={book}
                      open={openMap[id] ?? true}
                      panelOpen={panel?.mode === 'edit' && panel.heading.id === id}
                      categoryNames={(catMap[id] || []).map((c) => catNameById[c]).filter(Boolean)}
                      forceExpanded={hl?.headingId === id}
                      onToggleOpen={() => setOpenMap((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }))}
                      onChanged={() => { setPanel(null); refresh(); }}
                      onEditRequest={(heading) => setPanel({ mode: 'edit', heading })}
                      onAssign={setAssigning}
                      hScale={hScale}
                    />
                  );
                })}

                {pageState === 'loading' && indexState === 'ready' && <><HeadingSkeleton /><HeadingSkeleton /></>}
              </div>

              {indexState === 'ready' && order.length > 0 && (
                <div className="list-status">
                  {pageState === 'error' ? (
                    <>
                      <span>Couldn't load more findings.</span>
                      <button className="link-btn" onClick={loadMore}>Retry</button>
                    </>
                  ) : allShown ? (
                    <span>All {order.length} finding{order.length === 1 ? '' : 's'} shown</span>
                  ) : pageState === 'idle' ? (
                    <button className="load-more-btn" onClick={loadMore}>Load more ({order.length - shown} left)</button>
                  ) : null}
                </div>
              )}
              <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />

              {isAdmin && !panel && allShown && (
                <button className="primary add-heading-btn no-print icon-row" onClick={() => setPanel({ mode: 'add' })}>
                  <Plus size={16} /> New heading
                </button>
              )}
            </div>

            {panel && (
              <HeadingEditorPanel
                key={panel.mode === 'edit' ? panel.heading.id : 'new'}
                book={book}
                panel={panel}
                nextSortOrder={nextSortOrder}
                onClose={() => setPanel(null)}
                onSaved={(newId) => { setPanel(null); refresh(newId); }}
              />
            )}
          </div>
        </div>
      </div>

      {assigning && (
        <CategoryAssign
          heading={assigning}
          categories={categories}
          assigned={catMap[assigning.id] || []}
          onClose={() => setAssigning(null)}
          onChanged={(ids) => setCatMap((m) => ({ ...m, [assigning.id]: ids }))}
        />
      )}

      <div className="print-only print-citation-page">
        <h2>Source</h2>
        <p>Printed from Sirājan Munīrā — {typeof window !== 'undefined' ? window.location.href : ''}</p>
        {book.source_links?.map((l, i) => <p key={i}>{l.label}: {l.url}</p>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const BOOK_PAGE_CSS = `
/* ── Header ───────────────────────── */
.book-page .bp-header { display: flex; gap: 1.8rem; align-items: flex-start; margin-bottom: 1.4rem; }
.book-page .bp-cover { flex: 0 1 auto; max-width: 42%; padding: 0; border: none; background: none; cursor: zoom-in; display: block; }
.book-page .bp-cover img {
  display: block; width: auto; height: auto; max-width: 100%; max-height: 78vh;
  border-radius: 4px; box-shadow: 0 6px 20px rgba(0,0,0,0.16);
}
.book-page .bp-meta { flex: 1 1 280px; min-width: 0; }
.book-page .bp-meta h1 { margin: 0 0 0.7rem; font-size: 1.75rem; line-height: 1.25; word-break: break-word; }
.bp-facts { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; margin: 0 0 1rem; font-size: 0.9rem; }
.bp-facts > div { display: contents; }
.bp-facts dt { color: var(--muted); }
.bp-facts dd { margin: 0; color: var(--fg); word-break: break-word; }
.book-page .bx-bar { margin-bottom: 1rem; }
.bp-sk-cover { width: 220px; aspect-ratio: 3 / 4; border-radius: 4px; flex-shrink: 0; }

/* ── Gallery (natural size, never cropped) ── */
.bp-gallery { margin: 0 0 1.6rem; padding-bottom: 1.2rem; border-bottom: 1px dashed var(--border); }
.bp-section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 0.6rem; }
.bp-section-head h2 { margin: 0; font-size: 1rem; }
.bp-gallery-main { margin: 0; display: flex; justify-content: center; background: color-mix(in srgb, var(--fg) 3%, transparent); border-radius: 6px; padding: 0.6rem; }
.bp-gallery-main button { padding: 0; border: none; background: none; cursor: zoom-in; display: block; max-width: 100%; }
.bp-gallery-main img { display: block; width: auto; height: auto; max-width: 100%; max-height: 85vh; border-radius: 4px; animation: bpFade 0.25s ease; }
@keyframes bpFade { from { opacity: 0.3; } to { opacity: 1; } }
.bp-gallery-nav { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.6rem; }
.bp-gallery-arrow { width: 34px; height: 34px; flex-shrink: 0; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); display: grid; place-items: center; color: var(--fg); }
.bp-gallery-arrow:hover { border-color: var(--accent); color: var(--accent); }
.bp-gallery-thumbs { display: flex; gap: 0.4rem; overflow-x: auto; flex: 1; padding: 2px; scrollbar-width: thin; }
.bp-thumb { flex-shrink: 0; height: 56px; padding: 0; border: 2px solid transparent; border-radius: 4px; overflow: hidden; background: var(--border); opacity: 0.7; }
.bp-thumb img { height: 100%; width: auto; display: block; }
.bp-thumb.active { border-color: var(--accent); opacity: 1; }
.bp-thumb:hover { opacity: 1; }

/* ── Toolbar ──────────────────────── */
.book-toolbar { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.8rem; padding-bottom: 0.6rem; border-bottom: 1px solid var(--border); }
.book-toolbar .icon-btn { display: inline-flex; align-items: center; gap: 0.3rem; }
.bp-toolbar-end { margin-left: auto; display: flex; gap: 0.7rem; align-items: center; }
.bp-progress { font-size: 0.76rem; font-variant-numeric: tabular-nums; }
.book-sort-tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; }
.book-sort-tab { padding: 0.32rem 0.7rem; font-size: 0.78rem; border: 1px solid var(--border); border-radius: 6px; color: var(--muted); display: flex; align-items: center; gap: 0.3rem; }
.book-sort-tab:hover { border-color: var(--accent); color: var(--accent); }
.book-sort-tab--active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--bg)); font-weight: 600; }
.book-sort-badge { min-width: 16px; height: 16px; border-radius: 4px; background: var(--accent); color: #fff; font-size: 0.65rem; font-weight: 700; padding: 0 4px; display: inline-flex; align-items: center; justify-content: center; }

.bp-hl-note { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; flex-wrap: wrap; font-size: 0.82rem;
  padding: 0.5rem 0.75rem; margin-bottom: 0.8rem; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); }
.bp-hl-note.passage { border-left: 3px solid var(--accent); }
.bp-hl-note.terms { border-left: 3px solid #e0b000; }

/* ── Heading extras ───────────────── */
.heading-cat-badges { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.4rem; }
.heading-cat-badge { font-size: 0.66rem; font-weight: 600; padding: 0.1rem 0.45rem; border-radius: 4px; background: color-mix(in srgb, var(--accent) 10%, var(--bg)); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent); }
.heading-importance-display { display: flex; align-items: center; gap: 1px; margin-bottom: 0.2rem; }
.heading-star { color: #d4a017; }
.heading-block--bookmarked { border-left: 2px solid #b8860b; padding-left: 0.7rem; }
.bp-sk { border-bottom: 1px solid var(--border); }

.hdg-threedot { position: relative; display: inline-block; }
.hdg-threedot__btn { width: 24px; height: 24px; border-radius: 4px; display: grid; place-items: center; color: var(--muted); }
.hdg-threedot__btn:hover { background: var(--surface); color: var(--accent); }
.hdg-threedot__menu { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.14); min-width: 200px; overflow: hidden; animation: menuFadeIn 0.12s ease; }
.hdg-threedot__menu button { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.55rem 0.8rem; font-size: 0.82rem; color: var(--fg); border-bottom: 1px solid var(--border); text-align: left; }
.hdg-threedot__menu button:last-child { border-bottom: none; }
.hdg-threedot__menu button:hover { background: color-mix(in srgb, var(--accent) 7%, var(--bg)); color: var(--accent); }
.hdg-threedot__panel { padding: 0.7rem 0.8rem; }
.importance-picker__label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin: 0 0 0.5rem; }
.importance-picker__stars { display: flex; align-items: center; gap: 0.2rem; }
.importance-star { color: #d4a017; }
.importance-clear { font-size: 0.72rem; color: var(--muted); border-bottom: 1px solid var(--border); margin-left: 0.5rem; }

.hscale-control { position: relative; display: inline-block; }
.hscale-control__btn { position: relative; }
.hscale-indicator { position: absolute; top: -2px; right: -2px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
.hscale-control__menu { position: absolute; right: 0; top: 110%; z-index: 120; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.14); min-width: 200px; overflow: hidden; animation: menuFadeIn 0.12s ease; }
.hscale-control__label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); padding: 0.5rem 0.8rem 0.2rem; margin: 0; }
.hscale-option { display: flex; flex-direction: column; gap: 0.1rem; width: 100%; padding: 0.5rem 0.8rem; text-align: left; border-bottom: 1px solid var(--border); }
.hscale-option:last-child { border-bottom: none; }
.hscale-option:hover { background: color-mix(in srgb, var(--accent) 7%, var(--bg)); }
.hscale-option--active { background: color-mix(in srgb, var(--accent) 10%, var(--bg)); }
.hscale-option__label { font-size: 0.84rem; font-weight: 600; color: var(--fg); }
.hscale-option__desc { font-size: 0.72rem; color: var(--muted); }
[data-hscale="h1-as-h2"] .rt-content h1 { font-size: 1.35rem; }
[data-hscale="reduced"] .rt-content h1 { font-size: 1.5rem; }
[data-hscale="reduced"] .rt-content h2 { font-size: 1.2rem; }

/* ── Sidebar ──────────────────────── */
.bp-count { font-weight: 400; font-size: 0.76rem; }
.bp-sidebar-close { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.78rem; color: var(--muted);
  border: 1px solid var(--border); border-radius: 6px; padding: 0.25rem 0.55rem; background: var(--surface); }
.bp-sidebar-close:hover { color: var(--accent); border-color: var(--accent); }
.book-page .book-sidebar-head { position: sticky; top: 0; z-index: 2; background: var(--bg); padding: 0.35rem 0; margin-top: -0.35rem; }

/* Floating "Findings" button — visible whenever the list is closed */
.bp-fab-findings {
  position: fixed; left: 1.1rem; bottom: 1.5rem; z-index: 210;
  display: inline-flex; align-items: center; gap: 0.45rem;
  padding: 0.55rem 0.85rem; border-radius: 999px;
  background: var(--surface); color: var(--fg); border: 1px solid var(--border);
  box-shadow: 0 4px 14px rgba(0,0,0,0.14); font-size: 0.86rem; font-weight: 600;
  animation: bpFabIn 0.18s ease;
}
.bp-fab-findings:hover { border-color: var(--accent); color: var(--accent); }
.bp-fab-findings svg { color: var(--accent); }
.bp-fab-count { font-size: 0.72rem; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, var(--fg) 7%, transparent); border-radius: 999px; padding: 0 0.4rem; }
@keyframes bpFabIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .bp-fab-findings { animation: none; } }
.book-sidebar-search .icon-btn { display: inline-flex; }
.bp-sidebar-note { margin: 0 0 0.3rem; font-size: 0.74rem; }
.book-sidebar-list button { display: flex !important; align-items: baseline; gap: 0.35rem; }
.bp-sidebar-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.bp-sidebar-page { font-size: 0.68rem; color: var(--muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }
.sidebar-item--bookmarked button { color: #b8860b !important; }
.sidebar-item--current button { color: var(--accent) !important; font-weight: 700; background: color-mix(in srgb, var(--accent) 10%, transparent); border-radius: 4px; padding-left: 0.3rem !important; }
.sidebar-filter-active { color: var(--accent) !important; }
.book-sidebar-actions { display: flex; gap: 0.6rem; font-size: 0.74rem; margin-bottom: 0.5rem; flex-wrap: wrap; align-items: center; }
.book-sidebar-actions .link-btn { display: inline-flex; align-items: center; gap: 0.2rem; }


/* ── Findings + top/bottom buttons: hidden while reading, shown on fast scroll ── */
.bp-autohide { opacity: 0; transform: translateY(12px) scale(.96); pointer-events: none;
  transition: opacity .25s ease, transform .25s ease; animation: none !important; }
.bp-autohide--on, .bp-autohide:focus-within, .bp-autohide:focus-visible { opacity: 1; transform: none; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) { .bp-autohide { transition: opacity .1s; transform: none; } }

/* ── Floating scroll buttons ─────── */
.floating-scroll-btns { position: fixed; bottom: 1.5rem; right: 1.2rem; z-index: 200; display: flex; flex-direction: column; gap: 0.4rem; }
.floating-scroll-btn { width: 38px; height: 38px; border-radius: 50%; background: var(--surface); border: 1px solid var(--border); display: grid; place-items: center; color: var(--fg); box-shadow: 0 3px 10px rgba(0,0,0,0.12); }
.floating-scroll-btn:hover { border-color: var(--accent); color: var(--accent); }

/* ── Misc ─────────────────────────── */
.book-desc-clipped { position: relative; max-height: 5.5em; overflow: hidden; }
.book-desc-clipped::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2.5em; background: linear-gradient(transparent, var(--bg)); }
.admin-add-top { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.8rem; padding: 0.6rem 0; border-bottom: 1px dashed var(--border); }
.book-main { display: flex; flex-direction: column; min-width: 0; }

/* ── Mobile ───────────────────────── */
@media (max-width: 720px) {
  .book-page .bp-header { flex-direction: column; gap: 1rem; }
  .book-page .bp-cover { max-width: 100%; align-self: center; }
  .book-page .bp-cover img { max-height: 70vh; }
  .book-page .bp-meta h1 { font-size: 1.4rem; }
  .bp-sk-cover { width: 60%; align-self: center; }
  .bp-toolbar-end { margin-left: 0; width: 100%; justify-content: space-between; }
  .book-sort-tabs { width: 100%; }
  .book-sort-tab { flex: 1; justify-content: center; }
  .floating-scroll-btns { bottom: 1rem; right: 0.8rem; }
  .bp-fab-findings { left: 0.8rem; bottom: 1rem; }
}
@media (max-width: 860px) {
  .book-page .book-sidebar-head { top: -1rem; margin-top: -1rem; padding-top: 1rem; }
  .heading-controls { gap: 0.5rem 0.8rem; }
}
`;