import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Eye, EyeOff, Trash2, Plus, Star, ChevronRight, Loader2, BookOpen } from 'lucide-react';
import {
  Book, BookStats, createBook, deleteBook, getBookStatsMany, listBooksPage,
  replaceSourceLinks, updateBook, uploadImage,
} from '../lib/supabase';
import { useAdmin, useTrackView } from '../lib/context';
import { RichEditor } from '../components/Editor';
import { docToPlainText } from '../lib/richtext';
import { BookExportMenu } from '../lib/bookExport';

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const FEATURED_LIMIT = 24;         // featured sets are small; all are shown
const PAGE_SIZE = 18;

function fmtDate(d?: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function plural(n: number, one: string, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }

// ---------------------------------------------------------------------------
// Book form (admin) — unchanged behaviour, inline errors instead of alerts
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
  initial: Book | null; onSave: () => void; onCancel: () => void;
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
          source_links: (initial.source_links || []).map((l) => ({ label: l.label, url: l.url })),
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'cover' | 'detail' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File, kind: 'cover' | 'detail') => {
    setUploading(kind); setError(null);
    try {
      const url = await uploadImage(file, kind === 'cover' ? 'covers' : 'book-details');
      setForm((f) => kind === 'cover' ? { ...f, cover_image_url: url } : { ...f, detail_image_urls: [...f.detail_image_urls, url] });
    } catch (e: any) {
      setError(`Image upload failed: ${e?.message || 'unknown error'}`);
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError(null);
    try {
      const { source_links, ...bookFields } = form;
      let bookId = initial?.id;
      if (initial) await updateBook(initial.id, bookFields);
      else bookId = (await createBook(bookFields)).id;
      if (bookId) await replaceSourceLinks(bookId, source_links.filter((l) => l.label && l.url));
      onSave();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setLink = (i: number, patch: Partial<{ label: string; url: string }>) => {
    const arr = [...form.source_links]; arr[i] = { ...arr[i], ...patch }; setForm({ ...form, source_links: arr });
  };

  return (
    <div className="split-detail book-form">
      <button className="link-btn detail-close" onClick={onCancel}>← Close</button>
      <h3>{initial ? 'Edit book' : 'New book'}</h3>
      <label>Cover image <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'cover')} /></label>
      {uploading === 'cover' && <p className="muted"><Loader2 size={12} className="spin" /> Uploading…</p>}
      {form.cover_image_url && <img src={form.cover_image_url} alt="Cover preview" className="cover-preview" />}
      <label>Title * <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
      <label>Author <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></label>
      <label>Publisher <input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} /></label>
      <label>Language <input value={form.base_language} onChange={(e) => setForm({ ...form, base_language: e.target.value })} placeholder="Bangla / English / …" /></label>
      <label>Detail images <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'detail')} /></label>
      {uploading === 'detail' && <p className="muted"><Loader2 size={12} className="spin" /> Uploading…</p>}
      <div className="detail-thumbs">
        {form.detail_image_urls.map((u, i) => (
          <div key={i} className="thumb">
            <img src={u} alt="" />
            <button aria-label="Remove image" onClick={() => setForm((f) => ({ ...f, detail_image_urls: f.detail_image_urls.filter((_, j) => j !== i) }))}>✕</button>
          </div>
        ))}
      </div>
      <label>Description</label>
      <RichEditor content={form.description} onChange={(doc) => setForm({ ...form, description: doc })} placeholder="Write a description…" imagePathPrefix="book-description" />
      <label>Source links</label>
      {form.source_links.map((l, i) => (
        <div key={i} className="source-link-row">
          <input placeholder="Label" aria-label="Link label" value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} />
          <input placeholder="https://…" aria-label="Link URL" value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} />
          <button aria-label="Remove link" onClick={() => setForm({ ...form, source_links: form.source_links.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button className="secondary" onClick={() => setForm({ ...form, source_links: [...form.source_links, { label: '', url: '' }] })}>+ Add source link</button>
      <label className="check"><input type="checkbox" checked={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.checked })} /> Visible to guests</label>
      <label className="check"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> Featured</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="primary" disabled={saving || !!uploading} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin actions (shared by both card types)
// ---------------------------------------------------------------------------

interface AdminHandlers {
  onEdit: (b: Book) => void; onToggleFeatured: (b: Book) => void;
  onToggleVisibility: (b: Book) => void; onDelete: (b: Book) => void;
}

function AdminActions({ book, h }: { book: Book; h: AdminHandlers }) {
  return (
    <div className="bs-admin" aria-label="Admin actions">
      <button onClick={() => h.onEdit(book)}><Pencil size={12} /> Edit</button>
      <button onClick={() => h.onToggleFeatured(book)}><Star size={12} fill={book.featured ? 'currentColor' : 'none'} /> {book.featured ? 'Unfeature' : 'Feature'}</button>
      <button onClick={() => h.onToggleVisibility(book)}>{book.visibility ? <EyeOff size={12} /> : <Eye size={12} />} {book.visibility ? 'Hide' : 'Show'}</button>
      <button className="bs-danger" onClick={() => h.onDelete(book)}><Trash2 size={12} /> Delete</button>
    </div>
  );
}

function CoverImage({ book, className }: { book: Book; className: string }) {
  return book.cover_image_url
    ? <img src={book.cover_image_url} alt="" className={className} loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
    : <span className={`${className} bs-cover-ph`} aria-hidden="true"><BookOpen size={20} /></span>;
}

// ---------------------------------------------------------------------------
// Featured book — wide card with description and full stats
// ---------------------------------------------------------------------------

function FeaturedBookCard({ book, stats, isAdmin, h }: { book: Book; stats?: BookStats; isAdmin: boolean; h: AdminHandlers }) {
  const desc = book.description ? docToPlainText(book.description) : '';
  const sub = [book.author, book.publisher, book.base_language].filter(Boolean).join(' · ');
  return (
    <article className={`bs-feat ${!book.visibility ? 'is-hidden' : ''}`}>
      <Link to={`/book/${book.slug}`} className="bs-feat-cover" tabIndex={-1} aria-hidden="true">
        <CoverImage book={book} className="bs-feat-img" />
      </Link>
      <div className="bs-feat-body">
        <div className="bs-feat-top">
          <span className="bs-badge"><Star size={11} fill="currentColor" /> Featured</span>
          {!book.visibility && <span className="bs-badge bs-badge--hidden">Hidden</span>}
        </div>
        <h3 className="bs-feat-title"><Link to={`/book/${book.slug}`}>{book.title}</Link></h3>
        {sub && <p className="bs-sub">{sub}</p>}
        {desc && <p className="bs-feat-desc">{desc}</p>}
        <dl className="bs-feat-stats">
          <div><dt>Findings</dt><dd>{stats ? stats.headingCount : '—'}</dd></div>
          <div><dt>Visits</dt><dd>{stats ? stats.viewCount : '—'}</dd></div>
          <div><dt>Added</dt><dd>{fmtDate(book.created_at) || '—'}</dd></div>
        </dl>
        <div className="bs-feat-actions">
          <Link to={`/book/${book.slug}`} className="bs-read">Read <ChevronRight size={14} /></Link>
          <BookExportMenu book={book} />
        </div>
        {isAdmin && <AdminActions book={book} h={h} />}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Regular book — compact grid card
// ---------------------------------------------------------------------------

function BookCard({ book, stats, isAdmin, h }: { book: Book; stats?: BookStats; isAdmin: boolean; h: AdminHandlers }) {
  return (
    <article className={`bs-card ${!book.visibility ? 'is-hidden' : ''}`}>
      <Link to={`/book/${book.slug}`} className="bs-card-cover" tabIndex={-1} aria-hidden="true">
        <CoverImage book={book} className="bs-card-img" />
        {!book.visibility && <span className="bs-badge bs-badge--hidden bs-on-cover">Hidden</span>}
      </Link>
      <div className="bs-card-body">
        <h3 className="bs-card-title"><Link to={`/book/${book.slug}`}>{book.title}</Link></h3>
        {book.author && <p className="bs-sub">{book.author}</p>}
        <div className="bs-card-foot">
          <span className="bs-card-stats">
            {stats ? plural(stats.headingCount, 'finding') : <span className="skeleton-pulse" style={{ display: 'inline-block', width: 64, height: 10 }} />}
          </span>
          <BookExportMenu book={book} />
        </div>
        {isAdmin && <AdminActions book={book} h={h} />}
      </div>
    </article>
  );
}

function FeaturedSkeleton() {
  return (
    <div className="bs-feat" aria-hidden="true">
      <div className="bs-feat-cover"><div className="skeleton-pulse" style={{ width: '100%', aspectRatio: '3 / 4' }} /></div>
      <div className="bs-feat-body">
        <div className="skeleton-pulse sk-line sm" style={{ width: 70 }} />
        <div className="skeleton-pulse sk-line lg" style={{ width: '70%' }} />
        <div className="skeleton-pulse sk-line sm" style={{ width: '45%', marginBottom: 12 }} />
        <div className="skeleton-pulse sk-line" style={{ width: '95%' }} />
        <div className="skeleton-pulse sk-line" style={{ width: '80%' }} />
      </div>
    </div>
  );
}
function CardSkeleton() {
  return (
    <div className="bs-card" aria-hidden="true">
      <div className="bs-card-cover"><div className="skeleton-pulse" style={{ width: '100%', aspectRatio: '3 / 4' }} /></div>
      <div className="bs-card-body">
        <div className="skeleton-pulse sk-line" style={{ width: '85%' }} />
        <div className="skeleton-pulse sk-line sm" style={{ width: '55%' }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bookshelf
// ---------------------------------------------------------------------------

type LoadState = 'loading' | 'more' | 'idle' | 'error';

export default function Bookshelf() {
  const { isAdmin } = useAdmin();
  useTrackView('site', 'bookshelf');

  const [featured, setFeatured] = useState<Book[]>([]);
  const [featState, setFeatState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadState>('loading');
  const [stats, setStats] = useState<Record<string, BookStats>>({});
  const [editing, setEditing] = useState<Book | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const reqId = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadStats = useCallback((ids: string[]) => {
    if (!ids.length) return;
    getBookStatsMany(ids).then((s) => setStats((prev) => ({ ...prev, ...s }))).catch(() => {});
  }, []);

  const loadPage = useCallback(async (offset: number) => {
    const id = ++reqId.current;
    setState(offset ? 'more' : 'loading');
    try {
      const page = await listBooksPage({ includeHidden: isAdmin, featured: false, offset, limit: PAGE_SIZE });
      if (id !== reqId.current) return;
      setBooks((prev) => (offset ? [...prev, ...page.rows] : page.rows));
      setTotal(page.total);
      setState('idle');
      loadStats(page.rows.map((b) => b.id));
    } catch {
      if (id === reqId.current) setState('error');
    }
  }, [isAdmin, loadStats]);

  const loadFeatured = useCallback(async () => {
    setFeatState('loading');
    try {
      const page = await listBooksPage({ includeHidden: isAdmin, featured: true, offset: 0, limit: FEATURED_LIMIT });
      setFeatured(page.rows);
      setFeatState('idle');
      loadStats(page.rows.map((b) => b.id));
    } catch {
      setFeatState('error');
    }
  }, [isAdmin, loadStats]);

  const reloadAll = useCallback(() => { loadFeatured(); loadPage(0); }, [loadFeatured, loadPage]);
  useEffect(() => { reloadAll(); }, [reloadAll]);

  // Infinite scroll with a "Load more" button as fallback.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && state === 'idle' && books.length < total) loadPage(books.length);
    }, { rootMargin: '600px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [state, books.length, total, loadPage]);

  const act = async (fn: () => Promise<void>) => {
    setActionError(null);
    try { await fn(); reloadAll(); } catch (e: any) { setActionError(e?.message || 'That change could not be saved.'); }
  };
  const handlers: AdminHandlers = {
    onEdit: (b) => setEditing(b),
    onToggleFeatured: (b) => act(() => updateBook(b.id, { featured: !b.featured })),
    onToggleVisibility: (b) => act(() => updateBook(b.id, { visibility: !b.visibility })),
    onDelete: (b) => { if (confirm(`Delete "${b.title}" and all of its findings? This cannot be undone.`)) act(() => deleteBook(b.id)); },
  };

  const totalBooks = total + featured.length;
  const nothing = featState === 'idle' && state === 'idle' && featured.length === 0 && books.length === 0;

  return (
    <div className="page bookshelf-page">
      <style>{BOOKSHELF_CSS}</style>

      <div className="page-head bs-head">
        <div>
          <h1>Bookshelf</h1>
          <p className="muted bs-intro">
            {state === 'loading' ? 'Loading books…' : `${plural(totalBooks, 'book')}. `}
            Open a book to read its findings — each with its page number — then bookmark, copy, or print them.
          </p>
        </div>
        {isAdmin && <button className="primary icon-row" onClick={() => setEditing('new')}><Plus size={16} /> New book</button>}
      </div>

      {actionError && <p className="form-error" role="alert">{actionError}</p>}

      <div className={`split-view ${editing ? 'has-detail' : ''}`}>
        <div className="split-list">
          {/* Featured */}
          {(featState === 'loading' || featured.length > 0) && (
            <section className="bs-section" aria-labelledby="bs-featured">
              <h2 id="bs-featured" className="bs-section-title">Featured</h2>
              <div className="bs-feat-grid">
                {featState === 'loading' ? <><FeaturedSkeleton /><FeaturedSkeleton /></>
                  : featured.map((b) => <FeaturedBookCard key={b.id} book={b} stats={stats[b.id]} isAdmin={isAdmin} h={handlers} />)}
              </div>
            </section>
          )}
          {featState === 'error' && (
            <div className="state-block error"><p>Featured books couldn't be loaded.</p>
              <div className="state-actions"><button className="link-btn" onClick={loadFeatured}>Retry</button></div></div>
          )}

          {/* All other books */}
          {(state !== 'idle' || books.length > 0) && (
            <section className="bs-section" aria-labelledby="bs-all">
              <h2 id="bs-all" className="bs-section-title">
                {featured.length ? 'All books' : 'Books'} {total > 0 && <span className="muted">{total}</span>}
              </h2>
              {state === 'error' && books.length === 0 ? (
                <div className="state-block error" role="alert">
                  <h3>Couldn't load the bookshelf</h3><p>Check your connection and try again.</p>
                  <div className="state-actions"><button className="primary" onClick={() => loadPage(0)}>Try again</button></div>
                </div>
              ) : (
                <div className="bs-grid">
                  {books.map((b) => <BookCard key={b.id} book={b} stats={stats[b.id]} isAdmin={isAdmin} h={handlers} />)}
                  {(state === 'loading' || state === 'more') && Array.from({ length: state === 'loading' ? 6 : 3 }).map((_, i) => <CardSkeleton key={`sk${i}`} />)}
                </div>
              )}
              {books.length > 0 && (
                <div className="list-status">
                  {state === 'error' ? (<><span>Couldn't load more books.</span><button className="link-btn" onClick={() => loadPage(books.length)}>Retry</button></>)
                    : books.length < total ? (state === 'idle' && <button className="load-more-btn" onClick={() => loadPage(books.length)}>Load more ({total - books.length} left)</button>)
                    : <span>All books shown</span>}
                </div>
              )}
              <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />
            </section>
          )}

          {nothing && (
            <div className="state-block">
              <h3>No books yet</h3>
              <p>{isAdmin ? 'Add the first book with “New book”.' : 'Books will appear here once they are added.'}</p>
            </div>
          )}
        </div>

        {editing && (
          <BookForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            onSave={() => { setEditing(null); reloadAll(); }}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const BOOKSHELF_CSS = `
.bs-head { align-items: flex-end; }
.bs-intro { margin: 0.25rem 0 0; max-width: 620px; }
.bs-section { margin-bottom: 2rem; }
.bs-section-title { font-size: 0.95rem; font-weight: 700; margin: 0 0 0.9rem; display: flex; gap: 0.5rem; align-items: baseline; font-family: var(--font-english), sans-serif; }
.bs-section-title .muted { font-weight: 400; font-size: 0.8rem; }

.bs-badge { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.68rem; font-weight: 600; color: var(--accent); }
.bs-badge--hidden { color: #c0392b; border: 1px solid currentColor; border-radius: 3px; padding: 0 0.3rem; }
.bs-sub { margin: 0; font-size: 0.8rem; color: var(--muted); }
.is-hidden .bs-feat-cover, .is-hidden .bs-card-cover { opacity: 0.55; }
.bs-cover-ph { display: grid !important; place-items: center; color: var(--muted); background: color-mix(in srgb, var(--fg) 6%, var(--bg)); aspect-ratio: 3 / 4; }

/* Featured: wide, informative */
.bs-feat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr)); gap: 1rem; }
.bs-feat { display: flex; gap: 1.1rem; padding: 1rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
.bs-feat-cover { flex: 0 0 120px; display: block; align-self: flex-start; }
.bs-feat-img { display: block; width: 100%; height: auto; border-radius: 4px; box-shadow: 0 3px 10px rgba(0,0,0,0.12); }
.bs-feat-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.bs-feat-top { display: flex; gap: 0.5rem; align-items: center; }
.bs-feat-title { margin: 0; font-size: 1.15rem; line-height: 1.3; word-break: break-word; }
.bs-feat-title a, .bs-card-title a { color: var(--fg); text-decoration: none; }
.bs-feat-title a:hover, .bs-card-title a:hover { color: var(--accent); }
.bs-feat-desc { margin: 0.2rem 0 0; font-size: 0.86rem; line-height: 1.6; color: color-mix(in srgb, var(--fg) 78%, var(--muted));
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.bs-feat-stats { display: flex; gap: 1.2rem; flex-wrap: wrap; margin: 0.35rem 0 0.2rem; }
.bs-feat-stats dt { font-size: 0.68rem; color: var(--muted); }
.bs-feat-stats dd { margin: 0; font-size: 0.92rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.bs-feat-actions { display: flex; align-items: center; gap: 0.5rem; margin-top: auto; padding-top: 0.4rem; }
.bs-read { display: inline-flex; align-items: center; gap: 0.2rem; background: var(--accent); color: #fff; text-decoration: none; font-size: 0.84rem; font-weight: 600; padding: 0.42rem 0.9rem; border-radius: 6px; }
.bs-read:hover { opacity: 0.9; }

/* Regular: compact grid */
.bs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1.4rem 1.1rem; }
.bs-card { display: flex; flex-direction: column; min-width: 0; }
.bs-card-cover { position: relative; display: block; border-radius: 4px; overflow: hidden; background: var(--border); }
.bs-card-img { display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover; transition: opacity 0.15s; }
.bs-card-cover:hover .bs-card-img { opacity: 0.88; }
.bs-on-cover { position: absolute; top: 6px; left: 6px; background: var(--surface); }
.bs-card-body { padding-top: 0.5rem; display: flex; flex-direction: column; gap: 0.15rem; flex: 1; }
.bs-card-title { margin: 0; font-size: 0.9rem; line-height: 1.35; font-family: var(--font-english), 'Hind Siliguri', sans-serif; font-weight: 600; word-break: break-word;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bs-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; margin-top: auto; padding-top: 0.3rem; }
.bs-card-stats { font-size: 0.74rem; color: var(--muted); }
.bs-card .bx-dots { width: 28px; height: 28px; }

.bs-admin { display: flex; flex-wrap: wrap; gap: 0.2rem 0.7rem; margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px dashed var(--border); }
.bs-admin button { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.72rem; color: var(--muted); }
.bs-admin button:hover { color: var(--accent); }
.bs-admin .bs-danger:hover { color: #c0392b; }

@media (max-width: 560px) {
  .bs-feat { padding: 0.8rem; gap: 0.8rem; }
  .bs-feat-cover { flex-basis: 88px; }
  .bs-feat-title { font-size: 1.02rem; }
  .bs-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.1rem 0.8rem; }
}
`;