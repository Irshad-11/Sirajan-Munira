import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  BookOpen, FolderOpen, Bookmark, Search, ShieldCheck, Printer,
  Inbox as InboxIcon, ArrowRight, Star, Plus, Pencil, Trash2, X, ArrowUpRight,
  ScrollText, Archive, HardDrive, Library, Languages, Sparkles, UserRound, CalendarDays, Lightbulb, Compass,
  Link2, Hash, Code, Wrench, Feather, Mail, FileText, BookCopy, Send, ListChecks,
  Bot, Copy, Check, Braces, AlertTriangle, Table2, GitCompare, ClipboardPaste, FileJson, Terminal, Cpu, Upload, Globe2, ScanSearch, Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAdmin, useTrackView } from '../lib/context';
import { Book, Category, getLiveStats, listBooks, listCategories, getSiteSetting, setSiteSetting } from '../lib/supabase';
import { ContactForm } from './StaticPages';
import { SearchBox } from '../components/SearchBox';
import { CuratorNote } from '../components/Disclaimer';
import { AuthorQuote } from '../components/AuthorQuote';
import { copyToClipboard } from '../lib/richtext';
import { siteOrigin } from '../lib/ai';
import '../styles/hgai.css';

// ---------------------------------------------------------------------------
// Animated hero: lamp + book scene (artwork + GSAP timeline in
// components/LampBookScene). Lazy-loaded so the ~250 KB of vector artwork
// never delays the rest of the landing page.
// ---------------------------------------------------------------------------
const LampBookScene = React.lazy(() => import('../components/LampBookScene/LampBookScene'));

function AnimatedHeroScene() {
  return (
    <React.Suspense fallback={<div className="lnd-scene-ph" aria-hidden="true" />}>
      <LampBookScene />
    </React.Suspense>
  );
}
// ---------------------------------------------------------------------------
// Shelf Quotes — admin-managed
// ---------------------------------------------------------------------------
interface ShelfQuote { id: string; text: string; source: string; url?: string; }

/** "example.com/x" -> "https://example.com/x"; "/book/abc" stays internal; "" -> undefined */
function normalizeUrl(raw?: string): string | undefined {
  const v = (raw || '').trim();
  if (!v) return undefined;
  if (v.startsWith('/')) return v;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  return `https://${v}`;
}

function QuoteManager({ quotes, onChange }: { quotes: ShelfQuote[]; onChange: (q: ShelfQuote[]) => void }) {
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [url, setUrl] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const reset = () => { setEditId(null); setText(''); setSource(''); setUrl(''); };

  const save = async () => {
    if (!text.trim() || !source.trim()) return;
    const link = normalizeUrl(url);
    let next: ShelfQuote[];
    if (editId) {
      next = quotes.map(q => q.id === editId ? { ...q, text: text.trim(), source: source.trim(), url: link } : q);
    } else {
      next = [...quotes, { id: Date.now().toString(), text: text.trim(), source: source.trim(), url: link }];
    }
    await setSiteSetting('shelf_quotes', next);
    onChange(next);
    reset();
  };

  const remove = async (id: string) => {
    const next = quotes.filter(q => q.id !== id);
    await setSiteSetting('shelf_quotes', next);
    onChange(next);
  };

  const startEdit = (q: ShelfQuote) => { setEditId(q.id); setText(q.text); setSource(q.source); setUrl(q.url || ''); };

  return (
    <div className="quote-manager">
      <h4 className="quote-manager__title">Manage "From the Shelf" cards</h4>
      <div className="quote-manager__form">
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Card text…" rows={3} className="quote-manager__textarea" />
        <input value={source} onChange={e => setSource(e.target.value)} placeholder="Source (book name, author…)" className="quote-manager__input" />
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Link (optional) — https://… or /book/your-slug" className="quote-manager__input" inputMode="url" />
        <div className="quote-manager__btns">
          <button className="primary" onClick={save}>{editId ? 'Save edit' : <><Plus size={13}/> Add card</>}</button>
          {editId && <button className="secondary" onClick={reset}>Cancel</button>}
        </div>
      </div>
      <div className="quote-manager__list">
        {quotes.map(q => (
          <div key={q.id} className="quote-manager__item">
            <div className="quote-manager__item-text">"{q.text.slice(0, 80)}{q.text.length > 80 ? '…' : ''}"</div>
            <div className="quote-manager__item-source muted">— {q.source}{q.url ? ` · ${q.url}` : ''}</div>
            <div className="quote-manager__item-actions">
              <button onClick={() => startEdit(q)}><Pencil size={12}/> Edit</button>
              <button onClick={() => remove(q.id)} className="danger"><Trash2 size={12}/> Remove</button>
            </div>
          </div>
        ))}
        {quotes.length === 0 && <p className="muted" style={{fontSize:'0.82rem'}}>No cards added yet.</p>}
      </div>
    </div>
  );
}

// Same id -> same look, every time (so cards don't jump around on reload).
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
// Some cards lean left, some right, a few stay straight.
const TILTS = [-2.6, 1.8, 0, -1.2, 2.4, 0, 1.2, -2];

function ShelfCard({ q }: { q: ShelfQuote }) {
  const h = hashId(q.id);
  const tilt = TILTS[h % TILTS.length];
  const href = normalizeUrl(q.url);
  const style = { ['--tilt' as any]: `${tilt}deg`, ['--tone' as any]: `${(h >> 3) % 3}` } as React.CSSProperties;
  const inner = (
    <>
      <span className="shelf-pin" aria-hidden="true" />
      <p className="shelf-card__text">“{q.text}”</p>
      <p className="shelf-card__source">— {q.source}</p>
      {href && <span className="shelf-card__go" aria-hidden="true"><ArrowUpRight size={14} /></span>}
    </>
  );
  const cls = `shelf-card shelf-tone-${(h >> 3) % 3} ${href ? 'shelf-card--link' : ''}`;
  if (!href) return <div className={cls} style={style}>{inner}</div>;
  if (href.startsWith('/')) return <Link to={href} className={cls} style={style}>{inner}</Link>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>{inner}</a>;
}

/** One wall of cards (no slider). */
function ShelfWall({ quotes }: { quotes: ShelfQuote[] }) {
  return (
    <div className="shelf-wall">
      {quotes.map(q => <ShelfCard key={q.id} q={q} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reader guide — "How to get the most out of this site"
// Four tabs, each with a small animated illustration. Auto-advances while the
// section is on screen; stops for good as soon as the reader picks a tab.
// ---------------------------------------------------------------------------
type GuideStep = {
  id: string;
  icon: LucideIcon;
  tab: string;
  hint: string;
  title: string;
  body: React.ReactNode;
  cta: { to: string; label: string; primary?: boolean };
  Visual: React.ComponentType;
};

function VisualSources() {
  return (
    <div className="hg-vis hg-vis--links" aria-hidden="true">
      <div className="hg-link hg-link--primary">
        <span className="hg-link__icon"><Archive size={16} /></span>
        <span className="hg-link__text"><b>Internet Archive</b><small>মূল লিংক</small></span>
        <span className="hg-pill hg-pill--swap">
          <span className="hg-pill__a">খুলছে…</span>
          <span className="hg-pill__b">সাড়া দিচ্ছে না</span>
        </span>
      </div>
      <div className="hg-link__bridge"><span /></div>
      <div className="hg-link hg-link--mirror">
        <span className="hg-link__icon"><HardDrive size={16} /></span>
        <span className="hg-link__text"><b>GDrive mirror</b><small>ব্যাকআপ কপি</small></span>
        <span className="hg-pill hg-pill--ok">পাওয়া যাচ্ছে</span>
      </div>
      <div className="hg-merge">
        <span className="hg-merge__item"><Printer size={13} /> Findings প্রিন্ট</span>
        <span className="hg-merge__plus">+</span>
        <span className="hg-merge__item"><FileText size={13} /> মূল PDF</span>
        <span className="hg-merge__plus">=</span>
        <span className="hg-merge__item hg-merge__item--result"><BookCopy size={13} /> পূর্ণ বই</span>
      </div>
    </div>
  );
}

function VisualMeta() {
  const chips = [
    { icon: UserRound, label: 'কে লিখেছেন' },
    { icon: ShieldCheck, label: 'সুন্নি ধারায় গ্রহণযোগ্যতা' },
    { icon: Lightbulb, label: 'কেন লিখেছেন' },
    { icon: ListChecks, label: 'বইয়ে কী কী আছে' },
    { icon: CalendarDays, label: 'Edition ও প্রকাশনা' },
  ];
  return (
    <div className="hg-vis hg-vis--meta" aria-hidden="true">
      <div className="hg-book">
        <span className="hg-book__spine" />
        <span className="hg-book__line w1" /><span className="hg-book__line w2" /><span className="hg-book__line w3" />
      </div>
      <div className="hg-chips">
        {chips.map((c, i) => (
          <span key={c.label} className="hg-chip" style={{ animationDelay: `${180 + i * 150}ms` }}>
            <c.icon size={13} /> {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function VisualTranslate() {
  return (
    <div className="hg-vis hg-vis--tr" aria-hidden="true">
      <div className="hg-tr__card hg-tr__src">
        <small>আরবি / উর্দু</small>
        <span lang="ar" dir="rtl" className="hg-tr__ar">أَهْلُ الْبَيْت</span>
      </div>
      <div className="hg-tr__arrow"><Languages size={16} /><span /></div>
      <div className="hg-tr__card hg-tr__dst">
        <small>বাংলা finding</small>
        <span lang="bn" className="hg-tr__bn">আহলে বাইত</span>
        <span className="hg-tr__tags">
          <span><BookOpen size={11} /> বই</span>
          <span><Hash size={11} /> পৃষ্ঠা</span>
          <span><Link2 size={11} /> নিজস্ব লিংক</span>
        </span>
      </div>
    </div>
  );
}

function VisualCollections() {
  const books = [
    { c: '#a4501f', n: 'বই ১' },
    { c: '#3f7fc9', n: 'বই ২' },
    { c: '#3f9e5e', n: 'বই ৩' },
  ];
  return (
    <div className="hg-vis hg-vis--col" aria-hidden="true">
      <div className="hg-col__books">
        {books.map((b, i) => (
          <span key={b.n} className="hg-col__book" style={{ ['--bc' as any]: b.c, animationDelay: `${i * 120}ms` }}>
            <span className="hg-col__spine" /> {b.n}
          </span>
        ))}
      </div>
      <div className="hg-col__flow"><span /><span /><span /></div>
      <div className="hg-col__topic">
        <span className="hg-col__head"><FolderOpen size={14} /> একটি topic</span>
        {books.map((b, i) => (
          <span key={b.n} className="hg-col__row" style={{ animationDelay: `${900 + i * 220}ms` }}>
            <span className="hg-col__dot" style={{ background: b.c }} />
            <span className="hg-col__lines"><span /><span /></span>
            <small>{b.n}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

// Example queries for the demo: a hadith is easiest to find when you describe
// its event in 2–3 sentences.
const SEARCH_EXAMPLES = [
  'বিদায় হজ থেকে ফেরার পথে নবী ﷺ এক জায়গায় সবাইকে থামালেন। সেখানে তিনি আলী (আ.)-এর ব্যাপারে কিছু বললেন।',
  'নবী ﷺ একটা চাদরের নিচে আলী, ফাতিমা, হাসান ও হুসাইন (আ.)-কে নিলেন। তারপর তাঁদের পবিত্রতা নিয়ে একটা আয়াত পড়লেন।',
];
const TYPE_MS = 32;

function VisualSearch() {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const chars = Array.from(SEARCH_EXAMPLES[round % SEARCH_EXAMPLES.length]);
    if (reduce) { setText(chars.join('')); setDone(true); return; }
    let i = 0;
    setText(''); setDone(false);
    const typer = window.setInterval(() => {
      i += 1;
      setText(chars.slice(0, i).join(''));
      if (i >= chars.length) { window.clearInterval(typer); setDone(true); }
    }, TYPE_MS);
    const next = window.setTimeout(() => setRound((r) => r + 1), chars.length * TYPE_MS + 3200);
    return () => { window.clearInterval(typer); window.clearTimeout(next); };
  }, [round]);
  return (
    <div className="hg-vis hg-vis--search" aria-hidden="true">
      <div className="hg-sbox">
        <Search size={15} />
        <span className="hg-sbox__text">{text}<span className="hg-caret" /></span>
      </div>
      <div className="hg-results">
        {done && [92, 81, 67].map((pct, i) => (
          <div key={`${round}-${i}`} className="hg-result" style={{ animationDelay: `${150 + i * 160}ms` }}>
            <span className="hg-result__lines"><span /><span /></span>
            <span className="hg-result__bar"><span style={{ width: `${pct}%`, animationDelay: `${300 + i * 160}ms` }} /></span>
            <small>{pct}%</small>
          </div>
        ))}
      </div>
      <p className="hg-sfoot"><Sparkles size={12} /> ঘটনার অর্থ মিলিয়ে সম্পর্কিত হাদিস খোঁজা</p>
    </div>
  );
}

function VisualContact() {
  return (
    <div className="hg-vis hg-vis--contact" aria-hidden="true">
      <div className="hg-msg hg-msg--out">
        <span className="hg-msg__who"><UserRound size={12} /> আপনি</span>
        একটা finding-এর অনুবাদে ভুল চোখে পড়েছে…
      </div>
      <div className="hg-msg hg-msg--out hg-msg--2">
        আর একটা হাদিস নিয়ে কিছু জানার ছিল।
      </div>
      <div className="hg-msg__send"><Send size={13} /> সরাসরি আমার কাছে পৌঁছাবে</div>
    </div>
  );
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'source',
    icon: ScrollText,
    tab: 'মূল স্ক্রিপ্ট',
    hint: 'Findings নিজেই যাচাই করুন',
    title: 'এক নজরে: মূল বই থেকে নিজেই যাচাই করুন',
    body: (
      <>
        <p>এই সাইটে যেসব বই থেকে findings লেখা আছে, সেই findings আপনি নিজেই <strong>যাচাই</strong> করতে পারবেন। এজন্য প্রতিটি বইয়ের পাতার একদম ওপরে <strong>Internet Archive</strong>-এ সেই বইয়ের লিংক দেওয়া আছে।</p>
        <p>কোনো কারণে সেই লিংক কাজ না করলে, আমার নিজের <strong>GDrive</strong>-এর <strong>mirror লিংক</strong>ও দেওয়া আছে, যাতে আপনাকে কোনো সমস্যায় পড়তে না হয়।</p>
        <p>চাইলে আমাদের findings <strong>প্রিন্ট</strong> করে নিতে পারবেন। পরে মূল PDF আর findings একসঙ্গে merge করে পুরো একটা <strong>স্বয়ংসম্পূর্ণ বই</strong> বানিয়ে ফেলতে পারবেন। যে বাংলাভাষী পাঠকেরা আসলেই জানতে চান, তাঁদের জন্য এটা অনেক কাজে দেবে।</p>
      </>
    ),
    cta: { to: '/books', label: 'Bookshelf দেখুন' },
    Visual: VisualSources,
  },
  {
    id: 'meta',
    icon: Library,
    tab: 'বইয়ের তথ্য',
    hint: 'বই আর লেখককে চিনুন',
    title: 'পড়ার আগে বই আর লেখককে চিনে নিন',
    body: (
      <>
        <p>প্রতিটি বইয়ের সঙ্গে লেখা আছে বইটা <strong>কে লিখেছেন</strong>, আর সুন্নি ধারায় সেই লেখকের <strong>গ্রহণযোগ্যতা</strong> কতটুকু।</p>
        <p>লেখক <strong>কী কারণে</strong> বইটা লিখেছেন, আর এই বইয়ে তিনি <strong>কী কী রাখতে চেয়েছেন</strong>, সেটাও বলা আছে।</p>
        <p>সঙ্গে আছে বইয়ের <strong>মেটাডেটা</strong>: edition, প্রকাশনা আর এরকম অন্যান্য তথ্য।</p>
      </>
    ),
    cta: { to: '/books', label: 'একটা বই খুলুন' },
    Visual: VisualMeta,
  },
  {
    id: 'findings',
    icon: Feather,
    tab: 'Findings',
    hint: 'সাইটের সবচেয়ে ভালো অংশ',
    title: 'Findings: বাংলায় অনুবাদ করা অংশ',
    body: (
      <>
        <p>এই সাইটের সবচেয়ে ভালো দিক হলো findings। বেশিরভাগ বই <strong>আরবি বা উর্দু</strong> ভাষায় লেখা। সেই বইয়ের গুরুত্বপূর্ণ অংশগুলো <strong>বাংলায় অনুবাদ</strong> করে এখানে findings আকারে যোগ করা হয়।</p>
        <p>প্রতিটি finding-এ বইয়ের নাম আর পৃষ্ঠা নম্বর থাকে, আর প্রতিটির নিজস্ব একটা লিংক আছে। তাই পড়তে পারবেন, bookmark করে রাখতে পারবেন, যে কারও সঙ্গে শেয়ারও করতে পারবেন।</p>
      </>
    ),
    cta: { to: '/books', label: 'Findings পড়া শুরু করুন' },
    Visual: VisualTranslate,
  },
  {
    id: 'collections',
    icon: FolderOpen,
    tab: 'Collections',
    hint: 'বিষয় ধরে সাজানো',
    title: 'Collections: বিষয়ভিত্তিক দ্রুত রেফারেন্স',
    body: (
      <>
        <p>Collections-এ findings বিভিন্ন <strong>বিষয় (topic) অনুযায়ী</strong> সাজানো আছে। একেকটা topic-এর নিচে বিভিন্ন বই থেকে নেওয়া findings গুছিয়ে রাখা হয়েছে।</p>
        <p>তাই কোনো নির্দিষ্ট বিষয়ে <strong>দ্রুত রেফারেন্স</strong> খুঁজতে চাইলে আলাদা আলাদা বই ঘাঁটতে হবে না। একটা collection খুললেই সব এক জায়গায় পেয়ে যাবেন।</p>
      </>
    ),
    cta: { to: '/collections', label: 'Collections দেখুন' },
    Visual: VisualCollections,
  },
  {
    id: 'search',
    icon: Search,
    tab: 'Semantic search',
    hint: 'ঘটনা লিখে হাদিস খুঁজুন',
    title: 'তারপরও না পেলে: semantic search',
    body: (
      <>
        <p>এরপরও কিছু খুঁজে পেতে সমস্যা হলে <strong>semantic search</strong> তো আছেই। এটা শুধু শব্দ মেলায় না, আপনি কী বোঝাতে চাইছেন সেটাও বোঝে।</p>
        <p>ব্যবহার করবেন এভাবে: যে হাদিসটা খুঁজছেন, সেই হাদিসের <strong>ঘটনাটা দুই-তিন বাক্যে</strong> একটু বড় করে লিখুন। তারপর সেই ঘটনার সঙ্গে মিলে যায় এমন <strong>সম্পর্কিত হাদিসগুলো</strong> সামনে চলে আসবে।</p>
      </>
    ),
    cta: { to: '/search', label: 'সার্চ করে দেখুন' },
    Visual: VisualSearch,
  },
  {
    id: 'contact',
    icon: Mail,
    tab: 'যোগাযোগ',
    hint: 'ভুল বা প্রশ্ন থাকলে',
    title: 'সরাসরি আমার সঙ্গে যোগাযোগ করুন',
    body: (
      <>
        <p>কোনো finding-এ <strong>ভুল</strong> চোখে পড়লে, বা কোনো কিছু <strong>জানার</strong> থাকলে, সরাসরি আমার সঙ্গে যোগাযোগ করবেন।</p>
        <p>আপনার নাম আর যোগাযোগের একটা মাধ্যম, যেমন email বা WhatsApp দিলেই হবে।</p>
      </>
    ),
    cta: { to: '/contact', label: 'যোগাযোগ করুন', primary: true },
    Visual: VisualContact,
  },
];


// ---------------------------------------------------------------------------
// AI এজেন্ট সিস্টেম (new) — same tabbed/animated guide, own accent.
// ---------------------------------------------------------------------------
function CopyChip({ text, label, icon: Icon }: { text: string; label: string; icon?: LucideIcon }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="hgai-prompt">
      <div className="hgai-prompt__head">
        <span className="hgai-prompt__label">{Icon && <Icon size={15} aria-hidden="true" />} {label}</span>
        <button type="button" onClick={async () => { if (await copyToClipboard(text)) { setOk(true); window.setTimeout(() => setOk(false), 1800); } }} aria-label={`${label} — সম্পূর্ণ প্রম্পট কপি করুন`}>
          {ok ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {ok ? 'কপি হয়েছে' : 'কপি'}
        </button>
      </div>
      <p className="hgai-prompt__text" title="সম্পূর্ণ প্রম্পট কপি হবে">{text}</p>
    </div>
  );
}

/** Prompt lab: the reader types a topic (and optionally a book); every prompt updates live. Previews are
 *  clipped to two lines, the copy button always copies the full text. */
function PromptLab() {
  const [topic, setTopic] = useState('');
  const [book, setBook] = useState('');
  const [quote, setQuote] = useState('');
  const t = topic.trim() || '[এখানে বিষয় লিখুন]';
  const bk = book.trim() || '[বইয়ের নাম]';
  const qt = quote.trim() || '[এখানে বাক্যটি পেস্ট করুন]';
  const o = O();
  return (
    <>
      <label className="hgai-field">
        <span><ScanSearch size={14} aria-hidden="true" /> আপনার প্রশ্ন বা বিষয়</span>
        <textarea rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="যেমন: আফজাল আমল" />
      </label>
      <label className="hgai-field">
        <span><BookOpen size={14} aria-hidden="true" /> বইয়ের নাম (শুধু একটি বইয়ে খুঁজলে)</span>
        <input value={book} onChange={(e) => setBook(e.target.value)} placeholder="বইয়ের নাম" />
      </label>
      <label className="hgai-field">
        <span><Hash size={14} aria-hidden="true" /> যাচাই করতে চাওয়া বাক্য</span>
        <textarea rows={2} value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="বাক্যটি পেস্ট করুন" />
      </label>
      <CopyChip icon={Globe2} label="সব বইয়ে খুঁজুন" text={`আমার প্রশ্ন: ${t}. ${o}/llms.txt পড়ে সব বই খুঁজে সব প্রাসঙ্গিক finding বের করো। প্রতিটির ফুল permalink, বই, PDF পৃষ্ঠা ও শুরুর কথা দাও। শেষে বলো কতটি finding পড়েছ।`} />
      <CopyChip icon={BookOpen} label="একটি বইয়ের ভেতরে" text={`${o}/llms.txt পড়ো। তারপর শুধু "${bk}" বইয়ের index.tsv ও part-ফাইলগুলো (শেষে END OF BOOK পর্যন্ত) পড়ে "${t}" সম্পর্কিত সব finding দাও, permalink ও PDF পৃষ্ঠা সহ।`} />
      <CopyChip icon={FileJson} label="কালেকশন JSON" text={`আমার প্রশ্ন: ${t}. ${o}/llms.txt পড়ে সব বই খুঁজে সব প্রাসঙ্গিক finding বের করো। উত্তর শুধু একটি JSON ব্লকে দাও, schema 'sirajan-collection/1', প্রতিটি item-এ ফুল permalink, book, title, pdf_page, first_words (হুবহু), match, note থাকবে। শেষে এক লাইনে বলো কতটি finding পড়েছ কতটির মধ্যে।`} />
      <CopyChip icon={ShieldCheck} label="উদ্ধৃতি যাচাই" text={`${o}/llms.txt পড়ো। নিচের বাক্যটি সাইটের কোন finding-এ আছে খুঁজে দাও (verify endpoint ব্যবহার করে)। পাওয়া গেলে permalink, বই, PDF পৃষ্ঠা দাও; না পেলে স্পষ্ট বলো "পাওয়া যায়নি"।\n\nবাক্য: ${qt}`} />
    </>
  );
}

/** Generic animated flow: nodes light up one after another (CSS only). */
function VisualFlow({ nodes }: { nodes: { icon: LucideIcon; label: string }[] }) {
  return (
    <div className="hg-vis hgai-flow" aria-hidden="true">
      {nodes.map((n, i) => (
        <React.Fragment key={n.label}>
          <div className="hgai-node" style={{ animationDelay: `${i * 0.7}s` }}>
            <span className="hgai-node__ic"><n.icon size={18} /></span>
            <span className="hgai-node__tx">{n.label}</span>
          </div>
          {i < nodes.length - 1 && <span className="hgai-edge" style={{ animationDelay: `${i * 0.7 + 0.35}s` }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

const O = () => siteOrigin();
const Scene = ({ children }: { children: React.ReactNode }) => <div className="hgai-sw" aria-hidden="true">{children}</div>;
const v = (o: Record<string, string | number>) => o as React.CSSProperties;
const Ic = ({ I, c = '', s }: { I: LucideIcon; c?: string; s?: React.CSSProperties }) => <span className={`hgai-i ${c}`} style={s}><I size={16} /></span>;
// 1 ORBIT: the five ways to use AI circle one assistant
const S1 = () => (<Scene><div className="hgai-s hgai-s1" aria-hidden="true">
  <svg viewBox="0 0 360 170"><circle cx="180" cy="85" r="62" /><circle cx="180" cy="85" r="34" /></svg>
  <Ic I={Bot} c="hgai-s1__c" />
  <div className="hgai-s1__ring">{[Globe2, Upload, Layers, Terminal, Cpu].map((I, i) => <Ic key={i} I={I} s={v({ '--a': `${i * 72}deg`, '--d': `${i * 3.6}s` })} />)}</div>
</div></Scene>);
// 2 TYPEWRITER: prompt types out -> copy -> packet flies -> chat reply
const S2 = () => (<Scene><div className="hgai-s hgai-s2" aria-hidden="true">
  <div className="hgai-s2__card">{[100, 82, 94, 56].map((w, i) => <i key={i} style={v({ '--w': `${w}%`, '--n': i })} />)}</div>
  <Ic I={Copy} c="hgai-s2__cp" /><b className="hgai-s2__pk" />
  <div className="hgai-s2__chat"><u className="me" /><u className="ai"><em /><em /><em /></u><u className="ln" /></div>
</div></Scene>);
// 3 CONVEYOR: JSON blocks ride a belt, pass the scanner gate, become Verified/Check badges, drop into folder
const S3 = () => (<Scene><div className="hgai-s hgai-s3" aria-hidden="true">
  <svg viewBox="0 0 360 170"><rect className="belt" x="0" y="122" width="360" height="6" rx="3" /><path className="gate" d="M150 122V50h40v72" /><rect className="beam" x="156" y="56" width="28" height="3" rx="1.5" /></svg>
  <Ic I={ScanSearch} c="hgai-s3__sc" />
  {[0, 1, 2].map(i => <span key={i} className={`hgai-s3__c${i === 2 ? ' warn' : ''}`} style={v({ '--i': i })}>
    <Braces className="a" size={18} />{i === 2 ? <AlertTriangle className="b" size={18} /> : <Check className="b" size={18} />}</span>)}
  <Ic I={FolderOpen} c="hgai-s3__f" />
</div></Scene>);
// 4 RADAR: a sweep over the collection pings findings; results light up on the right
const S4 = () => (<Scene><div className="hgai-s hgai-s4" aria-hidden="true">
  <div className="hgai-s4__r"><i className="sw" />{[[40, 22], [104, 36], [92, 100], [30, 88]].map(([x, y], i) => <b key={i} style={v({ left: x, top: y, '--d': `${[0.9, 1.5, 3, 4.1][i]}s` })} />)}</div>
  <Ic I={FolderOpen} c="hgai-s4__c" />
  {[Table2, GitCompare, FileText].map((I, i) => <Ic key={i} I={I} s={v({ top: 22 + i * 46, '--d': `${1.4 + i * 1.3}s` })} c="hgai-s4__o" />)}
</div></Scene>);
// 5 STACK: a reader walks down the file layers: llms.txt > index.tsv > part-N > END OF BOOK
const S5 = () => (<Scene><div className="hgai-s hgai-s5" aria-hidden="true">
  {[[FileText, 'llms.txt'], [ListChecks, 'index.tsv'], [BookOpen, 'part-1'], [BookOpen, 'part-N'], [Check, 'END OF BOOK']].map(([I, t], i) =>
    <div key={i} className="hgai-s5__r" style={v({ '--i': i })}><I size={14} /><span>{t as string}</span></div>)}
  <i className="hgai-s5__beam" /><Ic I={Bot} c="hgai-s5__bot" />
</div></Scene>);

const P_JSON = () => `আমার প্রশ্ন: [এখানে প্রশ্ন]. ${O()}/llms.txt পড়ে সব বই খুঁজে সব প্রাসঙ্গিক finding বের করো। উত্তর শুধু একটি JSON ব্লকে দাও, schema 'sirajan-collection/1', প্রতিটি item-এ ফুল permalink, book, title, pdf_page, first_words (হুবহু), match, note থাকবে। শেষে এক লাইনে বলো কতটি finding পড়েছ কতটির মধ্যে।`;

const AI_STEPS: GuideStep[] = [
  {
    id: 'ai-ways', icon: Bot, tab: 'AI কীভাবে ব্যবহার করবেন', hint: '৫ ধরনের AI, ৫ রকম উপায়',
    title: 'আপনার AI যেটাই হোক, ব্যবহারের উপায় আছে',
    body: (
      <>
        <p>এই সাইট AI-এর জন্য সরল টেক্সট ফাইল দেয়, তাই নিচের যেকোনো ধরনের AI দিয়েই কাজ করা যায়:</p>
        <ul className="hgai-list">
          <li><Globe2 size={15} aria-hidden="true" /><span><b>ব্রাউজিং আছে</b> (ChatGPT, Claude, Gemini-এর web সার্চ): নিচের প্রম্পট কপি করে পেস্ট করুন। AI নিজেই <code>llms.txt</code> থেকে শুরু করে বই খুঁজে নেবে।</span></li>
          <li><Upload size={15} aria-hidden="true" /><span><b>ব্রাউজিং নেই:</b> বইয়ের পাতা বা কালেকশন থেকে TXT/JSON ডাউনলোড করে AI-তে আপলোড করুন, তারপর প্রশ্ন করুন।</span></li>
          <li><Layers size={15} aria-hidden="true" /><span><b>Projects / Custom GPT / Gems / NotebookLM:</b> <code>SKILL.md</code> ও বইয়ের ফাইল একবার যোগ করুন, তারপর বারবার ব্যবহার করুন।</span></li>
          <li><Terminal size={15} aria-hidden="true" /><span><b>কোডিং এজেন্ট</b> (Claude Code, Codex ইত্যাদি): <code>openapi.json</code> ও <code>index.tsv</code> দিন; এরা search, verify ও part-ফাইল নিজেই চালাতে পারে।</span></li>
          <li><Cpu size={15} aria-hidden="true" /><span><b>লোকাল মডেল:</b> ছোট কনটেক্সট, তাই কালেকশন থেকে "Copy as AI context" নিন এবং একসাথে ২০–৩০টির বেশি finding দেবেন না।</span></li>
        </ul>
      </>
    ),
    cta: { to: '/ai-integration', label: 'পূর্ণ AI Integration গাইড' },
    Visual: S1,
  },
  {
    id: 'ai-prompts', icon: Copy, tab: 'রেডি প্রম্পট', hint: 'কপি করে সরাসরি পেস্ট',
    title: 'প্রম্পট কপি করুন, AI-তে পেস্ট করুন',
    body: (
      <>
        <p>নিচে আপনার প্রশ্ন লিখুন, প্রম্পটগুলো নিজে থেকেই বদলে যাবে। প্রিভিউ ছোট করে দেখানো হয়েছে; <strong>কপি</strong> চাপলে পুরো প্রম্পট কপি হবে।</p>
        <PromptLab />
      </>
    ),
    cta: { to: '/search', label: 'Search with High Accuracy' },
    Visual: S2,
  },
  {
    id: 'ai-collect', icon: FileJson, tab: 'কালেকশন বানানো', hint: 'AI-এর JSON সাইটে যাচাই',
    title: 'AI-এর উত্তর থেকে নিজের কালেকশন',
    body: (
      <>
        <p>AI যা খুঁজে পায় তা JSON আকারে দিতে বলুন, তারপর <Link to="/collections/import">Import collection</Link> পাতায় পেস্ট করুন। সাইট প্রতিটি item আসল ডাটাবেসের সঙ্গে মিলিয়ে <strong>Verified</strong> অথবা <strong>Check</strong> চিহ্ন দেখাবে, ভুল হলে "AI বলেছে / সাইটে আছে" পাশাপাশি দেখাবে।</p>
        <CopyChip label="কালেকশন JSON প্রম্পট" text={P_JSON()} />
        <p>সেভ করার জায়গা: <strong>Temporary</strong> (এই ট্যাবে), <strong>Local</strong> (এই ডিভাইসে, Export করে ব্যাকআপ রাখা যায়)। সেভ করা কালেকশন <Link to="/my-collections">My collections</Link>-এ।</p>
      </>
    ),
    cta: { to: '/collections/import', label: 'Import collection', primary: true },
    Visual: S3,
  },
  {
    id: 'ai-analyze', icon: Sparkles, tab: 'AI দিয়ে বিশ্লেষণ', hint: 'সারাংশ, তুলনা, প্রবন্ধ',
    title: 'কালেকশন দিয়ে AI-কে দিয়ে কাজ করান',
    body: (
      <>
        <p>কালেকশন পাতায় <strong>Copy as AI context</strong> চেপে AI-তে পেস্ট করুন, তারপর নিচের যেকোনো কাজ বলুন:</p>
        <ul className="hgai-list hgai-list--plain">
          <li>উপ-বিষয় অনুযায়ী findings ভাগ করা</li>
          <li>বই-বই তুলনা, মিল ও অমিল টেবিলে</li>
          <li>টাইমলাইন বা টেবিল: বই, পৃষ্ঠা, সারাংশ, লিংক</li>
          <li>কীওয়ার্ড ও সমার্থক শব্দ বের করা (যেমন আফজাল, শ্রেষ্ঠ, সর্বোত্তম)</li>
          <li>প্রতিটি finding-এর ২ লাইনের সারাংশ</li>
          <li>পড়ার প্রশ্ন ও কুইজ, উত্তরের পাশে permalink</li>
          <li>permalink-সহ প্রবন্ধের খসড়া</li>
          <li>ফাঁক খোঁজা: কোন দিক বাদ পড়েছে</li>
          <li>উত্তরের উদ্ধৃতি verify দিয়ে আবার যাচাই</li>
        </ul>
        <p className="hgai-note">কাজের ধারা: প্রশ্ন করুন, JSON নিন, পেস্ট করে Verified দেখুন, ভুল বাদ দিন, সেভ করুন, তারপর "Copy as AI context" দিয়ে ফলো-আপ প্রশ্ন করুন।</p>
      </>
    ),
    cta: { to: '/my-collections', label: 'My collections' },
    Visual: S4,
  },
  {
    id: 'ai-files', icon: Terminal, tab: 'ফাইল ও এন্ডপয়েন্ট', hint: 'এজেন্টদের জন্য কাঁচা লিংক',
    title: 'AI এজেন্টের জন্য প্রস্তুত ফাইল',
    body: (
      <>
        <p>সবই সরল টেক্সট, JavaScript লাগে না:</p>
        <ul className="hgai-links">
          <li><a href="/llms.txt">llms.txt</a><span>শুরুর নির্দেশ ও উত্তরের ফরম্যাট</span></li>
          <li><a href="/ai-integration/SKILL.md">SKILL.md</a><span>এজেন্টের স্থায়ী নিয়ম</span></li>
          <li><a href="/index.tsv">index.tsv</a><span>সব বই ও finding-এর তালিকা</span></li>
          <li><a href="/openapi.json">openapi.json</a><span>search ও verify API</span></li>
          <li><a href="/synonyms.txt">synonyms.txt</a><span>সমার্থক শব্দের তালিকা</span></li>
        </ul>
        <p>প্রতিটি বইয়ের টেক্সট ছোট ছোট part-এ ভাগ করা; শেষে <code>NEXT</code> লিংক বা <code>END OF BOOK</code> থাকে, তাই এজেন্ট জানে কখন পুরো বই পড়া হয়েছে।</p>
      </>
    ),
    cta: { to: '/ai-integration', label: 'AI Integration গাইড দেখুন' },
    Visual: S5,
  },
];

const GUIDE_INTERVAL = 7000;

function ReaderGuide({ steps = GUIDE_STEPS, label = 'সাইটটি কীভাবে ব্যবহার করবেন', variant = '' }: { steps?: GuideStep[]; label?: string; variant?: string }) {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);       // false forever once the reader picks a tab
  const [paused, setPaused] = useState(false);  // hover / focus / off-screen
  const [onScreen, setOnScreen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setAuto(false);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOnScreen(true); return; }
    const obs = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.35 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const running = auto && !paused && onScreen;
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % steps.length), GUIDE_INTERVAL);
    return () => window.clearTimeout(t);
  }, [running, active]);

  const pick = (i: number, focus = false) => {
    setAuto(false);
    setActive(i);
    if (focus) tabRefs.current[i]?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const n = steps.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); pick((active + 1) % n, true); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); pick((active - 1 + n) % n, true); }
    if (e.key === 'Home') { e.preventDefault(); pick(0, true); }
    if (e.key === 'End') { e.preventDefault(); pick(n - 1, true); }
  };

  const step = steps[active];
  const Visual = step.Visual;

  return (
    <div
      ref={rootRef}
      className={`hg ${variant} ${running ? 'hg--running' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="hg-tabs" role="tablist" aria-label={label} aria-orientation="vertical" onKeyDown={onKey}>
        {steps.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={`hg-tab-${s.id}`}
            aria-controls={`hg-panel-${s.id}`}
            aria-selected={i === active}
            tabIndex={i === active ? 0 : -1}
            className={`hg-tab ${i === active ? 'is-active' : ''}`}
            onClick={() => pick(i)}
          >
            <span className="hg-tab__no">{String(i + 1).padStart(2, '0')}</span>
            <span className="hg-tab__icon"><s.icon size={17} /></span>
            <span className="hg-tab__text">
              <span className="hg-tab__title">{s.tab}</span>
              <span className="hg-tab__hint">{s.hint}</span>
            </span>
            {i === active && <span className="hg-tab__progress" key={`${active}-${running}`} />}
          </button>
        ))}
      </div>

      <div
        className="hg-panel"
        role="tabpanel"
        id={`hg-panel-${step.id}`}
        aria-labelledby={`hg-tab-${step.id}`}
        key={step.id}
      >
        <div className="hg-panel__visual"><Visual /></div>
        <div className="hg-panel__text">
          <h3>{step.title}</h3>
          {step.body}
          <Link to={step.cta.to} className={`hg-cta ${step.cta.primary ? 'hg-cta--primary' : ''}`}>{step.cta.label} <ArrowRight size={14} /></Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Developer credit
// ---------------------------------------------------------------------------
function DevCredit() {
  return (
    <div className="dev-credit bn">
      <div className="dev-credit__mark" aria-hidden="true">
        <span className="dev-credit__ring" />
        <span className="dev-credit__mono">IH</span>
      </div>
      <p className="dev-credit__label">Develop and Maintained by</p>
      <p className="dev-credit__name">Irshad Hossain</p>
      <span className="dev-credit__rule" aria-hidden="true" />
      <div className="dev-credit__roles">
        <span><Code size={12} /> Developer</span>
        <span><Wrench size={12} /> Maintainer</span>
        <span><Feather size={12} /> Editor</span>
      </div>
      
      <div className="dev-credit__quote"><AuthorQuote compact /></div>
      <div className="dev-credit__links">
        <Link to="/about">প্রজেক্ট সম্পর্কে <ArrowRight size={12} /></Link>
        <a href="https://irshad-11.github.io/Safeenah/" target="_blank" rel="noopener noreferrer">Safeenah <ArrowUpRight size={12} /></a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
const FEATURES = [
  { icon: BookOpen, title: 'Deep-linkable findings', body: 'Every heading is its own permanent, shareable page.' },
  { icon: FolderOpen, title: 'Curated collections', body: 'Findings gathered by theme across authors.' },
  { icon: Search, title: 'Search by meaning', body: 'Ask in Bangla or English — semantic search finds the passage, keyword search finds the exact words.' },
  { icon: Bookmark, title: 'Private bookmarks', body: 'Stored only in your browser, never on a server.' },
  { icon: ShieldCheck, title: 'No accounts', body: 'Browse anonymously. Nothing to sign up for.' },
  { icon: Printer, title: 'Print-ready', body: 'Clean print layout with cover and source citation.' },
];

const FAQ: [string, string][] = [
  ['Do I need an account to read or bookmark?', 'No. Reading is fully anonymous. Bookmarks live in your browser only.'],
  ['Can I suggest a book or point out an error?', 'Yes — use the message form below, or the Contact page.'],
  ['Are findings edited from the original text?', 'Findings are Bangla translations of the original Arabic or Urdu passages, kept as close to the original meaning as possible. Each one shows its book and page, so you can check it against the source.'],
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
function RevealSection({ id, className, style, children }: { id?: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const { ref, visible } = useReveal<HTMLElement>();
  return <section id={id} ref={ref as any} className={`reveal ${visible ? 'reveal-in' : ''} ${className || ''}`} style={style}>{children}</section>;
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
  const navigate = useNavigate();
  useTrackView('site', 'landing');
  const loc = useLocation();
  useEffect(() => {
    if (!loc.hash) return;
    const t = window.setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 700);
    return () => window.clearTimeout(t);
  }, [loc.hash]);

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
          <div className="lnd-search">
            <SearchBox onSubmit={(q) => navigate(`/search?q=${encodeURIComponent(q)}`)} label="Search the archive" />
            <p className="lnd-search-hint">Search by meaning in Bangla or English, or by exact words.</p>
          </div>
          <div className="hero-cta">
            <Link to="/books" className="cta-primary"><BookOpen size={16} /> Bookshelf</Link>
            <Link to="/collections" className="cta-secondary"><FolderOpen size={16} /> Collections</Link>
          </div>
        </div>
        <div className="lnd-hero__right"><AnimatedHeroScene /></div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="lnd-stats-bar">
          <div className="lnd-stat"><strong>{stats.books}</strong><span>books</span></div>
          <div className="lnd-stats-sep" />
          <div className="lnd-stat"><strong>{stats.categories}</strong><span>collections</span></div>
          <div className="lnd-stats-sep" />
          <div className="lnd-stat"><strong>{Math.max(stats.visitors, 1).toLocaleString()}</strong><span>visitors</span></div>
        </div>
      )}

      <div className="landing-body">

        {/* How to use this site + purpose & disclaimer */}
        <RevealSection id="guide" className="landing-section hg-section bn">
          <p className="hg-eyebrow">পাঠকের গাইড</p>
          <h2 className="hg-heading">এই সাইট আপনি ব্যবহার করবেন যেভাবে</h2>
          <p className="hg-intro">
            এই আর্কাইভের কাজ হলো আপনাকে মূল সোর্স পর্যন্ত পৌঁছে দেওয়া, আর সেখানে কী আছে তা বুঝতে
            সাহায্য করা। এখানে কী কী পাবেন, আর কীভাবে সবচেয়ে ভালোভাবে ব্যবহার করবেন, নিচে দেখুন।
          </p>
          <ReaderGuide />
          <div className="hg-note"><CuratorNote /></div>
        </RevealSection>

        {/* AI agent system (new) */}
        <RevealSection id="ai-agents" className="landing-section hg-section hgai-section bn">
          <p className="hg-eyebrow hgai-eyebrow"><Bot size={13} aria-hidden="true" /> AI এজেন্ট সিস্টেম <em className="hgai-new">নতুন</em></p>
          <h2 className="hg-heading">AI দিয়ে খুঁজুন, যাচাই করুন, বিশ্লেষণ করুন</h2>
          <p className="hg-intro">
            ChatGPT, Claude, Gemini বা যেকোনো AI এজেন্ট এখন সরাসরি এই আর্কাইভ পড়তে পারে। কোন ধরনের AI কীভাবে ব্যবহার করবেন, রেডি প্রম্পট, কালেকশন বানানো আর বিশ্লেষণের ধাপ নিচে দেখুন।
          </p>
          <ReaderGuide steps={AI_STEPS} label="AI এজেন্ট কীভাবে ব্যবহার করবেন" variant="hgai" />
        </RevealSection>

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
            <ShelfWall quotes={quotes} />
          ) : (
            <p className="muted" style={{fontStyle:'italic'}}>No cards added yet.{isAdmin ? ' Click "Manage" to add some.' : ''}</p>
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

        <RevealSection className="landing-section dev-credit-section" style={{ borderBottom: 'none' }}>
          <DevCredit />
        </RevealSection>
      </div>
    </div>
  );
}

const LANDING_CSS = `
.lnd-search { margin-top: 1.4rem; max-width: 520px; }
.lnd-search-hint { font-size: .76rem; color: var(--muted); margin: .45rem 0 0; }
@media(max-width:720px){ .landing-feature{ margin:0; padding:.6rem 0; } }
.lnd-hero .hero-cta { justify-content: flex-start; margin-top: 1.2rem; }
@media(max-width:600px){ .lnd-search{ margin-left:auto; margin-right:auto; width:100%; } .lnd-search-hint{ text-align:center; } .lnd-hero .hero-cta{ justify-content:center; } .lnd-hero__left{ width:100%; } }
.lnd-hero { display:flex; align-items:center; justify-content:space-between; gap:1.5rem; flex-wrap:wrap; text-align:left; padding:3.5rem 1.4rem 2.8rem; }
.lnd-hero__left { max-width:480px; }
.lnd-hero__right { flex:1 1 380px; min-width:0; max-width:734px; }
.lnd-scene-ph { width:100%; aspect-ratio:13.84/7.1; }
/* Desktop: the scene may grow past the 1080px column, out to the screen's right edge */
@media(min-width:1081px){ .lnd-hero{ flex-wrap:nowrap; } .lnd-hero__left{ flex:0 0 auto; }
  .lnd-hero__right{ margin-right:calc((1080px - 100vw) / 2 - 1.4rem + 12px); }
  /* the hero's tint runs edge to edge so the wider scene has no seam beside it */
  .lnd-hero{ position:relative; isolation:isolate; background:transparent; }
  .lnd-hero::before{ content:''; position:absolute; top:0; bottom:0; left:50%; width:100vw; transform:translateX(-50%); z-index:-1; pointer-events:none;
    background:linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, var(--bg)), var(--bg)); }
  body:has(.landing-page){ overflow-x:clip; } }
.lnd-eyebrow { font-size:.62rem; font-weight:700; text-transform:uppercase; letter-spacing:.2em; color:var(--accent); margin-bottom:.5rem; }
@media(max-width:600px){ .lnd-hero{flex-direction:column;text-align:center;align-items:center;} .lnd-hero__right{display:block; width:calc(100% + 2.8rem); max-width:none; margin:0 -1.4rem; flex-basis:auto;} }

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

/* From the shelf — wall of tilted cards */
.shelf-wall { column-count:3; column-gap:1.1rem; padding:.6rem .3rem .2rem; }
@media(max-width:900px){ .shelf-wall{ column-count:2; } }
@media(max-width:520px){ .shelf-wall{ column-gap:.8rem; } }
.shelf-card {
  position:relative; display:block; break-inside:avoid; margin:0 0 1.2rem;
  padding:1.6rem 1.1rem 1rem; border-radius:6px; text-decoration:none; color:var(--fg);
  background:var(--surface); border:1px solid var(--border);
  box-shadow:0 2px 3px rgba(0,0,0,.06), 0 10px 22px -8px rgba(0,0,0,.22);
  transform:rotate(var(--tilt,0deg)); transform-origin:50% 12%;
  transition:transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s ease, border-color .2s;
  -webkit-tap-highlight-color:transparent;
}
.shelf-tone-1 { background:color-mix(in srgb, var(--accent) 7%, var(--surface)); }
.shelf-tone-2 { background:color-mix(in srgb, #e0b040 12%, var(--surface)); }
.shelf-pin { position:absolute; top:7px; left:50%; width:13px; height:13px; margin-left:-6px; border-radius:50%;
  background:radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent) 55%, #fff), var(--accent));
  box-shadow:0 2px 3px rgba(0,0,0,.3); }
.shelf-card__text { font-family:var(--font-serif),Georgia,serif; font-style:italic; font-size:.98rem; line-height:1.7; margin:0 0 .7rem; color:var(--fg); }
.shelf-card__source { font-size:.76rem; color:var(--muted); margin:0; }
.shelf-card__go { position:absolute; right:.6rem; bottom:.55rem; color:var(--accent); opacity:.75; display:inline-flex; }
.shelf-card--link { cursor:pointer; padding-bottom:1.6rem; }
.shelf-card--link:hover, .shelf-card--link:focus-visible {
  transform:rotate(0deg) translateY(-5px) scale(1.03); border-color:var(--accent); outline:none;
  box-shadow:0 4px 6px rgba(0,0,0,.08), 0 18px 32px -10px rgba(0,0,0,.32); z-index:2;
}
.shelf-card--link:hover .shelf-card__go { opacity:1; }
@media (prefers-reduced-motion: reduce){ .shelf-card{ transition:none; } }


/* ===================== Reader guide (hg-) ===================== */
.hg-section { padding-top:2.2rem; }
.hg-eyebrow { margin:0 0 .35rem; font-size:.8rem; font-weight:700; letter-spacing:.04em; color:var(--accent); }
.hg-section.bn, .hg-section.bn h2, .hg-section.bn h3 { font-family:'Hind Siliguri', var(--font-english), sans-serif; }
.hg-section.bn h2, .hg-section.bn h3 { line-height:1.5; }
.landing-section h2.hg-heading { font-size:clamp(1.35rem,3.2vw,1.75rem); margin:0 0 .5rem; }
.hg-intro { margin:0 0 1.4rem; color:var(--muted); max-width:640px; line-height:1.95; font-size:.98rem; }

.hg { display:grid; grid-template-columns:minmax(0, 250px) minmax(0, 1fr); gap:1.1rem; align-items:stretch; }

.hg-tabs { display:flex; flex-direction:column; gap:.45rem; }
.hg-tab {
  position:relative; overflow:hidden; display:grid; grid-template-columns:auto auto 1fr; align-items:center; gap:.6rem;
  width:100%; text-align:left; padding:.75rem .8rem; border-radius:10px; color:var(--fg);
  border:1px solid var(--border); background:var(--surface);
  transition:border-color .2s, background .2s, transform .2s, box-shadow .2s;
}
.hg-tab:hover { border-color:color-mix(in srgb, var(--accent) 45%, var(--border)); transform:translateX(2px); }
.hg-tab:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.hg-tab.is-active { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 8%, var(--surface));
  box-shadow:0 6px 18px -10px color-mix(in srgb, var(--accent) 70%, transparent); }
.hg-tab__no { font-size:.62rem; font-weight:700; letter-spacing:.08em; color:var(--muted); font-variant-numeric:tabular-nums; }
.hg-tab.is-active .hg-tab__no { color:var(--accent); }
.hg-tab__icon { width:32px; height:32px; border-radius:8px; display:grid; place-items:center; color:var(--muted);
  background:color-mix(in srgb, var(--fg) 5%, var(--surface)); transition:color .2s, background .2s, transform .3s; }
.hg-tab.is-active .hg-tab__icon { color:#fff; background:var(--accent); transform:rotate(-6deg); }
.hg-tab__text { display:flex; flex-direction:column; min-width:0; }
.hg-tab__title { font-size:.92rem; font-weight:700; line-height:1.35; }
.hg-tab__hint { font-size:.78rem; color:var(--muted); line-height:1.4; }
.hg-tab__progress { position:absolute; left:0; bottom:0; height:2px; width:100%; background:var(--accent); transform-origin:left; transform:scaleX(0); opacity:.85; }
.hg--running .hg-tab__progress { animation:hgProgress 7s linear forwards; }
.hg:not(.hg--running) .hg-tab__progress { transform:scaleX(1); opacity:.35; }
@keyframes hgProgress { to { transform:scaleX(1); } }

.hg-panel { display:grid; grid-template-rows:auto 1fr; border:1px solid var(--border); border-radius:12px; background:var(--surface);
  overflow:hidden; animation:hgPanelIn .45s cubic-bezier(.2,.8,.2,1) both; }
@keyframes hgPanelIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
.hg-panel__visual { position:relative; min-height:178px; display:grid; place-items:center; padding:1.2rem;
  border-bottom:1px solid var(--border);
  background:
    radial-gradient(circle at 18% 20%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 55%),
    radial-gradient(circle at 85% 90%, color-mix(in srgb, #e0a24a 12%, transparent), transparent 50%),
    repeating-linear-gradient(0deg, transparent 0 21px, color-mix(in srgb, var(--border) 45%, transparent) 21px 22px),
    var(--bg); }
.hg-panel__text { padding:1.2rem 1.35rem 1.3rem; }
.hg-panel__text h3 { margin:0 0 .6rem; font-size:1.12rem; }
.hg-panel__text p { margin:0 0 .65rem; line-height:1.95; font-size:.98rem; }
.hg-panel__text strong { color:var(--accent); font-weight:600; }
.hg-cta { display:inline-flex; align-items:center; gap:.35rem; margin-top:.35rem; padding:.45rem .95rem; border-radius:999px;
  font-size:.88rem; font-weight:600; text-decoration:none; color:var(--accent); border:1px solid var(--accent); transition:background .2s, color .2s, gap .2s; }
.hg-cta:hover { background:var(--accent); color:#fff; gap:.55rem; }

/* shared visual bits */
.hg-vis { width:100%; max-width:380px; }
.hg-pill { font-size:.72rem; font-weight:700; padding:.2rem .55rem; border-radius:999px; white-space:nowrap; }

/* 1 — sources */
.hg-vis--links { display:flex; flex-direction:column; align-items:stretch; }
.hg-link { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:.65rem; padding:.6rem .75rem; border-radius:9px;
  background:var(--surface); border:1px solid var(--border); box-shadow:0 4px 12px -8px rgba(0,0,0,.3); }
.hg-link__icon { width:30px; height:30px; border-radius:7px; display:grid; place-items:center; color:var(--accent); background:color-mix(in srgb, var(--accent) 10%, var(--surface)); }
.hg-link__text { display:flex; flex-direction:column; line-height:1.25; }
.hg-link__text b { font-size:.82rem; }
.hg-link__text small { font-size:.74rem; color:var(--muted); }
.hg-link--primary { animation:hgDim 3.6s ease .2s both; }
@keyframes hgDim { 0%,40% { opacity:1; } 65%,100% { opacity:.55; } }
.hg-pill--swap { position:relative; display:inline-grid; }
.hg-pill--swap > span { grid-area:1/1; padding:.2rem .55rem; border-radius:999px; }
.hg-pill__a { color:var(--muted); background:color-mix(in srgb, var(--fg) 7%, var(--surface)); animation:hgOut 3.6s ease both; }
.hg-pill__b { color:#c0392b; background:color-mix(in srgb, #c0392b 12%, var(--surface)); animation:hgIn 3.6s ease both; }
.hg-pill--swap { padding:0; }
@keyframes hgOut { 0%,35% { opacity:1; } 45%,100% { opacity:0; } }
@keyframes hgIn  { 0%,40% { opacity:0; } 50%,100% { opacity:1; } }
.hg-link__bridge { height:26px; display:flex; justify-content:center; }
.hg-link__bridge span { width:2px; height:100%; background:linear-gradient(var(--border), var(--accent)); transform-origin:top; animation:hgGrowY .5s ease 1.9s both; }
@keyframes hgGrowY { from { transform:scaleY(0); } to { transform:scaleY(1); } }
.hg-link--mirror { opacity:.5; animation:hgMirror .6s ease 2.3s both; }
@keyframes hgMirror { to { opacity:1; border-color:#3f9e5e; box-shadow:0 0 0 4px color-mix(in srgb, #3f9e5e 14%, transparent), 0 4px 12px -8px rgba(0,0,0,.3); } }
.hg-pill--ok { color:#2f8a4f; background:color-mix(in srgb, #3f9e5e 14%, var(--surface)); opacity:0; animation:hgFade .4s ease 2.5s both; }
@keyframes hgFade { to { opacity:1; } }

/* 2 — book details */
.hg-vis--meta { display:flex; align-items:center; gap:1.1rem; justify-content:center; }
.hg-book { position:relative; flex-shrink:0; width:74px; height:100px; border-radius:3px 7px 7px 3px; padding:16px 10px 0 18px;
  background:linear-gradient(135deg, color-mix(in srgb, var(--accent) 85%, #000), var(--accent));
  box-shadow:0 10px 20px -10px rgba(0,0,0,.5); animation:hgBook .6s cubic-bezier(.2,.8,.2,1) both; display:flex; flex-direction:column; gap:6px; }
.hg-book__spine { position:absolute; left:6px; top:0; bottom:0; width:2px; background:rgba(255,255,255,.35); }
.hg-book__line { height:3px; border-radius:2px; background:rgba(255,255,255,.75); }
.hg-book__line.w1 { width:90%; } .hg-book__line.w2 { width:70%; } .hg-book__line.w3 { width:45%; }
@keyframes hgBook { from { opacity:0; transform:rotate(-8deg) translateY(8px); } to { opacity:1; transform:rotate(-3deg); } }
.hg-chips { display:flex; flex-direction:column; gap:.4rem; align-items:flex-start; }
.hg-chip { display:inline-flex; align-items:center; gap:.4rem; padding:.3rem .7rem; border-radius:999px; font-size:.8rem; font-weight:600;
  background:var(--surface); border:1px solid var(--border); color:var(--fg); box-shadow:0 3px 8px -6px rgba(0,0,0,.35);
  opacity:0; animation:hgChip .45s cubic-bezier(.2,.8,.2,1) both; }
.hg-chip svg { color:var(--accent); }
@keyframes hgChip { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:none; } }

/* 3 — translation */
.hg-vis--tr { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:.6rem; }
.hg-tr__card { display:flex; flex-direction:column; gap:.25rem; padding:.7rem .75rem; border-radius:9px; background:var(--surface);
  border:1px solid var(--border); min-height:96px; justify-content:center; box-shadow:0 4px 12px -8px rgba(0,0,0,.3); }
.hg-tr__card small { font-size:.72rem; font-weight:700; color:var(--muted); }
.hg-tr__src { animation:hgFade .4s ease both; }
.hg-tr__ar { font-size:1.35rem; color:var(--fg); text-align:right; font-family:'Hind Siliguri',serif; }
.hg-tr__arrow { display:flex; flex-direction:column; align-items:center; gap:4px; color:var(--accent); }
.hg-tr__arrow span { width:34px; height:2px; background:var(--accent); transform-origin:left; animation:hgGrowX .6s ease .6s both; }
@keyframes hgGrowX { from { transform:scaleX(0); } to { transform:scaleX(1); } }
.hg-tr__dst { border-color:color-mix(in srgb, var(--accent) 40%, var(--border)); opacity:0; animation:hgPop .5s cubic-bezier(.2,.8,.2,1) 1.1s both; }
@keyframes hgPop { from { opacity:0; transform:translateX(-10px) scale(.96); } to { opacity:1; transform:none; } }
.hg-tr__bn { font-family:'Hind Siliguri',sans-serif; font-size:1.2rem; font-weight:600; color:var(--accent); }
.hg-tr__tags { display:flex; flex-wrap:wrap; gap:.3rem; margin-top:.2rem; }
.hg-tr__tags span { display:inline-flex; align-items:center; gap:.2rem; font-size:.68rem; padding:.1rem .35rem; border-radius:4px;
  color:var(--muted); background:color-mix(in srgb, var(--fg) 6%, var(--surface)); opacity:0; animation:hgFade .3s ease both; }
.hg-tr__tags span:nth-child(1) { animation-delay:1.6s; } .hg-tr__tags span:nth-child(2) { animation-delay:1.75s; } .hg-tr__tags span:nth-child(3) { animation-delay:1.9s; }

/* 4 — search */
.hg-vis--search { display:flex; flex-direction:column; gap:.55rem; }
.hg-sbox { display:flex; align-items:flex-start; gap:.5rem; padding:.6rem .8rem; border-radius:12px; background:var(--surface);
  border:1px solid var(--accent); box-shadow:0 0 0 4px color-mix(in srgb, var(--accent) 10%, transparent); color:var(--muted); min-height:76px; }
.hg-sbox > svg { margin-top:.2rem; flex-shrink:0; }
.hg-sbox__text { font-size:.84rem; line-height:1.6; color:var(--fg); white-space:normal; }
.hg-caret { display:inline-block; width:1.5px; height:1em; background:var(--accent); margin-left:1px; vertical-align:-.15em; animation:hgBlink 1s steps(1) infinite; }
@keyframes hgBlink { 50% { opacity:0; } }
.hg-results { display:flex; flex-direction:column; gap:.35rem; min-height:108px; }
.hg-result { display:grid; grid-template-columns:1fr 70px auto; align-items:center; gap:.55rem; padding:.45rem .65rem; border-radius:8px;
  background:var(--surface); border:1px solid var(--border); opacity:0; animation:hgChip .4s ease both; }
.hg-result__lines { display:flex; flex-direction:column; gap:4px; }
.hg-result__lines span { height:4px; border-radius:2px; background:color-mix(in srgb, var(--fg) 14%, transparent); }
.hg-result__lines span:first-child { width:85%; } .hg-result__lines span:last-child { width:55%; }
.hg-result__bar { height:5px; border-radius:3px; background:color-mix(in srgb, var(--fg) 8%, transparent); overflow:hidden; }
.hg-result__bar span { display:block; height:100%; border-radius:3px; background:var(--accent); transform-origin:left; animation:hgGrowX .6s ease both; }
.hg-result small { font-size:.66rem; font-weight:700; color:var(--accent); font-variant-numeric:tabular-nums; }
.hg-sfoot { margin:.1rem 0 0; display:flex; align-items:center; gap:.35rem; font-size:.78rem; color:var(--muted); }
.hg-sfoot svg { color:var(--accent); }

.hg-note { margin-top:1.4rem; }

/* 1 — merge row */
.hg-merge { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:.35rem; margin-top:.9rem; }
.hg-merge__item { display:inline-flex; align-items:center; gap:.3rem; padding:.25rem .55rem; border-radius:6px; font-size:.74rem; font-weight:600;
  background:var(--surface); border:1px solid var(--border); color:var(--fg); opacity:0; animation:hgChip .4s ease both; }
.hg-merge__item svg { color:var(--accent); }
.hg-merge__item:nth-child(1) { animation-delay:2.9s; } .hg-merge__item:nth-child(3) { animation-delay:3.1s; } .hg-merge__item:nth-child(5) { animation-delay:3.4s; }
.hg-merge__item--result { border-color:var(--accent); color:var(--accent); background:color-mix(in srgb, var(--accent) 9%, var(--surface)); }
.hg-merge__plus { font-weight:700; color:var(--muted); opacity:0; animation:hgFade .3s ease both; }
.hg-merge__plus:nth-child(2) { animation-delay:3s; } .hg-merge__plus:nth-child(4) { animation-delay:3.3s; }

/* 4 — collections */
.hg-vis--col { display:grid; grid-template-columns:auto 34px 1fr; align-items:center; gap:.5rem; }
.hg-col__books { display:flex; flex-direction:column; gap:.4rem; }
.hg-col__book { display:inline-flex; align-items:center; gap:.4rem; padding:.3rem .6rem .3rem .3rem; border-radius:6px; font-size:.74rem; font-weight:600;
  background:var(--surface); border:1px solid var(--border); opacity:0; animation:hgChip .4s ease both; }
.hg-col__spine { width:6px; height:18px; border-radius:2px; background:var(--bc); }
.hg-col__flow { display:flex; flex-direction:column; gap:.95rem; }
.hg-col__flow span { height:2px; background:linear-gradient(90deg, var(--border), var(--accent)); transform-origin:left; animation:hgGrowX .5s ease .5s both; }
.hg-col__topic { display:flex; flex-direction:column; gap:.35rem; padding:.65rem .7rem; border-radius:9px; background:var(--surface);
  border:1px solid color-mix(in srgb, var(--accent) 40%, var(--border)); box-shadow:0 4px 12px -8px rgba(0,0,0,.3); }
.hg-col__head { display:inline-flex; align-items:center; gap:.35rem; font-size:.78rem; font-weight:700; color:var(--accent); margin-bottom:.1rem; }
.hg-col__row { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:.45rem; padding:.3rem .4rem; border-radius:6px;
  background:color-mix(in srgb, var(--fg) 4%, var(--surface)); opacity:0; animation:hgChip .4s ease both; }
.hg-col__dot { width:8px; height:8px; border-radius:50%; }
.hg-col__lines { display:flex; flex-direction:column; gap:3px; }
.hg-col__lines span { height:3px; border-radius:2px; background:color-mix(in srgb, var(--fg) 14%, transparent); }
.hg-col__lines span:last-child { width:60%; }
.hg-col__row small { font-size:.66rem; color:var(--muted); }

/* 6 — contact */
.hg-vis--contact { display:flex; flex-direction:column; align-items:flex-end; gap:.45rem; }
.hg-msg { max-width:88%; padding:.55rem .8rem; border-radius:12px 12px 4px 12px; font-size:.84rem; line-height:1.55;
  background:var(--accent); color:#fff; box-shadow:0 4px 12px -8px rgba(0,0,0,.4); opacity:0; animation:hgPop .45s cubic-bezier(.2,.8,.2,1) .2s both; }
.hg-msg--2 { animation-delay:.9s; }
.hg-msg__who { display:flex; align-items:center; gap:.25rem; font-size:.68rem; font-weight:700; opacity:.85; margin-bottom:.15rem; }
.hg-msg__send { display:inline-flex; align-items:center; gap:.35rem; margin-top:.2rem; font-size:.78rem; font-weight:600; color:var(--accent);
  opacity:0; animation:hgFade .4s ease 1.6s both; }
.hg-msg__send svg { animation:hgSend 1.6s ease-in-out 2s infinite; }
@keyframes hgSend { 0%,100% { transform:none; } 50% { transform:translate(3px,-3px); } }

.hg-cta--primary { background:var(--accent); color:#fff; }
.hg-cta--primary:hover { opacity:.9; }


@media (max-width:760px){
  .hg { grid-template-columns:1fr; }
  .hg-tabs { display:grid; grid-template-columns:1fr 1fr; gap:.45rem; }
  .hg-tab { grid-template-columns:auto 1fr; padding:.6rem .65rem; }
  .hg-tab__no { display:none; }
  .hg-tab:hover { transform:none; }
  .hg-tab__hint { display:none; }
  .hg-tab__title { font-size:.8rem; }
  .hg-panel__visual { min-height:160px; padding:1rem .8rem; }
  .hg-panel__text { padding:1rem 1rem 1.1rem; }
}
@media (max-width:420px){
  .hg-vis--col { grid-template-columns:1fr; }
  .hg-col__books { flex-direction:row; flex-wrap:wrap; justify-content:center; }
  .hg-col__flow { display:none; }
  .hg-vis--tr { grid-template-columns:1fr; }
  .hg-tr__arrow { flex-direction:row; justify-content:center; }
  .hg-tr__arrow span { width:2px; height:18px; }
  .hg-vis--meta { gap:.8rem; }
  .hg-book { width:60px; height:84px; }
}
@media (prefers-reduced-motion: reduce){
  .hg-panel, .hg-panel *, .hg-tab__progress { animation:none !important; }
  .hg-chip, .hg-result, .hg-tr__dst, .hg-tr__tags span, .hg-pill--ok, .hg-link--mirror,
  .hg-merge__item, .hg-merge__plus, .hg-col__book, .hg-col__row, .hg-msg, .hg-msg__send { opacity:1; }
  .hg-pill__a { opacity:0; }
}

/* ===================== Developer credit ===================== */
.dev-credit-section { padding-top:2.4rem; }
.dev-credit { position:relative; text-align:center; padding:2rem 1.2rem 1.8rem; border-radius:14px; overflow:hidden;
  border:1px solid color-mix(in srgb, var(--accent) 25%, var(--border));
  background:
    radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%),
    var(--surface); }
.dev-credit::before, .dev-credit::after { content:'◆'; position:absolute; top:1rem; font-size:.6rem; color:color-mix(in srgb, var(--accent) 55%, transparent); }
.dev-credit::before { left:1.1rem; } .dev-credit::after { right:1.1rem; }
.dev-credit__mark { position:relative; width:74px; height:74px; margin:0 auto .9rem; display:grid; place-items:center; }
.dev-credit__ring { position:absolute; inset:0; border-radius:50%; padding:2px;
  background:conic-gradient(from 0deg, var(--accent), #e0a24a, transparent 60%, var(--accent));
  -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude;
  animation:dcSpin 7s linear infinite; }
@keyframes dcSpin { to { transform:rotate(360deg); } }
.dev-credit__mono { width:60px; height:60px; border-radius:50%; display:grid; place-items:center; font-family:var(--font-serif),Georgia,serif;
  font-size:1.35rem; font-weight:700; color:var(--accent); background:color-mix(in srgb, var(--accent) 8%, var(--bg));
  box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent); }
.dev-credit.bn { font-family:'Hind Siliguri', var(--font-english), sans-serif; }
.dev-credit__label { margin:0; font-size:.86rem; font-weight:600; letter-spacing:.04em; color:var(--muted); }
.dev-credit__name { position:relative; display:inline-block; margin:.25rem 0 0; font-family:var(--font-serif),Georgia,serif;
  font-size:clamp(1.6rem,4.6vw,2.2rem); font-weight:700; letter-spacing:.01em; line-height:1.2;
  background:linear-gradient(100deg, var(--fg) 0%, var(--fg) 40%, var(--accent) 50%, var(--fg) 60%, var(--fg) 100%);
  background-size:250% 100%; background-position:100% 0; -webkit-background-clip:text; background-clip:text; color:transparent;
  animation:dcSheen 5s ease-in-out 1s infinite; }
@keyframes dcSheen { 0% { background-position:100% 0; } 40%,100% { background-position:0% 0; } }
.dev-credit__rule { display:block; width:120px; height:2px; margin:.55rem auto .9rem; border-radius:2px;
  background:linear-gradient(90deg, transparent, #d48f3c, var(--accent), transparent); transform:scaleX(0); }
.reveal-in .dev-credit__rule { animation:hgGrowXc .8s cubic-bezier(.3,.7,.2,1) .35s both; }
@keyframes hgGrowXc { from { transform:scaleX(0); } to { transform:scaleX(1); } }
.dev-credit__roles { display:flex; justify-content:center; flex-wrap:wrap; gap:.45rem; margin-bottom:.9rem; }
.dev-credit__roles span { display:inline-flex; align-items:center; gap:.3rem; padding:.28rem .75rem; border-radius:999px; font-size:.82rem; font-weight:600;
  color:var(--accent); background:color-mix(in srgb, var(--accent) 9%, var(--surface)); border:1px solid color-mix(in srgb, var(--accent) 25%, transparent); }
.dev-credit__note { margin:0 auto 1rem; max-width:440px; font-size:.92rem; color:var(--muted); line-height:1.65; }
.dev-credit__quote { max-width:520px; margin:0 auto 1.1rem; }
.dev-credit__links { display:flex; justify-content:center; gap:1.2rem; flex-wrap:wrap; }
.dev-credit__links a { display:inline-flex; align-items:center; gap:.25rem; font-size:.88rem; font-weight:600; color:var(--fg);
  text-decoration:none; border-bottom:1px solid var(--border); padding-bottom:1px; transition:color .2s, border-color .2s; }
.dev-credit__links a:hover { color:var(--accent); border-bottom-color:var(--accent); }
@media (prefers-reduced-motion: reduce){
  .dev-credit__ring, .dev-credit__name { animation:none; }
  .dev-credit__name { color:var(--fg); background:none; }
  .dev-credit__rule { transform:none; }
}

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