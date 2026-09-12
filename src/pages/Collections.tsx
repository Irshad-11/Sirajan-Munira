import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? 'কালেকশন সম্পাদনা / Edit Collection' : 'নতুন কালেকশন / New Collection'}</h3>
        <label>নাম / Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>রঙ / Folder color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <label>ব্যানার / Banner image <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])} /></label>
        {banner && <img src={banner} alt="" className="cover-preview" />}
        <label>বিবরণ / Description <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></label>
        <div className="modal-actions">
          <button className="primary" onClick={save}>Save</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
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
        <h1>সংগ্রহ / Collections</h1>
        {isAdmin && <button className="primary" onClick={() => setEditing('new')}>+ নতুন কালেকশন / New collection</button>}
      </div>
      {cats.length === 0 && <p className="muted">No collections yet.</p>}
      <div className="category-grid">
        {cats.map((c) => (
          <Link to={`/collections/${c.id}`} key={c.id} className="category-card" style={{ borderColor: c.color }}>
            {c.banner_image_url && <img src={c.banner_image_url} alt="" />}
            <div className="category-card-body">
              <span className="dot" style={{ background: c.color }} />
              <h3>{c.name}</h3>
              {c.description && <p className="muted">{c.description}</p>}
            </div>
            {isAdmin && (
              <div className="card-admin-actions" onClick={(e) => e.preventDefault()}>
                <button onClick={() => setEditing(c)}>Edit</button>
                <button className="danger" onClick={() => remove(c)}>Delete</button>
              </div>
            )}
          </Link>
        ))}
      </div>
      {editing && <CategoryForm initial={editing === 'new' ? null : editing} onSave={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />}
    </div>
  );
}

export function CategoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [category, setCategory] = useState<Category | null>(null);
  const [items, setItems] = useState<CategoryHeadingDetail[]>([]);
  const [expandedExcerpt, setExpandedExcerpt] = useState<string | null>(null);
  const [panelItem, setPanelItem] = useState<CategoryHeadingDetail | null>(null);
  useTrackView('category', id ?? null);

  useEffect(() => {
    if (!id) return;
    listCategories().then((cats) => setCategory(cats.find((c) => c.id === id) || null));
    listCategoryHeadings(id).then(setItems);
  }, [id]);

  return (
    <div className="page collection-detail-page">
      <button className="link-btn" onClick={() => navigate('/collections')}>← সংগ্রহে ফিরুন / Back to collections</button>
      <h1>{category?.name || '…'}</h1>
      {category?.description && <p className="muted">{category.description}</p>}

      <div className="category-heading-list">
        {items.map(({ heading, book }) => {
          const excerpt = docToPlainText(heading.content).slice(0, 220);
          const expanded = expandedExcerpt === heading.id;
          return (
            <div key={heading.id} className="category-heading-item">
              <div className="chi-main" onClick={() => setPanelItem({ heading, book })}>
                <h4>{book.title}{book.author ? ` — ${book.author}` : ''}</h4>
                {heading.page_number != null && <span className="page-badge">p. {heading.page_number}</span>}
                <p className="excerpt">{expanded ? docToPlainText(heading.content) : excerpt}{excerpt.length >= 220 && !expanded ? '…' : ''}</p>
              </div>
              <div className="chi-actions">
                {excerpt.length >= 220 && (
                  <button className="link-btn" onClick={() => setExpandedExcerpt(expanded ? null : heading.id)}>
                    {expanded ? 'সংক্ষিপ্ত / less' : 'আরও পড়ুন / read more'}
                  </button>
                )}
                <button className="link-btn" onClick={() => setPanelItem({ heading, book })}>খুলুন / Open</button>
                <Link className="link-btn" to={`/book/${book.slug}#${heading.id}`} target="_blank" rel="noopener noreferrer">নতুন ট্যাবে / New tab ↗</Link>
              </div>
            </div>
          );
        })}
        {items.length === 0 && <p className="muted">No headings in this collection yet.</p>}
      </div>

      {panelItem && (
        <div className="side-panel-backdrop" onClick={() => setPanelItem(null)}>
          <div className="side-panel" onClick={(e) => e.stopPropagation()}>
            <div className="side-panel-head">
              <div>
                <h3>{panelItem.book.title}</h3>
                <p className="muted">{panelItem.book.author}</p>
              </div>
              <div className="side-panel-actions">
                <Link to={`/book/${panelItem.book.slug}#${panelItem.heading.id}`} target="_blank" rel="noopener noreferrer">নতুন ট্যাবে / New tab ↗</Link>
                <button onClick={() => setPanelItem(null)}>✕</button>
              </div>
            </div>
            <RichTextView doc={panelItem.heading.content} />
          </div>
        </div>
      )}
    </div>
  );
}
