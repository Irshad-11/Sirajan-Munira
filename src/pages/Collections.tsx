import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, ExternalLink, ChevronRight } from 'lucide-react';
import {
  Category,
  CategoryHeadingDetail,
  createCategory,
  deleteCategory,
  listCategories,
  listCategoryHeadings,
  updateCategory,
  uploadImage,
} from '../lib/supabase';
import { useAdmin, useTrackView } from '../lib/context';
import { RichTextView, docToPlainText } from '../lib/richtext';

function CategoryForm({ initial, onSave, onCancel }: { initial: Category | null; onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || '#6b5b95');
  const [banner, setBanner] = useState(initial?.banner_image_url || '');
  const [description, setDescription] = useState(initial?.description || '');

  const uploadBanner = async (file: File) => setBanner(await uploadImage(file, 'category-banners'));

  const save = async () => {
    if (!name.trim()) return alert('Name is required.');
    if (initial) await updateCategory(initial.id, { name, color, banner_image_url: banner, description });
    else await createCategory({ name, color, banner_image_url: banner, description });
    onSave();
  };

  return (
    <div className="split-detail">
      <button className="link-btn detail-close" onClick={onCancel}>← Close</button>
      <h3>{initial ? 'Edit collection' : 'New collection'}</h3>
      <label>Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Folder color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      <label>Banner image <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])} /></label>
      {banner && <img src={banner} alt="" className="cover-preview" />}
      <label>Description <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></label>
      <div className="modal-actions">
        <button className="primary" onClick={save}>Save</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function CollectionsList() {
  const { isAdmin } = useAdmin();
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  useTrackView('site', 'collections');

  const reload = () => listCategories().then(setCats);
  useEffect(() => { reload(); }, []);

  const remove = async (c: Category) => {
    if (!confirm(`Delete collection "${c.name}"?`)) return;
    await deleteCategory(c.id);
    reload();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Collections</h1>
        {isAdmin && <button className="primary icon-row" onClick={() => setEditing('new')}><Plus size={16} /> New collection</button>}
      </div>

      <div className={`split-view ${editing ? 'has-detail' : ''}`}>
        <div className="split-list">
          {cats.length === 0 && <p className="muted">No collections yet.</p>}
          <div className="row-list">
            {cats.map((c) => (
              <div key={c.id} className="row-item">
                {c.banner_image_url ? <img src={c.banner_image_url} alt="" className="row-thumb" /> : <div className="row-thumb-placeholder" />}
                <div className="row-body">
                  <p className="row-title">
                    <span className="dot" style={{ background: c.color }} />
                    <Link to={`/collections/${c.id}`}>{c.name}</Link>
                  </p>
                  {c.description && <p className="row-excerpt">{c.description}</p>}
                  <div className="row-actions">
                    <Link to={`/collections/${c.id}`} className="link-btn icon-row"><ChevronRight size={13} /> Open</Link>
                    {isAdmin && <button className="link-btn icon-row" onClick={() => setEditing(c)}><Pencil size={13} /> Edit</button>}
                    {isAdmin && <button className="link-btn icon-row" onClick={() => remove(c)}><Trash2 size={13} /> Delete</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {editing && (
          <CategoryForm initial={editing === 'new' ? null : editing} onSave={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
        )}
      </div>
    </div>
  );
}

export function CategoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [category, setCategory] = useState<Category | null>(null);
  const [items, setItems] = useState<CategoryHeadingDetail[]>([]);
  const [expandedExcerpt, setExpandedExcerpt] = useState<string | null>(null);
  const [selected, setSelected] = useState<CategoryHeadingDetail | null>(null);
  useTrackView('category', id ?? null);

  useEffect(() => {
    if (!id) return;
    setSelected(null);
    listCategories().then((cats) => setCategory(cats.find((c) => c.id === id) || null));
    listCategoryHeadings(id).then(setItems);
  }, [id]);

  return (
    <div className="page collection-detail-page">
      <div className="page-head">
        <div>
          <button className="link-btn" onClick={() => navigate('/collections')}>← Collections</button>
          <h1>{category?.name || '…'}</h1>
          {category?.description && <p className="muted">{category.description}</p>}
        </div>
      </div>

      <div className={`split-view ${selected ? 'has-detail' : ''}`}>
        <div className="split-list">
          {items.map(({ heading, book }) => {
            const excerpt = docToPlainText(heading.content).slice(0, 200);
            const expanded = expandedExcerpt === heading.id;
            return (
              <div key={heading.id} className="category-heading-item">
                {book.cover_image_url ? <img src={book.cover_image_url} alt="" className="row-thumb" /> : <div className="row-thumb-placeholder" />}
                <div className={`chi-main ${selected?.heading.id === heading.id ? 'active' : ''}`} onClick={() => setSelected({ heading, book })}>
                  <h4>{book.title}{book.author ? ` — ${book.author}` : ''}</h4>
                  {heading.page_number != null && <span className="page-badge">p. {heading.page_number}</span>}
                  <p className="excerpt">{expanded ? docToPlainText(heading.content) : excerpt}{excerpt.length >= 200 && !expanded ? '…' : ''}</p>
                  <div className="row-actions">
                    {excerpt.length >= 200 && (
                      <button className="link-btn" onClick={(e) => { e.stopPropagation(); setExpandedExcerpt(expanded ? null : heading.id); }}>
                        {expanded ? 'less' : 'read more'}
                      </button>
                    )}
                    <button className="link-btn icon-row" onClick={(e) => { e.stopPropagation(); setSelected({ heading, book }); }}><ChevronRight size={13} /> Open</button>
                    <Link className="link-btn icon-row" to={`/book/${book.slug}#${heading.id}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink size={13} /> New tab</Link>
                  </div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && <p className="muted">No headings in this collection yet.</p>}
        </div>

        {selected && (
          <div className="split-detail">
            <button className="link-btn detail-close" onClick={() => setSelected(null)}>← Close</button>
            <div className="side-panel-head">
              <div>
                <h3>{selected.book.title}</h3>
                <p className="muted">{selected.book.author}</p>
              </div>
              <div className="side-panel-actions">
                <Link to={`/book/${selected.book.slug}#${selected.heading.id}`} target="_blank" rel="noopener noreferrer" className="icon-row"><ExternalLink size={14} /> New tab</Link>
              </div>
            </div>
            <RichTextView doc={selected.heading.content} />
          </div>
        )}
      </div>
    </div>
  );
}