import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Check, Copy, Download, ExternalLink, FileJson, FileText, FlaskConical, Info, Layers, Search, ShieldCheck, Wand2 } from 'lucide-react';
import { Book, Category, listBooks, listCategories } from '../lib/supabase';
import { copyToClipboard } from '../lib/richtext';
import { GENAI_APPS, aiUrls, bookAiUrls, bookPrompt, collectionAiUrls, collectionPrompt, generalPrompt, searchPrompt, siteOrigin } from '../lib/ai';
import { AiLogoCycle, AppLogo } from '../components/AiBits';
import { useAdmin } from '../lib/context';

function CopyChip({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button type="button" className="aii-chip" onClick={async () => { setOk(await copyToClipboard(text)); clearTimeout(t.current); t.current = setTimeout(() => setOk(false), 1800); }}>
      {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? 'Copied' : label}
    </button>
  );
}

function Code({ children, copy }: { children: string; copy?: string }) {
  return (
    <div className="aii-code"><code>{children}</code><CopyChip text={copy ?? children} /></div>
  );
}

// ---------------------------------------------------------------------------
// Prompt studio: choose a task → get a ready prompt with a placeholder.
// ---------------------------------------------------------------------------
type Mode = 'book' | 'search' | 'topic' | 'general';

function PromptStudio({ books, cats }: { books: Book[]; cats: Category[] }) {
  const [mode, setMode] = useState<Mode>('book');
  const [slug, setSlug] = useState('');
  const [catId, setCatId] = useState('');
  const [scope, setScope] = useState('');
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState(false);
  const origin = siteOrigin();
  useEffect(() => { if (!slug && books[0]) setSlug(books[0].slug); }, [books, slug]);
  useEffect(() => { if (!catId && cats[0]) setCatId(cats[0].id); }, [cats, catId]);
  useEffect(() => setCopied(false), [mode, slug, catId, q, scope]);

  const book = books.find((b) => b.slug === slug);
  const cat = cats.find((c) => c.id === catId);
  const prompt = useMemo(() => {
    if (mode === 'book' && book) return bookPrompt({ title: book.title, slug: book.slug, question: q, origin });
    if (mode === 'topic' && cat) return collectionPrompt({ name: cat.name, id: cat.id, question: q, origin });
    if (mode === 'search') { const sb = books.find((b) => b.slug === scope); return searchPrompt({ query: q, bookSlug: sb?.slug, bookTitle: sb?.title, origin }); }
    return generalPrompt(origin);
  }, [mode, book, cat, q, origin, scope, books]);

  const tabs: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: 'book', label: 'One book', icon: <FileText size={14} /> },
    { id: 'search', label: 'High-accuracy search', icon: <Search size={14} /> },
    { id: 'topic', label: 'Topic collection', icon: <Layers size={14} /> },
    { id: 'general', label: 'Set up assistant', icon: <Bot size={14} /> },
  ];

  return (
    <div className="aii-studio">
      <div className="aii-tabs" role="tablist" aria-label="Prompt type">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={mode === t.id} className={`aii-tab ${mode === t.id ? 'on' : ''}`} onClick={() => setMode(t.id)}>{t.icon}<span>{t.label}</span></button>
        ))}
      </div>
      <div className="aii-studio-body">
        {mode === 'book' && (
          <label className="aii-field">Book
            <select value={slug} onChange={(e) => setSlug(e.target.value)}>{books.map((b) => <option key={b.id} value={b.slug}>{b.title}</option>)}</select>
          </label>
        )}
        {mode === 'search' && (
          <label className="aii-field">Search in
            <select value={scope} onChange={(e) => setScope(e.target.value)}><option value="">All books</option>{books.map((b) => <option key={b.id} value={b.slug}>{b.title}</option>)}</select>
          </label>
        )}
        {mode === 'topic' && (cats.length ? (
          <label className="aii-field">Collection
            <select value={catId} onChange={(e) => setCatId(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
        ) : <p className="muted">No public collections yet.</p>)}
        {mode !== 'general' && (
          <label className="aii-field">{mode === 'search' ? 'Search query / question' : 'Your question'} <span className="muted">(leave empty to keep the placeholder and type it in the AI chat)</span>
            <textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Write in Bangla or English" />
          </label>
        )}
        <pre className="aii-prompt" tabIndex={0} aria-label="Generated prompt">{prompt}</pre>
        <div className="aii-actions">
          <button type="button" className="ai-copy" onClick={async () => setCopied(await copyToClipboard(prompt))}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied — now paste into your AI' : 'Copy prompt'}</button>
          <span className="aii-open">
            {GENAI_APPS.map((a) => (
              <a key={a.id} className="ai-app" href={a.open(prompt)} target="_blank" rel="noopener noreferrer" style={{ ['--c' as any]: a.color }}><AppLogo id={a.id} /> {a.name} <ExternalLink size={11} /></a>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AiIntegrationPage() {
  const { isAdmin } = useAdmin();
  const [books, setBooks] = useState<Book[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const origin = siteOrigin();
  const g = aiUrls(origin);

  useEffect(() => {
    document.title = 'AI Integration — Sirājan Munīrā';
    Promise.all([listBooks({ includeHidden: false }), listCategories().catch(() => [])])
      .then(([b, c]) => { setBooks(b); setCats(c); setState('ok'); })
      .catch(() => setState('error'));
  }, []);

  const claudeCode = `mkdir -p ~/.claude/skills/sirajan-munira && curl -fsSL ${g.skill} -o ~/.claude/skills/sirajan-munira/SKILL.md`;

  return (
    <div className="page aii-page">
      <header className="aii-hero">
        <p className="aii-kicker"><AiLogoCycle size={16} /> AI Integration Center</p>
        <h1>Use Sirājan Munīrā with ChatGPT, Claude, Gemini or any AI</h1>
        <p className="aii-lead">Every book is published as plain text and JSON, so an AI can read <em>all</em> findings — with original-PDF page numbers and permanent links — without opening this JavaScript website.</p>
        <ol className="aii-steps">
          <li><b>Pick</b> a prompt below (one book, a topic, or a high-accuracy search across every book).</li>
          <li><b>Copy</b> it and write your question where the placeholder is.</li>
          <li><b>Paste</b> it into ChatGPT, Claude or Gemini (web browsing on). It reads the raw files and answers with sources.</li>
        </ol>
      </header>

      <section className="aii-sec" id="prompts">
        <h2>1 · Copy a ready prompt</h2>
        {state === 'loading' ? <div className="skeleton-pulse sk-line lg" style={{ height: 220 }} /> : state === 'error' ? <p className="form-error">Couldn’t load the book list. Prompts that don’t need a book still work.</p> : null}
        {state === 'ok' && <PromptStudio books={books} cats={cats} />}
      </section>

      <section className="aii-sec" id="setup">
        <h2>2 · Add it to your AI agent</h2>
        <p className="muted">Either paste a prompt (works everywhere), or install the skill once so your agent follows the rules automatically.</p>
        <div className="aii-grid">
          <article className="aii-card">
            <h3><AppLogo id="claude" size={18} /> Claude</h3>
            <ol>
              <li><b>Quick:</b> paste a prompt from step 1 into a chat (Claude needs web search / fetch enabled).</li>
              <li><b>Permanent skill:</b> download <a href={g.skill} download>SKILL.md</a>, put it in a folder named <code>sirajan-munira</code>, zip the folder, then <i>Settings → Capabilities → Skills → Upload</i>.</li>
              <li><b>Claude Code / agents:</b> run this once:</li>
            </ol>
            <Code>{claudeCode}</Code>
          </article>
          <article className="aii-card">
            <h3><AppLogo id="chatgpt" size={18} /> ChatGPT</h3>
            <ol>
              <li>Turn on <i>Search / browse the web</i> and paste a prompt from step 1.</li>
              <li><b>Permanent:</b> create a Custom GPT, paste “Set up assistant” prompt into <i>Instructions</i>, enable Web Search.</li>
              <li>If it says it can’t open a link, ask it to “fetch the raw URL” or paste the TXT contents.</li>
            </ol>
          </article>
          <article className="aii-card">
            <h3><AppLogo id="gemini" size={18} /> Gemini</h3>
            <ol>
              <li>Paste a prompt from step 1 into a new chat (Gemini opens links in your prompt itself).</li>
              <li><b>Permanent:</b> create a <i>Gem</i> and paste the “Set up assistant” prompt as its instructions.</li>
              <li>For very long books, ask it to read the TXT in parts using the <code>CONTINUE WITH</code> link.</li>
            </ol>
          </article>
          <article className="aii-card">
            <h3><Bot size={18} /> Any other AI / agent</h3>
            <ol>
              <li>Give it one URL and tell it to follow the instructions in it:</li>
            </ol>
            <Code>{g.llms}</Code>
            <p className="aii-fine">Agents that can’t browse can still be given the downloaded TXT/JSON file of a book.</p>
          </article>
        </div>
      </section>

      <section className="aii-sec" id="how">
        <h2>3 · How an AI agent uses this site</h2>
        <ol className="aii-flow">
          <li><b>Discover</b><span><a href={g.llms}>llms.txt</a> lists every book, topic collection and its TXT / JSON / download URLs.</span></li>
          <li><b>Learn the rules</b><span><a href={g.skill}>SKILL.md</a> explains the content model, search types, citation and verification.</span></li>
          <li><b>Read</b><span><code>/book/&lt;slug&gt;.txt</code> or <code>.json</code> — complete Bengali findings, no JavaScript. Long books split with a <code>CONTINUE WITH</code> link.</span></li>
          <li><b>Search</b><span><a href={g.search}>search API</a>: exact phrase, keyword, semantic — across all books at once, so the number of books doesn’t matter.</span></li>
          <li><b>Cite &amp; verify</b><span>Heading ID, original PDF page and permalink for every claim (<a href={g.citation}>citation rules</a>); <code>/ai-integration/verify</code> checks a quotation.</span></li>
        </ol>
      </section>

      <aside className="aii-callout" role="note">
        <Info size={18} aria-hidden="true" />
        <div>
          <h3>Findings are not the original book</h3>
          <p>This site does not publish the original Arabic or Urdu text. Each <b>finding</b> is a Bengali research statement written from the original book’s PDF, with the PDF page number attached. An AI must never present a finding as the original text or a certified translation, must say when it paraphrases, and must say when it couldn’t read everything.</p>
        </div>
      </aside>

      <section className="aii-sec" id="library">
        <h2>4 · Books &amp; direct links</h2>
        {state === 'loading' && <div className="skeleton-pulse sk-line lg" style={{ height: 120 }} />}
        {state === 'ok' && books.length === 0 && <p className="muted">No public books yet.</p>}
        <ul className="aii-books">
          {books.map((b) => {
            const u = bookAiUrls(b.slug, origin);
            return (
              <li key={b.id} className="aii-book">
                <div className="aii-book-t"><Link to={`/book/${b.slug}`}>{b.title}</Link>{b.author && <span className="muted"> · {b.author}</span>}</div>
                <div className="aii-book-l">
                  <a href={u.txt} target="_blank" rel="noopener noreferrer"><FileText size={13} /> TXT</a>
                  <a href={u.json} target="_blank" rel="noopener noreferrer"><FileJson size={13} /> JSON</a>
                  <a href={u.dlTxt} download><Download size={13} /> .txt</a>
                  <a href={u.dlJson} download><Download size={13} /> .json</a>
                  <CopyChip text={u.txt} label="Copy TXT URL" />
                </div>
              </li>
            );
          })}
          {cats.map((c) => {
            const u = collectionAiUrls(c.id, origin);
            return (
              <li key={c.id} className="aii-book aii-book--topic">
                <div className="aii-book-t"><Layers size={13} /> <Link to={`/collections/${c.id}`}>{c.name}</Link> <span className="muted">· topic collection</span></div>
                <div className="aii-book-l">
                  <a href={u.txt} target="_blank" rel="noopener noreferrer"><FileText size={13} /> TXT</a>
                  <a href={u.json} target="_blank" rel="noopener noreferrer"><FileJson size={13} /> JSON</a>
                  <CopyChip text={u.txt} label="Copy TXT URL" />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="aii-sec" id="reference">
        <h2>5 · Endpoint reference</h2>
        <div className="aii-table-wrap">
          <table className="aii-table">
            <tbody>
              {[
                ['Entry point', g.llms, 'Index of everything'],
                ['Skill file', g.skill, 'Rules for AI agents'],
                ['Search docs', g.search, 'Exact / keyword / semantic'],
                ['Citation guide', g.citation, 'Finding vs original book'],
                ['Search API', `${g.searchApi}?q=<query>&mode=auto`, 'JSON; add &book=<slug>'],
                ['Verify quotation', `${g.verifyApi}?text=<text>`, 'exact / partial / none'],
                ['Book text', `${origin}/book/<slug>.txt`, 'Complete findings'],
                ['Book JSON', `${origin}/book/<slug>.json`, 'Structured + citations'],
                ['Download', `${origin}/book/<slug>/download?format=json`, 'Attachment (txt or json)'],
              ].map(([n, url, d]) => (
                <tr key={n}><th scope="row">{n}</th><td><code>{url}</code></td><td className="muted">{d}</td><td><CopyChip text={url} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="aii-fine"><ShieldCheck size={13} /> Content is public and read-only. Hidden books are never exported. Each export carries a content version, so citations stay traceable. {isAdmin && <Link to="/ai-integration/test"><FlaskConical size={13} /> Run the endpoint tester</Link>}</p>
      </section>
    </div>
  );
}
