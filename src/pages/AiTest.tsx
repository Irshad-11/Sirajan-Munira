import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Play, X, AlertTriangle } from 'lucide-react';
import { siteOrigin } from '../lib/ai';

type Row = { name: string; url?: string; status: 'pass' | 'warn' | 'fail'; detail: string };

async function get(url: string) {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { Accept: '*/*' } });
  const body = await res.text();
  return { res, body, ms: Math.round(performance.now() - t0) };
}

/** Admin/developer self-test for FR-12: availability, JSON validity, unique IDs, page numbers, links, TXT↔JSON consistency. */
export default function AiTestPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const origin = siteOrigin();
  const add = (r: Row) => setRows((x) => [...x, r]);

  const run = async () => {
    setRows([]); setRunning(true);
    try {
      const llms = await get(`${origin}/llms.txt`).catch((e) => ({ res: null as any, body: '', ms: 0, e }));
      if (!llms.res?.ok) { add({ name: 'llms.txt', url: `${origin}/llms.txt`, status: 'fail', detail: `Not reachable (${llms.res?.status ?? 'network error'})` }); return; }
      add({ name: 'llms.txt', url: `${origin}/llms.txt`, status: 'pass', detail: `${llms.res.status} · ${llms.ms} ms · ${llms.body.length} chars` });
      for (const f of ['SKILL.md', 'SEARCH.md', 'CITATION.md']) {
        const r = await get(`${origin}/ai-integration/${f}`);
        add({ name: f, url: `${origin}/ai-integration/${f}`, status: r.res.ok && r.body.length > 200 ? 'pass' : 'fail', detail: `${r.res.status} · ${r.body.length} chars` });
      }
      const slugs = [...llms.body.matchAll(/\]\((https?:\/\/[^)\s]+\/book\/([^)\s/]+))\)/g)].map((m) => m[2]);
      if (!slugs.length) add({ name: 'Books in llms.txt', status: 'warn', detail: 'No books listed.' });
      for (const slug of slugs) {
        const base = `${origin}/book/${slug}`;
        const [j, t, d] = await Promise.all([get(`${base}.json`), get(`${base}.txt`), get(`${base}/download?format=json`)]);
        add({ name: `${slug} · TXT`, url: `${base}.txt`, status: t.res.ok ? 'pass' : 'fail', detail: `${t.res.status} · ${t.ms} ms${/PARTIAL OUTPUT/.test(t.body) ? ' · split into parts (expected for very large books)' : ''}` });
        add({ name: `${slug} · download`, url: `${base}/download`, status: d.res.ok && /attachment/.test(d.res.headers.get('content-disposition') || '') ? 'pass' : 'fail', detail: `${d.res.status} · ${d.res.headers.get('content-disposition') || 'no Content-Disposition'}` });
        let data: any;
        try { data = JSON.parse(j.body); } catch { add({ name: `${slug} · JSON`, url: `${base}.json`, status: 'fail', detail: 'Invalid JSON' }); continue; }
        const fs: any[] = data.findings || [];
        const ids = fs.map((f) => f.heading_id);
        const dupes = ids.length - new Set(ids).size;
        const pids = fs.flatMap((f) => f.passages.map((p: any) => p.passage_id));
        const pdupes = pids.length - new Set(pids).size;
        const noPage = fs.filter((f) => !f.pdf_page_number).length;
        const noLink = fs.filter((f) => !f.permalink).length;
        add({ name: `${slug} · JSON structure`, url: `${base}.json`, status: dupes || pdupes || noLink ? 'fail' : 'pass', detail: `${fs.length} findings, ${pids.length} passages · duplicate heading IDs: ${dupes} · duplicate passage IDs: ${pdupes} · missing permalink: ${noLink}` });
        add({ name: `${slug} · PDF page numbers`, status: noPage ? 'warn' : 'pass', detail: noPage ? `${noPage} of ${fs.length} findings have no PDF page number (exported as null)` : 'All findings have a page number' });
        add({ name: `${slug} · original PDF URL`, status: data.book?.original_source_pdf_url ? 'pass' : 'warn', detail: data.book?.original_source_pdf_url || 'No PDF link among source links (exported as null)' });
        if (!/PARTIAL OUTPUT/.test(t.body)) {
          const txtIds = new Set([...t.body.matchAll(/^HEADING ID: (\S+)/gm)].map((m) => m[1]));
          const missing = ids.filter((id) => !txtIds.has(id)).length;
          add({ name: `${slug} · TXT ↔ JSON`, status: missing || txtIds.size !== ids.length ? 'fail' : 'pass', detail: `TXT has ${txtIds.size} findings, JSON has ${ids.length}${missing ? ` · ${missing} missing in TXT` : ''}` });
        }
        const sample = fs[0]?.permalink;
        if (sample) add({ name: `${slug} · sample permalink`, url: sample, status: sample.startsWith(origin) ? 'pass' : 'warn', detail: sample });
        const pdf = data.book?.original_source_pdf_url;
        if (pdf) {
          try { await fetch(pdf, { method: 'HEAD', mode: 'no-cors' }); add({ name: `${slug} · PDF reachable`, url: pdf, status: 'pass', detail: 'Request sent (cross-origin; status not readable by the browser)' }); }
          catch { add({ name: `${slug} · PDF reachable`, url: pdf, status: 'warn', detail: 'Could not reach the PDF — check the link' }); }
        }
      }
      const s = await get(`${origin}/ai-integration/search?q=${encodeURIComponent('test')}&mode=exact&limit=1`);
      add({ name: 'Search API', url: `${origin}/ai-integration/search`, status: s.res.ok ? 'pass' : 'fail', detail: `${s.res.status} · ${s.ms} ms` });
    } finally { setRunning(false); }
  };

  const bad = rows.filter((r) => r.status === 'fail').length, warn = rows.filter((r) => r.status === 'warn').length;
  return (
    <div className="page aii-page">
      <header className="aii-hero">
        <p className="aii-kicker"><Link to="/ai-integration">← AI Integration</Link></p>
        <h1>AI integration self-test</h1>
        <p className="aii-lead">Checks every AI endpoint on this deployment: availability, JSON validity, unique IDs, page numbers, links and TXT/JSON consistency.</p>
        <button className="ai-copy" style={{ maxWidth: 220 }} onClick={run} disabled={running}>{running ? <Loader2 size={15} className="spin" /> : <Play size={15} />} {running ? 'Running…' : 'Run tests'}</button>
      </header>
      {rows.length > 0 && <p className="aii-summary" role="status">{rows.length} checks · <b className="ok">{rows.length - bad - warn} passed</b> · <b className="wn">{warn} warnings</b> · <b className="bd">{bad} failed</b></p>}
      <ul className="aii-tests">
        {rows.map((r, i) => (
          <li key={i} className={`aii-test aii-test--${r.status}`}>
            <span className="aii-test-i">{r.status === 'pass' ? <Check size={14} /> : r.status === 'warn' ? <AlertTriangle size={14} /> : <X size={14} />}</span>
            <div><b>{r.name}</b>{r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="aii-test-u">{r.url}</a>}<p>{r.detail}</p></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
