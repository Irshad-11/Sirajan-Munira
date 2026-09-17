import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import {
  Link2, Bookmark, Copy, Pencil, FolderPlus, Trash2, Check, ChevronDown, ChevronRight,
  ChevronLeft, Plus, PanelLeft, X, ListTree, MoreVertical, ArrowUp, ArrowDown, Star, Type,
} from 'lucide-react';
import {
  Book, Category, Heading, addHeadingToCategory, createHeading, deleteHeading,
  getBookBySlug, listCategories, listCategoriesForHeading, listHeadings,
  removeHeadingFromCategory, trackEvent, updateHeading, updateHeadingImportance,
} from '../lib/supabase';
import { useAdmin, usePrefs, useTrackView } from '../lib/context';
import {
  RichTextView, docToMarkdown, docToPlainText, firstLineOf, ImageLightboxProvider,
  useImageLightbox, copyToClipboard,
} from '../lib/richtext';
import { RichEditor } from '../components/Editor';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LONG_CONTENT_THRESHOLD = 500;
const SITE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://sirajan-munira.vercel.app';

// ---------------------------------------------------------------------------
// H-size scale modes (stored in localStorage)
// ---------------------------------------------------------------------------

type HScale = 'default' | 'h1-as-h2' | 'reduced';

function readHScale(): HScale {
  try { return (localStorage.getItem('sm_hscale') as HScale) || 'default'; } catch { return 'default'; }
}

function saveHScale(v: HScale) {
  try { localStorage.setItem('sm_hscale', v); } catch {}
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
// Category assign modal
// ---------------------------------------------------------------------------

function CategoryAssign({ heading, onClose }: { heading: Heading; onClose: () => void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  useEffect(() => {
    listCategories({ includeHidden: true }).then(setCats);
    listCategoriesForHeading(heading.id).then(setAssigned);
  }, [heading.id]);

  const toggle = async (catId: string) => {
    if (assigned.includes(catId)) {
      await removeHeadingFromCategory(catId, heading.id);
      setAssigned((a) => a.filter((c) => c !== catId));
    } else {
      await addHeadingToCategory(catId, heading.id);
      setAssigned((a) => [...a, catId]);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Assign to collections</h3>
        {cats.length === 0 && <p className="muted">No collections yet.</p>}
        <div className="category-check-list">
          {cats.map((c) => (
            <label key={c.id} className="check">
              <input type="checkbox" checked={assigned.includes(c.id)} onChange={() => toggle(c.id)} />
              <span className="dot" style={{ background: c.color }} /> {c.name}
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Importance star picker (admin only)
// ---------------------------------------------------------------------------

function ImportancePicker({ heading, onClose }: { heading: Heading; onClose: () => void }) {
  const [hovered, setHovered] = useState(0);
  const current = heading.importance_level || 0;

  const set = async (level: number) => {
    await updateHeadingImportance(heading.id, level === current ? null : level);
    onClose();
  };

  return (
    <div className="importance-picker">
      <p className="importance-picker__label">Importance</p>
      <div className="importance-picker__stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`importance-star ${(hovered || current) >= n ? 'importance-star--filled' : ''}`}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => set(n)}
            title={`Level ${n}${current === n ? ' (click to remove)' : ''}`}
          >
            <Star size={18} fill={(hovered || current) >= n ? 'currentColor' : 'none'} />
          </button>
        ))}
        {current > 0 && (
          <button className="importance-clear" onClick={() => set(0)}>Clear</button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Three-dot menu per heading
// ---------------------------------------------------------------------------

type HeadingMenuMode = 'none' | 'importance';

function HeadingThreeDot({ heading, book, isAdmin, onImportanceDone }: {
  heading: Heading; book: Book; isAdmin: boolean; onImportanceDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<HeadingMenuMode>('none');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const { copySettings } = usePrefs();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setMode('none'); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const permalink = `${SITE_URL}/book/${book.slug}#${heading.id}`;
  const externalSource = book.source_links?.[0]?.url;

  const buildEnhancedText = (type: 'markdown' | 'plain') => {
    const content = type === 'markdown' ? docToMarkdown(heading.content) : docToPlainText(heading.content);
    const lines: string[] = [content, ''];
    if (heading.page_number) lines.push(`Page: ${heading.page_number}`);
    lines.push(`Book: ${book.title}`);
    if (book.author) lines.push(`Author: ${book.author}`);
    if (externalSource) lines.push(`Source: ${externalSource}`);
    lines.push(`Link: ${permalink}`);
    lines.push(`Via: ${SITE_URL} (Sirājan Munīrā)`);
    return lines.join('\n');
  };

  const copyMd = async () => {
    setOpen(false);
    const ok = await copyToClipboard(buildEnhancedText('markdown'));
    if (!ok) window.prompt('Copy this markdown:', buildEnhancedText('markdown'));
  };

  const copyPlain = async () => {
    setOpen(false);
    const ok = await copyToClipboard(buildEnhancedText('plain'));
    if (!ok) window.prompt('Copy this text:', buildEnhancedText('plain'));
  };

  const openHdgMenu = () => {
    if (!ref.current) return;
    const btn = ref.current.querySelector('.hdg-threedot__btn') as HTMLElement;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const mW = 210; const mH = isAdmin ? 130 : 90;
    const vw = window.innerWidth; const vh = window.innerHeight;
    const style: React.CSSProperties = { position: 'fixed', zIndex: 9999 };
    style.left = r.right + mW > vw ? Math.max(4, r.right - mW) : r.left;
    style.top = r.bottom + mH > vh ? r.top - mH - 4 : r.bottom + 4;
    setMenuStyle(style);
    setOpen((v) => !v); setMode('none');
  };

  return (
    <div className="hdg-threedot" ref={ref}>
      <button className="hdg-threedot__btn" onClick={openHdgMenu} title="More options" onMouseDown={(e) => e.stopPropagation()}>
        <MoreVertical size={14} />
      </button>
      {open && createPortal(
        <div className="hdg-threedot__menu" style={menuStyle} onMouseDown={(e) => e.stopPropagation()}>
          {mode === 'none' ? (
            <>
              <button onClick={copyMd}><Copy size={12} /> Copy as Markdown</button>
              <button onClick={copyPlain}><Copy size={12} /> Copy as plain text</button>
              {isAdmin && (
                <button onClick={() => setMode('importance')}>
                  <Star size={12} /> Importance level
                  {heading.importance_level ? ` (${heading.importance_level}★)` : ''}
                </button>
              )}
            </>
          ) : (
            <div className="hdg-threedot__panel">
              <ImportancePicker
                heading={heading}
                onClose={() => { setOpen(false); setMode('none'); onImportanceDone(); }}
              />
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// H-scale controls
// ---------------------------------------------------------------------------

function HScaleControls({ hScale, onChange }: { hScale: HScale; onChange: (v: HScale) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
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
      <button
        className="hscale-control__btn icon-btn"
        onClick={() => setOpen((v) => !v)}
        title="Text size options"
      >
        <Type size={14} />
        {hScale !== 'default' && <span className="hscale-indicator" />}
      </button>
      {open && (
        <div className="hscale-control__menu">
          <p className="hscale-control__label">Heading text size</p>
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`hscale-option ${hScale === opt.value ? 'hscale-option--active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
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
// Sort tab types
// ---------------------------------------------------------------------------

type SortMode = 'page' | 'importance' | 'featured';

// ---------------------------------------------------------------------------
// Heading block
// ---------------------------------------------------------------------------

function HeadingBlock({
  heading, book, open, panelOpen, headingCategories, onToggleOpen, onChanged, onEditRequest, hScale,
}: {
  heading: Heading; book: Book; open: boolean; panelOpen: boolean;
  headingCategories: string[]; onToggleOpen: () => void; onChanged: () => void; onEditRequest: (h: Heading) => void; hScale: HScale;
}) {
  const { isAdmin } = useAdmin();
  const { toggleBookmark, isBookmarked, copySettings } = usePrefs();
  const [readMore, setReadMore] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [copied, setCopied] = useState(false);
  const bookmarked = isBookmarked(heading.id);

  const plain = useMemo(() => docToPlainText(heading.content), [heading.content]);
  const isLong = plain.length > LONG_CONTENT_THRESHOLD;
  const permalink = `${SITE_URL}/book/${book.slug}#${heading.id}`;
  const externalSource = book.source_links?.[0]?.url;

  const copyUrl = async () => {
    const ok = await copyToClipboard(permalink);
    if (!ok) window.prompt('Copy this link:', permalink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    trackEvent('interact', 'heading', heading.id);
  };

  const copyContent = async () => {
    const content = docToMarkdown(heading.content);
    const parts: string[] = [content, ''];
    if (copySettings.includePageNumber && heading.page_number) parts.push(`Page: ${heading.page_number}`);
    if (copySettings.includeBookTitle) parts.push(`Book: ${book.title}`);
    if (book.author) parts.push(`Author: ${book.author}`);
    if (copySettings.includeSourceLink && externalSource) parts.push(`Source: ${externalSource}`);
    parts.push(`Link: ${permalink}`);
    parts.push(`Via: ${SITE_URL} (Sirājan Munīrā)`);
    const text = parts.join('\n');
    const ok = await copyToClipboard(text);
    if (!ok) window.prompt('Copy this text:', text);
    trackEvent('interact', 'heading', heading.id);
  };

  const remove = async () => {
    if (!confirm('Delete this heading? This cannot be undone.')) return;
    await deleteHeading(heading.id);
    onChanged();
  };

  return (
    <div
      id={heading.id}
      className={`heading-block ${bookmarked ? 'heading-block--bookmarked' : ''}`}
      data-hscale={hScale}
    >
      {/* Collection badges — always visible (not hover-only) */}
      {headingCategories.length > 0 && (
        <div className="heading-cat-badges no-print">
          {headingCategories.map((name, i) => (
            <span key={i} className="heading-cat-badge">{name}</span>
          ))}
        </div>
      )}

      {/* Importance stars — always visible if set */}
      {heading.importance_level && (
        <div className="heading-importance-display no-print">
          {Array.from({ length: heading.importance_level }).map((_, i) => (
            <Star key={i} size={11} fill="currentColor" className="heading-star" />
          ))}
        </div>
      )}

      <div className={`heading-controls no-print ${panelOpen ? 'pinned' : ''}`}>
        <button className="heading-collapse-toggle" title={open ? 'Collapse' : 'Expand'} onClick={onToggleOpen}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <button title={copied ? 'Link copied!' : 'Copy link to this finding'} onClick={copyUrl}>
          {copied ? <Check size={15} /> : <Link2 size={15} />}
          {copied ? 'Copied!' : 'Link'}
        </button>
        <button
          className={`icon-bookmark ${bookmarked ? 'active' : ''}`}
          title="Bookmark"
          onClick={() => toggleBookmark(heading.id)}
        >
          <Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />
          {bookmarked ? 'Saved' : 'Bookmark'}
        </button>
        <button title="Copy content + citation" onClick={copyContent}><Copy size={15} /> Copy</button>
        {isAdmin && (
          <>
            <button onClick={() => onEditRequest(heading)}><Pencil size={15} /> Edit</button>
            <button onClick={() => setAssigning(true)}><FolderPlus size={15} /> Collection</button>
            <button className="danger" onClick={remove}><Trash2 size={15} /> Delete</button>
          </>
        )}
        <HeadingThreeDot heading={heading} book={book} isAdmin={isAdmin} onImportanceDone={onChanged} />
      </div>

      {heading.page_number && <p className="heading-page-label">Page {heading.page_number}</p>}

      {open ? (
        <>
          <div className={`rt-clip ${isLong && !readMore ? 'clipped' : ''}`}>
            <RichTextView doc={heading.content} />
          </div>
          {isLong && (
            <button className="link-btn read-more-btn" onClick={() => setReadMore((v) => !v)}>
              {readMore ? 'Read less' : 'Read more'}
            </button>
          )}
        </>
      ) : (
        <p className="heading-collapsed-preview">{firstLineOf(heading.content, 140)}</p>
      )}

      {assigning && <CategoryAssign heading={heading} onClose={() => setAssigning(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heading editor panel
// ---------------------------------------------------------------------------

type PanelState = { mode: 'add' } | { mode: 'edit'; heading: Heading } | null;

function HeadingEditorPanel({ book, panel, nextSortOrder, onClose, onSaved }: {
  book: Book; panel: PanelState; nextSortOrder: number; onClose: () => void; onSaved: (newHeadingId?: string) => void;
}) {
  const isEdit = panel?.mode === 'edit';
  const [level, setLevel] = useState<1 | 2 | 3 | 4>(isEdit ? panel!.heading.level : 1);
  const [pageNumber, setPageNumber] = useState(isEdit ? panel!.heading.page_number ?? '' : '');
  const [content, setContent] = useState<any>(
    isEdit
      ? panel!.heading.content
      : { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [] }] }
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (isEdit) {
        await updateHeading(panel!.heading.id, { content, page_number: pageNumber || null });
        onSaved();
      } else {
        const created = await createHeading({
          book_id: book.id, level, content,
          page_number: pageNumber || null, sort_order: nextSortOrder,
        });
        onSaved(created.id);
      }
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
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
            <option value={4}>H4</option>
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
      <div className="modal-actions">
        <button className="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add heading'}</button>
        <button className="secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function BookSidebar({
  headings, currentId, onJump, onCollapseAll, onExpandAll,
  mobileOpen, onCloseMobile, bookmarks, categories,
}: {
  headings: Heading[]; currentId: string | null; onJump: (id: string) => void;
  onCollapseAll: () => void; onExpandAll: () => void;
  mobileOpen: boolean; onCloseMobile: () => void;
  bookmarks: string[]; categories: Category[];
}) {
  const [query, setQuery] = useState('');
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  let filtered = showBookmarksOnly
    ? headings.filter((h) => bookmarks.includes(h.id))
    : headings;

  if (query.trim()) {
    const q = query.trim().toLowerCase();
    filtered = filtered.filter((h) => docToPlainText(h.content).toLowerCase().includes(q));
  }

  return (
    <>
      {mobileOpen && <div className="book-sidebar-backdrop" onClick={onCloseMobile} />}
      <aside className="book-sidebar">
        <div className="book-sidebar-head">
          <strong className="icon-row"><ListTree size={15} /> Findings</strong>
          <div className="book-sidebar-head-actions">
            {/* Collapse button inside the sidebar */}
            <button className="icon-btn sidebar-collapse-btn" onClick={onCloseMobile} title="Close sidebar">
              <PanelLeft size={15} />
            </button>
          </div>
        </div>

        <div className="book-sidebar-search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search headings…" />
          {query && <button className="link-btn" onClick={() => setQuery('')}>Clear</button>}
        </div>

        <div className="book-sidebar-actions">
          <button className="link-btn" onClick={onExpandAll}>Expand all</button>
          <button className="link-btn" onClick={onCollapseAll}>Collapse all</button>
          <button
            className={`link-btn ${showBookmarksOnly ? 'sidebar-filter-active' : ''}`}
            onClick={() => setShowBookmarksOnly((v) => !v)}
            title="Show only bookmarked"
          >
            <Bookmark size={11} fill={showBookmarksOnly ? 'currentColor' : 'none'} />
            {showBookmarksOnly ? 'All' : 'Bookmarks'}
          </button>
        </div>

        <ul className="book-sidebar-list">
          {filtered.map((h) => {
            const isBookmarked = bookmarks.includes(h.id);
            const isCurrent = currentId === h.id;
            return (
              <li key={h.id} className={`${isBookmarked ? 'sidebar-item--bookmarked' : ''} ${isCurrent ? 'sidebar-item--current' : ''}`}>
                <button onClick={() => onJump(h.id)}>
                  {isBookmarked && <Bookmark size={9} fill="currentColor" style={{ flexShrink: 0 }} />}
                  {firstLineOf(h.content, 70) || 'Untitled'}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="muted" style={{ padding: '0.5rem 0', fontSize: '0.82rem' }}>
              {showBookmarksOnly ? 'No bookmarks yet.' : 'No matches.'}
            </li>
          )}
        </ul>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Floating go-to-top / go-to-bottom buttons
// ---------------------------------------------------------------------------

function FloatingScrollBtns() {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY;
      const total = document.body.scrollHeight - window.innerHeight;
      setShowTop(scrolled > 300);
      setShowBottom(total - scrolled > 300);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="floating-scroll-btns no-print">
      {showTop && (
        <button
          className="floating-scroll-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Go to top"
        >
          <ArrowUp size={16} />
        </button>
      )}
      {showBottom && (
        <button
          className="floating-scroll-btn"
          onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
          title="Go to bottom"
        >
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image panel (right side)
// ---------------------------------------------------------------------------

function RightImagePanel({ images }: { images: string[] }) {
  const openLightbox = useImageLightbox();
  const [idx, setIdx] = useState(0);
  const total = images.length;
  if (total === 0) return null;

  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  return (
    <div className="book-right-images no-print">
      <div className="book-right-images__track">
        {images.map((src, i) => (
          <div key={i} className={`book-right-images__slide ${i === idx ? 'book-right-images__slide--active' : i < idx ? 'book-right-images__slide--prev' : 'book-right-images__slide--next'}`}>
            <button className="book-right-images__img-btn" onClick={() => openLightbox(src)}>
              <img src={src} alt={`Image ${i + 1}`} className="book-right-images__img" />
            </button>
          </div>
        ))}
      </div>
      {total > 1 && (
        <div className="book-right-images__nav">
          <button className="col-carousel-btn" onClick={prev}><ChevronLeft size={14} /></button>
          <span className="book-right-images__count">{idx + 1}/{total}</span>
          <button className="col-carousel-btn" onClick={next}><ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BookPage main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Book page loading state — centered, animated, engaging
// ---------------------------------------------------------------------------

const LOADING_LINES = [
  'وَمَا أُوتِيتُم مِّنَ الْعِلْمِ إِلَّا قَلِيلًا',
  '"And of knowledge, you have been given only a little." — Al-Isra 17:85',
  'Reading is a conversation with the minds of all ages.',
  'Every great book is a new journey waiting to begin.',
  'A reader lives a thousand lives before they die.',
  'The more that you read, the more things you will know.',
  'In books lies the soul of the whole past time.',
  'Loading your findings from the archive…',
  'Gathering the headings and their sources…',
  'One who seeks knowledge is on a path to Paradise.',
  'Sirājan Munīrā — a lamp spreading light.',
  'Knowledge is the life of the mind.',
];

function useElapsed() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setMs(Date.now() - start), 100);
    return () => clearInterval(t);
  }, []);
  return ms;
}

function useRotatingText(lines: string[], intervalMs = 2600) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % lines.length); setVisible(true); }, 350);
    }, intervalMs);
    return () => clearInterval(t);
  }, [lines.length, intervalMs]);
  return { text: lines[idx], visible };
}

function BookPageSkeleton() {
  const ms = useElapsed();
  const secs = (ms / 1000).toFixed(1);
  const progress = ms < 3000
    ? (ms / 3000) * 78
    : 78 + Math.min(12, ((ms - 3000) / 8000) * 12);
  const { text, visible } = useRotatingText(LOADING_LINES, 2800);

  return (
    <div className="bkl-fullscreen">
      <style>{SPINNER_CSS}</style>

      {/* Animated book SVG */}
      <svg className="bkl-book-svg" viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {/* Left page */}
        <rect x="4" y="8" width="34" height="44" rx="2" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.4"/>
        {/* Right page */}
        <rect x="42" y="8" width="34" height="44" rx="2" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.4"/>
        {/* Spine */}
        <line x1="40" y1="8" x2="40" y2="52" stroke="var(--border)" strokeWidth="2"/>
        {/* Left lines */}
        {[18,25,32,39,46].map((y,i) => (
          <line key={i} x1="11" y1={y} x2={i===2?32:i===4?28:34} y2={y} stroke="var(--border)" strokeWidth="1.1" opacity="0.8"/>
        ))}
        {/* Highlight left */}
        <rect x="11" y="22" width="23" height="7" rx="1" fill="#ffe066" opacity="0.5">
          <animate attributeName="opacity" values="0.5;0.85;0.5" dur="2s" repeatCount="indefinite"/>
        </rect>
        {/* Right lines */}
        {[18,25,32,39,46].map((y,i) => (
          <line key={i} x1="48" y1={y} x2={i===1?66:i===3?62:68} y2={y} stroke="var(--border)" strokeWidth="1.1" opacity="0.8"/>
        ))}
        {/* Highlight right */}
        <rect x="48" y="36" width="18" height="7" rx="1" fill="#ffe066" opacity="0.5">
          <animate attributeName="opacity" values="0.5;0.85;0.5" dur="2s" begin="1s" repeatCount="indefinite"/>
        </rect>
        {/* Bookmark */}
        <path d="M68 8 L68 26 L64 23 L60 26 L60 8 Z" fill="var(--accent)" opacity="0.55"/>
        {/* Floating dot sparkles */}
        <circle cx="22" cy="6" r="2" fill="var(--accent)" opacity="0.7">
          <animate attributeName="cy" values="6;2;6" dur="1.8s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.7;0.15;0.7" dur="1.8s" repeatCount="indefinite"/>
        </circle>
        <circle cx="54" cy="4" r="1.5" fill="var(--accent)" opacity="0.5">
          <animate attributeName="cy" values="4;0;4" dur="2.3s" begin="0.5s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2.3s" begin="0.5s" repeatCount="indefinite"/>
        </circle>
        <circle cx="36" cy="56" r="1.5" fill="var(--accent)" opacity="0.4">
          <animate attributeName="cy" values="56;60;56" dur="1.9s" begin="1s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.4;0.08;0.4" dur="1.9s" begin="1s" repeatCount="indefinite"/>
        </circle>
      </svg>

      {/* Dual-ring spinner */}
      <div className="bkl-rings" aria-label="Loading">
        <div className="bkl-ring bkl-ring--outer"/>
        <div className="bkl-ring bkl-ring--inner"/>
        <div className="bkl-ring-dot"/>
      </div>

      {/* Rotating text */}
      <p className={`bkl-rotating-text ${visible ? 'bkl-text--in' : 'bkl-text--out'}`}>
        {text}
      </p>

      {/* Progress */}
      <div className="bkl-progress-wrap">
        <div className="bkl-progress-track">
          <div className="bkl-progress-bar" style={{ width: `${progress}%` }}/>
        </div>
        <span className="bkl-elapsed">{secs}s</span>
      </div>

      {/* Dots pulse indicator */}
      <div className="bkl-dots">
        <span/><span/><span/>
      </div>
    </div>
  );
}

const SPINNER_CSS = [
  /* Fullscreen centering */
  '.bkl-fullscreen{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.4rem;background:var(--bg);padding:2rem;}',

  /* Book SVG */
  '.bkl-book-svg{width:80px;height:60px;filter:drop-shadow(0 4px 14px color-mix(in srgb,var(--accent) 20%,transparent));}',

  /* Dual-ring spinner */
  '.bkl-rings{position:relative;width:56px;height:56px;flex-shrink:0;}',
  '.bkl-ring{position:absolute;inset:0;border-radius:50%;border:3px solid transparent;}',
  '.bkl-ring--outer{border-top-color:var(--accent);animation:bklSpin 1s linear infinite;}',
  '.bkl-ring--inner{inset:8px;border-right-color:color-mix(in srgb,var(--accent) 45%,transparent);animation:bklSpin 0.7s linear infinite reverse;}',
  '.bkl-ring-dot{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:var(--accent);animation:bklPulse 1s ease-in-out infinite;}',
  '@keyframes bklSpin{to{transform:rotate(360deg)}}',
  '@keyframes bklPulse{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:1}50%{transform:translate(-50%,-50%) scale(0.5);opacity:0.4}}',

  /* Rotating quote text */
  '.bkl-rotating-text{max-width:340px;text-align:center;font-family:var(--font-serif),Georgia,serif;font-size:.92rem;line-height:1.7;color:var(--muted);font-style:italic;transition:opacity .35s ease,transform .35s ease;min-height:3.4em;display:flex;align-items:center;justify-content:center;}',
  '.bkl-text--in{opacity:1;transform:translateY(0);}',
  '.bkl-text--out{opacity:0;transform:translateY(6px);}',

  /* Progress bar */
  '.bkl-progress-wrap{display:flex;align-items:center;gap:.7rem;width:220px;}',
  '.bkl-progress-track{flex:1;height:3px;background:var(--border);border-radius:2px;overflow:hidden;}',
  '.bkl-progress-bar{height:100%;background:var(--accent);border-radius:2px;transition:width .4s ease;}',
  '.bkl-elapsed{font-size:.68rem;color:color-mix(in srgb,var(--muted) 60%,transparent);font-variant-numeric:tabular-nums;white-space:nowrap;width:2.8rem;text-align:right;}',

  /* Three bouncing dots */
  '.bkl-dots{display:flex;gap:.4rem;}',
  '.bkl-dots span{width:6px;height:6px;border-radius:50%;background:var(--accent);opacity:.3;animation:bklBounce .9s ease-in-out infinite;}',
  '.bkl-dots span:nth-child(2){animation-delay:.18s;}',
  '.bkl-dots span:nth-child(3){animation-delay:.36s;}',
  '@keyframes bklBounce{0%,60%,100%{transform:translateY(0);opacity:.3}30%{transform:translateY(-7px);opacity:1}}',

  /* Mobile: tighten spacing */
  '@media(max-width:480px){.bkl-rotating-text{font-size:.84rem;max-width:88vw;}.bkl-progress-wrap{width:80vw;}}',
].join('');


const SKELETON_CSS = [
  '.bk-skeleton-header { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }',
  '.bk-skeleton-cover { width: 160px; height: 210px; border-radius: 6px; flex-shrink: 0; }',
  '.bk-skeleton-meta { flex: 1; min-width: 200px; padding-top: 0.5rem; }',
  '.bk-skeleton-heading { padding: 1rem 0; border-bottom: 1px solid var(--border); }',
  '@media(max-width:480px){ .bk-skeleton-cover{width:110px;height:145px;} }',
].join(' ');

export default function BookPage() {
  const { slug } = useParams();
  const { isAdmin } = useAdmin();
  const { bookmarks } = usePrefs();
  const [book, setBook] = useState<Book | null>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [headingCatMap, setHeadingCatMap] = useState<Record<string, string[]>>({}); // headingId → category names
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<PanelState>(null);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sm_book_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [currentHeadingId, setCurrentHeadingId] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('page');
  const [hScale, setHScaleState] = useState<HScale>(readHScale);
  const scrollTargetRef = useRef<string | null>(null);
  useTrackView('book', book?.id ?? null);

  const setHScale = (v: HScale) => {
    setHScaleState(v);
    saveHScale(v);
  };

  const toggleSidebar = () => {
    const isMobile = window.matchMedia('(max-width: 860px)').matches;
    if (isMobile) setSidebarMobileOpen((v) => !v);
    else {
      setSidebarCollapsed((v) => {
        const next = !v;
        try { localStorage.setItem('sm_book_sidebar_collapsed', next ? '1' : '0'); } catch {}
        return next;
      });
    }
  };

  // Build heading->categories map once categories loaded
  const buildCatMap = useCallback(async (headingIds: string[], cats: Category[]) => {
    const catById = Object.fromEntries(cats.map((c) => [c.id, c.name]));
    const entries = await Promise.all(
      headingIds.map(async (hid) => {
        const catIds = await import('../lib/supabase').then((m) => m.listCategoriesForHeading(hid));
        return [hid, catIds.map((id) => catById[id]).filter(Boolean)] as [string, string[]];
      })
    );
    setHeadingCatMap(Object.fromEntries(entries));
  }, []);

  const load = async () => {
    if (!slug) return;
    setLoading(true);
    const b = await getBookBySlug(slug);
    setBook(b);
    if (b) {
      const [hs, cats] = await Promise.all([
        listHeadings(b.id),
        listCategories({ includeHidden: true }),
      ]);
      setHeadings(hs);
      setAllCategories(cats);
      setOpenMap((prev) => {
        const next = { ...prev };
        hs.forEach((h) => { if (!(h.id in next)) next[h.id] = true; });
        return next;
      });
      buildCatMap(hs.map((h) => h.id), cats);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [slug]);

  // Deep-link scroll
  useEffect(() => {
    if (loading || !window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    setTimeout(() => jumpTo(id), 150);
  }, [loading, headings]);

  // Restore last heading position (localStorage memory)
  useEffect(() => {
    if (loading || !slug || window.location.hash) return;
    try {
      const lastId = localStorage.getItem(`sm_last_h_${slug}`);
      if (lastId && headings.some(h => h.id === lastId)) {
        setTimeout(() => {
          const el = document.getElementById(lastId);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
      }
    } catch {}
  }, [loading, headings, slug]);

  // E keyboard shortcut removed (interferes with typing)

  // Live scroll sync: detect which heading is in view + save to localStorage
  useEffect(() => {
    if (loading || !slug) return;
    const handler = () => {
      const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height') || '58', 10);
      let found: string | null = null;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= navH + 40) found = h.id;
        else break;
      }
      setCurrentHeadingId(found);
      if (found) {
        try { localStorage.setItem(`sm_last_h_${slug}`, found); } catch {}
      }
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [loading, headings, slug]);

  const jumpTo = (id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: true }));
    setSidebarMobileOpen(false);
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('deep-link-highlight');
        setTimeout(() => el.classList.remove('deep-link-highlight'), 2200);
      }
    });
  };

  // After new heading saved: auto-scroll to it
  const handleHeadingSaved = async (newId?: string) => {
    setPanel(null);
    await load();
    if (newId) {
      setTimeout(() => jumpTo(newId), 300);
    }
  };

  const nextSortOrder = useMemo(
    () => (headings.length ? Math.max(...headings.map((h) => h.sort_order)) + 1 : 0),
    [headings]
  );

  // Sorted headings for display
  const sortedHeadings = useMemo(() => {
    if (sortMode === 'importance') {
      return [...headings].sort((a, b) => (b.importance_level || 0) - (a.importance_level || 0));
    }
    if (sortMode === 'featured') {
      return headings.filter((h) => bookmarks.includes(h.id));
    }
    // page order (default)
    return headings;
  }, [headings, sortMode, bookmarks]);

  // Book description handling
  const descText = book?.description ? docToPlainText(book.description) : '';
  const descLong = descText.length > 250;

  const carouselImages = book?.detail_image_urls || [];

  if (loading) return <BookPageSkeleton />;
  if (!book) return <div className="page"><p>Book not found.</p></div>;

  return (
    <ImageLightboxProvider>
      <div className="page book-page" data-hscale={hScale}>
        <style>{BOOK_PAGE_CSS}</style>
        <FloatingScrollBtns />

        {/* Print-only cover */}
        <div className="print-only print-cover-page">
          {book.cover_image_url && <img src={book.cover_image_url} alt="" />}
          <h1>{book.title}</h1>
          {book.author && <p>{book.author}</p>}
        </div>

        {/* Book header */}
        <div className="book-header no-print-chrome">
          <div className="book-header__left">
            {book.cover_image_url && <img className="book-cover" src={book.cover_image_url} alt={book.title} />}
          </div>

          <div className="book-meta">
            <h1>{book.title}</h1>
            {book.author && <p className="meta-line">Author: {book.author}</p>}
            {book.publisher && <p className="meta-line">Publisher: {book.publisher}</p>}
            {book.base_language && <p className="meta-line">Language: {book.base_language}</p>}
            <SourceLinks links={book.source_links || []} />
          </div>

          {/* Right side: detail images */}
          {carouselImages.length > 0 && (
            <div className="book-header__right no-print">
              <RightImagePanel images={carouselImages} />
            </div>
          )}
        </div>

        {/* Description */}
        {book.description && (
          <div className="book-description no-print">
            <div className={descExpanded || !descLong ? '' : 'book-desc-clipped'}>
              <RichTextView doc={book.description} />
            </div>
            {descLong && (
              <button className="link-btn read-more-btn" onClick={() => setDescExpanded((v) => !v)}>
                {descExpanded ? 'Read less ↑' : 'Read more ↓'}
              </button>
            )}
          </div>
        )}

        {/* Book layout */}
        <div className={`book-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${sidebarMobileOpen ? 'sidebar-mobile-open' : ''} no-print`}>
          <BookSidebar
            headings={headings}
            currentId={currentHeadingId}
            onJump={jumpTo}
            onCollapseAll={() => setOpenMap(Object.fromEntries(headings.map((h) => [h.id, false])))}
            onExpandAll={() => setOpenMap(Object.fromEntries(headings.map((h) => [h.id, true])))}
            mobileOpen={sidebarMobileOpen}
            onCloseMobile={() => { setSidebarMobileOpen(false); if (!window.matchMedia('(max-width: 860px)').matches) setSidebarCollapsed(true); }}
            bookmarks={bookmarks}
            categories={allCategories}
          />

          <div className="book-main">
            {/* Toolbar row */}
            <div className="book-toolbar icon-row no-print">
              <button className="icon-btn" onClick={toggleSidebar} title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}>
                <PanelLeft size={16} />
                <span className="book-sidebar-toggle-label">Findings</span>
              </button>

              {/* Sort tabs */}
              <div className="book-sort-tabs" role="tablist">
                {([
                  { id: 'page', label: 'Page order' },
                  { id: 'importance', label: 'Importance' },
                  { id: 'featured', label: 'Bookmarked' },
                ] as { id: SortMode; label: string }[]).map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={sortMode === tab.id}
                    className={`book-sort-tab ${sortMode === tab.id ? 'book-sort-tab--active' : ''}`}
                    onClick={() => setSortMode(tab.id)}
                  >
                    {tab.label}
                    {tab.id === 'featured' && bookmarks.length > 0 && (
                      <span className="book-sort-badge">{bookmarks.filter((id) => headings.some((h) => h.id === id)).length}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* H-scale and text controls */}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <HScaleControls hScale={hScale} onChange={setHScale} />
              </div>
            </div>

            {/* Admin: add heading button at top */}
            {isAdmin && !panel && (
              <div className="admin-add-top no-print">
                <button className="primary icon-row" onClick={() => setPanel({ mode: 'add' })}>
                  <Plus size={15} /> New heading
                </button>
              </div>
            )}

            <div className={`split-view wide-detail ${panel ? 'has-detail' : ''}`}>
              <div className="split-list reading-column">
                {/* Headings */}
                <div className="headings-list">
                  {sortedHeadings.length === 0 && sortMode === 'featured' && (
                    <p className="muted" style={{ marginTop: '1rem' }}>
                      No bookmarks on this book yet. Use the Bookmark button on any heading.
                    </p>
                  )}
                  {sortedHeadings.map((h) => (
                    <HeadingBlock
                      key={h.id}
                      heading={h}
                      book={book}
                      open={openMap[h.id] ?? true}
                      panelOpen={panel?.mode === 'edit' && panel.heading.id === h.id}
                      headingCategories={headingCatMap[h.id] || []}
                      onToggleOpen={() => setOpenMap((prev) => ({ ...prev, [h.id]: !prev[h.id] }))}
                      onChanged={() => { setPanel(null); load(); }}
                      onEditRequest={(heading) => setPanel({ mode: 'edit', heading })}
                      hScale={hScale}
                    />
                  ))}
                </div>

                {/* Admin: add button at bottom too */}
                {isAdmin && !panel && (
                  <button className="primary add-heading-btn no-print icon-row" onClick={() => setPanel({ mode: 'add' })}>
                    <Plus size={16} /> New heading
                  </button>
                )}
              </div>

              {panel && (
                <HeadingEditorPanel
                  book={book}
                  panel={panel}
                  nextSortOrder={nextSortOrder}
                  onClose={() => setPanel(null)}
                  onSaved={handleHeadingSaved}
                />
              )}
            </div>
          </div>
        </div>

        {/* Print citation */}
        <div className="print-only print-citation-page">
          <h2>Source</h2>
          <p>Printed from Sirājan Munīrā — {typeof window !== 'undefined' ? window.location.href : ''}</p>
          {book.source_links?.map((l, i) => <p key={i}>{l.label}: {l.url}</p>)}
        </div>
      </div>
    </ImageLightboxProvider>
  );
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const BOOK_PAGE_CSS = `
/* ── Collection badges on headings ─── */
.heading-cat-badges {
  display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.4rem;
}
.heading-cat-badge {
  font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
  padding: 0.15rem 0.5rem; border-radius: 20px;
  background: color-mix(in srgb, var(--accent) 12%, var(--bg));
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
}

/* ── Importance stars ─────────────── */
.heading-importance-display {
  display: flex; align-items: center; gap: 1px; margin-bottom: 0.2rem;
}
.heading-star { color: #d4a017; }
.heading-block--bookmarked { border-left: 2px solid #b8860b; padding-left: 0.7rem; }

/* ── Three-dot menu ───────────────── */
.hdg-threedot { position: relative; display: inline-block; }
.hdg-threedot__btn {
  width: 24px; height: 24px; border-radius: 4px;
  display: grid; place-items: center; color: var(--muted);
  transition: background 0.12s, color 0.12s;
}
.hdg-threedot__btn:hover { background: var(--surface); color: var(--accent); }
.hdg-threedot__menu {
  position: absolute; left: 0; top: 110%; z-index: 120;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.14);
  min-width: 200px; overflow: hidden;
  animation: menuFadeIn 0.12s ease;
}
.hdg-threedot__menu button {
  display: flex; align-items: center; gap: 0.5rem;
  width: 100%; padding: 0.55rem 0.8rem;
  font-size: 0.82rem; color: var(--fg);
  border-bottom: 1px solid var(--border); text-align: left;
  transition: background 0.1s, color 0.1s;
}
.hdg-threedot__menu button:last-child { border-bottom: none; }
.hdg-threedot__menu button:hover { background: color-mix(in srgb, var(--accent) 7%, var(--bg)); color: var(--accent); }
.hdg-threedot__panel { padding: 0.7rem 0.8rem; }

/* ── Importance picker ─────────────── */
.importance-picker { }
.importance-picker__label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 0.5rem; }
.importance-picker__stars { display: flex; align-items: center; gap: 0.2rem; }
.importance-star { color: #d4a017; transition: transform 0.12s; }
.importance-star:hover { transform: scale(1.2); }
.importance-star--filled { color: #d4a017; }
.importance-clear { font-size: 0.72rem; color: var(--muted); border-bottom: 1px solid var(--border); margin-left: 0.5rem; }

/* ── H-scale controls ─────────────── */
.hscale-control { position: relative; display: inline-block; }
.hscale-control__btn { position: relative; }
.hscale-indicator {
  position: absolute; top: -2px; right: -2px; width: 6px; height: 6px;
  border-radius: 50%; background: var(--accent);
}
.hscale-control__menu {
  position: absolute; right: 0; top: 110%; z-index: 120;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.14);
  min-width: 200px; overflow: hidden;
  animation: menuFadeIn 0.12s ease;
}
.hscale-control__label {
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--muted); padding: 0.5rem 0.8rem 0.2rem;
}
.hscale-option {
  display: flex; flex-direction: column; gap: 0.1rem;
  width: 100%; padding: 0.5rem 0.8rem;
  text-align: left; border-bottom: 1px solid var(--border);
  transition: background 0.1s;
}
.hscale-option:last-child { border-bottom: none; }
.hscale-option:hover { background: color-mix(in srgb, var(--accent) 7%, var(--bg)); }
.hscale-option--active { background: color-mix(in srgb, var(--accent) 10%, var(--bg)); }
.hscale-option__label { font-size: 0.84rem; font-weight: 600; color: var(--fg); }
.hscale-option__desc { font-size: 0.72rem; color: var(--muted); }

/* ── H-scale application ──────────── */
[data-hscale="h1-as-h2"] .rt-content h1 { font-size: 1.35rem; }
[data-hscale="reduced"] .rt-content h1 { font-size: 1.5rem; }
[data-hscale="reduced"] .rt-content h2 { font-size: 1.2rem; }

/* ── Sort tabs ────────────────────── */
.book-toolbar {
  display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
  margin-bottom: 0.8rem; padding-bottom: 0.6rem; border-bottom: 1px solid var(--border);
}
.book-sort-tabs { display: flex; gap: 0.2rem; }
.book-sort-tab {
  padding: 0.35rem 0.75rem; font-size: 0.78rem;
  border: 1px solid var(--border); border-radius: 20px;
  color: var(--muted); background: transparent;
  display: flex; align-items: center; gap: 0.3rem;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.book-sort-tab:hover { border-color: var(--accent); color: var(--accent); }
.book-sort-tab--active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--bg)); font-weight: 600; }
.book-sort-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 16px; border-radius: 8px;
  background: var(--accent); color: #fff; font-size: 0.65rem; font-weight: 700;
  padding: 0 4px;
}

/* ── Sidebar improvements ─────────── */
.sidebar-collapse-btn { color: var(--muted); }
.sidebar-collapse-btn:hover { color: var(--accent); }
.book-sidebar-head-actions { display: flex; gap: 0.3rem; }
.sidebar-item--bookmarked button {
  color: #b8860b !important;
  display: flex; align-items: center; gap: 0.3rem;
}
.sidebar-item--current button {
  color: var(--accent) !important;
  font-weight: 700;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  padding: 0.5rem 0.25rem;
  border-radius: 4px;
  transition: background 0.3s ease;
}
.sidebar-filter-active { color: var(--accent) !important; }
.book-sidebar-actions { display: flex; gap: 0.5rem; font-size: 0.72rem; margin-bottom: 0.5rem; flex-wrap: wrap; align-items: center; }
.book-sidebar-actions .link-btn { display: flex; align-items: center; gap: 0.2rem; }

/* ── Floating scroll buttons ─────── */
.floating-scroll-btns {
  position: fixed; bottom: 1.5rem; right: 1.2rem; z-index: 200;
  display: flex; flex-direction: column; gap: 0.4rem;
}
.floating-scroll-btn {
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--surface); border: 1px solid var(--border);
  display: grid; place-items: center; color: var(--fg);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;
  animation: fadeInUp 0.2s ease;
}
.floating-scroll-btn:hover { border-color: var(--accent); color: var(--accent); box-shadow: 0 4px 16px rgba(0,0,0,0.22); }
@keyframes fadeInUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }

/* ── Right image panel ────────────── */
.book-header__right { flex-shrink: 0; width: 200px; }
.book-right-images { }
.book-right-images__track { position: relative; height: 220px; overflow: hidden; border-radius: 8px; }
.book-right-images__slide {
  position: absolute; inset: 0;
  transition: transform 0.45s cubic-bezier(.4,0,.2,1), opacity 0.45s;
  opacity: 0; pointer-events: none; transform: translateX(100%);
}
.book-right-images__slide--active { opacity: 1; pointer-events: auto; transform: translateX(0); }
.book-right-images__slide--prev { transform: translateX(-100%); }
.book-right-images__slide--next { transform: translateX(100%); }
.book-right-images__img-btn { padding: 0; display: block; width: 100%; height: 100%; cursor: zoom-in; }
.book-right-images__img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 8px; }
.book-right-images__nav { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 0.4rem; }
.book-right-images__count { font-size: 0.72rem; color: var(--muted); }

@media(max-width:860px) {
  .book-header { flex-direction: column; }
  .book-header__right { width: 100%; }
  .book-right-images__track { height: 180px; }
}

/* ── Book header layout ───────────── */
.book-header { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.2rem; align-items: flex-start; }
.book-header__left { flex-shrink: 0; }
.book-meta { flex: 1; min-width: 200px; }

/* ── Description clipping ─────────── */
.book-desc-clipped { position: relative; max-height: 5.5em; overflow: hidden; }
.book-desc-clipped::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2.5em;
  background: linear-gradient(transparent, var(--bg));
}

/* ── Admin shortcuts ──────────────── */
.admin-add-top {
  display: flex; align-items: center; gap: 1rem;
  margin-bottom: 0.8rem; padding: 0.6rem 0; border-bottom: 1px dashed var(--border);
}
.admin-shortcut-hint { font-size: 0.76rem; }
.admin-shortcut-hint kbd {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
  padding: 0.1rem 0.35rem; font-size: 0.72rem; font-family: monospace;
}

/* ── Book main layout ─────────────── */
.book-main { display: flex; flex-direction: column; min-width: 0; }
`;