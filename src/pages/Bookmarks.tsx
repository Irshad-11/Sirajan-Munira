import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, BookOpen, ExternalLink, Trash2 } from 'lucide-react';
import { Book, Heading, getHeadingsByIds, getBookById } from '../lib/supabase';
import { usePrefs, useTrackView } from '../lib/context';
import { docToPlainText, firstLineOf } from '../lib/richtext';

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function SkeletonRow() {
  return (
    <div className="bm-skeleton-row">
      <div className="skeleton-pulse" style={{ width: 44, height: 60, flexShrink: 0, borderRadius: 4 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton-pulse" style={{ width: '50%', height: 13, marginBottom: 6 }} />
        <div className="skeleton-pulse" style={{ width: '80%', height: 11, marginBottom: 4 }} />
        <div className="skeleton-pulse" style={{ width: '60%', height: 11 }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bookmarks page
// ---------------------------------------------------------------------------
export default function BookmarksPage() {
  const { bookmarks, toggleBookmark } = usePrefs();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [books, setBooks] = useState<Record<string, Book>>({});
  const [loading, setLoading] = useState(true);
  useTrackView('site', 'bookmarks');

  useEffect(() => {
    if (bookmarks.length === 0) { setLoading(false); return; }
    setLoading(true);
    getHeadingsByIds(bookmarks)
      .then(async (hs) => {
        setHeadings(hs);
        const bookIds = [...new Set(hs.map((h) => h.book_id))];
        const bks = await Promise.all(bookIds.map((id) => getBookById(id)));
        const map: Record<string, Book> = {};
        bks.forEach((b) => { if (b) map[b.id] = b; });
        setBooks(map);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [bookmarks.join(',')]);

  // Group headings by book_id, preserving bookmark order
  const grouped = useMemo(() => {
    const map = new Map<string, Heading[]>();
    // Order by bookmark array order
    bookmarks.forEach((id) => {
      const h = headings.find((x) => x.id === id);
      if (!h) return;
      if (!map.has(h.book_id)) map.set(h.book_id, []);
      map.get(h.book_id)!.push(h);
    });
    return [...map.entries()];
  }, [headings, bookmarks]);

  return (
    <div className="page bookmarks-page">
      <style>{BOOKMARKS_CSS}</style>
      <div className="page-head">
        <h1 className="icon-row">
          <Bookmark size={20} fill="currentColor" style={{ color: '#b8860b' }} /> My Bookmarks
        </h1>
        <span className="muted">{bookmarks.length} saved on this device</span>
      </div>

      {loading ? (
        <div className="bm-list">
          {[1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="bm-empty">
          <Bookmark size={40} style={{ opacity: 0.25 }} />
          <p>No bookmarks yet.</p>
          <p className="muted">Open any book and click the Bookmark button on a heading to save it here.</p>
          <Link to="/books" className="cta-primary" style={{ marginTop: '1rem' }}>
            <BookOpen size={16} /> Browse the Bookshelf
          </Link>
        </div>
      ) : (
        <div className="bm-groups">
          {grouped.map(([bookId, hs]) => {
            const book = books[bookId];
            return (
              <div key={bookId} className="bm-group">
                {/* Book header */}
                <div className="bm-group__header">
                  {book?.cover_image_url
                    ? <img src={book.cover_image_url} alt="" className="bm-group__cover" />
                    : <div className="bm-group__cover bm-group__cover--ph"><BookOpen size={18} /></div>
                  }
                  <div className="bm-group__book-info">
                    {book ? (
                      <>
                        <Link to={`/book/${book.slug}`} className="bm-group__book-title">{book.title}</Link>
                        {book.author && <p className="muted bm-group__author">{book.author}</p>}
                      </>
                    ) : (
                      <span className="muted">Unknown book</span>
                    )}
                    <span className="bm-group__count">{hs.length} bookmark{hs.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Heading list */}
                <div className="bm-heading-list">
                  {hs.map((h) => {
                    const text = docToPlainText(h.content);
                    const preview = text.slice(0, 180);
                    return (
                      <div key={h.id} className="bm-heading-item">
                        <div className="bm-heading-item__main">
                          {h.page_number && (
                            <span className="bm-page-badge">p. {h.page_number}</span>
                          )}
                          <p className="bm-heading-text">
                            {preview}{text.length > 180 ? '…' : ''}
                          </p>
                          <div className="bm-heading-actions">
                            {book && (
                              <Link
                                to={`/book/${book.slug}#${h.id}`}
                                className="bm-action-btn"
                                title="Read in context"
                              >
                                <ExternalLink size={13} /> Read
                              </Link>
                            )}
                            <button
                              className="bm-action-btn bm-action-btn--remove"
                              onClick={() => toggleBookmark(h.id)}
                              title="Remove bookmark"
                            >
                              <Trash2 size={13} /> Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Orphaned bookmarks (heading deleted or book changed) */}
          {bookmarks.length > headings.length && (
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: '1rem' }}>
              {bookmarks.length - headings.length} bookmark(s) point to deleted headings.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------
const BOOKMARKS_CSS = `
.bookmarks-page { max-width: 760px; }

.bm-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 0.6rem; padding: 4rem 1rem; text-align: center; color: var(--muted);
}
.bm-empty p { margin: 0; font-size: 0.9rem; }

.bm-skeleton-row {
  display: flex; gap: 0.8rem; padding: 0.8rem 0;
  border-bottom: 1px solid var(--border);
}

.bm-groups { display: flex; flex-direction: column; gap: 0; }

.bm-group { margin-bottom: 1.5rem; }

.bm-group__header {
  display: flex; gap: 0.8rem; align-items: center;
  padding: 0.8rem 0; border-bottom: 2px solid var(--border);
  margin-bottom: 0;
}
.bm-group__cover {
  width: 44px; height: 60px; object-fit: cover;
  border-radius: 4px; flex-shrink: 0; display: block;
  background: var(--border);
}
.bm-group__cover--ph {
  display: grid; place-items: center; color: var(--muted);
}
.bm-group__book-info { flex: 1; min-width: 0; }
.bm-group__book-title {
  font-weight: 700; font-size: 0.96rem; color: var(--fg); text-decoration: none;
  display: block; margin-bottom: 0.1rem;
}
.bm-group__book-title:hover { color: var(--accent); }
.bm-group__author { font-size: 0.78rem; margin: 0 0 0.2rem; }
.bm-group__count {
  font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
  color: #b8860b; background: color-mix(in srgb, #b8860b 12%, var(--bg));
  padding: 0.1rem 0.45rem; border-radius: 10px;
  border: 1px solid color-mix(in srgb, #b8860b 25%, transparent);
}

.bm-heading-list { display: flex; flex-direction: column; }
.bm-heading-item {
  padding: 0.75rem 0.4rem;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.bm-heading-item:last-child { border-bottom: none; }
.bm-heading-item__main { display: flex; flex-direction: column; gap: 0.3rem; }
.bm-page-badge {
  display: inline-block; font-size: 0.65rem; font-weight: 700;
  color: var(--muted); border: 1px solid var(--border);
  padding: 0.08rem 0.35rem; border-radius: 3px; align-self: flex-start;
}
.bm-heading-text {
  font-size: 0.88rem; line-height: 1.6; color: var(--fg);
  font-family: var(--font-serif), Georgia, serif;
  margin: 0;
}
.bm-heading-actions { display: flex; gap: 0.8rem; }
.bm-action-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font-size: 0.74rem; color: var(--accent);
  border-bottom: 1px dotted var(--accent); text-decoration: none;
  transition: opacity 0.12s;
  background: none; cursor: pointer;
}
.bm-action-btn:hover { opacity: 0.75; }
.bm-action-btn--remove { color: #c0392b; border-bottom-color: #c0392b; }

@media (max-width: 480px) {
  .bm-group__cover { width: 36px; height: 48px; }
  .bm-heading-text { font-size: 0.84rem; }
}
`;