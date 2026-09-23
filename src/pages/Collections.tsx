import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, ExternalLink, ChevronRight, Star, Eye, EyeOff, Loader2, ArrowLeft,
} from 'lucide-react';
import {
  Category, CategoryHeadingDetail, CategoryStats, createCategory, deleteCategory, getCategory,
  getCategoryStatsMany, listCategoriesPage, listCategoryItemsPage, requestIndexing, updateCategory, uploadImage,
} from '../lib/supabase';
import { useAdmin, useTrackView } from '../lib/context';
import { RichTextView, docToPlainText } from '../lib/richtext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LIST_PAGE = 20;
const ITEM_PAGE = 12;

function fmtDate(d?: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function plural(n: number, one: string, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }

function statsLine(s?: CategoryStats) {
  if (!s) return null;
  return `${plural(s.entryCount, 'finding')} from ${plural(s.bookCount, 'book')} · ${plural(s.viewCount, 'visit')}`;
}

/** Title = first block of the finding; excerpt = the text after it. */
function splitHeading(content: any, fallbackTitle?: string) {
  const blocks = content?.content || [];
  const title = (fallbackTitle || docToPlainText({ type: 'doc', content: blocks.slice(0, 1) })).trim();
  const body = docToPlainText({ type: 'doc', content: blocks.slice(1) }).trim();
  return { title: title || 'Untitled finding', body };
}

// ---------------------------------------------------------------------------
// Collection form (admin)
// ---------------------------------------------------------------------------

function CategoryForm({ initial, onSave, onCancel }: { initial: Category | null; onSave: () => void; onCancel: () => void; }) {
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || '#6b5b95');
  const [banner, setBanner] = useState(initial?.banner_image_url || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [featured, setFeatured] = useState(initial?.featured || false);
  const [visibility, setVisibility] = useState(initial?.visibility ?? true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadBanner = async (file: File) => {
    setUploading(true); setError(null);
    try { setBanner(await uploadImage(file, 'category-banners')); }
    catch (e: any) { setError(`Image upload failed: ${e?.message || 'unknown error'}`); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError(null);
    try {
      const patch = { name, color, banner_image_url: banner, description, featured, visibility };
      if (initial) await updateCategory(initial.id, patch); else await createCategory(patch);
      requestIndexing();
      onSave();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="split-detail">
      <button className="link-btn detail-close" onClick={onCancel}>← Close</button>
      <h3>{initial ? 'Edit collection' : 'New collection'}</h3>
      <label>Name <input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label>Color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      <label>Banner image <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])} /></label>
      {uploading && <p className="muted"><Loader2 size={12} className="spin" /> Uploading…</p>}
      {banner && <img src={banner} alt="Banner preview" className="cover-preview" />}
      <label>Description <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></label>
      <label className="check"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Featured</label>
      <label className="check"><input type="checkbox" checked={visibility} onChange={(e) => setVisibility(e.target.checked)} /> Visible to guests</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="primary" disabled={saving || uploading} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin row actions
// ---------------------------------------------------------------------------

interface AdminHandlers {
  onEdit: (c: Category) => void; onToggleFeatured: (c: Category) => void;
  onToggleVisibility: (c: Category) => void; onDelete: (c: Category) => void;
}

function AdminActions({ c, h }: { c: Category; h: AdminHandlers }) {
  return (
    <div className="cl-admin" aria-label="Admin actions">
      <button onClick={() => h.onEdit(c)}><Pencil size={12} /> Edit</button>
      <button onClick={() => h.onToggleFeatured(c)}><Star size={12} fill={c.featured ? 'currentColor' : 'none'} /> {c.featured ? 'Unfeature' : 'Feature'}</button>
      <button onClick={() => h.onToggleVisibility(c)}>{c.visibility ? <EyeOff size={12} /> : <Eye size={12} />} {c.visibility ? 'Hide' : 'Show'}</button>
      <button className="cl-danger" onClick={() => h.onDelete(c)}><Trash2 size={12} /> Delete</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured collection — card with banner
// ---------------------------------------------------------------------------

function FeaturedCard({ c, stats, isAdmin, h }: { c: Category; stats?: CategoryStats; isAdmin: boolean; h: AdminHandlers }) {
  return (
    <article className={`cl-feat ${!c.visibility ? 'is-hidden' : ''}`} style={{ ['--cc' as any]: c.color }}>
      <Link to={`/collections/${c.id}`} className="cl-feat-banner" tabIndex={-1} aria-hidden="true">
        {c.banner_image_url ? <img src={c.banner_image_url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span className="cl-feat-banner-ph" />}
      </Link>
      <div className="cl-feat-body">
        <div className="cl-feat-top">
          <span className="cl-badge"><Star size={11} fill="currentColor" /> Featured</span>
          {!c.visibility && <span className="cl-badge cl-badge--hidden">Hidden</span>}
        </div>
        <h3 className="cl-feat-title"><Link to={`/collections/${c.id}`}>{c.name}</Link></h3>
        {c.description && <p className="cl-feat-desc">{c.description}</p>}
        <p className="cl-stats">
          {stats ? statsLine(stats) : <span className="skeleton-pulse" style={{ display: 'inline-block', width: 180, height: 10 }} />}
        </p>
        <div className="cl-feat-foot">
          <Link to={`/collections/${c.id}`} className="cl-open">Open collection <ChevronRight size={14} /></Link>
          {c.updated_at && <span className="muted cl-date">Updated {fmtDate(c.updated_at)}</span>}
        </div>
        {isAdmin && <AdminActions c={c} h={h} />}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Regular collection — plain row
// ---------------------------------------------------------------------------

function CollectionRow({ c, stats, isAdmin, h }: { c: Category; stats?: CategoryStats; isAdmin: boolean; h: AdminHandlers }) {
  return (
    <li className={`cl-row ${!c.visibility ? 'is-hidden' : ''}`}>
      <Link to={`/collections/${c.id}`} className="cl-row-link">
        <span className="cl-row-dot" style={{ background: c.color }} aria-hidden="true" />
        <span className="cl-row-main">
          <span className="cl-row-title">
            {c.name}
            {!c.visibility && <span className="cl-badge cl-badge--hidden">Hidden</span>}
          </span>
          {c.description && <span className="cl-row-desc">{c.description}</span>}
          <span className="cl-stats">{stats ? statsLine(stats) : ' '}</span>
        </span>
        <ChevronRight size={16} className="cl-row-chev" aria-hidden="true" />
      </Link>
      {isAdmin && <AdminActions c={c} h={h} />}
    </li>
  );
}

function RowSkeleton() {
  return (
    <li className="cl-row" aria-hidden="true">
      <div className="cl-row-link">
        <span className="skeleton-pulse cl-row-dot" />
        <span className="cl-row-main" style={{ width: '100%' }}>
          <span className="skeleton-pulse sk-line lg" style={{ width: '40%', display: 'block' }} />
          <span className="skeleton-pulse sk-line" style={{ width: '75%', display: 'block' }} />
          <span className="skeleton-pulse sk-line sm" style={{ width: '30%', display: 'block' }} />
        </span>
      </div>
    </li>
  );
}
function FeatSkeleton() {
  return (
    <div className="cl-feat" aria-hidden="true">
      <div className="cl-feat-banner"><span className="skeleton-pulse" style={{ display: 'block', width: '100%', height: '100%' }} /></div>
      <div className="cl-feat-body">
        <div className="skeleton-pulse sk-line lg" style={{ width: '60%' }} />
        <div className="skeleton-pulse sk-line" style={{ width: '90%' }} />
        <div className="skeleton-pulse sk-line sm" style={{ width: '40%' }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collections list
// ---------------------------------------------------------------------------

export function CollectionsList() {
  const { isAdmin } = useAdmin();
  useTrackView('site', 'collections');

  const [featured, setFeatured] = useState<Category[]>([]);
  const [featState, setFeatState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [rows, setRows] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<'loading' | 'more' | 'idle' | 'error'>('loading');
  const [stats, setStats] = useState<Record<string, CategoryStats>>({});
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const reqId = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadStats = useCallback((ids: string[]) => {
    if (ids.length) getCategoryStatsMany(ids).then((s) => setStats((p) => ({ ...p, ...s }))).catch(() => {});
  }, []);

  const loadFeatured = useCallback(async () => {
    setFeatState('loading');
    try {
      const page = await listCategoriesPage({ includeHidden: isAdmin, featured: true, offset: 0, limit: 24 });
      setFeatured(page.rows); setFeatState('idle'); loadStats(page.rows.map((c) => c.id));
    } catch { setFeatState('error'); }
  }, [isAdmin, loadStats]);

  const loadPage = useCallback(async (offset: number) => {
    const id = ++reqId.current;
    setState(offset ? 'more' : 'loading');
    try {
      const page = await listCategoriesPage({ includeHidden: isAdmin, featured: false, offset, limit: LIST_PAGE });
      if (id !== reqId.current) return;
      setRows((p) => (offset ? [...p, ...page.rows] : page.rows));
      setTotal(page.total); setState('idle'); loadStats(page.rows.map((c) => c.id));
    } catch { if (id === reqId.current) setState('error'); }
  }, [isAdmin, loadStats]);

  const reloadAll = useCallback(() => { loadFeatured(); loadPage(0); }, [loadFeatured, loadPage]);
  useEffect(() => { reloadAll(); }, [reloadAll]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && state === 'idle' && rows.length < total) loadPage(rows.length);
    }, { rootMargin: '500px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [state, rows.length, total, loadPage]);

  const act = async (fn: () => Promise<void>) => {
    setActionError(null);
    try { await fn(); reloadAll(); } catch (e: any) { setActionError(e?.message || 'That change could not be saved.'); }
  };
  const h: AdminHandlers = {
    onEdit: setEditing,
    onToggleFeatured: (c) => act(() => updateCategory(c.id, { featured: !c.featured })),
    onToggleVisibility: (c) => act(() => updateCategory(c.id, { visibility: !c.visibility })),
    onDelete: (c) => { if (confirm(`Delete collection "${c.name}"? The findings themselves are kept.`)) act(() => deleteCategory(c.id)); },
  };

  const nothing = featState === 'idle' && state === 'idle' && featured.length === 0 && rows.length === 0;
  const count = total + featured.length;

  return (
    <div className="page collections-page">
      <style>{COLLECTIONS_CSS}</style>
      <div className="page-head cl-head">
        <div>
          <h1>Collections</h1>
          <p className="muted cl-intro">
            {state === 'loading' ? 'Loading collections…' : `${plural(count, 'collection')}. `}
            Each collection gathers findings on one theme from across different books.
          </p>
        </div>
        {isAdmin && <button className="primary icon-row" onClick={() => setEditing('new')}><Plus size={16} /> New collection</button>}
      </div>
      {actionError && <p className="form-error" role="alert">{actionError}</p>}

      <div className={`split-view ${editing ? 'has-detail' : ''}`}>
        <div className="split-list">
          {(featState === 'loading' || featured.length > 0) && (
            <section className="cl-section" aria-labelledby="cl-featured">
              <h2 id="cl-featured" className="cl-section-title">Featured</h2>
              <div className="cl-feat-grid">
                {featState === 'loading' ? <><FeatSkeleton /><FeatSkeleton /></>
                  : featured.map((c) => <FeaturedCard key={c.id} c={c} stats={stats[c.id]} isAdmin={isAdmin} h={h} />)}
              </div>
            </section>
          )}
          {featState === 'error' && (
            <div className="state-block error"><p>Featured collections couldn't be loaded.</p>
              <div className="state-actions"><button className="link-btn" onClick={loadFeatured}>Retry</button></div></div>
          )}

          {(state !== 'idle' || rows.length > 0) && (
            <section className="cl-section" aria-labelledby="cl-all">
              <h2 id="cl-all" className="cl-section-title">{featured.length ? 'All collections' : 'Collections'} {total > 0 && <span className="muted">{total}</span>}</h2>
              {state === 'error' && rows.length === 0 ? (
                <div className="state-block error" role="alert">
                  <h3>Couldn't load collections</h3>
                  <div className="state-actions"><button className="primary" onClick={() => loadPage(0)}>Try again</button></div>
                </div>
              ) : (
                <ul className="cl-list">
                  {rows.map((c) => <CollectionRow key={c.id} c={c} stats={stats[c.id]} isAdmin={isAdmin} h={h} />)}
                  {(state === 'loading' || state === 'more') && Array.from({ length: state === 'loading' ? 4 : 2 }).map((_, i) => <RowSkeleton key={`s${i}`} />)}
                </ul>
              )}
              {rows.length > 0 && (
                <div className="list-status">
                  {state === 'error' ? (<><span>Couldn't load more.</span><button className="link-btn" onClick={() => loadPage(rows.length)}>Retry</button></>)
                    : rows.length < total ? (state === 'idle' && <button className="load-more-btn" onClick={() => loadPage(rows.length)}>Load more ({total - rows.length} left)</button>)
                    : null}
                </div>
              )}
              <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />
            </section>
          )}

          {nothing && (
            <div className="state-block"><h3>No collections yet</h3>
              <p>{isAdmin ? 'Create one with “New collection”, then add findings to it from any book page.' : 'Collections will appear here once they are created.'}</p></div>
          )}
        </div>

        {editing && (
          <CategoryForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing}
            onSave={() => { setEditing(null); reloadAll(); }} onCancel={() => setEditing(null)} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collection detail
// ---------------------------------------------------------------------------

function ItemSkeleton() {
  return (
    <li className="cd-item" aria-hidden="true">
      <div className="cd-item-main">
        <div className="skeleton-pulse sk-line lg" style={{ width: '55%' }} />
        <div className="skeleton-pulse sk-line" style={{ width: '95%' }} />
        <div className="skeleton-pulse sk-line" style={{ width: '80%' }} />
        <div className="skeleton-pulse sk-line sm" style={{ width: '35%', marginTop: 8 }} />
      </div>
    </li>
  );
}

export function CategoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const [category, setCategory] = useState<Category | null>(null);
  const [catState, setCatState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [stats, setStats] = useState<CategoryStats | null>(null);
  const [items, setItems] = useState<CategoryHeadingDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<'loading' | 'more' | 'idle' | 'error'>('loading');
  const [selected, setSelected] = useState<CategoryHeadingDetail | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [descExpanded, setDescExpanded] = useState(false);
  const reqId = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  useTrackView('category', id ?? null);

  const loadItems = useCallback(async (offset: number) => {
    if (!id) return;
    const rid = ++reqId.current;
    setState(offset ? 'more' : 'loading');
    try {
      const page = await listCategoryItemsPage(id, offset, ITEM_PAGE);
      if (rid !== reqId.current) return;
      setItems((p) => (offset ? [...p, ...page.rows] : page.rows));
      setTotal(page.total); setState('idle');
    } catch { if (rid === reqId.current) setState('error'); }
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setSelected(null); setItems([]); setCatState('loading');
    loadItems(0);
    try {
      const c = await getCategory(id);
      if (!c || (!c.visibility && !isAdmin)) { setCatState('notfound'); return; }
      setCategory(c); setCatState('ready');
      getCategoryStatsMany([id]).then((s) => setStats(s[id] || null)).catch(() => {});
    } catch { setCatState('error'); }
  }, [id, loadItems, isAdmin]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && state === 'idle' && items.length < total) loadItems(items.length);
    }, { rootMargin: '600px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [state, items.length, total, loadItems]);

  if (catState === 'notfound') {
    return <div className="page"><div className="state-block"><h3>Collection not found</h3><p>It may have been removed or hidden.</p>
      <div className="state-actions"><button className="primary" onClick={() => navigate('/collections')}>All collections</button></div></div></div>;
  }
  if (catState === 'error') {
    return <div className="page"><div className="state-block error" role="alert"><h3>Couldn't load this collection</h3>
      <div className="state-actions"><button className="primary" onClick={load}>Try again</button></div></div></div>;
  }

  const desc = category?.description || '';
  const descLong = desc.length > 240;

  return (
    <div className="page collection-detail-page">
      <style>{COLLECTIONS_CSS}</style>

      <header className="cd-head" style={category ? { ['--cc' as any]: category.color } : undefined}>
        <Link to="/collections" className="cd-back"><ArrowLeft size={14} /> Collections</Link>
        {catState === 'loading' ? (
          <>
            <div className="skeleton-pulse sk-line" style={{ width: '45%', height: 28, margin: '0.4rem 0 0.8rem' }} />
            <div className="skeleton-pulse sk-line" style={{ width: '70%' }} />
          </>
        ) : category && (
          <>
            <h1 className="cd-title"><span className="cd-title-dot" aria-hidden="true" />{category.name}</h1>
            {desc && (
              <div className="cd-desc">
                <p>{descExpanded || !descLong ? desc : `${desc.slice(0, 240)}…`}</p>
                {descLong && <button className="link-btn" onClick={() => setDescExpanded((v) => !v)} aria-expanded={descExpanded}>{descExpanded ? 'Read less' : 'Read more'}</button>}
              </div>
            )}
            <p className="cl-stats cd-stats">
              {stats ? statsLine(stats) : <span className="skeleton-pulse" style={{ display: 'inline-block', width: 200, height: 10 }} />}
              {category.updated_at && <> · Updated {fmtDate(category.updated_at)}</>}
            </p>
          </>
        )}
      </header>

      <div className={`split-view ${selected ? 'has-detail' : ''}`}>
        <div className="split-list">
          {state === 'error' && items.length === 0 ? (
            <div className="state-block error" role="alert"><h3>Couldn't load the findings</h3>
              <div className="state-actions"><button className="primary" onClick={() => loadItems(0)}>Try again</button></div></div>
          ) : state === 'idle' && items.length === 0 ? (
            <div className="state-block"><h3>No findings in this collection yet</h3><p>Findings are added to a collection from their book page.</p></div>
          ) : (
            <ul className="cd-list">
              {items.map((it) => {
                const { heading, book } = it;
                const { title, body } = splitHeading(heading.content);
                const isOpen = !!expanded[heading.id];
                const isActive = selected?.heading.id === heading.id;
                const href = `/book/${book.slug}#${heading.id}`;
                return (
                  <li key={heading.id} className={`cd-item ${isActive ? 'is-active' : ''}`}>
                    <div className="cd-item-main">
                      <h2 className="cd-item-title"><Link to={href}>{title}</Link></h2>
                      {body && (
                        <p className={`cd-item-excerpt ${isOpen ? 'open' : ''}`}>{body}</p>
                      )}
                      <p className="cd-item-meta">
                        {book.cover_image_url && <img src={book.cover_image_url} alt="" className="cd-item-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                        <span className="cd-item-book">{book.title}</span>
                        {book.author && <span>{book.author}</span>}
                        {heading.page_number && <span>p. {heading.page_number}</span>}
                      </p>
                      <div className="cd-item-actions">
                        {body.length > 220 && (
                          <button className="link-btn" onClick={() => setExpanded((m) => ({ ...m, [heading.id]: !isOpen }))} aria-expanded={isOpen}>
                            {isOpen ? 'Show less' : 'Show more'}
                          </button>
                        )}
                        <button className="link-btn" onClick={() => setSelected(it)}>Preview</button>
                        <Link className="link-btn" to={href}>Read in book</Link>
                        <Link className="link-btn cd-newtab" to={href} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> New tab</Link>
                      </div>
                    </div>
                  </li>
                );
              })}
              {(state === 'loading' || state === 'more') && Array.from({ length: state === 'loading' ? 4 : 2 }).map((_, i) => <ItemSkeleton key={`s${i}`} />)}
            </ul>
          )}
          {items.length > 0 && (
            <div className="list-status">
              {state === 'error' ? (<><span>Couldn't load more findings.</span><button className="link-btn" onClick={() => loadItems(items.length)}>Retry</button></>)
                : items.length < total ? (state === 'idle' && <button className="load-more-btn" onClick={() => loadItems(items.length)}>Load more ({total - items.length} left)</button>)
                : <span>All {plural(total, 'finding')} shown</span>}
            </div>
          )}
          <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />
        </div>

        {selected && (
          <div className="split-detail cd-preview">
            <button className="link-btn detail-close" onClick={() => setSelected(null)}>← Close</button>
            <div className="side-panel-head">
              <div>
                <p className="cd-preview-book">{selected.book.title}</p>
                <p className="muted" style={{ margin: 0 }}>
                  {[selected.book.author, selected.heading.page_number ? `p. ${selected.heading.page_number}` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="side-panel-actions">
                <Link to={`/book/${selected.book.slug}#${selected.heading.id}`} className="icon-row">Read in book <ChevronRight size={14} /></Link>
                <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close preview">✕</button>
              </div>
            </div>
            <RichTextView doc={selected.heading.content} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const COLLECTIONS_CSS = `
.cl-head { align-items: flex-end; }
.cl-intro { margin: 0.25rem 0 0; max-width: 620px; }
.cl-section { margin-bottom: 2rem; }
.cl-section-title { font-size: 0.95rem; font-weight: 700; margin: 0 0 0.9rem; display: flex; gap: 0.5rem; align-items: baseline; font-family: var(--font-english), sans-serif; }
.cl-section-title .muted { font-weight: 400; font-size: 0.8rem; }
.cl-badge { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.68rem; font-weight: 600; color: var(--accent); }
.cl-badge--hidden { color: #c0392b; border: 1px solid currentColor; border-radius: 3px; padding: 0 0.3rem; margin-left: 0.4rem; }
.cl-stats { margin: 0; font-size: 0.78rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.is-hidden { opacity: 0.7; }

/* Featured: banner card */
.cl-feat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 1rem; }
.cl-feat { display: flex; flex-direction: column; border: 1px solid var(--border); border-top: 3px solid var(--cc, var(--accent)); border-radius: 8px; overflow: hidden; background: var(--surface); }
.cl-feat-banner { display: block; aspect-ratio: 16 / 7; background: color-mix(in srgb, var(--cc, var(--accent)) 14%, var(--bg)); }
.cl-feat-banner img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cl-feat-banner-ph { display: block; width: 100%; height: 100%; }
.cl-feat-body { padding: 0.9rem 1rem 1rem; display: flex; flex-direction: column; gap: 0.35rem; flex: 1; }
.cl-feat-title { margin: 0; font-size: 1.1rem; line-height: 1.3; word-break: break-word; }
.cl-feat-title a { color: var(--fg); text-decoration: none; }
.cl-feat-title a:hover { color: var(--accent); }
.cl-feat-desc { margin: 0; font-size: 0.86rem; line-height: 1.6; color: color-mix(in srgb, var(--fg) 78%, var(--muted));
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.cl-feat-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; flex-wrap: wrap; margin-top: auto; padding-top: 0.5rem; }
.cl-open { display: inline-flex; align-items: center; gap: 0.2rem; background: var(--accent); color: #fff; text-decoration: none; font-size: 0.84rem; font-weight: 600; padding: 0.42rem 0.9rem; border-radius: 6px; }
.cl-open:hover { opacity: 0.9; }
.cl-date { font-size: 0.74rem; }

/* Regular: rows */
.cl-list, .cd-list { list-style: none; margin: 0; padding: 0; }
.cl-row { border-bottom: 1px solid var(--border); }
.cl-row-link { display: flex; align-items: flex-start; gap: 0.8rem; padding: 0.85rem 0.4rem; color: inherit; text-decoration: none; border-radius: 6px; }
a.cl-row-link:hover { background: color-mix(in srgb, var(--accent) 5%, transparent); }
a.cl-row-link:hover .cl-row-title { color: var(--accent); }
.cl-row-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 0.45rem; }
.cl-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
.cl-row-title { font-weight: 700; font-size: 0.98rem; }
.cl-row-desc { font-size: 0.85rem; color: color-mix(in srgb, var(--fg) 75%, var(--muted)); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cl-row-chev { color: var(--muted); flex-shrink: 0; margin-top: 0.3rem; }
.cl-admin { display: flex; flex-wrap: wrap; gap: 0.2rem 0.8rem; padding: 0 0.4rem 0.7rem 1.9rem; }
.cl-feat .cl-admin { padding: 0.4rem 0 0; border-top: 1px dashed var(--border); margin-top: 0.4rem; }
.cl-admin button { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.72rem; color: var(--muted); }
.cl-admin button:hover { color: var(--accent); }
.cl-admin .cl-danger:hover { color: #c0392b; }

/* Detail */
.cd-head { padding: 0.2rem 0 1rem; margin-bottom: 0.8rem; border-bottom: 1px solid var(--border); }
.cd-back { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.82rem; color: var(--muted); text-decoration: none; }
.cd-back:hover { color: var(--accent); }
.cd-title { margin: 0.45rem 0 0.5rem; font-size: 1.6rem; font-weight: 800; line-height: 1.25; display: flex; align-items: center; gap: 0.55rem; word-break: break-word; }
.cd-title-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--cc, var(--accent)); flex-shrink: 0; }
.cd-desc p { margin: 0 0 0.25rem; max-width: 720px; color: color-mix(in srgb, var(--fg) 78%, var(--muted)); }
.cd-stats { margin-top: 0.5rem; }

.cd-list { max-width: 780px; }
.cd-item { border-bottom: 1px solid var(--border); }
.cd-item.is-active { background: color-mix(in srgb, var(--accent) 6%, transparent); }
.cd-item-main { padding: 1rem 0.4rem; }
.cd-item-title { margin: 0 0 0.35rem; font-size: 1.06rem; font-weight: 700; line-height: 1.4; font-family: var(--font-serif), 'Hind Siliguri', Georgia, serif; word-break: break-word; }
.cd-item-title a { color: var(--fg); text-decoration: none; }
.cd-item-title a:hover { color: var(--accent); }
.cd-item-excerpt { margin: 0 0 0.5rem; font-size: 0.9rem; line-height: 1.65; color: color-mix(in srgb, var(--fg) 80%, var(--muted));
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.cd-item-excerpt.open { display: block; -webkit-line-clamp: unset; }
.cd-item-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.2rem 0.5rem; margin: 0 0 0.4rem; font-size: 0.78rem; color: var(--muted); }
.cd-item-meta span + span::before { content: '·'; margin-right: 0.5rem; }
.cd-item-cover { width: 18px; height: 24px; object-fit: cover; border-radius: 2px; }
.cd-item-book { color: var(--fg); font-weight: 600; }
.cd-item-actions { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; font-size: 0.8rem; }
.cd-item-actions .link-btn { display: inline-flex; align-items: center; gap: 0.25rem; }
.cd-preview-book { margin: 0; font-weight: 700; }

@media (max-width: 560px) {
  .cd-title { font-size: 1.3rem; }
  .cl-admin { padding-left: 0.4rem; }
  .cd-newtab { display: none !important; }
}
`;