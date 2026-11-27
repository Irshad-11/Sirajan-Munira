import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ClipboardPaste, Check, AlertTriangle, Info, StickyNote, XCircle, Copy, Download, Upload, Trash2, FolderOpen, ExternalLink, Sparkles, ArrowLeft } from 'lucide-react';
import { useAdmin } from '../lib/context';
import { copyToClipboard } from '../lib/richtext';
import { addHeadingToCategory, createCategory, listCategories, listCategoryHeadings, Category } from '../lib/supabase';
import {
  ResolvedItem, StoredCollection, StoredItem, LiveFinding, SCHEMA, TEMP_ID, aiContext, deleteLocal, exportJson, exportLocalStore,
  fetchLive, getStored, getTemp, importLocalStore, isUsable, itemsFromResolved, listLocal, makeCollection, mergeItems,
  parseCollectionJson, permalinkFor, resolveItems, saveCollection, ParseResult,
} from '../lib/collections';
import { bnFuzzy } from '../lib/bn';
import '../styles/coll.css';

const SITE = 'https://sirajan-munira.vercel.app';
export const COLLECTION_PROMPT = (q: string) =>
  `আমার প্রশ্ন: ${q}. ${SITE}/llms.txt পড়ে সব বই খুঁজে সব প্রাসঙ্গিক finding বের করো। উত্তর শুধু একটি JSON ব্লকে দাও, schema '${SCHEMA}'। প্রতিটি item-এ থাকবে: "url" (ফুল permalink, শেষে #finding-id সহ), "book", "title", "pdf_page", "first_words" (হুবহু), "match", "note"। ID বা লিংক নিজে বানাবে না, শুধু সাইটে দেখা permalink কপি করবে। search URL-এ বাংলা query অবশ্যই UTF-8 percent-encoded করবে। শেষে এক লাইনে বলো কতটি finding পড়েছ কতটির মধ্যে।`;

function download(name: string, text: string, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function useToast() {
  const [t, setT] = useState('');
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(''), 2600); return () => clearTimeout(h); }, [t]);
  return [t, setT] as const;
}

const STATUS_LABEL: Record<string, string> = {
  valid: 'Valid · ঠিক আছে', unknown_id: 'Unknown ID · আইডি নেই', wrong_domain: 'Wrong domain · ভিন্ন সাইট',
  duplicate: 'Duplicate · ডুপ্লিকেট', mismatch: 'ID ≠ URL · মিলছে না', invalid: 'Invalid · অসম্পূর্ণ',
};

function Badge({ r }: { r: ResolvedItem }) {
  if (!isUsable(r)) return <span className="co-badge co-bad"><XCircle size={13} aria-hidden /> {STATUS_LABEL[r.status]}</span>;
  const v = r.verify;
  const warn = v && (v.words === 'mismatch' || v.title === 'diff' || v.page === 'diff' || v.slug === 'diff');
  const unchecked = v && v.words === 'none' && v.title === 'none' && v.page === 'none' && v.slug !== 'ok';
  if (unchecked) return <span className="co-badge"><Check size={13} aria-hidden /> Exists · Not checked (আইডি আছে, লেখা যাচাই হয়নি)</span>;
  if (warn) return <span className="co-badge co-warn"><AlertTriangle size={13} aria-hidden /> Check text · লেখা মিলিয়ে দেখুন</span>;
  return <span className="co-badge co-ok"><Check size={13} aria-hidden /> Verified{r.status === 'mismatch' ? ' (id used)' : ''}</span>;
}

function Compare({ r }: { r: ResolvedItem }) {
  const v = r.verify; if (!v || !r.live) return null;
  const rows: [string, string | undefined, string | undefined, boolean][] = [];
  if (v.slug === 'diff') rows.push(['Book · বই', v.aiSlug, v.siteSlug, false]);
  if (v.aiWords !== undefined) rows.push(['First words · শুরুর কথা', v.aiWords, v.siteWords, v.words === 'ok']);
  if (v.aiTitle !== undefined) rows.push(['Title · শিরোনাম', v.aiTitle, v.siteTitle, v.title === 'ok']);
  if (v.aiPage !== undefined) rows.push(['PDF page · পৃষ্ঠা', v.aiPage, v.sitePage ?? 'not recorded', v.page === 'ok']);
  const bad = rows.filter((x) => !x[3]);
  if (!bad.length) return null;
  return (
    <div className="co-cmp">
      {bad.map(([k, ai, site]) => (
        <div key={k} className="co-cmp-row">
          <b>{k}</b>
          <div><span>AI said · AI বলেছে</span><p>{ai}</p></div>
          <div><span>Site says · সাইটে আছে</span><p>{site}</p></div>
        </div>
      ))}
    </div>
  );
}


const REJECT_INFO: Record<string, { why: string; fix: string }> = {
  invalid: {
    why: 'Item-এ লিংক বা ID পাওয়া যায়নি, কিংবা লিংকটা পড়া যায়নি। সবচেয়ে সাধারণ কারণ: AI ভুল ফিল্ড-নাম দিয়েছে, অথবা লিংকের শেষে #finding-id বাদ পড়েছে।',
    fix: 'প্রতিটি item-এ "url" ফিল্ডে পুরো permalink থাকতে হবে, যেমন https://sirajan-munira.vercel.app/book/<বই>#<finding-id>। শুধু বইয়ের লিংক চলবে না। বিকল্প হিসেবে "id" ফিল্ডে finding-এর UUID দিলেও হয়।',
  },
  unknown_id: {
    why: 'লিংকের #id এই সাইটে নেই। AI কখনো ID নিজে বানিয়ে ফেলে, কখনো কপি করতে গিয়ে এক-দুটো অক্ষর বদলে যায়। কখনো কনটেন্ট মুছে গেছে বা বইটা লুকানো আছে।',
    fix: 'AI-কে বলুন শুধু index.tsv, search বা বইয়ের part-ফাইলে যে permalink দেখেছে সেটাই হুবহু কপি করতে। নিজে বানানো বা সংক্ষিপ্ত লিংক দেওয়া চলবে না।',
  },
  wrong_domain: {
    why: 'লিংকটা এই সাইটের নয়। যেমন localhost, ভিন্ন ডোমেইন বা কোনো সংক্ষিপ্ত লিংক। নিরাপত্তার কারণে অন্য সাইটের লিংক গ্রহণ করা হয় না।',
    fix: 'লিংক শুরু হতে হবে https://sirajan-munira.vercel.app দিয়ে। অন্য সাইটের লিংক বাদ দিন, নইলে AI-কে সঠিক permalink দিতে বলুন।',
  },
  duplicate: { why: 'একই finding আগের কোনো item-এও আছে, তাই এটা বাড়তি ধরা হয়েছে।', fix: 'কিছু ঠিক করতে হবে না। একটি কপিই রাখা হয়।' },
  mismatch: { why: 'id আর লিংক দুটো আলাদা finding দেখাচ্ছে।', fix: 'id-টাকেই ঠিক ধরা হয়েছে। AI-কে বলুন id আর লিংক একই finding থেকে নিতে।' },
};

export function RejectHelp({ rows, onCopy }: { rows: ResolvedItem[]; onCopy: (t: string) => void }) {
  const bad = rows.filter((r) => !isUsable(r) && r.status !== 'duplicate');
  const dup = rows.filter((r) => r.status === 'duplicate').length;
  if (!bad.length && !dup) return null;
  const by = new Map<string, ResolvedItem[]>();
  bad.forEach((r) => (by.get(r.status) || by.set(r.status, []).get(r.status)!).push(r));
  const fixPrompt = `তোমার দেওয়া JSON-এর ${bad.length}টি item সাইট গ্রহণ করেনি। ঠিক করে আবার পুরো JSON দাও, শুধু একটি JSON ব্লকে:\n- প্রতিটি item-এ "url" ফিল্ডে পুরো permalink থাকবে (${SITE}/book/<বই>#<finding-id>)।\n- ID বা লিংক নিজে বানাবে না; শুধু index.tsv, search বা part-ফাইলে দেখা permalink হুবহু কপি করবে।\n- বাংলা লেখা ঠিক রাখো, কিন্তু search-এর URL-এ query অবশ্যই percent-encoded (UTF-8) হবে।\nযে item-গুলো ঠিক করতে পারছ না সেগুলো বাদ দাও এবং শেষে এক লাইনে জানাও কয়টি বাদ গেল।`;
  return (
    <div className="co-help" role="region" aria-label="কেন বাতিল হলো">
      <h3><Info size={16} aria-hidden /> কেন কিছু item বাতিল হলো</h3>
      <p>বাতিল মানে ফাইল নষ্ট নয়। সাইট প্রতিটি item আসল ডাটাবেসের সঙ্গে মিলিয়ে দেখে, আর যেগুলো মেলেনি সেগুলো বাদ রাখে। নিচে কারণ আর সমাধান।</p>
      {[...by.entries()].map(([st, rs]) => (
        <div key={st} className="co-help-g">
          <b>{STATUS_LABEL[st]} · {rs.length}টি</b>
          <p><u>কারণ:</u> {REJECT_INFO[st]?.why}</p>
          <p><u>সমাধান:</u> {REJECT_INFO[st]?.fix}</p>
          <p className="co-help-ex">উদাহরণ: {(rs[0].raw.title || rs[0].raw.url || rs[0].raw.id || '(খালি item)').toString().slice(0, 90)}</p>
        </div>
      ))}
      {dup > 0 && <div className="co-help-g"><b>{STATUS_LABEL.duplicate} · {dup}টি</b><p>{REJECT_INFO.duplicate.why} {REJECT_INFO.duplicate.fix}</p></div>}
      <div className="co-help-g">
        <b>কীভাবে ঠিক করবেন (ধাপে ধাপে)</b>
        <ol>
          <li>নিচের বোতামে চাপ দিয়ে সংশোধনের নির্দেশ কপি করুন।</li>
          <li>যে AI চ্যাটে JSON পেয়েছেন সেখানেই সেটা পেস্ট করুন।</li>
          <li>AI নতুন JSON দিলে সেটা এখানে আবার পেস্ট করে Validate করুন।</li>
          <li>তবু কিছু বাতিল হলে সেগুলো বাদ দিয়েই বাকিগুলো সেভ করতে পারেন। বাতিল item আপনা থেকেই সেভ হয় না।</li>
        </ol>
        <button className="co-btn" onClick={() => onCopy(fixPrompt)}><Copy size={15} aria-hidden /> AI-কে সংশোধনের নির্দেশ কপি করুন</button>
      </div>
    </div>
  );
}

// ===========================================================================
// Importer
// ===========================================================================
type Dest = 'temp' | 'local' | 'global';

export function CollectionImport() {
  const nav = useNavigate();
  const { isAdmin } = useAdmin();
  const [toast, setToast] = useToast();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<ResolvedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [dest, setDest] = useState<Dest>('temp');
  const [name, setName] = useState('');
  const [localId, setLocalId] = useState('new');
  const [cats, setCats] = useState<Category[]>([]);
  const [catId, setCatId] = useState('new');
  const [diff, setDiff] = useState<{ add: number; have: number } | null>(null);

  useEffect(() => { if (isAdmin) listCategories({ includeHidden: true }).then(setCats).catch(() => {}); }, [isAdmin]);

  const validate = async () => {
    const p = parseCollectionJson(text);
    setParsed(p); setRows([]); setDiff(null);
    if (!p.ok) return;
    setBusy(true);
    try {
      const r = await resolveItems(p.items);
      setRows(r);
      setChecked(new Set(r.filter(isUsable).map((x) => x.key)));
      setName(p.name || p.query || 'AI collection');
    } catch (e) { setParsed({ ...p, ok: false, errors: [{ en: 'Could not reach the database: ' + String((e as Error).message), bn: 'ডাটাবেসে যাওয়া যায়নি।' }] }); }
    setBusy(false);
  };

  const groups = useMemo(() => {
    const m = new Map<string, ResolvedItem[]>();
    rows.forEach((r) => { const k = r.live?.bookTitle || r.raw.book || '— (unresolved · অমীমাংসিত)'; (m.get(k) || m.set(k, []).get(k)!).push(r); });
    return [...m.entries()];
  }, [rows]);

  const sel = rows.filter((r) => checked.has(r.key) && isUsable(r));
  const counts = { ok: rows.filter(isUsable).length, bad: rows.filter((r) => !isUsable(r)).length, warn: rows.filter((r) => isUsable(r) && r.verify && (r.verify.words === 'mismatch' || r.verify.title === 'diff' || r.verify.page === 'diff' || r.verify.slug === 'diff')).length };

  useEffect(() => {
    if (dest !== 'global' || catId === 'new') { setDiff(null); return; }
    listCategoryHeadings(catId).then((ex) => {
      const have = new Set(ex.map((e: any) => e.id ?? e.heading?.id));
      const ids = sel.map((s) => s.id!);
      setDiff({ add: ids.filter((i) => !have.has(i)).length, have: ids.filter((i) => have.has(i)).length });
    }).catch(() => setDiff(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest, catId, checked, rows]);

  const save = async () => {
    if (!sel.length) { setToast('Select at least one item · অন্তত একটি বাছুন'); return; }
    const items: StoredItem[] = itemsFromResolved(sel);
    const meta = { name: name || 'AI collection', description: parsed?.description, query: parsed?.query || query };
    if (dest === 'temp') {
      if (!saveCollection({ ...makeCollection(meta, items), id: TEMP_ID }, 'temp')) { setToast('Storage full — export instead · জায়গা নেই'); return; }
      nav('/my-collections/temp');
    } else if (dest === 'local') {
      const ex = localId === 'new' ? null : getStored(localId);
      const c = ex ? mergeItems(ex, items).c : makeCollection(meta, items);
      if (!saveCollection(c, 'local')) { setToast('Storage full — export instead · জায়গা নেই'); return; }
      nav('/my-collections/' + c.id);
    } else {
      try {
        setBusy(true);
        let id = catId;
        if (id === 'new') id = (await createCategory({ name: meta.name })).id;
        for (const it of items) await addHeadingToCategory(id, it.id);
        nav('/collections/' + id);
      } catch (e) { setToast('Failed: ' + String((e as Error).message)); setBusy(false); }
    }
  };

  const toggle = (k: number) => setChecked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="co-wrap">
      <h1 className="co-h1">Import collection · কালেকশন ইম্পোর্ট</h1>
      <p className="co-sub">AI-এর দেওয়া <code>{SCHEMA}</code> JSON এখানে পেস্ট করুন। সাইটের ডাটাবেসই সত্য — AI-এর লেখা যাচাই করে দেখানো হবে।</p>

      <section className="co-card">
        <h2>১. AI-কে প্রশ্ন করুন · Ask your AI</h2>
        <label className="co-lbl" htmlFor="co-q">আপনার প্রশ্ন · Your question</label>
        <input id="co-q" className="co-in" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="যেমন: আফজাল আমল" />
        <button className="co-btn" onClick={async () => setToast((await copyToClipboard(COLLECTION_PROMPT(query.trim() || '{QUERY}'))) ? 'Prompt copied · কপি হয়েছে' : 'Copy failed')}>
          <Copy size={15} aria-hidden /> Copy prompt for AI · প্রম্পট কপি
        </button>
        <p className="co-hint">প্রম্পট ChatGPT / Claude / Gemini-তে পেস্ট করুন, তারপর উত্তরের JSON নিচে আনুন।</p>
      </section>

      <section className="co-card">
        <h2>২. JSON পেস্ট করুন · Paste JSON</h2>
        <textarea className="co-ta" value={text} onChange={(e) => { setText(e.target.value); if (rows.length) { setRows([]); setParsed(null); setChecked(new Set()); setDiff(null); } }} spellCheck={false} rows={8} placeholder="এখানে JSON পেস্ট করুন" aria-label="Collection JSON" />
        <div className="co-row">
          <button className="co-btn co-primary" onClick={validate} disabled={busy}><ClipboardPaste size={15} aria-hidden /> {busy ? 'Checking…' : 'Validate · যাচাই'}</button>
          <button className="co-btn" onClick={async () => { try { setText(await navigator.clipboard.readText()); } catch { setToast('Clipboard blocked — paste manually'); } }}>Paste from clipboard</button>
          {text && <button className="co-btn" onClick={() => { setText(''); setParsed(null); setRows([]); setChecked(new Set()); setName(''); setDiff(null); }}>Clear</button>}
        </div>
        {parsed?.errors.map((e, i) => <div key={i} className="co-err" role="alert"><b>{e.bn}</b><br /><span>{e.en}</span></div>)}
        {parsed?.notes.map((e, i) => <div key={i} className="co-note"><Info size={14} aria-hidden /> {e.bn} <span>({e.en})</span></div>)}
      </section>

      {rows.length > 0 && (
        <section className="co-card">
          <h2>৩. প্রিভিউ · Preview</h2>
          <p className="co-sum">
            <b>{counts.ok}</b> valid · <b>{counts.warn}</b> check · <b>{counts.bad}</b> rejected
            {counts.warn > 0 && ' — "Check" মানে AI-এর লেখা সাইটের সাথে মেলেনি; সাইটেরটাই ঠিক ধরা হবে।'}
          </p>
          <RejectHelp rows={rows} onCopy={async (t) => setToast((await copyToClipboard(t)) ? 'নির্দেশ কপি হয়েছে' : 'Copy failed')} />
          {groups.map(([book, rs]) => (
            <div key={book} className="co-group">
              <h3>{book} <small>({rs.length})</small></h3>
              {rs.map((r) => (
                <div key={r.key} className={'co-item' + (isUsable(r) ? '' : ' co-dis')}>
                  <label className="co-chk">
                    <input type="checkbox" disabled={!isUsable(r)} checked={checked.has(r.key) && isUsable(r)} onChange={() => toggle(r.key)} aria-label={`Select item ${r.key + 1}`} />
                    <span className="co-t">{r.live?.title || r.raw.title || r.raw.id || r.raw.url || '(empty)'}</span>
                  </label>
                  <div className="co-meta"><Badge r={r} />{r.live && <span className="co-pg">PDF p. {r.live.page ?? 'not recorded'}</span>}{r.raw.match && <span className="co-pg">{r.raw.match}</span>}</div>
                  {r.detail && !isUsable(r) && <p className="co-hint">{r.detail.bn} <span>({r.detail.en})</span></p>}
                  {r.raw.note && <p className="co-nt"><StickyNote size={13} aria-hidden /> {r.raw.note}</p>}
                  <Compare r={r} />
                </div>
              ))}
            </div>
          ))}

          <h2 className="co-h2">৪. কোথায় রাখবেন · Destination</h2>
          <div className="co-dest" role="radiogroup" aria-label="Destination">
            {([['temp', 'Temporary', 'শুধু এই ট্যাবে, বন্ধ করলে মুছে যাবে'], ['local', 'Local (this device)', 'এই ব্রাউজারে সেভ — শুধু ID, নোট, তারিখ'], ...(isAdmin ? [['global', 'Global (admin)', 'সবার জন্য সাইটের কালেকশন']] : [])] as [Dest, string, string][]).map(([k, t, d]) => (
              <label key={k} className={'co-opt' + (dest === k ? ' on' : '')}><input type="radio" name="dest" checked={dest === k} onChange={() => setDest(k)} /><b>{t}</b><span>{d}</span></label>
            ))}
          </div>
          {dest !== 'global' || catId === 'new' ? (
            <><label className="co-lbl" htmlFor="co-name">নাম · Name</label><input id="co-name" className="co-in" value={name} onChange={(e) => setName(e.target.value)} /></>
          ) : null}
          {dest === 'local' && (
            <><label className="co-lbl" htmlFor="co-l">Save into</label>
              <select id="co-l" className="co-in" value={localId} onChange={(e) => setLocalId(e.target.value)}>
                <option value="new">New collection · নতুন</option>
                {listLocal().map((c) => <option key={c.id} value={c.id}>{c.name} ({c.items.length})</option>)}
              </select></>
          )}
          {dest === 'global' && (
            <><label className="co-lbl" htmlFor="co-g">Collection</label>
              <select id="co-g" className="co-in" value={catId} onChange={(e) => setCatId(e.target.value)}>
                <option value="new">New · নতুন</option>
                {cats.map((c) => <option key={c.id} value={c.id}>Merge into: {c.name}</option>)}
              </select>
              {diff && <p className="co-hint">Diff: <b>{diff.add}</b> new will be added · <b>{diff.have}</b> already there.</p>}
              <p className="co-hint"><AlertTriangle size={13} aria-hidden /> এটি সবার জন্য দৃশ্যমান হবে। Global-এ শুধু finding যোগ হয়; আগেরগুলো মোছা হয় না।</p></>
          )}
          <button className="co-btn co-primary co-wide" onClick={save} disabled={busy || !sel.length}>Save {sel.length} item{sel.length === 1 ? '' : 's'} · সেভ করুন</button>
        </section>
      )}
      {toast && <div className="co-toast" role="status">{toast}</div>}
    </div>
  );
}

// ===========================================================================
// My collections list
// ===========================================================================
export function MyCollectionsList() {
  const [, force] = useState(0);
  const [toast, setToast] = useToast();
  const all = listLocal(); const temp = getTemp();
  const fileRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="co-wrap">
      <h1 className="co-h1">My collections · আমার কালেকশন</h1>
      <p className="co-sub">এগুলো শুধু এই ব্রাউজারে আছে (ID + নোট + তারিখ)। ব্রাউজার ডাটা মুছলে হারাবে — তাই Export করে রাখুন।</p>
      <div className="co-row">
        <Link className="co-btn co-primary" to="/collections/import"><ClipboardPaste size={15} aria-hidden /> Import JSON</Link>
        <button className="co-btn" onClick={() => download('sirajan-local-collections.json', exportLocalStore())}><Download size={15} aria-hidden /> Export all</button>
        <button className="co-btn" onClick={() => fileRef.current?.click()}><Upload size={15} aria-hidden /> Import backup</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return; const r = importLocalStore(await f.text());
          setToast(r.error ? 'Error: ' + r.error : `${r.added} collection(s) imported`); force((x) => x + 1); e.target.value = '';
        }} />
      </div>
      {temp && <Link className="co-list-item" to="/my-collections/temp"><FolderOpen size={18} aria-hidden /><div><b>{temp.name}</b> <em className="co-tag">Temporary</em><span>{temp.items.length} findings · এই ট্যাব বন্ধ হলে মুছবে</span></div></Link>}
      {all.map((c) => (
        <div key={c.id} className="co-list-item">
          <Link to={'/my-collections/' + c.id} className="co-li-main"><FolderOpen size={18} aria-hidden /><div><b>{c.name}</b><span>{c.items.length} findings · {new Date(c.updatedAt).toLocaleDateString('en-GB')}</span></div></Link>
          <button className="co-icon" aria-label={`Delete ${c.name}`} onClick={() => { if (confirm(`Delete "${c.name}"?`)) { deleteLocal(c.id); force((x) => x + 1); } }}><Trash2 size={16} /></button>
        </div>
      ))}
      {!temp && !all.length && <p className="co-empty">এখনো কোনো কালেকশন নেই। <Link to="/collections/import">JSON ইম্পোর্ট করুন</Link> বা বইয়ের পাতা থেকে finding যোগ করুন।</p>}
      {toast && <div className="co-toast" role="status">{toast}</div>}
    </div>
  );
}

// ===========================================================================
// Collection view
// ===========================================================================
export function MyCollectionView() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState<StoredCollection | null>(() => getStored(id));
  const [live, setLive] = useState<Map<string, LiveFinding> | null>(null);
  const [toast, setToast] = useToast();
  const [bookF, setBookF] = useState('all');
  const [group, setGroup] = useState(true);
  const [sort, setSort] = useState<'order' | 'page'>('order');
  const [q, setQ] = useState('');
  const [full, setFull] = useState<Set<string>>(new Set());

  useEffect(() => { if (c) fetchLive(c.items.map((i) => i.id)).then(setLive).catch(() => setLive(new Map())); }, [c?.items.length]); // eslint-disable-line
  const persist = (n: StoredCollection) => { n = { ...n, updatedAt: new Date().toISOString() }; if (!saveCollection(n, id === TEMP_ID ? 'temp' : 'local')) { setToast('Storage full — export instead'); return; } setC(n); };

  const rowsAll = useMemo(() => (c?.items || []).map((item, i) => ({ item, live: live?.get(item.id) ?? null, i })), [c, live]);
  const books = useMemo(() => [...new Set(rowsAll.map((r) => r.live?.bookTitle).filter(Boolean) as string[])], [rowsAll]);
  const missing = rowsAll.filter((r) => live && !r.live);

  const shown = useMemo(() => {
    const nq = bnFuzzy(q);
    let r = rowsAll.filter((x) => x.live && (bookF === 'all' || x.live.bookTitle === bookF) &&
      (!nq || bnFuzzy(x.live.title + ' ' + x.live.plain + ' ' + (x.item.note || '')).includes(nq)));
    if (sort === 'page') r = [...r].sort((a, b) => (parseFloat(a.live!.page || '') || 1e9) - (parseFloat(b.live!.page || '') || 1e9));
    return r;
  }, [rowsAll, bookF, q, sort]);

  if (!c) return <div className="co-wrap"><h1 className="co-h1">Collection not found</h1><p className="co-empty">এই ব্রাউজারে এমন কালেকশন নেই। <Link to="/my-collections">সব দেখুন</Link></p></div>;

  const setNote = (iid: string, note: string) => persist({ ...c, items: c.items.map((i) => (i.id === iid ? { ...i, note: note || undefined } : i)) });
  const remove = (iid: string) => persist({ ...c, items: c.items.filter((i) => i.id !== iid) });
  const rowsFor = (rs: typeof shown) => rs.map((r) => ({ item: r.item, live: r.live }));
  const copy = async (t: string, msg: string) => setToast((await copyToClipboard(t)) ? msg : 'Copy failed');

  const renderItem = (r: (typeof shown)[number]) => {
    const l = r.live!; const open = full.has(l.id);
    return (
      <article key={l.id} className="co-item">
        <h4><Link to={`/book/${encodeURIComponent(l.bookSlug)}#${l.id}`}>{l.title}</Link></h4>
        <div className="co-meta"><span className="co-pg">{l.bookTitle}</span><span className="co-pg">PDF p. {l.page ?? 'not recorded'}</span>{r.item.match && <span className="co-pg">{r.item.match}</span>}</div>
        <p className="co-prev">{open ? l.plain : l.plain.slice(0, 220) + (l.plain.length > 220 ? '…' : '')}</p>
        {l.plain.length > 220 && <button className="co-link" onClick={() => setFull((s) => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; })}>{open ? 'Show less' : 'Show more · আরও'}</button>}
        <textarea className="co-note-in" rows={1} defaultValue={r.item.note || ''} placeholder="নোট লিখুন" aria-label="Note" onBlur={(e) => e.target.value !== (r.item.note || '') && setNote(l.id, e.target.value)} />
        <div className="co-row">
          <button className="co-btn co-sm" onClick={() => copy(permalinkFor(l.bookSlug, l.id), 'Link copied')}><Copy size={13} aria-hidden /> Link</button>
          <Link className="co-btn co-sm" to={`/book/${encodeURIComponent(l.bookSlug)}#${l.id}`}><ExternalLink size={13} aria-hidden /> Open</Link>
          <button className="co-btn co-sm" onClick={() => remove(l.id)}><Trash2 size={13} aria-hidden /> Remove</button>
        </div>
      </article>
    );
  };

  const byBook = group ? [...shown.reduce((m, r) => { const k = r.live!.bookTitle; (m.get(k) || m.set(k, []).get(k)!).push(r); return m; }, new Map<string, typeof shown>())] : [['', shown] as [string, typeof shown]];
  const exp = () => exportJson(c, rowsFor(rowsAll));

  return (
    <div className="co-wrap">
      <p className="co-crumb"><Link to="/my-collections"><ArrowLeft size={14} aria-hidden /> My collections</Link></p>
      <h1 className="co-h1">{c.name} {id === TEMP_ID && <em className="co-tag">Temporary</em>}</h1>
      {c.query && <p className="co-sub">প্রশ্ন: {c.query}</p>}
      <p className="co-sub">{rowsAll.length} findings · {books.length} books{!live && ' · loading…'}</p>

      <div className="co-row">
        <button className="co-btn" onClick={() => copy(shown.map((r) => permalinkFor(r.live!.bookSlug, r.live!.id)).join('\n'), 'All links copied')}><Copy size={15} aria-hidden /> Copy all links</button>
        <button className="co-btn" onClick={() => download((c.name || 'collection').replace(/[^\wঀ-৿-]+/g, '_') + '.json', exp())}><Download size={15} aria-hidden /> Export JSON</button>
        <button className="co-btn" onClick={() => copy(aiContext(c, rowsFor(shown)), 'AI context copied — paste it into your AI')}><Sparkles size={15} aria-hidden /> Copy as AI context</button>
        {id === TEMP_ID && <button className="co-btn co-primary" onClick={() => { const n = { ...c, id: makeCollection({ name: c.name }, []).id }; saveCollection(n, 'local'); setToast('Saved to this device'); nav('/my-collections/' + n.id, { replace: true }); }}>Save to this device</button>}
      </div>

      <div className="co-filters">
        <input className="co-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="কালেকশনে খুঁজুন" aria-label="Search in collection" />
        <select className="co-in" value={bookF} onChange={(e) => setBookF(e.target.value)} aria-label="Filter by book"><option value="all">All books · সব বই</option>{books.map((b) => <option key={b}>{b}</option>)}</select>
        <select className="co-in" value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Sort"><option value="order">Pasted order · ক্রম</option><option value="page">PDF page · পৃষ্ঠা</option></select>
        <label className="co-chk"><input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} /> Group by book</label>
      </div>

      {missing.length > 0 && (
        <div className="co-err" role="status"><b>{missing.length}টি finding পাওয়া যাচ্ছে না (missing / not available)।</b> <span>(deleted or hidden)</span>
          <ul>{missing.map((m) => <li key={m.item.id}><code>{m.item.id}</code>{m.item.note ? ` — ${m.item.note}` : ''} <button className="co-link" onClick={() => remove(m.item.id)}>remove</button></li>)}</ul></div>
      )}
      {live && !shown.length && <p className="co-empty">কিছু পাওয়া যায়নি।</p>}
      {byBook.map(([b, rs]) => <div key={b || 'all'}>{b && <h3 className="co-gh">{b} <small>({rs.length})</small></h3>}{rs.map(renderItem)}</div>)}
      {toast && <div className="co-toast" role="status">{toast}</div>}
    </div>
  );
}
