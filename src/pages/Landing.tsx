import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FolderOpen, Bookmark, Search, ShieldCheck, Printer, Quote as QuoteIcon, Inbox as InboxIcon, ArrowRight } from 'lucide-react';
import { useAdmin, useTrackView } from '../lib/context';
import { Book, Category, getLiveStats, listBooks, listCategories } from '../lib/supabase';
import { docToPlainText } from '../lib/richtext';
import { ContactForm } from './StaticPages';

// A quiet, hand-drawn-feeling mark for the masthead: a ruled A4 page (two of
// its lines "highlighted" in yellow, the way a reader marks up a source),
// resting beside a doyat-kalam — an old-school inkpot with a dip pen leaning
// into it. No animation beyond a gentle hover tilt: it's a mark that says
// "findings, taken from the page, kept."
function PageAndInkpotDoodle() {
  return (
    <svg
      className="masthead-doodle"
      width="200"
      height="112"
      viewBox="0 0 200 112"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="A ruled page with two highlighted lines, beside an inkpot and dip pen"
    >
      {/* The page — A4-proportioned */}
      <rect x="18" y="6" width="78" height="100" rx="2" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />

      {/* Highlighter marks, drawn under the ruled lines so the line still reads through */}
      <rect x="27" y="31" width="60" height="9" rx="1.5" fill="#ffe066" opacity="0.6" />
      <rect x="27" y="67" width="44" height="9" rx="1.5" fill="#ffe066" opacity="0.6" />

      {/* Ruled lines of "text" */}
      <line x1="27" y1="22" x2="87" y2="22" stroke="var(--border)" strokeWidth="1.2" />
      <line x1="27" y1="35.5" x2="87" y2="35.5" stroke="var(--muted)" strokeWidth="1.2" />
      <line x1="27" y1="47" x2="80" y2="47" stroke="var(--border)" strokeWidth="1.2" />
      <line x1="27" y1="59" x2="85" y2="59" stroke="var(--border)" strokeWidth="1.2" />
      <line x1="27" y1="71.5" x2="71" y2="71.5" stroke="var(--muted)" strokeWidth="1.2" />
      <line x1="27" y1="83" x2="83" y2="83" stroke="var(--border)" strokeWidth="1.2" />
      <line x1="27" y1="95" x2="64" y2="95" stroke="var(--border)" strokeWidth="1.2" strokeDasharray="2 2" />

      {/* Doyat-kalam: a squat inkpot... */}
      <ellipse cx="151" cy="90" rx="19" ry="6" fill="var(--surface)" stroke="var(--fg)" strokeWidth="1.5" />
      <path d="M132 90 L136 69 Q151 62 166 69 L170 90" fill="var(--surface)" stroke="var(--fg)" strokeWidth="1.5" />
      <ellipse cx="151" cy="69" rx="14" ry="4.2" fill="#201a12" />

      {/* ...with a dip pen leaning into it, feather flourish at the top */}
      <path d="M151 69 L184 21" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <path d="M148.5 72 L151 66.5 L155.5 70 Z" fill="var(--fg)" />
      <path
        d="M184 21 C 179 11, 189 4, 198 8 C 192 13, 192 19, 184 21 Z"
        fill="var(--accent)"
        opacity="0.85"
      />
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

// ---------------------------------------------------------------------------
// Small interactivity helpers — kept deliberately understated so the page
// still reads as a plain document, not an "app".
// ---------------------------------------------------------------------------

// Fades a section in the first time it scrolls into view. Respects
// prefers-reduced-motion via CSS (see .reveal in index.css).
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, visible };
}

function RevealSection({
  className, style, children,
}: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const { ref, visible } = useReveal<HTMLElement>();
  return (
    <section ref={ref as any} className={`reveal ${visible ? 'reveal-in' : ''} ${className || ''}`} style={style}>
      {children}
    </section>
  );
}

export default function Landing() {
  const { isAdmin } = useAdmin();
  const [stats, setStats] = useState<{ books: number; categories: number; visitors: number } | null>(null);
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [quotes, setQuotes] = useState<{ text: string; book: string }[]>([]);
  const [quoteIndex, setQuoteIndex] = useState(0);
  useTrackView('site', 'landing');

  useEffect(() => {
    getLiveStats().then(setStats).catch(() => setStats({ books: 0, categories: 0, visitors: 0 }));
    listBooks({ includeHidden: false }).then((books) => {
      setRecentBooks(books.slice(0, 6));
      const withDesc = books
        .filter((b) => b.description)
        .slice(0, 5)
        .map((b) => ({ text: docToPlainText(b.description).slice(0, 180), book: b.title }))
        .filter((q) => q.text);
      setQuotes(withDesc);
    });
    listCategories().then((c) => setCategories(c.slice(0, 6)));
  }, []);

  const quote = quotes[quoteIndex] || null;
  const nextQuote = () => setQuoteIndex((i) => (i + 1) % Math.max(quotes.length, 1));

  return (
    <div className="landing-page">
      <div className="hero">
        <h1>Sirājan Munīrā</h1>
        <p className="tagline">A Collection of Findings from Sunni-Classified Sources</p>
        <p className="tagline-sub">…and a luminous lamp.</p>
        <div className="hero-cta">
          <Link to="/books" className="cta-primary"><BookOpen size={17} /> Browse the Bookshelf</Link>
          <Link to="/collections" className="cta-secondary"><FolderOpen size={17} /> Explore Collections</Link>
        </div>
        <PageAndInkpotDoodle />
      </div>

      <div className="landing-body">
        <RevealSection className="landing-section">
          <h2>What you'll find here</h2>
          <p>
            This archive grows out of reading books from within the Sunni tradition itself — and collecting, from
            those very sources, the hadith narrations about Ahl al-Bayt (Ah.) that are recorded
            there but rarely surface in everyday public discussion. Every finding is kept as its own permanent,
            linkable page, quoted with its book and page number attached, so it can always be checked against the
            original.
          </p>
          <p>
            Beyond that, this is a general working archive of findings pulled from books — quotes, notes, and short
            passages. There are no reader accounts. Browse the bookshelf, follow a collection, or search for a
            phrase you half-remember. Bookmarks and reading preferences live only in your browser, and every page
            prints cleanly with its source attached.
          </p>
        </RevealSection>

        <RevealSection className="landing-section">
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
        </RevealSection>

        <RevealSection className="landing-section">
          <h2>How it works</h2>
          <ol className="landing-steps">
            <li>The curator reads a book and writes findings under it — quotes, notes, short passages.</li>
            <li>Each finding becomes its own heading with a stable, shareable link and, where relevant, a page number.</li>
            <li>Related findings from different books can be gathered into a collection, browsable by theme.</li>
            <li>Anyone can search, read, bookmark, and print — without ever creating an account.</li>
          </ol>
        </RevealSection>

        {quote && (
          <RevealSection className="landing-section">
            <h2>From the shelf</h2>
            <p className="landing-quote">
              <QuoteIcon size={16} /> {quote.text}…
            </p>
            <div className="quote-footer">
              <p className="muted">— {quote.book}</p>
              {quotes.length > 1 && (
                <button className="link-btn icon-row" onClick={nextQuote}>
                  Next finding <ArrowRight size={13} />
                </button>
              )}
            </div>
          </RevealSection>
        )}

        {recentBooks.length > 0 && (
          <RevealSection className="landing-section">
            <h2>Recently added books</h2>
            <ul className="landing-list">
              {recentBooks.map((b) => (
                <li key={b.id}>
                  <Link to={`/book/${b.slug}`}>{b.title}</Link>
                  {b.author && <span className="muted"> — {b.author}</span>}
                </li>
              ))}
            </ul>
          </RevealSection>
        )}

        {categories.length > 0 && (
          <RevealSection className="landing-section">
            <h2>Collections</h2>
            <ul className="landing-list">
              {categories.map((c) => (
                <li key={c.id}><Link to={`/collections/${c.id}`}>{c.name}</Link></li>
              ))}
            </ul>
          </RevealSection>
        )}

        <RevealSection className="landing-section">
          <h2>By the numbers</h2>
          <div className="landing-stats">
            <div><strong>{stats?.books ?? '—'}</strong>books</div>
            <div><strong>{stats?.categories ?? '—'}</strong>collections</div>
            <div><strong>{stats?.visitors ?? '—'}</strong>visitors</div>
          </div>
        </RevealSection>

        <RevealSection className="landing-section">
          <h2>Frequently asked</h2>
          <div className="landing-faq">
            {FAQ.map(([q, a]) => (
              <details key={q} className="faq-item">
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </RevealSection>

        <RevealSection className="landing-section contact-section" style={{ borderBottom: 'none' }}>
          {isAdmin ? (
            <>
              <h2>Messages</h2>
              <p className="muted icon-row"><InboxIcon size={15} /> You're signed in as admin — check the <Link to="/contact">Inbox</Link> for messages from readers.</p>
            </>
          ) : (
            <>
              <h2>Send a message</h2>
              <p className="muted">Suggest a book, point out an error, or just say hello.</p>
              <div className="contact-card">
                <ContactForm compact />
              </div>
            </>
          )}
        </RevealSection>
        <RevealSection className="landing-section">
  <p className="muted">
    This site is developed and maintained by Irshad Hossain.
  </p>
</RevealSection>
      </div>
    </div>
  );
}