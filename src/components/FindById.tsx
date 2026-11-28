import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, ExternalLink, Fingerprint, Loader2, SearchX, X } from 'lucide-react';
import { fetchLive, LiveFinding } from '../lib/collections';
import { brokenCandidates, extractIds, suggestIds, Suggestion } from '../lib/findingId';
import '../styles/fid.css';

const AUTO_KEY = 'sm_fid_auto';
const readAuto = () => { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch { return true; } };
const NEWTAB_KEY = 'sm_fid_newtab';
const readNewTab = () => { try { return localStorage.getItem(NEWTAB_KEY) === '1'; } catch { return false; } };
const hrefOf = (f: LiveFinding) => `/book/${encodeURIComponent(f.bookSlug)}#${f.id}`;

interface Miss { typed: string; suggestions: { s: Suggestion; f: LiveFinding }[]; }
type View =
  | { k: 'idle' }
  | { k: 'busy'; why: string }
  | { k: 'one'; f: LiveFinding }
  | { k: 'many'; found: LiveFinding[]; dupes: number; miss: Miss[]; unknown: string[] }
  | { k: 'miss'; miss: Miss[]; unknown: string[] }
  | { k: 'none' }
  | { k: 'error' };

/** Shows the id with the characters that differ from the typed one marked. */
function Diff({ typed, id }: { typed: string; id: string }) {
  const t = typed.replace(/-/g, ''); let i = 0;
  return (
    <code className="fid-id">
      {id.split('').map((ch, k) => {
        if (ch === '-') return <span key={k}>-</span>;
        const bad = t[i] !== undefined && t[i] !== ch; i++;
        return <span key={k} className={bad ? 'fid-d' : undefined}>{ch}</span>;
      })}
    </code>
  );
}

export function FindById({ initial = '', autoGo = true, onDone }: { initial?: string; autoGo?: boolean; onDone?: () => void }) {
  const nav = useNavigate();
  const [text, setText] = useState(initial);
  const [newTab, setNewTab] = useState(readNewTab);
  const [auto, setAuto] = useState(readAuto);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fromUrl = !!initial.trim();
  const fit = () => { const t = taRef.current; if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 110) + 'px'; } };
  const [view, setView] = useState<View>({ k: 'idle' });
  const [cancelled, setCancelled] = useState(false);
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const go = useCallback((f: LiveFinding, forceNew?: boolean) => {
    const href = hrefOf(f);
    if (forceNew ?? newTab) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); return; }
    nav(href, { replace: fromUrl }); onDone?.();
  }, [newTab, nav, onDone, fromUrl]);

  const search = useCallback(async (raw: string) => {
    const my = ++run.current;
    clearTimeout(timer.current); setCancelled(false);
    const { ids, duplicates } = extractIds(raw);
    const broken = brokenCandidates(raw);
    if (!ids.length && !broken.length) { setView(raw.trim() ? { k: 'none' } : { k: 'idle' }); return; }
    setView({ k: 'busy', why: 'Looking it up…' });
    try {
      const live = ids.length ? await fetchLive(ids) : new Map<string, LiveFinding>();
      if (my !== run.current) return;
      const found = ids.map((i) => live.get(i)).filter(Boolean) as LiveFinding[];
      const absent = ids.filter((i) => !live.has(i)).map((i) => i.replace(/-/g, ''));
      const toFix = [...absent, ...broken];
      let miss: Miss[] = [];
      if (toFix.length) {
        setView({ k: 'busy', why: 'Not an exact match — checking nearby IDs…' });
        miss = await Promise.all(toFix.slice(0, 6).map(async (typed) => {
          const sug = await suggestIds(typed);
          const lf = sug.length ? await fetchLive(sug.map((s) => s.id)) : new Map<string, LiveFinding>();
          return { typed, suggestions: sug.map((s) => ({ s, f: lf.get(s.id)! })).filter((x) => x.f) };
        }));
        if (my !== run.current) return;
      }
      if (found.length === 1 && !miss.length) {
        setView({ k: 'one', f: found[0] });
        if (autoGo && !newTab) timer.current = setTimeout(() => go(found[0]), 700);
      } else if (found.length) setView({ k: 'many', found, dupes: duplicates, miss, unknown: [] });
      else setView({ k: 'miss', miss, unknown: [] });
    } catch { if (my === run.current) setView({ k: 'error' }); }
  }, [autoGo, go]);

  useEffect(() => { if (initial.trim()) search(initial); return () => clearTimeout(timer.current); }, []); // eslint-disable-line
  useEffect(() => () => { run.current++; }, []);

  const cancel = () => { clearTimeout(timer.current); setCancelled(true); };
  const toggleAuto = (v: boolean) => { setAuto(v); try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch { /* ignore */ } };
  const toggleTab = (v: boolean) => { setNewTab(v); try { localStorage.setItem(NEWTAB_KEY, v ? '1' : '0'); } catch { /* ignore */ } };
  const busy = view.k === 'busy';

  const card = (f: LiveFinding, opts?: { sim?: number; typed?: string }) => (
    <div className="fid-card" key={f.id}>
      <span className="fid-cb"><BookOpen size={15} aria-hidden="true" /></span>
      <div className="fid-cm">
        <b className="fid-ct">{f.title}</b>
        <span className="fid-cs">{f.bookTitle}{f.bookAuthor ? ` · ${f.bookAuthor}` : ''} · PDF p. {f.page ?? 'not recorded'}{opts?.sim ? ` · ${Math.round(opts.sim * 100)}% similar` : ''}</span>
        {opts?.typed ? <Diff typed={opts.typed} id={f.id} /> : <code className="fid-id">{f.id}</code>}
      </div>
      <button className="fid-open" onClick={() => go(f)}>Open {newTab ? <ExternalLink size={14} aria-hidden="true" /> : <ArrowRight size={14} aria-hidden="true" />}</button>
    </div>
  );

  const missBlock = (m: Miss[]) => m.map((x) => (
    <div className="fid-miss" key={x.typed}>
      <p className="fid-mh"><SearchX size={15} aria-hidden="true" /> No finding has the ID <code>{x.typed.length === 32 ? x.typed.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') : x.typed}</code></p>
      {x.suggestions.length ? <><p className="fid-sub">Did you mean · এগুলোর কোনোটি?</p>{x.suggestions.map(({ s, f }) => card(f, { sim: s.score, typed: x.typed }))}</>
        : <p className="fid-sub">Nothing close. Check the ID is copied completely (36 characters, without a letter in front).</p>}
    </div>
  ));

  return (
    <div className={`fid ${busy ? 'is-busy' : ''}`}>
      <div className="fid-box">
        <Fingerprint size={18} className="fid-ic" aria-hidden="true" />
        <textarea
          ref={taRef} value={text} rows={1} spellCheck={false} aria-label="Finding ID or link"
          placeholder="Paste a finding ID, a link, or a whole AI answer · আইডি বা লিংক পেস্ট করুন"
          onChange={(e) => { setText(e.target.value); fit(); }}
          onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t) { e.preventDefault(); setText(t); setTimeout(fit, 0); if (auto) search(t); } }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); search(text); } }}
        />
        {text && <button className="fid-x" aria-label="Clear" onClick={() => { setText(''); setTimeout(fit, 0); setView({ k: 'idle' }); run.current++; clearTimeout(timer.current); }}><X size={15} /></button>}
        <span className="fid-scan" aria-hidden="true" />
      </div>
      <div className="fid-row">
        <span className="fid-opts">
          <label className="fid-chk"><input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} /> Find on paste</label>
          <label className="fid-chk"><input type="checkbox" checked={newTab} onChange={(e) => toggleTab(e.target.checked)} /> Open in new tab</label>
        </span>
        <button className="fid-go" onClick={() => search(text)} disabled={busy || !text.trim()}>{busy ? <Loader2 size={15} className="fid-spin" aria-hidden="true" /> : <Fingerprint size={15} aria-hidden="true" />} Find</button>
      </div>

      <div className="fid-out" aria-live="polite">
        {view.k === 'busy' && <p className="fid-status"><Loader2 size={14} className="fid-spin" aria-hidden="true" /> {view.why}</p>}
        {view.k === 'none' && <p className="fid-status fid-block">No finding ID in that text. An ID looks like <code>99407312-a862-4278-8e2a-58203c89722c</code>.</p>}
        {view.k === 'error' && <p className="fid-status">Couldn't reach the database. Try again.</p>}
        {view.k === 'one' && (
          <div className="fid-found">
            <div className="fid-ok"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10.5" className="fid-ring" /><path d="M7 12.5l3.2 3.2L17 9" className="fid-tick" /></svg><b>Found · পাওয়া গেছে</b></div>
            {card(view.f)}
            {autoGo && !newTab && !cancelled && <div className="fid-prog" aria-hidden="true"><i /></div>}
            {autoGo && !newTab && !cancelled && <p className="fid-sub">Taking you there… <button className="fid-link" onClick={cancel}>Stay here</button></p>}
          </div>
        )}
        {view.k === 'many' && (
          <div className="fid-found">
            <div className="fid-ok"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10.5" className="fid-ring" /><path d="M7 12.5l3.2 3.2L17 9" className="fid-tick" /></svg><b>{view.found.length} findings found</b>{view.dupes > 0 && <span className="fid-sub"> · {view.dupes} repeated ID{view.dupes === 1 ? '' : 's'} counted once</span>}</div>
            {view.found.map((f) => card(f))}
            {missBlock(view.miss)}
          </div>
        )}
        {view.k === 'miss' && <div className="fid-found">{missBlock(view.miss)}</div>}
      </div>
    </div>
  );
}
