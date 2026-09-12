import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTrackView } from '../lib/context';
import { Book, Category, getLiveStats, listBooks, listCategories } from '../lib/supabase';
import { ContactForm } from './StaticPages';

// A small, quiet illustration — a sheet of paper, a few ruled lines, a pen.
// No 3D, no animation: just a mark that says "this is a place for writing."
function PaperAndPenDoodle() {
  return (
    <svg
      className="masthead-doodle"
      width="360"
      height="180"
      viewBox="0 0 360 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>
        {`
          .highlight-1 {
            animation: highlightPulse 4s ease-in-out infinite;
            transform-box: fill-box;
            transform-origin: center;
          }

          .highlight-2 {
            animation: highlightPulse 4s ease-in-out infinite 2s;
            transform-box: fill-box;
            transform-origin: center;
          }

          /* Only the pen moves — the doyat remains completely static */
          .reed-pen {
            animation: penWriting 4s ease-in-out infinite;
            transform-box: fill-box;
            transform-origin: bottom left;
          }

          @keyframes highlightPulse {
            0%, 15% {
              opacity: 0;
            }
            25%, 45% {
              opacity: 0.7;
            }
            55%, 100% {
              opacity: 0;
            }
          }

          @keyframes penWriting {
            0%, 100% {
              transform: translate(0, 0) rotate(0deg);
            }

            20% {
              transform: translate(-7px, 4px) rotate(-3deg);
            }

            40% {
              transform: translate(5px, -2px) rotate(2deg);
            }

            60% {
              transform: translate(-4px, 3px) rotate(-2deg);
            }

            80% {
              transform: translate(6px, -2px) rotate(2deg);
            }
          }
        `}
      </style>

      {/* A4 paper */}
      <rect
        x="76"
        y="12"
        width="136"
        height="156"
        rx="1"
        fill="var(--bg)"
        stroke="var(--border)"
        strokeWidth="2"
      />

      {/* Page lines */}
      <line x1="92" y1="38" x2="196" y2="38" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="92" y1="53" x2="196" y2="53" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="92" y1="68" x2="196" y2="68" stroke="var(--border)" strokeWidth="1.5" />

      {/* Highlighted line 1 */}
      <rect
        className="highlight-1"
        x="90"
        y="76"
        width="92"
        height="12"
        rx="1"
        fill="#E8D878"
        opacity="0"
      />
      <line x1="92" y1="83" x2="196" y2="83" stroke="var(--border)" strokeWidth="1.5" />

      <line x1="92" y1="98" x2="196" y2="98" stroke="var(--border)" strokeWidth="1.5" />

      {/* Highlighted line 2 */}
      <rect
        className="highlight-2"
        x="90"
        y="106"
        width="78"
        height="12"
        rx="1"
        fill="#E8D878"
        opacity="0"
      />
      <line x1="92" y1="113" x2="196" y2="113" stroke="var(--border)" strokeWidth="1.5" />

      <line x1="92" y1="128" x2="196" y2="128" stroke="var(--border)" strokeWidth="1.5" />
      <line x1="92" y1="143" x2="178" y2="143" stroke="var(--muted)" strokeWidth="1.5" />

      {/* =====================================================
          DOYAT — STATIC
          ===================================================== */}
      <g className="doyat">
        {/* Doyat body */}
        <path
          d="
            M229 116
            C229 106 240 100 255 100
            C270 100 281 106 281 116
            L277 137
            C275 148 267 154 255 154
            C243 154 235 148 233 137
            Z
          "
          fill="var(--bg)"
          stroke="var(--border)"
          strokeWidth="2"
        />

        {/* Doyat neck */}
        <path
          d="
            M241 101
            L243 89
            C243 85 247 83 255 83
            C263 83 267 85 267 89
            L269 101
          "
          fill="var(--bg)"
          stroke="var(--border)"
          strokeWidth="2"
        />

        {/* Ink opening */}
        <ellipse
          cx="255"
          cy="89"
          rx="11"
          ry="4"
          fill="var(--fg)"
        />
      </g>

      {/* =====================================================
          REED PEN — MOVES INDEPENDENTLY
          ===================================================== */}
      <g className="reed-pen">
        <path
          d="M258 52 L318 112"
          stroke="var(--fg)"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Pen nib */}
        <path
          d="M318 112 L327 124 L313 118 Z"
          fill="var(--fg)"
        />
      </g>

      {/* Small ink detail */}
      <circle
        cx="294"
        cy="83"
        r="3"
        fill="var(--accent)"
      />
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
        <h4>وَسِرَاجًا مُّنِيرًا - “and a luminous lamp.” <b><i>Qur’an 33:46</i></b></h4>
        <p className="tagline">A Collection of Findings from Classified Sunni Sources.</p>
        <PaperAndPenDoodle />
      </div>

      <section className="landing-section">
        <h2>What you'll find here</h2>
        <p>
          This is a working archive of findings drawn from Sunni books — quotations, notes, and short passages, each preserved as its own permanent, linkable page. There are no reader accounts. Browse the bookshelf, explore a collection, or search for a phrase you half-remember. Bookmarks and reading preferences remain only in your browser.
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