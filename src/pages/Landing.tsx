import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, FolderOpen, Bookmark, Search, ShieldCheck, Printer,
  Inbox as InboxIcon, ArrowRight, Star, Plus, Pencil, Trash2, X,
} from 'lucide-react';
import { useAdmin, useTrackView } from '../lib/context';
import { Book, Category, getLiveStats, listBooks, listCategories, getSiteSetting, setSiteSetting } from '../lib/supabase';
import { ContactForm } from './StaticPages';

// ---------------------------------------------------------------------------
// Animated Hero SVG
// ---------------------------------------------------------------------------
function AnimatedHeroSVG() {
  const rayAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg
      className="hero-svg"
      width="260"
      height="140"
      viewBox="0 0 260 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="A book with pages turning beside a lamp that cycles from sunrise to a full moon"
    >
      <style>{`
        /* ================= BOOK: highlight sweeps (left→right wipe) ================= */
        .shm-hlA-left  { animation: shmHlAL 20s ease-in-out infinite; transform-box: fill-box; transform-origin: left center; }
        .shm-hlA-right { animation: shmHlAR 20s ease-in-out infinite; transform-box: fill-box; transform-origin: left center; }
        .shm-hlB-left  { animation: shmHlBL 20s ease-in-out infinite; transform-box: fill-box; transform-origin: left center; }
        .shm-hlB-right { animation: shmHlBR 20s ease-in-out infinite; transform-box: fill-box; transform-origin: left center; }

        @keyframes shmHlAL {
          0%, 1.9%  { opacity: 0; transform: scaleX(0); }
          2%        { opacity: 1; transform: scaleX(0); }
          8%        { opacity: 1; transform: scaleX(1); }
          18%       { opacity: 1; transform: scaleX(1); }
          19%       { opacity: 0; transform: scaleX(1); }
          100%      { opacity: 0; transform: scaleX(0); }
        }
        @keyframes shmHlAR {
          0%, 19.9% { opacity: 0; transform: scaleX(0); }
          20%       { opacity: 1; transform: scaleX(0); }
          26%       { opacity: 1; transform: scaleX(1); }
          36%       { opacity: 1; transform: scaleX(1); }
          37%       { opacity: 0; transform: scaleX(1); }
          100%      { opacity: 0; transform: scaleX(0); }
        }
        @keyframes shmHlBL {
          0%, 43.9% { opacity: 0; transform: scaleX(0); }
          44%       { opacity: 1; transform: scaleX(0); }
          50%       { opacity: 1; transform: scaleX(1); }
          60%       { opacity: 1; transform: scaleX(1); }
          61%       { opacity: 0; transform: scaleX(1); }
          100%      { opacity: 0; transform: scaleX(0); }
        }
        @keyframes shmHlBR {
          0%, 61.9% { opacity: 0; transform: scaleX(0); }
          62%       { opacity: 1; transform: scaleX(0); }
          68%       { opacity: 1; transform: scaleX(1); }
          78%       { opacity: 1; transform: scaleX(1); }
          79%       { opacity: 0; transform: scaleX(1); }
          100%      { opacity: 0; transform: scaleX(0); }
        }

        /* ================= BOOK: page flip (right side), twice per loop ================= */
        .shm-flip-page {
          transform-box: fill-box;
          transform-origin: left center;
          animation: shmFlip 20s ease-in-out infinite;
        }
        @keyframes shmFlip {
          0%, 37.9% { transform: scaleX(1) skewY(0deg); }
          38%       { transform: scaleX(1) skewY(0deg); }
          40%       { transform: scaleX(0.02) skewY(3deg); }
          42%       { transform: scaleX(1) skewY(0deg); }
          79.9%     { transform: scaleX(1) skewY(0deg); }
          82%       { transform: scaleX(0.02) skewY(-3deg); }
          84%, 100% { transform: scaleX(1) skewY(0deg); }
        }
        .shm-page-shadow {
          transform-box: fill-box;
          animation: shmShadow 20s ease-in-out infinite;
        }
        @keyframes shmShadow {
          0%   { opacity: 0; }
          37%  { opacity: 0; }
          40%  { opacity: 0.35; }
          43%  { opacity: 0; }
          79%  { opacity: 0; }
          82%  { opacity: 0.35; }
          85%  { opacity: 0; }
          100% { opacity: 0; }
        }

        /* content-set A / B swap, timed to the flip midpoints */
        .shm-setA { animation: shmSetA 20s ease-in-out infinite; }
        .shm-setB { animation: shmSetB 20s ease-in-out infinite; }
        @keyframes shmSetA {
          0%, 39%   { opacity: 1; }
          40%, 81%  { opacity: 0; }
          82%, 100% { opacity: 1; }
        }
        @keyframes shmSetB {
          0%, 39%   { opacity: 0; }
          40%, 81%  { opacity: 1; }
          82%, 100% { opacity: 0; }
        }

        /* ================= LAMP: day / night crossfade ================= */
        .shm-sun-fade  { animation: shmSunFade 40s ease-in-out infinite; }
        .shm-moon-fade { animation: shmMoonFade 40s ease-in-out infinite; }
        @keyframes shmSunFade {
          0%, 35%  { opacity: 1; }
          40%, 95% { opacity: 0; }
          100%     { opacity: 1; }
        }
        @keyframes shmMoonFade {
          0%, 35%  { opacity: 0; }
          40%, 95% { opacity: 1; }
          100%     { opacity: 0; }
        }
        .shm-halo-day {
          transform-box: fill-box; transform-origin: center;
          animation: shmSunFade 40s ease-in-out infinite, shmPulse 3.2s ease-in-out infinite;
        }
        .shm-halo-night {
          transform-box: fill-box; transform-origin: center;
          animation: shmMoonFade 40s ease-in-out infinite, shmPulse 3.6s ease-in-out infinite;
        }
        @keyframes shmPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.2); }
        }
        .shm-cone-day   { animation: shmSunFade 40s ease-in-out infinite; }
        .shm-cone-night { animation: shmMoonFade 40s ease-in-out infinite; }

        .shm-rays-rotate {
          transform-box: fill-box; transform-origin: center;
          animation: shmRotate 24s linear infinite;
        }
        @keyframes shmRotate { to { transform: rotate(360deg); } }

        .shm-star { animation: shmTwinkle 2.4s ease-in-out infinite; }
        @keyframes shmTwinkle {
          0%, 100% { opacity: 0.25; }
          50%      { opacity: 1; }
        }

        .shm-spark { animation: shmSparkFloat 2.4s ease-in-out infinite; }
        @keyframes shmSparkFloat {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50%      { transform: translateY(-8px); opacity: 0.15; }
        }
      `}</style>

      {/* ============ LAMP ============ */}
      <g transform="translate(213,40)">
        <ellipse className="shm-halo-day" cx="0" cy="0" rx="26" ry="26" fill="#ffd166" opacity="0.18" />
        <ellipse className="shm-halo-night" cx="0" cy="0" rx="22" ry="22" fill="#8fc7ff" opacity="0.2" />

        {/* Sun: rises, arcs up, sets — with a warm → bright → warm color shift */}
        <g className="shm-sun-fade">
          <g>
            <animateMotion
              path="M -18,14 Q 0,-22 18,14"
              keyTimes="0;0.35;1"
              keyPoints="0;1;1"
              dur="40s"
              repeatCount="indefinite"
            />
            <circle r="7" fill="#ff8c42">
              <animate
                attributeName="fill"
                values="#ff8c42;#ffd60a;#ff8c42;#ff8c42"
                keyTimes="0;0.175;0.35;1"
                dur="40s"
                repeatCount="indefinite"
              />
            </circle>
            <g className="shm-rays-rotate">
              {rayAngles.map((deg) => {
                const rad = (deg * Math.PI) / 180;
                return (
                  <line
                    key={deg}
                    x1={Math.cos(rad) * 10}
                    y1={Math.sin(rad) * 10}
                    x2={Math.cos(rad) * 14}
                    y2={Math.sin(rad) * 14}
                    stroke="#ffb703"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          </g>
        </g>

        {/* Moon: waxes crescent → first quarter → gibbous → full, then fades out */}
        <g className="shm-moon-fade">
          <circle r="9" fill="#0f172a" />
          <circle r="7" fill="#e9f2ff" />
          <circle cx="14" r="7" fill="#0f172a">
            <animate
              attributeName="cx"
              values="14;3.5;3.5;7;7;10.5;10.5;14;14"
              keyTimes="0;0.4;0.5;0.62;0.72;0.84;0.92;0.95;1"
              dur="40s"
              repeatCount="indefinite"
            />
          </circle>
          {[[-11, -8], [10, -10], [13, 4]].map(([x, y], i) => (
            <circle
              key={i}
              className="shm-star"
              cx={x}
              cy={y}
              r="1.1"
              fill="#e6f0ff"
              style={{ animationDelay: `${i * 0.6}s` }}
            />
          ))}
        </g>
      </g>

      {/* Lamp hardware (static) */}
      <ellipse cx="195" cy="118" rx="22" ry="6" fill="var(--border)" />
      <rect x="192" y="56" width="6" height="62" rx="3" fill="var(--muted)" />
      <path d="M195 56 C195 40, 215 30, 218 20" stroke="var(--muted)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M205 14 L230 26 L210 42 L196 42 Z" fill="var(--accent)" opacity="0.88" />
      <ellipse cx="213" cy="42" rx="9" ry="3.5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1" />

      {/* Light cone on the desk, warm by day / cool by night */}
      <path className="shm-cone-day" d="M205 44 L148 130 L180 130 Z" fill="#ffd166" opacity="0.09" />
      <path className="shm-cone-night" d="M205 44 L148 130 L180 130 Z" fill="#8fc7ff" opacity="0.08" />

      {/* ============ BOOK ============ */}
      <rect x="18" y="60" width="130" height="76" rx="3" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="83" y1="60" x2="83" y2="136" stroke="var(--border)" strokeWidth="2" />
      <rect className="shm-page-shadow" x="83" y="60" width="12" height="76" fill="#000" />

      {/* ---- Left page, set A ---- */}
      <g className="shm-setA">
        {[75, 85, 95, 105, 115, 125].map((y) => (
          <line key={y} x1="28" y1={y} x2="74" y2={y} stroke="var(--border)" strokeWidth="1" />
        ))}
        <rect className="shm-hlA-left" x="28" y="81" width="46" height="8" rx="1.5" fill="#ffe066" />
      </g>
      {/* ---- Left page, set B ---- */}
      <g className="shm-setB">
        {[78, 90, 102, 114, 126].map((y, i) => {
          const w = [40, 46, 34, 46, 20][i];
          return <line key={y} x1="28" y1={y} x2={28 + w} y2={y} stroke="var(--border)" strokeWidth="1" />;
        })}
        <rect className="shm-hlB-left" x="28" y="98" width="34" height="8" rx="1.5" fill="#ffe066" />
      </g>

      {/* ---- Right page, flips; content set swaps underneath the flip ---- */}
      <g className="shm-flip-page">
        <g className="shm-setA">
          {[75, 85, 95, 105, 115, 125].map((y, i) => {
            const w = [40, 35, 42, 30, 38, 22][i];
            return <line key={y} x1="92" y1={y} x2={92 + w} y2={y} stroke="var(--border)" strokeWidth="1" />;
          })}
          <rect className="shm-hlA-right" x="92" y="91" width="42" height="8" rx="1.5" fill="#ffe066" />
        </g>
        <g className="shm-setB">
          {[73, 82, 91, 100, 109, 118, 127].map((y, i) => {
            const w = [30, 38, 42, 25, 35, 40, 18][i];
            return <line key={y} x1="92" y1={y} x2={92 + w} y2={y} stroke="var(--border)" strokeWidth="1" />;
          })}
          <rect className="shm-hlB-right" x="92" y="96" width="25" height="8" rx="1.5" fill="#ffe066" />
        </g>
      </g>

      {/* Bookmark ribbon */}
      <path d="M152 60 L152 100 L146 95 L140 100 L140 60 Z" fill="var(--accent)" opacity="0.6" />

      {/* Floating reading sparkles */}
      <circle className="shm-spark" cx="172" cy="70" r="2" fill="var(--accent)" style={{ animationDelay: '0s' }} />
      <circle className="shm-spark" cx="162" cy="52" r="1.5" fill="var(--accent)" style={{ animationDelay: '0.5s' }} />
      <circle className="shm-spark" cx="180" cy="85" r="1.5" fill="var(--accent)" style={{ animationDelay: '1s' }} />
    </svg>
  );
}
// ---------------------------------------------------------------------------
// Shelf Quotes — admin-managed
// ---------------------------------------------------------------------------
interface ShelfQuote { id: string; text: string; source: string; }

function QuoteManager({ quotes, onChange }: { quotes: ShelfQuote[]; onChange: (q: ShelfQuote[]) => void }) {
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const save = async () => {
    if (!text.trim() || !source.trim()) return;
    let next: ShelfQuote[];
    if (editId) {
      next = quotes.map(q => q.id === editId ? { ...q, text: text.trim(), source: source.trim() } : q);
      setEditId(null);
    } else {
      next = [...quotes, { id: Date.now().toString(), text: text.trim(), source: source.trim() }];
    }
    await setSiteSetting('shelf_quotes', next);
    onChange(next);
    setText(''); setSource('');
  };

  const remove = async (id: string) => {
    const next = quotes.filter(q => q.id !== id);
    await setSiteSetting('shelf_quotes', next);
    onChange(next);
  };

  const startEdit = (q: ShelfQuote) => { setEditId(q.id); setText(q.text); setSource(q.source); };

  return (
    <div className="quote-manager">
      <h4 className="quote-manager__title">Manage "From the Shelf" Quotes</h4>
      <div className="quote-manager__form">
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Quote text…" rows={3} className="quote-manager__textarea" />
        <input value={source} onChange={e => setSource(e.target.value)} placeholder="Source (book name, author…)" className="quote-manager__input" />
        <div className="quote-manager__btns">
          <button className="primary" onClick={save}>{editId ? 'Save edit' : <><Plus size={13}/> Add quote</>}</button>
          {editId && <button className="secondary" onClick={() => { setEditId(null); setText(''); setSource(''); }}>Cancel</button>}
        </div>
      </div>
      <div className="quote-manager__list">
        {quotes.map(q => (
          <div key={q.id} className="quote-manager__item">
            <div className="quote-manager__item-text">"{q.text.slice(0, 80)}{q.text.length > 80 ? '…' : ''}"</div>
            <div className="quote-manager__item-source muted">— {q.source}</div>
            <div className="quote-manager__item-actions">
              <button onClick={() => startEdit(q)}><Pencil size={12}/> Edit</button>
              <button onClick={() => remove(q.id)} className="danger"><Trash2 size={12}/> Remove</button>
            </div>
          </div>
        ))}
        {quotes.length === 0 && <p className="muted" style={{fontSize:'0.82rem'}}>No quotes added yet.</p>}
      </div>
    </div>
  );
}

function RotatingQuotes({ quotes }: { quotes: ShelfQuote[] }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (quotes.length <= 1) return;
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % quotes.length); setVisible(true); }, 400);
    }, 5000);
    return () => clearInterval(t);
  }, [quotes.length]);

  if (!quotes.length) return null;
  const q = quotes[idx];
  return (
    <div className="landing-quote-card">
      <div className={`landing-quote-inner ${visible ? 'lq-visible' : 'lq-hidden'}`}>
        <p className="landing-quote-text">"{q.text}"</p>
        <p className="landing-quote-source muted">— {q.source}</p>
      </div>
      {quotes.length > 1 && (
        <div className="lq-dots">
          {quotes.map((_, i) => (
            <button key={i} className={`lq-dot ${i === idx ? 'lq-dot--active' : ''}`} onClick={() => { setIdx(i); setVisible(true); }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
const FEATURES = [
  { icon: BookOpen, title: 'Deep-linkable findings', body: 'Every heading is its own permanent, shareable page.' },
  { icon: FolderOpen, title: 'Curated collections', body: 'Findings gathered by theme across authors.' },
  { icon: Search, title: 'Full-text search', body: "Search reaches inside every finding's body." },
  { icon: Bookmark, title: 'Private bookmarks', body: 'Stored only in your browser, never on a server.' },
  { icon: ShieldCheck, title: 'No accounts', body: 'Browse anonymously. Nothing to sign up for.' },
  { icon: Printer, title: 'Print-ready', body: 'Clean print layout with cover and source citation.' },
];

const FAQ: [string, string][] = [
  ['Do I need an account to read or bookmark?', 'No. Reading is fully anonymous. Bookmarks live in your browser only.'],
  ['Can I suggest a book or point out an error?', 'Yes — use the message form below, or the Contact page.'],
  ['Are findings edited from the original text?', 'Only lightly formatted. See the About page for editorial standards.'],
];

// ---------------------------------------------------------------------------
// Reveal
// ---------------------------------------------------------------------------
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.1 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return { ref, visible };
}
function RevealSection({ className, style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const { ref, visible } = useReveal<HTMLElement>();
  return <section ref={ref as any} className={`reveal ${visible ? 'reveal-in' : ''} ${className || ''}`} style={style}>{children}</section>;
}

// ---------------------------------------------------------------------------
// Compact book card
// ---------------------------------------------------------------------------
function BookCard({ book }: { book: Book }) {
  return (
    <Link to={`/book/${book.slug}`} className="lnd-book-card">
      {book.cover_image_url
        ? <img src={book.cover_image_url} alt={book.title} className="lnd-book-card__cover" />
        : <div className="lnd-book-card__cover lnd-book-card__cover--ph"><BookOpen size={22} /></div>
      }
      <p className="lnd-book-card__title">{book.title}</p>
      {book.author && <p className="lnd-book-card__author">{book.author}</p>}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Compact collection chip
// ---------------------------------------------------------------------------
function ColChip({ cat }: { cat: Category }) {
  return (
    <Link to={`/collections/${cat.id}`} className="lnd-col-chip">
      <span className="dot" style={{ background: cat.color }} />
      {cat.name}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------
export default function Landing() {
  const { isAdmin } = useAdmin();
  const [stats, setStats] = useState<{ books: number; categories: number; visitors: number } | null>(null);
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [quotes, setQuotes] = useState<ShelfQuote[]>([]);
  const [showQuoteManager, setShowQuoteManager] = useState(false);
  useTrackView('site', 'landing');

  useEffect(() => {
    getLiveStats().then(setStats).catch(() => setStats({ books: 0, categories: 0, visitors: 0 }));
    listBooks({ includeHidden: false }).then(books => setRecentBooks(books.slice(0, 8)));
    listCategories().then(cats => setCategories(cats.slice(0, 10)));
    getSiteSetting('shelf_quotes').then(q => { if (Array.isArray(q)) setQuotes(q); });
  }, []);

  return (
    <div className="landing-page">
      <style>{LANDING_CSS}</style>

      {/* Hero */}
      <div className="hero lnd-hero">
        <div className="lnd-hero__left">
          <p className="lnd-eyebrow">An imprint of Safeenah</p>
          <h1>Sirājan Munīrā</h1>
          <p className="tagline">A Collection of Findings from Sunni-Classified Sources</p>
          <p className="tagline-sub">…and a luminous lamp.</p>
          <div className="hero-cta">
            <Link to="/books" className="cta-primary"><BookOpen size={16} /> Bookshelf</Link>
            <Link to="/collections" className="cta-secondary"><FolderOpen size={16} /> Collections</Link>
          </div>
        </div>
        <div className="lnd-hero__right"><AnimatedHeroSVG /></div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="lnd-stats-bar">
          <div className="lnd-stat"><strong>{stats.books}</strong><span>books</span></div>
          <div className="lnd-stats-sep" />
          <div className="lnd-stat"><strong>{stats.categories}</strong><span>collections</span></div>
          <div className="lnd-stats-sep" />
          <div className="lnd-stat"><strong>{stats.visitors}</strong><span>visitors</span></div>
        </div>
      )}

      <div className="landing-body">

        {/* Newest books */}
        {recentBooks.length > 0 && (
          <RevealSection className="landing-section">
            <div className="lnd-section-head">
              <h2>Newest Books</h2>
              <Link to="/books" className="lnd-all-link">All <ArrowRight size={12} /></Link>
            </div>
            <div className="lnd-books-row">
              {recentBooks.map(b => <BookCard key={b.id} book={b} />)}
            </div>
          </RevealSection>
        )}

        {/* Collections */}
        {categories.length > 0 && (
          <RevealSection className="landing-section">
            <div className="lnd-section-head">
              <h2>Collections</h2>
              <Link to="/collections" className="lnd-all-link">All <ArrowRight size={12} /></Link>
            </div>
            <div className="lnd-cols-row">
              {categories.map(c => <ColChip key={c.id} cat={c} />)}
            </div>
          </RevealSection>
        )}

        {/* From the shelf */}
        <RevealSection className="landing-section">
          <div className="lnd-section-head">
            <h2>From the shelf</h2>
            {isAdmin && (
              <button className="link-btn" onClick={() => setShowQuoteManager(v => !v)}>
                {showQuoteManager ? 'Close' : <><Pencil size={11}/> Manage</>}
              </button>
            )}
          </div>
          {isAdmin && showQuoteManager && (
            <QuoteManager quotes={quotes} onChange={setQuotes} />
          )}
          {quotes.length > 0 ? (
            <RotatingQuotes quotes={quotes} />
          ) : (
            <p className="muted" style={{fontStyle:'italic'}}>No quotes added yet.{isAdmin ? ' Click "Manage" to add some.' : ''}</p>
          )}
        </RevealSection>

        {/* Features */}
        <RevealSection className="landing-section">
          <h2>What's inside</h2>
          <div className="landing-features">
            {FEATURES.map(f => (
              <div key={f.title} className="landing-feature">
                <f.icon size={20} />
                <h3>{f.title}</h3>
                <p className="muted">{f.body}</p>
              </div>
            ))}
          </div>
        </RevealSection>

        {/* Steps */}
        <RevealSection className="landing-section">
          <h2>How it works</h2>
          <ol className="landing-steps">
            <li>The curator reads a book and writes findings under it — quotes, notes, passages.</li>
            <li>Each finding becomes its own heading with a stable, shareable link and a page number.</li>
            <li>Related findings from different books are gathered into thematic collections.</li>
            <li>Anyone can search, read, bookmark, and print — without creating an account.</li>
          </ol>
        </RevealSection>

        {/* FAQ */}
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

        {/* Contact */}
        <RevealSection className="landing-section contact-section" style={{ borderBottom: 'none' }}>
          {isAdmin ? (
            <>
              <h2>Messages</h2>
              <p className="muted icon-row"><InboxIcon size={15} /> Check the <Link to="/contact">Inbox</Link> for messages from readers.</p>
            </>
          ) : (
            <>
              <h2>Send a message</h2>
              <p className="muted">Suggest a book, point out an error, or just say hello.</p>
              <div className="contact-card"><ContactForm compact /></div>
            </>
          )}
        </RevealSection>

        <RevealSection className="landing-section">
          <p className="muted">This site is developed and maintained by Irshad Hossain.</p>
        </RevealSection>
      </div>
    </div>
  );
}

const LANDING_CSS = `
.lnd-hero { display:flex; align-items:center; justify-content:space-between; gap:1.5rem; flex-wrap:wrap; text-align:left; padding:3.5rem 1.4rem 2.8rem; }
.lnd-hero__left { max-width:480px; }
.lnd-hero__right { flex-shrink:0; }
.lnd-eyebrow { font-size:.62rem; font-weight:700; text-transform:uppercase; letter-spacing:.2em; color:var(--accent); margin-bottom:.5rem; }
@media(max-width:600px){ .lnd-hero{flex-direction:column;text-align:center;align-items:center;} .lnd-hero__right{display:none;} }

.lnd-stats-bar { display:flex; align-items:center; justify-content:center; gap:0; padding:.9rem 0; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
.lnd-stat { text-align:center; padding:0 1.8rem; }
.lnd-stat strong { display:block; font-size:1.4rem; font-weight:700; color:var(--accent); font-family:var(--font-serif),Georgia,serif; }
.lnd-stat span { font-size:.68rem; text-transform:uppercase; letter-spacing:.12em; color:var(--muted); }
.lnd-stats-sep { width:1px; height:32px; background:var(--border); }
@media(max-width:400px){ .lnd-stat{padding:0 1rem;} }

.lnd-section-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:.9rem; flex-wrap:wrap; gap:.5rem; }
.lnd-section-head h2 { margin:0; }
.lnd-all-link { display:inline-flex; align-items:center; gap:.25rem; font-size:.78rem; color:var(--accent); border-bottom:1px dotted var(--accent); text-decoration:none; }

/* Compact book row */
.lnd-books-row { display:flex; gap:.8rem; overflow-x:auto; padding-bottom:.4rem; scrollbar-width:thin; }
.lnd-books-row::-webkit-scrollbar { height:4px; }
.lnd-book-card { flex-shrink:0; width:110px; text-decoration:none; color:inherit; display:flex; flex-direction:column; transition:transform .15s; }
.lnd-book-card:hover { transform:translateY(-2px); }
.lnd-book-card__cover { width:110px; height:148px; object-fit:cover; border-radius:5px; display:block; background:var(--border); box-shadow:0 3px 10px rgba(0,0,0,.14); }
.lnd-book-card__cover--ph { display:grid; place-items:center; color:var(--muted); }
.lnd-book-card__title { font-size:.76rem; font-weight:600; margin:.35rem 0 .1rem; line-height:1.3; color:var(--fg); }
.lnd-book-card__author { font-size:.68rem; color:var(--muted); margin:0; }

/* Collection chips */
.lnd-cols-row { display:flex; flex-wrap:wrap; gap:.5rem; }
.lnd-col-chip { display:inline-flex; align-items:center; gap:.35rem; padding:.35rem .75rem; border:1px solid var(--border); border-radius:20px; font-size:.8rem; color:var(--fg); text-decoration:none; background:var(--surface); transition:border-color .15s,color .15s; }
.lnd-col-chip:hover { border-color:var(--accent); color:var(--accent); }

/* Quote card */
.landing-quote-card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:1.3rem 1.5rem; }
.landing-quote-inner { transition:opacity .4s ease; }
.lq-visible { opacity:1; }
.lq-hidden { opacity:0; }
.landing-quote-text { font-family:var(--font-serif),Georgia,serif; font-style:italic; font-size:1rem; line-height:1.75; color:var(--muted); margin:0 0 .7rem; }
.landing-quote-source { font-size:.8rem; margin:0; }
.lq-dots { display:flex; justify-content:center; gap:.4rem; margin-top:.8rem; }
.lq-dot { width:6px; height:6px; border-radius:50%; background:var(--border); padding:0; transition:background .2s,transform .2s; }
.lq-dot--active { background:var(--accent); transform:scale(1.4); }

/* Quote manager */
.quote-manager { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:1rem; margin-bottom:1rem; }
.quote-manager__title { font-size:.78rem; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--accent); margin-bottom:.8rem; }
.quote-manager__form { display:flex; flex-direction:column; gap:.5rem; margin-bottom:.8rem; }
.quote-manager__textarea { width:100%; border:1px solid var(--border); border-radius:5px; background:var(--bg); color:var(--fg); padding:.5rem .6rem; font-family:inherit; font-size:.88rem; resize:vertical; }
.quote-manager__input { width:100%; border:1px solid var(--border); border-radius:5px; background:var(--bg); color:var(--fg); padding:.45rem .6rem; font-size:.88rem; }
.quote-manager__textarea:focus,.quote-manager__input:focus { outline:none; border-color:var(--accent); }
.quote-manager__btns { display:flex; gap:.5rem; }
.quote-manager__list { display:flex; flex-direction:column; gap:.5rem; }
.quote-manager__item { padding:.6rem .7rem; border:1px solid var(--border); border-radius:6px; background:var(--bg); }
.quote-manager__item-text { font-size:.84rem; color:var(--fg); margin-bottom:.2rem; font-style:italic; }
.quote-manager__item-source { font-size:.76rem; margin-bottom:.4rem; }
.quote-manager__item-actions { display:flex; gap:.6rem; font-size:.74rem; }
.quote-manager__item-actions button { display:inline-flex; align-items:center; gap:.25rem; color:var(--muted); border-bottom:1px solid transparent; }
.quote-manager__item-actions button:hover { color:var(--accent); border-bottom-color:var(--accent); }
.quote-manager__item-actions button.danger:hover { color:#c0392b; border-bottom-color:#c0392b; }
`;