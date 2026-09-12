import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTrackView } from '../lib/context';
import { Book, Category, getLiveStats, listBooks, listCategories } from '../lib/supabase';
import { ContactForm } from './StaticPages';

// A small, quiet illustration — a sheet of paper, a few ruled lines, a pen.
// No 3D, no animation: just a mark that says "this is a place for writing."
function PaperAndPenDoodle() {
  return (
    <svg className="masthead-doodle" width="180" height="70" viewBox="0 0 180 70" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="8" width="90" height="56" rx="1" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="40" y1="24" x2="100" y2="24" stroke="var(--border)" strokeWidth="1.2" />
      <line x1="40" y1="34" x2="110" y2="34" stroke="var(--border)" strokeWidth="1.2" />
      <line x1="40" y1="44" x2="90" y2="44" stroke="var(--border)" strokeWidth="1.2" />
      <line x1="40" y1="54" x2="104" y2="54" stroke="var(--muted)" strokeWidth="1.2" strokeDasharray="2 2" />
      <path d="M112 50 L150 14" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <path d="M150 14 L156 8 L162 14 L156 20 Z" fill="var(--accent)" />
      <path d="M110 52 L114 48 L108 50 Z" fill="var(--fg)" />
    </svg>
  );
}

export default function Landing() {
  const [stats, setStats] = useState<{ books: number; categories: number; visitors: number } | null>(null);
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  useTrackView('site', 'landing');

  useEffect(() => {
    getLiveStats().then(setStats).catch(() => setStats({ books: 0, categories: 0, visitors: 0 }));
    listBooks({ includeHidden: false }).then((b) => setRecentBooks(b.slice(0, 5)));
    listCategories().then((c) => setCategories(c.slice(0, 5)));
  }, []);

  return (
    <div className="landing-page">
      <div className="masthead">
        <h1>Sirājan Munīrā</h1>
        <p className="tagline">A book-annotation and knowledge-archiving imprint of Safeenah.</p>
        <PaperAndPenDoodle />
      </div>

      <section className="landing-section">
        <h2>What you'll find here</h2>
        <p>
          This is a working archive of findings pulled from books — quotes, notes, and short passages, each kept as
          its own permanent, linkable page. There are no reader accounts. Browse the bookshelf, follow a collection,
          or search for a phrase you half-remember. Bookmarks and reading preferences live only in your browser.
        </p>
        <p>
          <Link to="/books">→ Browse the Bookshelf</Link><br />
          <Link to="/collections">→ Explore Collections</Link><br />
          <Link to="/about">→ Read more about this project</Link>
        </p>
      </section>

      {recentBooks.length > 0 && (
        <section className="landing-section">
          <h2>Recently added books</h2>
          <ul className="landing-list">
            {recentBooks.map((b) => (
              <li key={b.id}>
                <Link to={`/book/${b.slug}`}>{b.title}</Link>
                {b.author && <span className="muted"> — {b.author}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {categories.length > 0 && (
        <section className="landing-section">
          <h2>Collections</h2>
          <ul className="landing-list">
            {categories.map((c) => (
              <li key={c.id}><Link to={`/collections/${c.id}`}>{c.name}</Link></li>
            ))}
          </ul>
        </section>
      )}

      <section className="landing-section">
        <h2>By the numbers</h2>
        <div className="landing-stats">
          <div><strong>{stats?.books ?? '—'}</strong>books</div>
          <div><strong>{stats?.categories ?? '—'}</strong>collections</div>
          <div><strong>{stats?.visitors ?? '—'}</strong>visitors</div>
        </div>
      </section>

      <section className="landing-section" style={{ borderBottom: 'none' }}>
        <h2>Send a message</h2>
        <p className="muted">Suggest a book, point out an error, or just say hello.</p>
        <ContactForm compact />
      </section>
    </div>
  );
}