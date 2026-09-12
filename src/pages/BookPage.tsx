import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Link2, Bookmark, Copy, Pencil, FolderPlus, Trash2, Check, ChevronDown, ChevronRight,
  Plus, PanelLeft, X, ListTree,
} from 'lucide-react';
import {
  Book,
  Category,
  Heading,
  addHeadingToCategory,
  createHeading,
  deleteHeading,
  getBookBySlug,
  listCategories,
  listCategoriesForHeading,
  listHeadings,
  removeHeadingFromCategory,
  updateHeading,
  trackEvent,
} from '../lib/supabase';
import { useAdmin, usePrefs, useTrackView } from '../lib/context';
import {
  RichTextView, docToMarkdown, docToPlainText, firstLineOf, ImageLightboxProvider, useImageLightbox,
  copyToClipboard, ImageCarousel,
} from '../lib/richtext';
import { RichEditor } from '../components/Editor';

const LONG_CONTENT_THRESHOLD = 500;

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

function CategoryAssign({ heading, onClose }: { heading: Heading; onClose: () => void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);

  useEffect(() => {
    listCategories().then(setCats);
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
        {cats.length === 0 && <p className="muted">No collections yet — create one from the Collections page.</p>}
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

type PanelState = { mode: 'add' } | { mode: 'edit'; heading: Heading } | null;

function HeadingBlock({
  heading, book, open, panelOpen, onToggleOpen, onChanged, onEditRequest,
}: {
  heading: Heading; book: Book; open: boolean; panelOpen: boolean;
  onToggleOpen: () => void; onChanged: () => void; onEditRequest: (h: Heading) => void;
}) {
  const { isAdmin } = useAdmin();
  const { toggleBookmark, isBookmarked, copySettings } = usePrefs();
  const [readMore, setReadMore] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [copied, setCopied] = useState(false);

  const plain = useMemo(() => docToPlainText(heading.content), [heading.content]);
  const isLong = plain.length > LONG_CONTENT_THRESHOLD;
  const permalink = `${window.location.origin}/book/${book.slug}#${heading.id}`;

  const copyUrl = async () => {
    const ok = await copyToClipboard(permalink);
    if (!ok) window.prompt('Copy this link:', permalink);
    else { setCopied(true); setTimeout(() => setCopied(false), 1500); }
    trackEvent('interact', 'heading', heading.id);
  };

  const copyContent = async () => {
    const externalSource = book.source_links?.[0]?.url;
    const parts: Record<string, string> = {
      content: docToMarkdown(heading.content),
      title: copySettings.includeBookTitle ? `— ${book.title}` : '',
      page: copySettings.includePageNumber && heading.page_number ? `Page ${heading.page_number}` : '',
      source: copySettings.includeSourceLink ? (externalSource || permalink) : '',
    };
    const text = copySettings.order.map((k) => parts[k]).filter(Boolean).join('\n');
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
    <div id={heading.id} className="heading-block">
      <div className={`heading-controls no-print ${panelOpen ? 'pinned' : ''}`}>
        <button className="heading-collapse-toggle" title={open ? 'Collapse' : 'Expand'} onClick={onToggleOpen}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <button title="Copy link to this finding" onClick={copyUrl}>{copied ? <Check size={15} /> : <Link2 size={15} />} {copied ? 'Copied' : 'Link'}</button>
        <button className={`icon-bookmark ${isBookmarked(heading.id) ? 'active' : ''}`} title="Bookmark" onClick={() => toggleBookmark(heading.id)}>
          <Bookmark size={15} fill={isBookmarked(heading.id) ? 'currentColor' : 'none'} /> {isBookmarked(heading.id) ? 'Saved' : 'Bookmark'}
        </button>
        <button title="Copy content + citation" onClick={copyContent}><Copy size={15} /> Copy</button>
        {isAdmin && (
          <>
            <button onClick={() => onEditRequest(heading)}><Pencil size={15} /> Edit</button>
            <button onClick={() => setAssigning(true)}><FolderPlus size={15} /> Collection</button>
            <button className="danger" onClick={remove}><Trash2 size={15} /> Delete</button>
          </>
        )}
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

function HeadingEditorPanel({ book, panel, nextSortOrder, onClose, onSaved }: {
  book: Book; panel: PanelState; nextSortOrder: number; onClose: () => void; onSaved: () => void;
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
      } else {
        await createHeading({ book_id: book.id, level, content, page_number: pageNumber || null, sort_order: nextSortOrder });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="split-detail">
      <button className="link-btn detail-close" onClick={onClose}>← Close</button>
      <h3>{isEdit ? 'Edit heading' : 'New heading'}</h3>
      {!isEdit && (
        <label>
          Level
          <select value={level} onChange={(e) => setLevel(Number(e.target.value) as 1 | 2 | 3 | 4)}>
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
            <option value={4}>H4</option>
          </select>
        </label>
      )}
      <label>
        Page number
        <input value={pageNumber} onChange={(e) => setPageNumber(e.target.value)} placeholder="e.g. 12 or 100-104" />
      </label>
      <RichEditor content={content} onChange={setContent} imagePathPrefix={isEdit ? `headings/${panel!.heading.id}` : `headings/new-${book.id}`} autosaveKey={isEdit ? panel!.heading.id : undefined} />
      <div className="modal-actions">
        <button className="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add heading'}</button>
        <button className="secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function BookSidebar({ headings, onJump, onCollapseAll, onExpandAll, mobileOpen, onCloseMobile }: {
  headings: Heading[]; onJump: (id: string) => void; onCollapseAll: () => void; onExpandAll: () => void;
  mobileOpen: boolean; onCloseMobile: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? headings.filter((h) => docToPlainText(h.content).toLowerCase().includes(query.trim().toLowerCase()))
    : headings;

  return (
    <>
      {mobileOpen && <div className="book-sidebar-backdrop" onClick={onCloseMobile} />}
      <aside className="book-sidebar">
        <div className="book-sidebar-head">
          <strong className="icon-row"><ListTree size={15} /> Findings</strong>
          <button className="icon-btn" onClick={onCloseMobile}><X size={16} /></button>
        </div>
        <div className="book-sidebar-search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search headings…" />
          {query && <button className="link-btn" onClick={() => setQuery('')}>Clear</button>}
        </div>
        <div className="book-sidebar-actions">
          <button className="link-btn" onClick={onExpandAll}>Expand all</button>
          <button className="link-btn" onClick={onCollapseAll}>Collapse all</button>
        </div>
        <ul className="book-sidebar-list">
          {filtered.map((h) => (
            <li key={h.id}>
              <button onClick={() => onJump(h.id)}>{firstLineOf(h.content, 70) || 'Untitled'}</button>
            </li>
          ))}
          {filtered.length === 0 && <li className="muted" style={{ padding: '0.5rem 0' }}>No matches.</li>}
        </ul>
      </aside>
    </>
  );
}

export default function BookPage() {
  const { slug } = useParams();
  const { isAdmin } = useAdmin();
  const [book, setBook] = useState<Book | null>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<PanelState>(null);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sm_book_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  // Single toggle button drives both behaviours: on narrow screens it opens
  // the mobile overlay; on desktop it collapses/expands the inline sidebar.
  // Deciding this in JS (rather than showing two separate buttons and
  // hiding one of them with CSS) means there's exactly one control and it
  // always does the right thing for the current screen size.
  const toggleSidebar = () => {
    const isMobile = window.matchMedia('(max-width: 860px)').matches;
    if (isMobile) {
      setSidebarMobileOpen((v) => !v);
    } else {
      setSidebarCollapsed((v) => {
        const next = !v;
        try { localStorage.setItem('sm_book_sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
        return next;
      });
    }
  };
  useTrackView('book', book?.id ?? null);

  const load = async () => {
    if (!slug) return;
    setLoading(true);
    const b = await getBookBySlug(slug);
    setBook(b);
    if (b) {
      const hs = await listHeadings(b.id);
      setHeadings(hs);
      setOpenMap((prev) => {
        const next = { ...prev };
        hs.forEach((h) => { if (!(h.id in next)) next[h.id] = true; });
        return next;
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // FR-14: deep-link scroll + temporary highlight
  useEffect(() => {
    if (loading || !window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    setTimeout(() => jumpTo(id), 150);
  }, [loading, headings]);

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

  const nextSortOrder = useMemo(() => (headings.length ? Math.max(...headings.map((h) => h.sort_order)) + 1 : 0), [headings]);

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (!book) return <div className="page"><p>Book not found.</p></div>;

  const carouselImages = book.detail_image_urls || [];

  return (
    <ImageLightboxProvider>
      <div className="page book-page">
        {/* Print-only cover page (FR-37) */}
        <div className="print-only print-cover-page">
          {book.cover_image_url && <img src={book.cover_image_url} alt="" />}
          <h1>{book.title}</h1>
          {book.author && <p>{book.author}</p>}
          {book.publisher && <p>{book.publisher}</p>}
        </div>

        <div className="book-header no-print-chrome">
          {book.cover_image_url && <img className="book-cover" src={book.cover_image_url} alt={book.title} />}
          <div className="book-meta">
            <h1>{book.title}</h1>
            {book.author && <p className="meta-line">Author: {book.author}</p>}
            {book.publisher && <p className="meta-line">Publisher: {book.publisher}</p>}
            {book.base_language && <p className="meta-line">Language: {book.base_language}</p>}
            <SourceLinks links={book.source_links || []} />
            {carouselImages.length > 0 && (
              <div className="no-print" style={{ marginTop: '0.7rem', maxWidth: 340 }}>
                <ImageCarouselWrapper images={carouselImages} />
              </div>
            )}
          </div>
        </div>

        <div className={`book-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${sidebarMobileOpen ? 'sidebar-mobile-open' : ''} no-print`}>
          <BookSidebar
            headings={headings}
            onJump={jumpTo}
            onCollapseAll={() => setOpenMap(Object.fromEntries(headings.map((h) => [h.id, false])))}
            onExpandAll={() => setOpenMap(Object.fromEntries(headings.map((h) => [h.id, true])))}
            mobileOpen={sidebarMobileOpen}
            onCloseMobile={() => setSidebarMobileOpen(false)}
          />

          <div>
            <div className="icon-row" style={{ marginBottom: '0.6rem' }}>
              <button
                className="icon-btn"
                onClick={toggleSidebar}
                title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
              >
                <PanelLeft size={16} />
                <span className="book-sidebar-toggle-label">Findings list</span>
              </button>
            </div>

            <div className={`split-view wide-detail ${panel ? 'has-detail' : ''}`}>
              <div className="split-list reading-column">
                {book.description && (
                  <div className="book-description">
                    <RichTextView doc={book.description} />
                  </div>
                )}

                <div className="headings-list">
                  {headings.map((h) => (
                    <HeadingBlock
                      key={h.id}
                      heading={h}
                      book={book}
                      open={openMap[h.id] ?? true}
                      panelOpen={panel?.mode === 'edit' && panel.heading.id === h.id}
                      onToggleOpen={() => setOpenMap((prev) => ({ ...prev, [h.id]: !prev[h.id] }))}
                      onChanged={load}
                      onEditRequest={(heading) => setPanel({ mode: 'edit', heading })}
                    />
                  ))}
                </div>

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
                  onSaved={() => { setPanel(null); load(); }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Print-only citation/traceback page (FR-37) */}
        <div className="print-only print-citation-page">
          <h2>Source</h2>
          <p>Printed from Sirājan Munīrā — {typeof window !== 'undefined' ? window.location.href : ''}</p>
          {book.source_links?.map((l, i) => <p key={i}>{l.label}: {l.url}</p>)}
        </div>
      </div>
    </ImageLightboxProvider>
  );
}

function ImageCarouselWrapper({ images }: { images: string[] }) {
  const openLightbox = useImageLightbox();
  return <ImageCarousel images={images} onImageClick={openLightbox} />;
}