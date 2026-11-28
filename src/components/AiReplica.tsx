import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Copy, FolderOpen, Fingerprint, Loader2, Search, Send, Star } from 'lucide-react';
import { AiLogoCycle } from './AiBits';
import '../styles/replica.css';

/* Replicas of the real screens (the site, and a generic ChatGPT / Claude style chat) that play a short loop.
   Everything inside is sample content, labelled "উদাহরণ". */

const W = 520, H = 300;
const SAMPLE_ID = '4b7d2e91-6c3a-4f58-9a0e-1d2c3b4a5f60';
const SAMPLE_ID2 = '9a1f03c7-2be4-4d16-8c75-e0b2a6d19f34';
const TOPIC = 'আফজাল আমল';

const reduced = () => { try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Loops through phases; each phase lasts ms[i]. With reduced motion it rests on `still`. */
function usePhase(ms: number[], still: number) {
  const [p, setP] = useState(() => (reduced() ? still : 0));
  useEffect(() => {
    if (reduced()) return;
    const t = window.setTimeout(() => setP((x) => (x + 1) % ms.length), ms[p]);
    return () => window.clearTimeout(t);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  return p;
}
function useTyped(text: string, on: boolean, cps = 16) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) { setN(0); return; }
    if (reduced()) { setN(text.length); return; }
    let i = 0; setN(0);
    const id = window.setInterval(() => { i++; setN(i); if (i >= text.length) window.clearInterval(id); }, 1000 / cps);
    return () => window.clearInterval(id);
  }, [on, text, cps]);
  return Array.from(text).slice(0, n).join('');
}

/** Fixed 520×300 canvas that scales down to the width available. */
function Stage({ children, label }: { children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => setK(Math.min(1, el.clientWidth / W));
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  return (
    <div ref={ref} className={`rp-wrap${k < 0.8 ? ' rp-sm' : ''}`} style={{ height: H * k }} role="img" aria-label={label}>
      <div className="rp-stage" style={{ transform: `scale(${k})` }}>{children}<span className="rp-demo">Demo</span></div>
    </div>
  );
}

const SiteBar = ({ path }: { path: string }) => (
  <div className="rp-bar">
    <i /><i /><i /><span className="rp-url">{path}</span>
  </div>
);
const SiteNav = ({ active }: { active?: string }) => (
  <div className="rp-nav">
    <b>Sirājan Munīrā</b>
    {['Bookshelf', 'Collections', 'Search'].map((n) => <span key={n} className={n === active ? 'on' : ''}>{n}</span>)}
    <em><Search size={9} /> Quick search…</em>
  </div>
);
const Cursor = ({ x, y, click }: { x: number; y: number; click?: boolean }) => (
  <svg className={`rp-cur ${click ? 'click' : ''}`} style={{ left: x, top: y }} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 2-3 6z" fill="#222" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
);

// ---------------------------------------------------------------- 1. site: choose scope + topic -> prompt
export function ReplicaAsk() {
  const p = usePhase([2300, 1200, 1500, 1500, 1500, 1500], 5);
  const typed = useTyped(TOPIC, p === 0);
  const topic = p === 0 ? typed : TOPIC;
  const scope = p <= 1 ? 0 : p === 2 ? 1 : 2;
  const copied = p >= 5;
  return (
    <Stage label="সাইটে বিষয় লিখে, কোন বইয়ে খুঁজবেন বেছে প্রম্পট কপি করার ছবি">
      <SiteBar path="sirajan-munira.vercel.app/#ai-agents" />
      <SiteNav />
      <div className="rp-body">
        <div className="rp-card">
          <p className="rp-lbl">আপনার topic</p>
          <div className="rp-in">{topic}{p === 0 && <u className="rp-caret" />}</div>
          <p className="rp-lbl">কোথায় খুঁজবে</p>
          <div className="rp-chips">
            {['সব বই', 'একটি বই', 'কয়েকটি বই'].map((t, i) => (
              <span key={t} className={`rp-chip ${p >= 1 && scope === i ? 'on' : ''}`}><i className="rp-rad" />{t}</span>
            ))}
          </div>
          <div className="rp-sub">
            {scope === 0 && p >= 1 && <span className="rp-fade">সব বইয়ে খুঁজবে</span>}
            {scope === 1 && <span className="rp-fade rp-sel"><BookOpen size={11} /> শাওয়াহিদুত তানযীল <b>▾</b></span>}
            {scope === 2 && <span className="rp-fade rp-multi"><i className="rp-ck on"><Star size={8} fill="#fff" /></i>শাওয়াহিদুত <i className="rp-ck on"><Star size={8} fill="#fff" /></i>কিতাবুল <i className="rp-ck" />ফজিলতের</span>}
          </div>
          <div className="rp-prompt">
            <span>এই সাইটের বই পড়ে “{TOPIC}” নিয়ে যা আছে, heading ধরে এক লাইনে quote + ID দাও…</span>
            <button className={`rp-btn ${p === 4 ? 'press' : ''} ${copied ? 'done' : ''}`}>{copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}</button>
          </div>
        </div>
      </div>
      {p === 4 && <Cursor x={452} y={222} click />}
    </Stage>
  );
}

// ---------------------------------------------------------------- 2. chat: paste + send + AI works
const Chat = ({ children, input, kbd }: { children?: React.ReactNode; input?: React.ReactNode; kbd?: boolean }) => (
  <div className="rp-chat">
    <div className="rp-chat__top"><AiLogoCycle size={16} /><b>ChatGPT / Claude</b><span>New chat</span></div>
    <div className="rp-chat__msgs">{children}</div>
    <div className="rp-chat__in">
      <div className="rp-chat__box">{input || <span className="rp-ph">Message লিখুন…</span>}</div>
      {kbd && <kbd className="rp-kbd">Ctrl/⌘ + V</kbd>}
      <span className="rp-send"><Send size={12} /></span>
    </div>
  </div>
);
const PROMPT_TXT = `এই সাইটের সব বইয়ে “${TOPIC}” নিয়ে যা আছে খুঁজে দাও। heading ধরে সাজিয়ে প্রতি লাইনে: “quote” (বই, p.পৃষ্ঠা) → পুরো ID।`;
export function ReplicaChat() {
  const p = usePhase([1600, 1800, 1000, 4300], 3);
  return (
    <Stage label="ChatGPT বা Claude-এ প্রম্পট পেস্ট করে পাঠানোর ছবি">
      <Chat kbd={p === 0} input={p === 1 ? <span className="rp-pasted">{PROMPT_TXT}</span> : undefined}>
        {p >= 2 && <div className="rp-bub me rp-pop">{PROMPT_TXT}</div>}
        {p >= 3 && (
          <div className="rp-bub ai rp-pop">
            <ul className="rp-steps">
              {['সাইটটা খুলছে', 'সব বইয়ের index দেখছে', `“${TOPIC}” আর কাছাকাছি শব্দ খুঁজছে`, 'উত্তর সাজাচ্ছে'].map((t, i) => (
                <li key={t} className={i < 3 ? 'dn' : ''} style={{ ['--d' as string]: `${i * 0.9}s` }}><Check size={11} className="ck" /><Loader2 size={11} className="rp-spin" />{t}</li>
              ))}
            </ul>
          </div>
        )}
      </Chat>
    </Stage>
  );
}

// ---------------------------------------------------------------- 3. chat reply with ids -> copy one id
const Line = ({ q, b, id, hot, i }: { q: string; b: string; id: string; hot?: boolean; i: number }) => (
  <div className="rp-ln rp-pop" style={{ animationDelay: `${0.35 * i}s` }}>
    <span>“{q}” <small>({b})</small></span>
    <code className={hot ? 'hot' : ''}>→ {id}</code>
  </div>
);
export function ReplicaReply() {
  const p = usePhase([3200, 1700, 2300], 1);
  return (
    <Stage label="AI-র উত্তরে প্রতিটি লাইনের শেষে ID থাকে, সেই ID কপি করার ছবি">
      <Chat>
        <div key={p === 0 ? 'a' : 'b'} className="rp-bub ai wide">
          <p className="rp-h">আমলের মর্যাদা</p>
          <Line i={0} q="সময়মতো নামাজ আদায় করা সবচেয়ে প্রিয় আমল" b="শাওয়াহিদুত, p.13" id={SAMPLE_ID} hot={p >= 1} />
          <Line i={1} q="পিতামাতার সাথে সদ্ব্যবহার" b="শাওয়াহিদুত, p.37" id={SAMPLE_ID2} />
          <p className="rp-h">আরও কিছু</p>
          <Line i={2} q="যে আমল নিয়মিত, তা অল্প হলেও প্রিয়" b="কিতাবুল, p.8" id="c03e7a15-d4b2-4a90-b6e1-7f8a9b0c1d2e" />
          {p >= 2 && <span className="rp-tip rp-pop">ID select করে copy <kbd>Ctrl/⌘ + C</kbd></span>}
        </div>
      </Chat>
    </Stage>
  );
}

// ---------------------------------------------------------------- 4. site: paste id -> found -> exact heading
export function ReplicaFind() {
  const p = usePhase([1800, 2000, 3600], 2);
  const typed = useTyped(SAMPLE_ID, p === 0, 40);
  if (p === 2) return (
    <Stage label="ID পেস্ট করলে বইয়ের ঠিক সেই হেডিংয়ে পৌঁছে যাওয়ার ছবি">
      <SiteBar path="…/book/shawahid-al-tanzil#4b7d2e91…" />
      <SiteNav />
      <div className="rp-body rp-book">
        <p className="rp-bk">শাওয়াহিদুত তানযীল <small>· PDF p. 13</small></p>
        <div className="rp-hd faded"><i style={{ width: '70%' }} /><i style={{ width: '90%' }} /></div>
        <div className="rp-hd hit rp-pop">
          <p className="rp-ht">সময়মতো নামাজ আদায় করা সবচেয়ে প্রিয় আমল</p>
          <i style={{ width: '96%' }} /><i style={{ width: '88%' }} /><i style={{ width: '60%' }} />
        </div>
        <div className="rp-hd faded"><i style={{ width: '80%' }} /></div>
      </div>
    </Stage>
  );
  return (
    <Stage label="সার্চ বক্সে ID পেস্ট করে Find চাপার ছবি">
      <SiteBar path="sirajan-munira.vercel.app/search" />
      <SiteNav active="Search" />
      <div className="rp-body">
        <p className="rp-sh"><Fingerprint size={12} /> Find by ID</p>
        <div className="rp-find"><Fingerprint size={13} /><code>{p === 0 ? typed : SAMPLE_ID}</code>{p === 0 && <u className="rp-caret" />}</div>
        <div className="rp-frow"><span><i className="rp-ck on"><Star size={8} fill="#fff" /></i> Find on paste</span><span><i className="rp-ck" /> Open in new tab</span><b className="rp-gobtn"><Fingerprint size={11} /> Find</b></div>
        {p === 1 && (
          <div className="rp-found rp-pop">
            <div className="rp-ok"><svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10.5" className="r" /><path d="M7 12.5l3.2 3.2L17 9" className="t" /></svg><b>Found</b></div>
            <div className="rp-fc"><BookOpen size={13} /><div><b>সময়মতো নামাজ আদায় করা সবচেয়ে প্রিয় আমল</b><small>শাওয়াহিদুত তানযীল · PDF p. 13</small></div><span>Open <ArrowRight size={10} /></span></div>
            <div className="rp-prog"><i /></div>
          </div>
        )}
      </div>
    </Stage>
  );
}

// ---------------------------------------------------------------- 5. collection: AI list -> import -> save -> collection page
export function ReplicaCollect() {
  const p = usePhase([2300, 3000, 1400, 3600], 3);
  if (p === 0) return (
    <Stage label="AI কালেকশনের জন্য নাম ও লিংকের তালিকা দিচ্ছে">
      <Chat>
        <div className="rp-bub me rp-pop">{TOPIC} নিয়ে সব হাদিস দাও, collection বানানোর JSON-এ।</div>
        <div className="rp-bub ai rp-pop wide"><pre className="rp-json">{`{"name":"${TOPIC}",\n "links":[\n  ".../book/shawahid#${SAMPLE_ID.slice(0, 13)}…",\n  ".../book/shawahid#${SAMPLE_ID2.slice(0, 13)}…",\n  ".../book/kitab#c03e7a15-d4b2…" ]}`}</pre><span className="rp-copyb"><Copy size={10} /> Copy</span></div>
      </Chat>
    </Stage>
  );
  if (p === 3) return (
    <Stage label="সেভ করা কালেকশন পাতা">
      <SiteBar path="…/my-collections/k3x9" />
      <SiteNav active="Collections" />
      <div className="rp-body">
        <p className="rp-kick"><FolderOpen size={10} /> COLLECTION · THIS DEVICE</p>
        <p className="rp-ct">{TOPIC}</p>
        <p className="rp-chips2"><span>3 findings</span><span>2 books</span></p>
        {[['সময়মতো নামাজ আদায় করা সবচেয়ে প্রিয় আমল', 'শাওয়াহিদুত · p.13'], ['পিতামাতার সাথে সদ্ব্যবহার', 'শাওয়াহিদুত · p.37'], ['যে আমল নিয়মিত, তা অল্প হলেও প্রিয়', 'কিতাবুল · p.8']].map(([t, m], i) => (
          <div key={t} className="rp-item rp-pop" style={{ animationDelay: `${i * 0.25}s` }}><b>{t}</b><small>{m}</small></div>
        ))}
      </div>
    </Stage>
  );
  return (
    <Stage label="Import পাতায় JSON পেস্ট করে যাচাই করে সেভ করার ছবি">
      <SiteBar path="sirajan-munira.vercel.app/collections/import" />
      <SiteNav />
      <div className="rp-body">
        <p className="rp-sh">Import collection</p>
        <div className="rp-ta">{`{"name":"${TOPIC}","links":["…#4b7d2e91…","…#9a1f03c7…","…#c03e7a15…"]}`}</div>
        <div className="rp-vrows">
          {['সময়মতো নামাজ আদায় করা…', 'পিতামাতার সাথে সদ্ব্যবহার', 'যে আমল নিয়মিত…'].map((t, i) => (
            <div key={t} className="rp-vr rp-pop" style={{ animationDelay: `${0.35 * i}s` }}><span className="rp-v"><Check size={9} /> Verified</span>{t}</div>
          ))}
        </div>
        <b className={`rp-save ${p === 2 ? 'press' : ''}`}>Save 3 items</b>
        {p === 2 && <Cursor x={400} y={252} click />}
      </div>
    </Stage>
  );
}
