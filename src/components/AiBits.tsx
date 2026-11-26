import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RiOpenaiFill } from 'react-icons/ri';
import { SiClaude, SiGooglegemini } from 'react-icons/si';
import { Check, Copy, ExternalLink, FileText, FileJson, Download, Sparkles, X, ChevronDown, BookOpen, Wand2 } from 'lucide-react';
import { copyToClipboard } from '../lib/richtext';
import { GENAI_APPS, aiUrls, bookAiUrls, bookPrompt, collectionAiUrls, collectionPrompt, searchPrompt, siteOrigin } from '../lib/ai';

// ---------------------------------------------------------------------------
// Animated brand-logo carousel: ChatGPT → Gemini → Claude, crossfading.
// ---------------------------------------------------------------------------
export function AiLogoCycle({ size = 18 }: { size?: number }) {
  return (
    <span className="ai-cycle" style={{ width: size, height: size }} aria-hidden="true">
      <span className="ai-cycle-i i1"><RiOpenaiFill size={size} color="#10a37f" /></span>
      <span className="ai-cycle-i i2"><SiGooglegemini size={size} color="#4285f4" /></span>
      <span className="ai-cycle-i i3"><SiClaude size={size} color="#d97757" /></span>
    </span>
  );
}

export function AppLogo({ id, size = 16 }: { id: string; size?: number }) {
  if (id === 'chatgpt') return <RiOpenaiFill size={size} color="#10a37f" />;
  if (id === 'gemini') return <SiGooglegemini size={size} color="#4285f4" />;
  return <SiClaude size={size} color="#d97757" />;
}

// ---------------------------------------------------------------------------
// Popover that is anchored to a button but rendered in a portal, so it is never
// clipped by overflow containers. On phones it becomes a bottom sheet.
// ---------------------------------------------------------------------------
function Popover({ anchor, onClose, children, label }: { anchor: React.RefObject<HTMLElement>; onClose: () => void; children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const [sheet, setSheet] = useState(false);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const mobile = window.innerWidth <= 640;
      setSheet(mobile);
      if (mobile) { setStyle({}); return; }
      const w = Math.min(400, window.innerWidth - 16);
      const h = ref.current?.offsetHeight || 420;
      const left = Math.max(8, Math.min(a.left, window.innerWidth - w - 8));
      const below = a.bottom + 8;
      const top = below + h > window.innerHeight && a.top - h - 8 > 8 ? a.top - h - 8 : below;
      setStyle({ position: 'fixed', top, left, width: w, maxHeight: window.innerHeight - 16 });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { onClose(); anchor.current?.focus(); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [anchor, onClose]);

  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [sheet]);

  return createPortal(
    <>
      {sheet && <div className="ai-sheet-backdrop" onClick={onClose} />}
      <div ref={ref} className={`ai-pop ${sheet ? 'ai-pop--sheet' : ''}`} style={style} role="dialog" aria-label={label}>
        <button className="ai-pop-x" onClick={onClose} aria-label="Close"><X size={15} /></button>
        {children}
      </div>
    </>,
    document.body
  );
}

function CopiedGuide({ prompt, onDone }: { prompt: string; onDone?: () => void }) {
  return (
    <div className="ai-copied" role="status" aria-live="polite">
      <div className="ai-copied-t"><Check size={15} /> Prompt copied</div>
      <p>Now paste it into your AI and press Enter. Open one:</p>
      <div className="ai-apps">
        {GENAI_APPS.map((a) => {
          const filled = a.prefill && a.open(prompt) !== a.plain;
          return (
            <a key={a.id} className="ai-app" href={a.open(prompt)} target="_blank" rel="noopener noreferrer" style={{ ['--c' as any]: a.color }} onClick={onDone}>
              <AppLogo id={a.id} /> <span>{a.name}</span> <ExternalLink size={11} />
              <small>{filled ? 'prompt pre-filled' : 'then paste'}</small>
            </a>
          );
        })}
      </div>
      <p className="ai-fine">If the box is empty, paste: <b>Ctrl+V</b> (⌘+V on Mac) or <b>long-press → Paste</b> on phones. Turn on web search/browsing in the AI so it can read the files.</p>
    </div>
  );
}

function LinkRow({ href, icon, label, hint, download }: { href: string; icon: React.ReactNode; label: string; hint?: string; download?: boolean }) {
  return (
    <a className="ai-link" href={href} target={download ? undefined : '_blank'} rel="noopener noreferrer" {...(download ? { download: '' } : {})}>
      {icon}<span className="ai-link-l">{label}</span>{hint && <span className="ai-link-h">{hint}</span>}
    </a>
  );
}

// ---------------------------------------------------------------------------
// "Analyze with GenAI" — book page / collection page
// ---------------------------------------------------------------------------
export function AnalyzeWithAI({ kind = 'book', slug, id, title }: { kind?: 'book' | 'collection'; slug?: string; id?: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const origin = siteOrigin();
  const prompt = kind === 'book' ? bookPrompt({ title, slug: slug!, question: q, origin }) : collectionPrompt({ name: title, id: id!, question: q, origin });
  const urls = kind === 'book' ? bookAiUrls(slug!, origin) : collectionAiUrls(id!, origin);
  const g = aiUrls(origin);

  const copy = async () => {
    const ok = await copyToClipboard(prompt);
    setCopied(ok); setFailed(!ok);
  };
  const toggle = () => { setOpen((v) => !v); setCopied(false); setFailed(false); };

  return (
    <>
      <button ref={btn} type="button" className={`ai-btn ${open ? 'open' : ''}`} onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <AiLogoCycle /> <span>Analyze with GenAI</span> <ChevronDown size={13} className="ai-btn-chev" />
      </button>
      {open && (
        <Popover anchor={btn} onClose={() => setOpen(false)} label="Analyze with GenAI">
          <h3 className="ai-pop-h"><Sparkles size={15} /> Analyze “{title}” with AI</h3>
          <p className="ai-pop-p">Your AI reads every finding of this {kind} from plain-text files, then answers your question with page-numbered sources.</p>

          <label className="ai-lbl" htmlFor="ai-q">Your question <span>(optional — you can also type it after pasting)</span></label>
          <textarea id="ai-q" className="ai-q" rows={3} value={q} onChange={(e) => { setQ(e.target.value); setCopied(false); }}
            placeholder={kind === 'book' ? 'e.g. What do the findings say about patience?' : 'e.g. Summarise all findings on this topic'} />

          <button type="button" className="ai-copy" onClick={copy}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied — copy again' : 'Copy prompt'}
          </button>
          {copied && <CopiedGuide prompt={prompt} />}
          {failed && <p className="ai-err">Couldn’t access the clipboard. Select the text below and copy it manually.<textarea readOnly className="ai-q" rows={4} value={prompt} onFocus={(e) => e.currentTarget.select()} /></p>}

          <details className="ai-more">
          <summary>For developers &amp; AI agents — raw files</summary>
          <div className="ai-links">
            <LinkRow href={urls.txt} icon={<FileText size={14} />} label="Open plain-text version" hint="all findings, TXT" />
            <LinkRow href={urls.json} icon={<FileJson size={14} />} label="View JSON" hint="structured" />
            {kind === 'book' && 'dlJson' in urls && <LinkRow href={(urls as ReturnType<typeof bookAiUrls>).dlJson} download icon={<Download size={14} />} label="Download JSON" />}
            {kind === 'book' && 'dlTxt' in urls && <LinkRow href={(urls as ReturnType<typeof bookAiUrls>).dlTxt} download icon={<Download size={14} />} label="Download TXT" />}
            <LinkRow href={g.llms} icon={<FileText size={14} />} label="llms.txt" hint="all books index" />
            <LinkRow href={g.skill} icon={<Wand2 size={14} />} label="SKILL.md" hint="rules for AI agents" />
            <LinkRow href={g.guide} icon={<BookOpen size={14} />} label="AI Integration guide" hint="set up in ChatGPT / Claude / Gemini" />
          </div>
          </details>
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// "Search with High Accuracy" — search page
// ---------------------------------------------------------------------------
export function HighAccuracySearch({ query, books, variant = 'inline' }: { query: string; books: { slug: string; title: string }[]; variant?: 'inline' | 'card' }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState('');
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const origin = siteOrigin();
  const bk = books.find((b) => b.slug === scope);
  const prompt = searchPrompt({ query, bookSlug: bk?.slug, bookTitle: bk?.title, origin });
  const g = aiUrls(origin);

  useEffect(() => { setCopied(false); }, [query, scope]);

  const copy = async () => { const ok = await copyToClipboard(prompt); setCopied(ok); setFailed(!ok); };

  return (
    <>
      <button ref={btn} type="button" className={`ai-hs ai-hs--${variant} ${open ? 'open' : ''}`} onClick={() => { setOpen((v) => !v); setCopied(false); }} aria-haspopup="dialog" aria-expanded={open}>
        <span className="ai-hs-glow" aria-hidden="true" />
        <AiLogoCycle size={variant === 'card' ? 22 : 18} />
        <span className="ai-hs-t">
          <strong>Search with High Accuracy</strong>
          {variant === 'card' && <small>An AI (ChatGPT, Claude or Gemini) reads every book and finds every relevant finding — more thorough than normal search</small>}
        </span>
        <span className="ai-new">NEW</span>
      </button>
      {open && (
        <Popover anchor={btn} onClose={() => setOpen(false)} label="Search with High Accuracy">
          <h3 className="ai-pop-h"><Sparkles size={15} /> Advanced · Higher-accuracy search</h3>
          <p className="ai-pop-p">An AI searches <b>all books</b> through exact, keyword and meaning-based search, opens the findings, and returns them with PDF page numbers and links.</p>
          {query
            ? <p className="ai-qshow"><span>Your query</span>{query}</p>
            : <p className="ai-fine">Tip: type your search above first — it is added to the prompt. Otherwise write it in the AI chat after pasting.</p>}
          {books.length > 1 && (
            <>
              <label className="ai-lbl" htmlFor="ai-scope">Search in</label>
              <select id="ai-scope" className="ai-select" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">All books</option>
                {books.map((b) => <option key={b.slug} value={b.slug}>{b.title}</option>)}
              </select>
            </>
          )}
          <button type="button" className="ai-copy" onClick={copy}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied — copy again' : 'Copy prompt'}
          </button>
          {copied && <CopiedGuide prompt={prompt} />}
          {failed && <p className="ai-err">Couldn’t access the clipboard. Select the text below and copy it manually.<textarea readOnly className="ai-q" rows={4} value={prompt} onFocus={(e) => e.currentTarget.select()} /></p>}
          <details className="ai-more">
          <summary>More options &amp; raw files</summary>
          <div className="ai-links">
            <LinkRow href={g.llms} icon={<FileText size={14} />} label="llms.txt" hint="index of all books" />
            <LinkRow href={g.skill} icon={<Wand2 size={14} />} label="SKILL.md" hint="rules for AI agents" />
            <LinkRow href={g.guide} icon={<BookOpen size={14} />} label="AI Integration guide" hint="step-by-step setup" />
          </div>
          </details>
        </Popover>
      )}
    </>
  );
}
