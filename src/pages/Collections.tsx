import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, ExternalLink, ChevronRight, Star,
  Eye, EyeOff, BookOpen, BarChart2, Calendar, RefreshCw,
  ChevronLeft, Layers, Hash,
} from 'lucide-react';
import {
  Category, CategoryHeadingDetail, CategoryStats,
  createCategory, deleteCategory, getCategoryStats,
  listCategories, listCategoryHeadings, updateCategory, uploadImage,
} from '../lib/supabase';
import { useAdmin, useTrackView } from '../lib/context';
import { RichTextView, docToPlainText } from '../lib/richtext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SkeletonCard() {
  return (
    <div className="col-skeleton-card">
      <div className="col-skeleton__img skeleton-pulse" />
      <div className="col-skeleton__body">
        <div className="skeleton-pulse" style={{ width: '60%', height: 16, marginBottom: 8 }} />
        <div className="skeleton-pulse" style={{ width: '90%', height: 11, marginBottom: 4 }} />
        <div className="skeleton-pulse" style={{ width: '70%', height: 11, marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="skeleton-pulse" style={{ width: 55, height: 11 }} />
          <div className="skeleton-pulse" style={{ width: 55, height: 11 }} />
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="col-skeleton-row">
      <div className="col-skeleton__thumb skeleton-pulse" />
      <div className="col-skeleton__row-body">
        <div className="skeleton-pulse" style={{ width: '45%', height: 14, marginBottom: 6 }} />
        <div className="skeleton-pulse" style={{ width: '75%', height: 11 }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category edit form
// ---------------------------------------------------------------------------

function CategoryForm({ initial, onSave, onCancel }: {
  initial: Category | null; onSave: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || '#6b5b95');
  const [banner, setBanner] = useState(initial?.banner_image_url || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [featured, setFeatured] = useState(initial?.featured || false);
  const [visibility, setVisibility] = useState(initial?.visibility ?? true);
  const [saving, setSaving] = useState(false);

  const uploadBanner = async (file: File) => setBanner(await uploadImage(file, 'category-banners'));

  const save = async () => {
    if (!name.trim()) return alert('Name is required.');
    setSaving(true);
    try {
      if (initial) await updateCategory(initial.id, { name, color, banner_image_url: banner, description, featured, visibility });
      else await createCategory({ name, color, banner_image_url: banner, description, featured, visibility });
      onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="split-detail">
      <button className="link-btn detail-close" onClick={onCancel}>← Close</button>
      <h3>{initial ? 'Edit collection' : 'New collection'}</h3>
      <label>Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      <label>Banner image <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])} /></label>
      {banner && <img src={banner} alt="" className="cover-preview" />}
      <label>Description <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></label>
      <label className="check">
        <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
        Featured (shown as card)
      </label>
      <label className="check">
        <input type="checkbox" checked={visibility} onChange={(e) => setVisibility(e.target.checked)} />
        Visible to guests
      </label>
      <div className="modal-actions">
        <button className="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats chip
// ---------------------------------------------------------------------------

function StatsRow({ stats }: { stats: CategoryStats | null }) {
  if (!stats) return null;
  return (
    <div className="col-card__stats">
      <span title="Total entries"><Layers size={12} /> {stats.entryCount}</span>
      <span title="Books"><BookOpen size={12} /> {stats.bookCount}</span>
      <span title="Visits"><BarChart2 size={12} /> {stats.viewCount}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured collection card (in carousel)
// ---------------------------------------------------------------------------

function FeaturedCollectionCard({ category, isAdmin, onEdit, onToggleFeatured, onToggleVisibility, onDelete }: {
  category: Category; isAdmin: boolean;
  onEdit: () => void; onToggleFeatured: () => void; onToggleVisibility: () => void; onDelete: () => void;
}) {
  const [stats, setStats] = useState<CategoryStats | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const desc = category.description || '';
  const descLong = desc.length > 120;

  useEffect(() => { getCategoryStats(category.id).then(setStats); }, [category.id]);

  return (
    <div className={`col-feat-card ${!category.visibility && isAdmin ? 'col-feat-card--hidden' : ''}`}>
      {/* Banner */}
      <div className="col-feat-card__img-wrap">
        {category.banner_image_url ? (
          <img src={category.banner_image_url} alt="" className="col-feat-card__img" />
        ) : (
          <div className="col-feat-card__img-placeholder">
            <span className="col-feat-card__dot" style={{ background: category.color }} />
          </div>
        )}
        {!category.visibility && isAdmin && (
          <div className="col-feat-card__hidden-badge">Hidden</div>
        )}
      </div>

      {/* Body */}
      <div className="col-feat-card__body">
        <p className="col-feat-card__label">
          <Star size={11} fill="currentColor" /> Featured
        </p>
        <h3 className="col-feat-card__title">
          <span className="dot" style={{ background: category.color }} />
          <Link to={`/collections/${category.id}`}>{category.name}</Link>
        </h3>

        {desc && (
          <div className="col-feat-card__desc">
            <p>{descExpanded || !descLong ? desc : `${desc.slice(0, 120)}…`}</p>
            {descLong && (
              <button className="link-btn col-readmore-btn" onClick={() => setDescExpanded((v) => !v)}>
                {descExpanded ? 'Read less ↑' : 'Read more ↓'}
              </button>
            )}
          </div>
        )}

        <StatsRow stats={stats} />

        <div className="col-feat-card__meta">
          {category.created_at && (
            <span><Calendar size={11} /> {fmtDate(category.created_at)}</span>
          )}
          {category.updated_at && category.updated_at !== category.created_at && (
            <span><RefreshCw size={11} /> {fmtDate(category.updated_at)}</span>
          )}
        </div>

        <div className="col-feat-card__actions">
          <Link to={`/collections/${category.id}`} className="col-open-btn">
            Open <ChevronRight size={13} />
          </Link>
          {isAdmin && (
            <div className="col-admin-actions">
              <button onClick={onEdit}><Pencil size={12} /> Edit</button>
              <button onClick={onToggleFeatured}><Star size={12} fill="currentColor" /> Unfeature</button>
              <button onClick={onToggleVisibility}>{category.visibility ? <EyeOff size={12} /> : <Eye size={12} />} {category.visibility ? 'Hide' : 'Show'}</button>
              <button className="danger" onClick={onDelete}><Trash2 size={12} /> Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured collections carousel
// ---------------------------------------------------------------------------

function FeaturedCarousel({ featured, isAdmin, onEdit, onToggleFeatured, onToggleVisibility, onDelete }: {
  featured: Category[]; isAdmin: boolean;
  onEdit: (c: Category) => void; onToggleFeatured: (c: Category) => void;
  onToggleVisibility: (c: Category) => void; onDelete: (c: Category) => void;
}) {
  const [idx, setIdx] = useState(0);
  const total = featured.length;

  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  if (total === 0) return null;

  return (
    <div className="col-featured-section">
      <div className="col-featured-header">
        <h2 className="col-section-title">Featured Collections</h2>
        {total > 1 && (
          <div className="col-carousel-nav">
            <button onClick={prev} className="col-carousel-btn" aria-label="Previous"><ChevronLeft size={16} /></button>
            <span className="col-carousel-count">{idx + 1} / {total}</span>
            <button onClick={next} className="col-carousel-btn" aria-label="Next"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      <div className="col-carousel-track">
        {featured.map((cat, i) => (
          <div
            key={cat.id}
            className={`col-carousel-slide ${i === idx ? 'col-carousel-slide--active' : i === (idx - 1 + total) % total ? 'col-carousel-slide--prev' : 'col-carousel-slide--next'}`}
            aria-hidden={i !== idx}
          >
            <FeaturedCollectionCard
              category={cat}
              isAdmin={isAdmin}
              onEdit={() => onEdit(cat)}
              onToggleFeatured={() => onToggleFeatured(cat)}
              onToggleVisibility={() => onToggleVisibility(cat)}
              onDelete={() => onDelete(cat)}
            />
          </div>
        ))}
      </div>

      {total > 1 && (
        <div className="col-carousel-dots">
          {featured.map((_, i) => (
            <button key={i} className={`col-carousel-dot ${i === idx ? 'col-carousel-dot--active' : ''}`} onClick={() => setIdx(i)} aria-label={`Go to ${i + 1}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Non-featured list row
// ---------------------------------------------------------------------------

function CollectionRow({ category, isAdmin, onEdit, onToggleFeatured, onToggleVisibility, onDelete }: {
  category: Category; isAdmin: boolean;
  onEdit: () => void; onToggleFeatured: () => void; onToggleVisibility: () => void; onDelete: () => void;
}) {
  const [stats, setStats] = useState<CategoryStats | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const desc = category.description || '';
  const descLong = desc.length > 100;

  useEffect(() => { getCategoryStats(category.id).then(setStats); }, [category.id]);

  return (
    <div className={`col-row ${!category.visibility && isAdmin ? 'col-row--hidden' : ''}`}>
      {/* Thumbnail */}
      <div className="col-row__thumb-wrap">
        {category.banner_image_url ? (
          <img src={category.banner_image_url} alt="" className="col-row__thumb" />
        ) : (
          <div className="col-row__thumb-placeholder">
            <span style={{ background: category.color, width: 20, height: 20, borderRadius: '50%', display: 'block' }} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="col-row__body">
        <div className="col-row__title-row">
          <span className="dot" style={{ background: category.color }} />
          <Link to={`/collections/${category.id}`} className="col-row__title">{category.name}</Link>
          {!category.visibility && isAdmin && <span className="badge">Hidden</span>}
          {category.featured && <span className="col-row__feat-chip"><Star size={10} fill="currentColor" /> featured</span>}
        </div>

        {desc && (
          <div className="col-row__desc">
            <span>{descExpanded || !descLong ? desc : `${desc.slice(0, 100)}…`}</span>
            {descLong && (
              <button className="link-btn col-readmore-btn" onClick={() => setDescExpanded((v) => !v)}>
                {descExpanded ? ' less' : ' more'}
              </button>
            )}
          </div>
        )}

        <div className="col-row__meta-row">
          {stats && (
            <>
              <span title="Entries"><Layers size={11} /> {stats.entryCount}</span>
              <span title="Books"><BookOpen size={11} /> {stats.bookCount}</span>
              <span title="Visits"><BarChart2 size={11} /> {stats.viewCount}</span>
            </>
          )}
          {category.created_at && (
            <span className="col-row__date"><Calendar size={11} /> {fmtDate(category.created_at)}</span>
          )}
        </div>

        <div className="row-actions">
          <Link to={`/collections/${category.id}`} className="link-btn icon-row"><ChevronRight size={13} /> Open</Link>
          {isAdmin && (
            <>
              <button className="link-btn icon-row" onClick={onEdit}><Pencil size={13} /> Edit</button>
              <button className="link-btn icon-row" onClick={onToggleFeatured}>
                <Star size={13} fill={category.featured ? 'currentColor' : 'none'} /> Feature
              </button>
              <button className="link-btn icon-row" onClick={onToggleVisibility}>
                {category.visibility ? <EyeOff size={13} /> : <Eye size={13} />} {category.visibility ? 'Hide' : 'Show'}
              </button>
              <button className="link-btn icon-row danger" onClick={onDelete}><Trash2 size={13} /> Delete</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CollectionsList
// ---------------------------------------------------------------------------

export function CollectionsList() {
  const { isAdmin } = useAdmin();
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  useTrackView('site', 'collections');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listCategories({ includeHidden: isAdmin });
      setCats(rows);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { reload(); }, [reload]);

  const remove = async (c: Category) => {
    if (!confirm(`Delete collection "${c.name}"?`)) return;
    await deleteCategory(c.id);
    reload();
  };

  const toggleFeatured = async (c: Category) => {
    await updateCategory(c.id, { featured: !c.featured });
    reload();
  };

  const toggleVisibility = async (c: Category) => {
    await updateCategory(c.id, { visibility: !c.visibility });
    reload();
  };

  const featured = cats.filter((c) => c.featured && (c.visibility || isAdmin));
  const rest = cats.filter((c) => !c.featured);

  return (
    <div className="page">
      <style>{COLLECTIONS_CSS}</style>

      <div className="page-head">
        <h1>Collections</h1>
        {isAdmin && (
          <button className="primary icon-row" onClick={() => setEditing('new')}>
            <Plus size={16} /> New collection
          </button>
        )}
      </div>

      <div className={`split-view ${editing ? 'has-detail' : ''}`}>
        <div className="split-list">

          {/* Featured carousel */}
          {loading ? (
            <div className="col-feat-skeleton-row">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : featured.length > 0 && (
            <FeaturedCarousel
              featured={featured}
              isAdmin={isAdmin}
              onEdit={setEditing}
              onToggleFeatured={toggleFeatured}
              onToggleVisibility={toggleVisibility}
              onDelete={remove}
            />
          )}

          {/* Non-featured list */}
          {rest.length > 0 && (
            <div className="col-list-section">
              {featured.length > 0 && <h2 className="col-section-title col-section-title--secondary">All Collections</h2>}
              <div className="col-list">
                {loading
                  ? [1, 2, 3].map((i) => <SkeletonRow key={i} />)
                  : rest.map((c) => (
                    <CollectionRow
                      key={c.id}
                      category={c}
                      isAdmin={isAdmin}
                      onEdit={() => setEditing(c)}
                      onToggleFeatured={() => toggleFeatured(c)}
                      onToggleVisibility={() => toggleVisibility(c)}
                      onDelete={() => remove(c)}
                    />
                  ))
                }
              </div>
            </div>
          )}

          {!loading && cats.length === 0 && (
            <p className="muted">No collections yet.</p>
          )}
        </div>

        {editing && (
          <CategoryForm
            initial={editing === 'new' ? null : editing}
            onSave={() => { setEditing(null); reload(); }}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategoryDetail
// ---------------------------------------------------------------------------

export function CategoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [category, setCategory] = useState<Category | null>(null);
  const [items, setItems] = useState<CategoryHeadingDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedExcerpt, setExpandedExcerpt] = useState<string | null>(null);
  const [selected, setSelected] = useState<CategoryHeadingDetail | null>(null);
  const [stats, setStats] = useState<CategoryStats | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  useTrackView('category', id ?? null);

  useEffect(() => {
    if (!id) return;
    setSelected(null);
    setLoading(true);
    Promise.all([
      listCategories({ includeHidden: true }),
      listCategoryHeadings(id),
      getCategoryStats(id),
    ]).then(([cats, headings, s]) => {
      setCategory(cats.find((c) => c.id === id) || null);
      setItems(headings);
      setStats(s);
    }).finally(() => setLoading(false));
  }, [id]);

  const desc = category?.description || '';
  const descLong = desc.length > 200;

  return (
    <div className="page collection-detail-page">
      <style>{COLLECTIONS_CSS}</style>

      <div className="page-head">
        <div>
          <button className="link-btn" onClick={() => navigate('/collections')}>← Collections</button>
          <h1>{category?.name || '…'}</h1>

          {desc && (
            <div className="col-detail-desc">
              <p className="muted">{descExpanded || !descLong ? desc : `${desc.slice(0, 200)}…`}</p>
              {descLong && (
                <button className="link-btn col-readmore-btn" onClick={() => setDescExpanded((v) => !v)}>
                  {descExpanded ? 'Read less ↑' : 'Read more ↓'}
                </button>
              )}
            </div>
          )}

          {stats && (
            <div className="col-detail-stats">
              <span><Layers size={13} /> <strong>{stats.entryCount}</strong> entries</span>
              <span><BookOpen size={13} /> <strong>{stats.bookCount}</strong> books</span>
              <span><BarChart2 size={13} /> <strong>{stats.viewCount}</strong> visits</span>
              {category?.created_at && (
                <span><Calendar size={13} /> Created {fmtDate(category.created_at)}</span>
              )}
              {category?.updated_at && category.updated_at !== category.created_at && (
                <span><RefreshCw size={13} /> Updated {fmtDate(category.updated_at)}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`split-view ${selected ? 'has-detail' : ''}`}>
        <div className="split-list col-detail-list">
          {loading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="col-detail-skeleton">
                  <div className="skeleton-pulse" style={{ width: 48, height: 64, flexShrink: 0, borderRadius: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton-pulse" style={{ width: '50%', height: 14, marginBottom: 6 }} />
                    <div className="skeleton-pulse" style={{ width: '80%', height: 11, marginBottom: 4 }} />
                    <div className="skeleton-pulse" style={{ width: '60%', height: 11 }} />
                  </div>
                </div>
              ))}
            </>
          ) : items.length === 0 ? (
            <p className="muted">No headings in this collection yet.</p>
          ) : (
            items.map(({ heading, book }) => {
              const excerpt = docToPlainText(heading.content).slice(0, 200);
              const expanded = expandedExcerpt === heading.id;
              const isActive = selected?.heading.id === heading.id;

              return (
                <div
                  key={heading.id}
                  className={`col-detail-item ${isActive ? 'col-detail-item--active' : ''}`}
                  onClick={() => setSelected({ heading, book })}
                >
                  {/* Book cover */}
                  {book.cover_image_url ? (
                    <img src={book.cover_image_url} alt="" className="col-detail-cover" />
                  ) : (
                    <div className="col-detail-cover-placeholder" />
                  )}

                  <div className="col-detail-body">
                    {/* Book name + page */}
                    <div className="col-detail-book-row">
                      <span className="col-detail-book-name">{book.title}</span>
                      {book.author && <span className="col-detail-author"> — {book.author}</span>}
                      {heading.page_number && (
                        <span className="col-detail-page">
                          <Hash size={10} /> p. {heading.page_number}
                        </span>
                      )}
                    </div>

                    {/* Excerpt */}
                    <p className="col-detail-excerpt">
                      {expanded ? docToPlainText(heading.content) : excerpt}
                      {excerpt.length >= 200 && !expanded ? '…' : ''}
                    </p>

                    <div className="row-actions">
                      {excerpt.length >= 200 && (
                        <button className="link-btn" onClick={(e) => { e.stopPropagation(); setExpandedExcerpt(expanded ? null : heading.id); }}>
                          {expanded ? 'less' : 'read more'}
                        </button>
                      )}
                      <button className="link-btn icon-row" onClick={(e) => { e.stopPropagation(); setSelected({ heading, book }); }}>
                        <ChevronRight size={13} /> Preview
                      </button>
                      <Link
                        className="link-btn icon-row"
                        to={`/book/${book.slug}#${heading.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={13} /> New tab
                      </Link>
                      <Link
                        className="link-btn icon-row"
                        to={`/book/${book.slug}#${heading.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Read
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Preview panel */}
        {selected && (
          <div className="split-detail">
            <button className="link-btn detail-close" onClick={() => setSelected(null)}>← Close</button>
            <div className="side-panel-head">
              <div>
                <h3>{selected.book.title}</h3>
                <p className="muted">{selected.book.author}</p>
              </div>
              <div className="side-panel-actions">
                <Link to={`/book/${selected.book.slug}#${selected.heading.id}`} target="_blank" rel="noopener noreferrer" className="icon-row">
                  <ExternalLink size={14} /> New tab
                </Link>
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
// CSS for Collections
// ---------------------------------------------------------------------------

const COLLECTIONS_CSS = `
/* ── Skeleton ─────────────── */
.skeleton-pulse {
  background: color-mix(in srgb, var(--border) 80%, var(--fg) 20%);
  border-radius: 4px;
  animation: skeletonPulse 1.4s ease-in-out infinite;
}
@keyframes skeletonPulse { 0%,100%{opacity:1} 50%{opacity:.4} }

.col-skeleton-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.col-skeleton__img { height: 180px; background: var(--border); animation: skeletonPulse 1.4s ease-in-out infinite; }
.col-skeleton__body { padding: 1rem; }
.col-skeleton-row {
  display: flex; gap: 0.8rem; padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
}
.col-skeleton__thumb { width: 52px; height: 52px; border-radius: 6px; flex-shrink: 0; animation: skeletonPulse 1.4s ease-in-out infinite; background: var(--border); }
.col-skeleton__row-body { flex: 1; }
.col-feat-skeleton-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 2rem; }
@media(max-width:600px){ .col-feat-skeleton-row{grid-template-columns:1fr;} }

/* ── Section titles ─────────── */
.col-section-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--fg);
  margin: 0 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.col-section-title--secondary { margin-top: 2rem; }

/* ── Featured card ──────────── */
.col-featured-section { margin-bottom: 2rem; }
.col-featured-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 1rem;
}
.col-carousel-nav { display: flex; align-items: center; gap: 0.5rem; }
.col-carousel-btn {
  width: 30px; height: 30px; border-radius: 50%;
  border: 1px solid var(--border); background: var(--surface);
  display: grid; place-items: center; color: var(--fg);
  transition: border-color 0.15s, color 0.15s;
}
.col-carousel-btn:hover { border-color: var(--accent); color: var(--accent); }
.col-carousel-count { font-size: 0.78rem; color: var(--muted); }

.col-carousel-track { position: relative; overflow: hidden; min-height: 340px; }
.col-carousel-slide {
  position: absolute; inset: 0;
  transition: transform 0.45s cubic-bezier(.4,0,.2,1), opacity 0.45s;
  opacity: 0; pointer-events: none;
  transform: translateX(100%);
}
.col-carousel-slide--active { opacity: 1; pointer-events: auto; transform: translateX(0); }
.col-carousel-slide--prev { transform: translateX(-100%); }
.col-carousel-slide--next { transform: translateX(100%); }

.col-carousel-dots {
  display: flex; justify-content: center; gap: 0.4rem; margin-top: 0.8rem;
}
.col-carousel-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--border); padding: 0;
  transition: background 0.2s, transform 0.2s;
}
.col-carousel-dot--active { background: var(--accent); transform: scale(1.35); }

.col-feat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 0;
  transition: box-shadow 0.25s, border-color 0.2s;
  height: 100%;
}
.col-feat-card:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); box-shadow: 0 8px 28px rgba(0,0,0,0.1); }
.col-feat-card--hidden { opacity: 0.6; }

.col-feat-card__img-wrap { position: relative; min-height: 200px; }
.col-feat-card__img { width: 100%; height: 100%; object-fit: cover; display: block; }
.col-feat-card__img-placeholder {
  width: 100%; height: 100%; min-height: 200px;
  background: color-mix(in srgb, var(--border) 70%, var(--bg));
  display: grid; place-items: center;
}
.col-feat-card__hidden-badge {
  position: absolute; top: 0.5rem; left: 0.5rem;
  background: rgba(0,0,0,0.6); color: #fff;
  font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
  padding: 0.2rem 0.5rem; border-radius: 4px;
}
.col-feat-card__dot {
  width: 40px; height: 40px; border-radius: 50%; display: block;
}

.col-feat-card__body { padding: 1.2rem 1.3rem; display: flex; flex-direction: column; gap: 0.5rem; }
.col-feat-card__label {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--accent);
}
.col-feat-card__title { margin: 0; font-size: 1.2rem; line-height: 1.3; }
.col-feat-card__title a { text-decoration: none; color: var(--fg); }
.col-feat-card__title a:hover { color: var(--accent); }

.col-feat-card__desc { font-size: 0.88rem; color: var(--muted); line-height: 1.65; }
.col-feat-card__desc p { margin: 0 0 0.2rem; }
.col-readmore-btn { font-size: 0.78rem; }

.col-feat-card__stats {
  display: flex; gap: 1rem;
  font-size: 0.78rem; color: var(--muted);
}
.col-feat-card__stats span { display: flex; align-items: center; gap: 0.25rem; }

.col-feat-card__meta {
  display: flex; gap: 0.8rem; flex-wrap: wrap;
  font-size: 0.72rem; color: var(--muted);
}
.col-feat-card__meta span { display: flex; align-items: center; gap: 0.25rem; }

.col-feat-card__actions { margin-top: auto; }
.col-open-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  background: var(--accent); color: #fff;
  padding: 0.45rem 1rem; border-radius: 6px;
  font-size: 0.82rem; font-weight: 600; text-decoration: none;
  transition: opacity 0.15s;
  margin-bottom: 0.5rem;
}
.col-open-btn:hover { opacity: 0.88; }
.col-admin-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; font-size: 0.72rem; margin-top: 0.3rem; }
.col-admin-actions button { display: inline-flex; align-items: center; gap: 0.25rem; color: var(--muted); border-bottom: 1px solid transparent; }
.col-admin-actions button:hover { color: var(--accent); border-bottom-color: var(--accent); }
.col-admin-actions button.danger:hover { color: #c0392b; border-bottom-color: #c0392b; }

@media(max-width: 640px) {
  .col-feat-card { grid-template-columns: 1fr; }
  .col-feat-card__img-wrap { min-height: 160px; max-height: 200px; }
}

/* ── Non-featured list row ─── */
.col-list-section { margin-top: 1rem; }
.col-list { display: flex; flex-direction: column; }
.col-row {
  display: flex; gap: 0.9rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}
.col-row--hidden { opacity: 0.55; }
.col-row__thumb-wrap { flex-shrink: 0; }
.col-row__thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; display: block; }
.col-row__thumb-placeholder {
  width: 56px; height: 56px; border-radius: 6px;
  background: var(--border); display: grid; place-items: center;
}
.col-row__body { flex: 1; min-width: 0; }
.col-row__title-row { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.25rem; }
.col-row__title { font-weight: 600; font-size: 0.95rem; color: var(--fg); text-decoration: none; }
.col-row__title:hover { color: var(--accent); }
.col-row__feat-chip {
  display: inline-flex; align-items: center; gap: 0.2rem;
  font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  padding: 0.1rem 0.35rem; border-radius: 4px;
}
.col-row__desc { font-size: 0.84rem; color: var(--muted); margin-bottom: 0.35rem; line-height: 1.55; }
.col-row__meta-row {
  display: flex; gap: 0.8rem; flex-wrap: wrap;
  font-size: 0.72rem; color: var(--muted); margin-bottom: 0.35rem;
}
.col-row__meta-row span { display: flex; align-items: center; gap: 0.25rem; }
.col-row__date { font-style: italic; }

/* ── Collection detail list ── */
.col-detail-list { max-width: 760px; }
.col-detail-stats {
  display: flex; gap: 1.2rem; flex-wrap: wrap;
  font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem;
}
.col-detail-stats span { display: flex; align-items: center; gap: 0.3rem; }
.col-detail-stats strong { color: var(--fg); }
.col-detail-desc { margin: 0.4rem 0; }
.col-detail-desc p { margin: 0 0 0.25rem; font-size: 0.88rem; }

.col-detail-skeleton { display: flex; gap: 0.8rem; padding: 0.75rem 0; border-bottom: 1px solid var(--border); }

.col-detail-item {
  display: flex; gap: 0.9rem;
  padding: 0.85rem 0.6rem;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.12s;
}
.col-detail-item:hover { background: color-mix(in srgb, var(--accent) 5%, var(--bg)); }
.col-detail-item--active { background: color-mix(in srgb, var(--accent) 8%, var(--bg)); border-left: 3px solid var(--accent); padding-left: 0.9rem; }

.col-detail-cover { width: 48px; height: 64px; object-fit: cover; flex-shrink: 0; border-radius: 4px; display: block; }
.col-detail-cover-placeholder { width: 48px; height: 64px; flex-shrink: 0; border-radius: 4px; background: var(--border); }
.col-detail-body { flex: 1; min-width: 0; }
.col-detail-book-row { display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
.col-detail-book-name { font-weight: 700; font-size: 0.92rem; color: var(--fg); }
.col-detail-author { font-size: 0.82rem; color: var(--muted); }
.col-detail-page { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.72rem; color: var(--muted); border: 1px solid var(--border); padding: 0.1rem 0.35rem; border-radius: 4px; }
.col-detail-excerpt { font-size: 0.86rem; color: var(--muted); line-height: 1.55; margin: 0 0 0.4rem; }

@media(max-width:640px){
  .col-feat-card__body { padding: 1rem; }
  .col-carousel-track { min-height: 400px; }
}
`;