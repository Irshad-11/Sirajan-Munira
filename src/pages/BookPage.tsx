import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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
import { RichTextView, docToMarkdown, ImageLightboxProvider } from '../lib/richtext';
import { RichEditor } from '../components/Editor';

function SourceLinks({ links }: { links: { label: string; url: string }[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!links.length) return null;
  const visible = showAll ? links : links.slice(0, 3);
  return (
    <div className="source-links no-print">
      <h4>উৎস / Sources</h4>
      <ul>
        {visible.map((l, i) => (
          <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a></li>
        ))}
      </ul>
      {links.length > 3 && (
        <button className="link-btn" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'কম দেখান / Show less' : `আরও দেখান / Show more (${links.length - 3})`}
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
        <h3>কালেকশনে যোগ করুন / Assign to collections</h3>
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

function HeadingBlock({ heading, book, onChanged }: { heading: Heading; book: Book; onChanged: () => void }) {
  const { isAdmin } = useAdmin();
  const { toggleBookmark, isBookmarked, copySettings } = usePrefs();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(heading.content);
  const [pageNumber, setPageNumber] = useState<number | ''>(heading.page_number ?? '');
  const [assigning, setAssigning] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    const url = `${window.location.origin}/book/${book.slug}#${heading.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    trackEvent('interact', 'heading', heading.id);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyContent = () => {
    const parts: Record<string, string> = {
      content: docToMarkdown(heading.content),
      title: copySettings.includeBookTitle ? `— ${book.title}` : '',
      page: copySettings.includePageNumber && heading.page_number ? `p. ${heading.page_number}` : '',
      source: copySettings.includeSourceLink && book.source_links?.[0] ? book.source_links[0].url : '',
    };
    const text = copySettings.order.map((k) => parts[k]).filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    trackEvent('interact', 'heading', heading.id);
  };

  const save = async () => {
    await updateHeading(heading.id, { content, page_number: pageNumber === '' ? null : Number(pageNumber) });
    setEditing(false);
    onChanged();
  };

  const remove = async () => {
    if (!confirm('Delete this heading? This cannot be undone.')) return;
    await deleteHeading(heading.id);
    onChanged();
  };

  return (
    <div id={heading.id} className="heading-block">
      <div className="heading-controls no-print">
        <button className="icon-link" title="Copy deep link" onClick={copyUrl}>{copied ? '✓ কপি হয়েছে' : '🔗'}</button>
        <button className={`icon-bookmark ${isBookmarked(heading.id) ? 'active' : ''}`} title="Bookmark" onClick={() => toggleBookmark(heading.id)}>
          {isBookmarked(heading.id) ? '★' : '☆'}
        </button>
        <button className="icon-copy" title="Copy content + citation" onClick={copyContent}>⧉ Copy</button>
        {heading.page_number != null && <span className="page-badge">p. {heading.page_number}</span>}
        {isAdmin && (
          <>
            <button onClick={() => setEditing((e) => !e)}>{editing ? 'বন্ধ / Close' : 'Edit'}</button>
            <button onClick={() => setAssigning(true)}>+ Collection</button>
            <button className="danger" onClick={remove}>Delete</button>
          </>
        )}
      </div>

      {editing ? (
        <div className="heading-editor">
          <label>
            পৃষ্ঠা নম্বর / Page number
            <input type="number" value={pageNumber} onChange={(e) => setPageNumber(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <RichEditor content={content} onChange={setContent} imagePathPrefix={`headings/${heading.id}`} autosaveKey={heading.id} />
          <div className="modal-actions">
            <button className="primary" onClick={save}>Save</button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <RichTextView doc={heading.content} />
      )}

      {assigning && <CategoryAssign heading={heading} onClose={() => setAssigning(false)} />}
    </div>
  );
}

function AddHeading({ book, nextSortOrder, onAdded }: { book: Book; nextSortOrder: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<1 | 2 | 3 | 4>(1);
  const [pageNumber, setPageNumber] = useState<number | ''>('');
  const [content, setContent] = useState<any>({
    type: 'doc',
    content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '' }] }],
  });

  const add = async () => {
    await createHeading({
      book_id: book.id,
      level,
      content,
      page_number: pageNumber === '' ? null : Number(pageNumber),
      sort_order: nextSortOrder,
    });
    setOpen(false);
    setContent({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [] }] });
    onAdded();
  };

  if (!open) return <button className="primary add-heading-btn no-print" onClick={() => setOpen(true)}>+ নতুন হেডিং / New heading</button>;

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>নতুন হেডিং / New heading</h3>
        <label>
          লেভেল / Level
          <select value={level} onChange={(e) => setLevel(Number(e.target.value) as 1 | 2 | 3 | 4)}>
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
            <option value={4}>H4</option>
          </select>
        </label>
        <label>
          পৃষ্ঠা নম্বর / Page number
          <input type="number" value={pageNumber} onChange={(e) => setPageNumber(e.target.value === '' ? '' : Number(e.target.value))} />
        </label>
        <RichEditor content={content} onChange={setContent} imagePathPrefix={`headings/new-${book.id}`} />
        <div className="modal-actions">
          <button className="primary" onClick={add}>Add heading</button>
          <button onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function BookPage() {
  const { slug } = useParams();
  const { isAdmin } = useAdmin();
  const [book, setBook] = useState<Book | null>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [loading, setLoading] = useState(true);
  useTrackView('book', book?.id ?? null);

  const load = async () => {
    if (!slug) return;
    setLoading(true);
    const b = await getBookBySlug(slug);
    setBook(b);
    if (b) setHeadings(await listHeadings(b.id));
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
    const el = document.getElementById(id);
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('deep-link-highlight');
        setTimeout(() => el.classList.remove('deep-link-highlight'), 2200);
      }, 150);
    }
  }, [loading, headings]);

  const nextSortOrder = useMemo(() => (headings.length ? Math.max(...headings.map((h) => h.sort_order)) + 1 : 0), [headings]);

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (!book) return <div className="page"><p>Book not found.</p></div>;

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
            {book.author && <p className="meta-line">লেখক / Author: {book.author}</p>}
            {book.publisher && <p className="meta-line">প্রকাশক / Publisher: {book.publisher}</p>}
            {book.base_language && <p className="meta-line">ভাষা / Language: {book.base_language}</p>}
            <SourceLinks links={book.source_links || []} />
            {book.detail_image_urls?.length > 0 && (
              <div className="detail-images no-print">
                {book.detail_image_urls.map((u, i) => <img key={i} src={u} alt="" />)}
              </div>
            )}
          </div>
        </div>

        {book.description && (
          <div className="book-description">
            <RichTextView doc={book.description} />
          </div>
        )}

        <div className="headings-list">
          {headings.map((h) => (
            <HeadingBlock key={h.id} heading={h} book={book} onChanged={load} />
          ))}
        </div>

        {isAdmin && <AddHeading book={book} nextSortOrder={nextSortOrder} onAdded={load} />}

        {/* Print-only citation/traceback page (FR-37) */}
        <div className="print-only print-citation-page">
          <h2>উৎস / Source</h2>
          <p>Printed from Sirājan Munīrā — {typeof window !== 'undefined' ? window.location.href : ''}</p>
          {book.source_links?.map((l, i) => <p key={i}>{l.label}: {l.url}</p>)}
        </div>
      </div>
    </ImageLightboxProvider>
  );
}
