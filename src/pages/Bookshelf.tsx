import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Eye, EyeOff, Trash2, Plus, Star, BookOpen, Users } from 'lucide-react';
import {
  Book,
  createBook,
  deleteBook,
  getBookStats,
  listBooks,
  replaceSourceLinks,
  updateBook,
  uploadImage,
} from '../lib/supabase';
import { useAdmin, useTrackView } from '../lib/context';
import { RichEditor } from '../components/Editor';
import { ImageCarousel, useImageLightbox, ImageLightboxProvider } from '../lib/richtext';

interface BookFormState {
  title: string;
  author: string;
  publisher: string;
  base_language: string;
  cover_image_url: string;
  detail_image_urls: string[];
  description: any;
  visibility: boolean;
  featured: boolean;
  source_links: { label: string; url: string }[];
}

const EMPTY_FORM: BookFormState = {
  title: '',
  author: '',
  publisher: '',
  base_language: '',
  cover_image_url: '',
  detail_image_urls: [],
  description: null,
  visibility: true,
  featured: false,
  source_links: [],
};

function BookForm({ initial, onSave, onCancel }: { initial: (Book & { source_links?: any[] }) | null; onSave: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<BookFormState>(() =>
    initial
      ? {
          title: initial.title,
          author: initial.author || '',
          publisher: initial.publisher || '',
          base_language: initial.base_language || '',
          cover_image_url: initial.cover_image_url || '',
          detail_image_urls: initial.detail_image_urls || [],
          description: initial.description,
          visibility: initial.visibility,
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

      <label>
        Cover image (required)
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} />
      </label>
      {form.cover_image_url && <img src={form.cover_image_url} alt="cover preview" className="cover-preview" />}

      <label>
        Title *
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <label>
        Author
        <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
      </label>
      <label>
        Publisher
        <input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
      </label>
      <label>
        Base language
        <input value={form.base_language} onChange={(e) => setForm({ ...form, base_language: e.target.value })} placeholder="Bangla / English / …" />
      </label>

      <label>
        Detail images
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadDetail(e.target.files[0])} />
      </label>
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

      <label className="check">
        <input type="checkbox" checked={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.checked })} />
        Visible to guests
      </label>
      <label className="check">
        <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
        Featured on Bookshelf
      </label>

      <div className="modal-actions">
        <button className="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function FeaturedBook({
  book, isAdmin, onEdit, onToggleFeatured, onToggleVisibility, onDelete,
}: {
  book: Book;
  isAdmin: boolean;
  onEdit: () => void;
  onToggleFeatured: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}) {
  const openLightbox = useImageLightbox();
  const [stats, setStats] = useState<{ headingCount: number; viewCount: number } | null>(null);
  useEffect(() => { getBookStats(book.id).then(setStats); }, [book.id]);

  const images = [book.cover_image_url, ...(book.detail_image_urls || [])].filter(Boolean) as string[];

  return (
    <div className="featured-card">
      <div className="featured-carousel">
        <ImageCarousel images={images} onImageClick={openLightbox} />
      </div>
      <div>
        <p className="featured-label icon-row"><Star size={13} fill="currentColor" /> Featured</p>
        <h2><Link to={`/book/${book.slug}`}>{book.title}</Link></h2>
        {book.author && <p className="muted">{book.author}</p>}
        <div className="featured-stats">
          <span className="icon-row"><BookOpen size={15} /> <strong>{stats?.headingCount ?? '—'}</strong>&nbsp;findings</span>
          <span className="icon-row"><Users size={15} /> <strong>{stats?.viewCount ?? '—'}</strong>&nbsp;visits</span>
        </div>
        {/* Previously the featured book was rendered without any admin
            controls at all, so once a book was featured there was no way
            to edit it, un-feature it, hide it, or delete it. */}
        {isAdmin && (
          <div className="card-admin-actions">
            <button onClick={onEdit}><Pencil size={13} /> Edit</button>
            <button onClick={onToggleFeatured} title="Remove from featured"><Star size={13} fill="currentColor" /> Unfeature</button>
            <button onClick={onToggleVisibility}>{book.visibility ? <EyeOff size={13} /> : <Eye size={13} />} {book.visibility ? 'Hide' : 'Show'}</button>
            <button className="danger" onClick={onDelete}><Trash2 size={13} /> Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Bookshelf() {
  const { isAdmin } = useAdmin();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Book | null | 'new'>(null);
  useTrackView('site', 'bookshelf');

  const reload = () => {
    setLoading(true);
    listBooks({ includeHidden: isAdmin })
      .then(setBooks)
      .finally(() => setLoading(false));
  };

  useEffect(reload, [isAdmin]);

  const toggleVisibility = async (b: Book) => {
    await updateBook(b.id, { visibility: !b.visibility });
    reload();
  };
  const toggleFeatured = async (b: Book) => {
    await updateBook(b.id, { featured: !b.featured });
    reload();
  };
  const remove = async (b: Book) => {
    if (!confirm(`Delete "${b.title}"? This cannot be undone.`)) return;
    await deleteBook(b.id);
    reload();
  };

  const featured = books.find((b) => b.featured && b.visibility);
  const rest = books.filter((b) => b.id !== featured?.id);

  return (
    <div className="page bookshelf-page">
      <div className="page-head">
        <h1>Bookshelf</h1>
        {isAdmin && <button className="primary icon-row" onClick={() => setEditing('new')}><Plus size={16} /> New book</button>}
      </div>

      <div className={`split-view ${editing ? 'has-detail' : ''}`}>
        <div className="split-list">
          {loading ? (
            <p className="muted">Loading…</p>
          ) : books.length === 0 ? (
            <p className="muted">No books yet.</p>
          ) : (
            <>
              {featured && (
                <ImageLightboxProvider>
                  <FeaturedBook
                    book={featured}
                    isAdmin={isAdmin}
                    onEdit={() => setEditing(featured)}
                    onToggleFeatured={() => toggleFeatured(featured)}
                    onToggleVisibility={() => toggleVisibility(featured)}
                    onDelete={() => remove(featured)}
                  />
                </ImageLightboxProvider>
              )}
              <div className="book-grid">
                {rest.map((b) => (
                  <div key={b.id} className={`book-grid-card ${!b.visibility ? 'hidden-book' : ''}`}>
                    <Link to={`/book/${b.slug}`}>
                      {b.cover_image_url ? <img src={b.cover_image_url} alt={b.title} /> : <div className="cover-placeholder" />}
                    </Link>
                    <p className="row-title"><Link to={`/book/${b.slug}`}>{b.title}</Link>{!b.visibility && <span className="badge">Hidden</span>}</p>
                    {b.author && <p className="row-meta muted">{b.author}</p>}
                    {isAdmin && (
                      <div className="card-admin-actions">
                        <button onClick={() => setEditing(b)} title="Edit"><Pencil size={13} /></button>
                        <button onClick={() => toggleFeatured(b)} title={b.featured ? 'Remove from featured' : 'Make featured'}>
                          <Star size={13} fill={b.featured ? 'currentColor' : 'none'} />
                        </button>
                        <button onClick={() => toggleVisibility(b)} title={b.visibility ? 'Hide' : 'Show'}>{b.visibility ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                        <button className="danger" onClick={() => remove(b)} title="Delete"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
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
  );
}