import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Play, X, AlertTriangle, ArrowLeft } from 'lucide-react';
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
      add({ name: 'ANSWER FORMAT at top of llms.txt', status: /ANSWER FORMAT/.test(llms.body.slice(0, 2500)) ? 'pass' : 'fail', detail: 'The rules must be in the first lines so truncated reads still contain them.' });
      add({ name: 'No repeated disclaimer text', status: /NOT the original text|certified translation/i.test(llms.body) ? 'fail' : 'pass', detail: 'AI-facing files should carry neutral metadata only.' });
      for (const f of ['SKILL.md', 'SEARCH.md', 'CITATION.md']) {
        const r = await get(`${origin}/ai-integration/${f}`);
        add({ name: f, url: `${origin}/ai-integration/${f}`, status: r.res.ok && r.body.length > 200 && /ANSWER FORMAT|SEARCH|CITATION/i.test(r.body) ? 'pass' : 'fail', detail: `${r.res.status} · ${r.body.length} chars` });
      }
      for (const f of ['openapi.json', 'synonyms.txt']) {
        const r = await get(`${origin}/${f}`);
        add({ name: f, url: `${origin}/${f}`, status: r.res.ok ? 'pass' : 'fail', detail: `${r.res.status}` });
      }
      const master = await get(`${origin}/index.tsv`);
      const books = master.body.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
      add({ name: 'Master index.tsv', url: `${origin}/index.tsv`, status: books.length && /END OF BOOK LIST/.test(master.body) ? 'pass' : 'fail', detail: `${books.length} books listed` });
      for (const [key, title, , count, , part1] of books) {
        const total = Number(count);
        // walk the part chain exactly as a limited agent would
        let url: string | null = part1, parts = 0, ids = new Set<string>(), maxKb = 0, end = false;
        while (url && parts < 200) {
          const r = await get(url); if (!r.res.ok) break;
          parts++; maxKb = Math.max(maxKb, Math.round(r.body.length / 1024));
          [...r.body.matchAll(/^ID: (\S+)/gm)].forEach((m) => ids.add(m[1]));
          const next = /END OF PART \d+\/\d+ - NEXT: (\S+)/.exec(r.body);
          if (/END OF BOOK/.test(r.body)) end = true;
          url = next ? next[1] : null;
        }
        add({ name: `${key} · text parts`, url: part1, status: end && ids.size === total ? 'pass' : 'fail', detail: `${title}: ${parts} parts (largest ≈ ${maxKb} KB), ${ids.size}/${total} findings reached, END marker ${end ? 'found' : 'MISSING'}` });
        const ix = await get(`${origin}/book/${key}/index.tsv`);
        add({ name: `${key} · index`, url: `${origin}/book/${key}/index.tsv`, status: ix.res.ok ? 'pass' : 'fail', detail: `${ix.res.status} · ETag ${ix.res.headers.get('etag') ? 'yes' : 'no'}` });
        const dl = await get(`${origin}/book/${key}/download?format=json`);
        add({ name: `${key} · download`, url: `${origin}/book/${key}/download?format=json`, status: dl.res.ok && /attachment/.test(dl.res.headers.get('content-disposition') || '') ? 'pass' : 'fail', detail: `${dl.res.status}` });
      }
      const q = await get(`${origin}/ai-integration/quality`);
      try { const d = JSON.parse(q.body); const n = d.books.reduce((a: number, b: any) => a + b.issues_count, 0); add({ name: 'Data-quality report', url: `${origin}/ai-integration/quality`, status: n ? 'warn' : 'pass', detail: `${n} issue(s): empty bodies, cut-off titles, missing pages, "similar till page X" without links, duplicates` }); }
      catch { add({ name: 'Data-quality report', status: 'fail', detail: 'Not valid JSON' }); }
      const s = await get(`${origin}/ai-integration/search?q=${encodeURIComponent('test')}&mode=exact&limit=1`);
      add({ name: 'Search API', url: `${origin}/ai-integration/search`, status: s.res.ok ? 'pass' : 'fail', detail: `${s.res.status} · ${s.ms} ms` });
    } finally { setRunning(false); }
  };

  const bad = rows.filter((r) => r.status === 'fail').length, warn = rows.filter((r) => r.status === 'warn').length;
  return (
    <div className="page aii-page">
      <header className="aii-hero">
        <p className="aii-kicker"><Link to="/ai-integration"><ArrowLeft size={14} aria-hidden /> AI Integration</Link></p>
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
