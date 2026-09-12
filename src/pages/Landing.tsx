import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FolderOpen, Bookmark, Search, ShieldCheck, Printer, Quote as QuoteIcon, Inbox as InboxIcon } from 'lucide-react';
import { useAdmin, useTrackView } from '../lib/context';
import { Book, Category, getLiveStats, listBooks, listCategories } from '../lib/supabase';
import { docToPlainText } from '../lib/richtext';
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

const FEATURES = [
  { icon: BookOpen, title: 'Deep-linkable findings', body: 'Every heading is its own permanent, shareable page — link directly to one sentence, not just a book.' },
  { icon: FolderOpen, title: 'Curated collections', body: 'Findings from many books, gathered by theme, so a subject can be read across authors.' },
  { icon: Search, title: 'Full-text search', body: 'Search reaches inside every finding\u2019s body, not just book titles.' },
  { icon: Bookmark, title: 'Private bookmarks', body: 'Save findings to read later — stored only in your browser, never on a server.' },
  { icon: ShieldCheck, title: 'No accounts', body: 'Browse anonymously. There is nothing to sign up for, ever.' },
  { icon: Printer, title: 'Print-ready', body: 'Every page has a clean print layout with a cover and a source citation.' },
];

const FAQ: [string, string][] = [
  ['Do I need an account to read or bookmark?', 'No. Reading is fully anonymous, and bookmarks are stored only in your browser\u2019s local storage.'],
  ['Can I suggest a book or point out an error?', 'Yes — use the message form below, or the Contact page.'],
  ['Are findings edited from the original text?', 'Only lightly formatted for reading. See the About page for the full editorial standard.'],
  ['Is there an API or export?', 'The admin can export the full archive as JSON at any time; there is no public API yet.'],
];

export default function Landing() {
  const { isAdmin } = useAdmin();
  const [stats, setStats] = useState<{ books: number; categories: number; visitors: number } | null>(null);
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [quote, setQuote] = useState<{ text: string; book: string } | null>(null);
  useTrackView('site', 'landing');

  useEffect(() => {
    getLiveStats().then(setStats).catch(() => setStats({ books: 0, categories: 0, visitors: 0 }));
    listBooks({ includeHidden: false }).then((books) => {
      setRecentBooks(books.slice(0, 6));
      const withDesc = books.find((b) => b.description);
      if (withDesc?.description) {
        const text = docToPlainText(withDesc.description).slice(0, 180);
        if (text) setQuote({ text, book: withDesc.title });
      }
    });
    listCategories().then((c) => setCategories(c.slice(0, 6)));
  }, []);

  return (
    <div className="landing-page">
      <div className="hero">
        <h1>Sirājan Munīrā</h1>
        <p className="tagline">A book-annotation and knowledge-archiving imprint of Safeenah — every finding kept, cited, and linkable, forever.</p>
        <div className="hero-cta">
          <Link to="/books" className="cta-primary"><BookOpen size={17} /> Browse the Bookshelf</Link>
          <Link to="/collections" className="cta-secondary"><FolderOpen size={17} /> Explore Collections</Link>
        </div>
        <PaperAndPenDoodle />
      </div>

      <div className="landing-body">
        <section className="landing-section">
          <h2>What you'll find here</h2>
          <p>
            This is a working archive of findings pulled from books — quotes, notes, and short passages, each kept as
            its own permanent, linkable page. There are no reader accounts. Browse the bookshelf, follow a
            collection, or search for a phrase you half-remember. Bookmarks and reading preferences live only in
            your browser, and every page prints cleanly with its source attached.
          </p>
        </section>

        <section className="landing-section">
          <h2>What's inside</h2>
          <div className="landing-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="landing-feature">
                <f.icon size={22} />
                <h3>{f.title}</h3>
                <p className="muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-section">
          <h2>How it works</h2>
          <ol className="landing-steps">
            <li>The curator reads a book and writes findings under it — quotes, notes, short passages.</li>
            <li>Each finding becomes its own heading with a stable, shareable link and, where relevant, a page number.</li>
            <li>Related findings from different books can be gathered into a collection, browsable by theme.</li>
            <li>Anyone can search, read, bookmark, and print — without ever creating an account.</li>
          </ol>
        </section>

        {quote && (
          <section className="landing-section">
            <h2>From the shelf</h2>
            <p className="landing-quote">
              <QuoteIcon size={16} /> {quote.text}…
            </p>
            <p className="muted">— {quote.book}</p>
          </section>
        )}

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

        <section className="landing-section">
          <h2>Frequently asked</h2>
          <dl className="landing-faq">
            {FAQ.map(([q, a]) => (
              <React.Fragment key={q}>
                <dt>{q}</dt>
                <dd>{a}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>

        <section className="landing-section" style={{ borderBottom: 'none' }}>
          {isAdmin ? (
            <>
              <h2>Messages</h2>
              <p className="muted icon-row"><InboxIcon size={15} /> You're signed in as admin — check the <Link to="/contact">Inbox</Link> for messages from readers.</p>
            </>
          ) : (
            <>
              <h2>Send a message</h2>
              <p className="muted">Suggest a book, point out an error, or just say hello.</p>
              <ContactForm compact />
            </>
          )}
        </section>
      </div>
    </div>
  );
}