import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2, Link2, FolderPlus } from 'lucide-react';
import { HeadingIndexRow, findHeadingIdsInBook } from '../lib/supabase';
import { addToLocal, getTemp, listLocal, makeCollection, saveCollection, setTemp, TEMP_ID, parsePermalink } from '../lib/collections';
import '../styles/coll.css';

/** Per-finding "Add to collection" popover: temporary / local. */
export function AddToCollectionMenu({ headingId, isAdmin, onClose }: { headingId: string; isAdmin: boolean; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [onClose]);
  const now = () => new Date().toISOString();
  const toTemp = () => {
    const t = getTemp() || { ...makeCollection({ name: 'Temporary collection' }, []), id: TEMP_ID };
    if (!t.items.some((i) => i.id === headingId)) t.items.push({ id: headingId, addedAt: now() });
    setTemp(t); setMsg('Added to temporary collection · যোগ হয়েছে');
  };
  const toLocal = (id: string) => { const n = addToLocal(id, [headingId]); setMsg(n ? 'Added · যোগ হয়েছে' : 'Already in this collection · আগেই আছে'); };
  const newLocal = () => {
    const name = prompt('Collection name · নাম'); if (!name) return;
    const c = makeCollection({ name }, [{ id: headingId, addedAt: now() }]); setMsg(saveCollection(c, 'local') ? 'Created · তৈরি হয়েছে' : 'Storage full — export instead');
  };
  return (
    <div className="hb-add-menu" ref={ref}>
      <b>Add to · কোথায় যোগ করবেন</b>
      <button onClick={toTemp}>Temporary (this tab)</button>
      {listLocal().map((c) => <button key={c.id} onClick={() => toLocal(c.id)}>Local: {c.name}</button>)}
      <button onClick={newLocal}>+ New local collection</button>
      {msg && <p className="hb-msg" role="status">{msg}</p>}
    </div>
  );
}

/** Always-visible per-book search (whole book, not just loaded batches) + jump-to box. */
export function BookFind({ bookId, bookSlug, index, ready, onJump }: {
  bookId: string; bookSlug: string; index: HeadingIndexRow[]; ready: boolean; onJump: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [ids, setIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [jump, setJump] = useState('');
  const [jmsg, setJmsg] = useState('');

  useEffect(() => {
    const t = q.trim();
    if (!t) { setIds(null); setBusy(false); setErr(false); return; }
    setBusy(true);
    const h = setTimeout(async () => {
      try { setIds(await findHeadingIdsInBook(bookId, t)); setErr(false); }
      catch { setErr(true); setIds([]); }
      setBusy(false);
    }, 300);
    return () => clearTimeout(h);
  }, [q, bookId]);

  const results = ids ? index.filter((h) => ids.includes(h.id)) : [];

  const go = () => {
    const raw = jump.trim(); if (!raw) return;
    let id: string | null = null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) id = raw.toLowerCase();
    else { const p = parsePermalink(raw); if (p.ok && p.id) id = p.id.toLowerCase(); }
    if (!id) { const p = parsePermalink(raw); setJmsg(p.ok === false && (p as { reason: string }).reason === 'wrong_domain' ? 'এটি এই সাইটের লিংক নয় · Wrong domain' : 'লিংক বা ID বোঝা যায়নি · Not a finding link/ID'); return; }
    if (ready && !index.some((h) => h.id === id)) { setJmsg('এই বইয়ে এই finding নেই · Not in this book'); return; }
    setJmsg(''); onJump(id); setJump(''); history.replaceState(null, '', `#${id}`);
  };

  return (
    <div className="bf no-print">
      <div className="bf-row">
        <Search size={16} aria-hidden className="bf-ic" />
        <input className="bf-in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="এই বইয়ে খুঁজুন" aria-label="Search this whole book" />
        {q && <button className="bf-x" onClick={() => setQ('')} aria-label="Clear search"><X size={16} /></button>}
      </div>
      {busy && <p className="bf-st"><Loader2 size={13} className="spin" aria-hidden /> খোঁজা হচ্ছে…</p>}
      {!busy && ids && (
        <div className="bf-res">
          <p className="bf-st" role="status">{err ? 'Search failed — try again.' : results.length ? `${results.length}টি ফল · ${results.length} result${results.length > 1 ? 's' : ''} (পুরো বই)` : 'কিছু পাওয়া যায়নি · No results'}</p>
          <ul>
            {results.slice(0, 100).map((h) => (
              <li key={h.id}><button onClick={() => { onJump(h.id); }}>{h.title || 'Untitled'}{h.page_number && <small> · p.{h.page_number}</small>}</button></li>
            ))}
          </ul>
        </div>
      )}
      <details className="bf-jump">
        <summary><Link2 size={14} aria-hidden /> Jump to a finding · লিংক/ID দিয়ে যান</summary>
        <div className="bf-row">
          <input className="bf-in" value={jump} onChange={(e) => setJump(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="লিংক বা ID পেস্ট করুন" aria-label="Jump to finding" />
          <button className="co-btn co-sm" onClick={go}>Go</button>
        </div>
        {jmsg && <p className="bf-st" role="alert">{jmsg}</p>}
      </details>
    </div>
  );
}
