import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Sparkles, TextSearch, BookOpen, FolderOpen, FileText, RotateCcw, Loader2, Database, RefreshCw, ChevronDown,
} from 'lucide-react';
import {
  EmbeddingStatus, SearchKind, SearchRow, embedIndex, keywordSearch, semanticSearch,
} from '../lib/supabase';
import { useAdmin, useTrackView } from '../lib/context';
import { Highlighted, splitTerms } from '../lib/highlight';
import { SearchBox, SEARCH_EXAMPLES } from '../components/SearchBox';
import { cacheClearAll, cacheGet, cacheSet, queryKey } from '../lib/searchCache';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Starting point for Gemini Embedding 2 cosine similarity on this archive.
 *  Tune after indexing: raise it if weak matches show up, lower it if good
 *  passages are missing. The reader can override it with the slider. */
export const RECOMMENDED_THRESHOLD = 0.55;
const THRESHOLD_MIN = 0.3;
const THRESHOLD_MAX = 0.9;
const KEYWORD_PAGE = 20;
const SEMANTIC_PAGE = 15;        // results revealed per "Show more"
const SEMANTIC_FETCH = 50;       // rows fetched per request (all ≥ THRESHOLD_MIN)

// Cache keys. Semantic results are stored once per query at the lowest
// confidence, then filtered in the browser — so moving the slider or
// toggling collections never triggers a new request.
const semKey = (q: string) => `sem:${queryKey(q)}`;
const kwKey = (q: string, kind: string) => `kw:${kind}:${queryKey(q)}`;
interface CachedList { rows: SearchRow[]; total: number; tookMs?: number; }

// Identical requests already in flight share one network call.
const inflight = new Map<string, Promise<any>>();
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!inflight.has(key)) inflight.set(key, fn().finally(() => inflight.delete(key)));
  return inflight.get(key) as Promise<T>;
}

function readPos(key: string): { y: number; semShown: number } | null {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}

type Tab = 'semantic' | 'keyword';
type Status = 'idle' | 'loading' | 'more' | 'done' | 'error';
type KindFilter = 'all' | SearchKind;

function readNum(key: string, fallback: number) {
  try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) && v > 0 ? v : fallback; } catch { return fallback; }
}
function readBool(key: string, fallback: boolean) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; }
}

function band(sim: number, threshold: number): { label: string; level: 3 | 2 | 1 } {
  if (sim >= threshold + 0.15) return { label: 'Strong match', level: 3 };
  if (sim >= threshold + 0.07) return { label: 'Good match', level: 2 };
  return { label: 'Possible match', level: 1 };
}

function resultHref(r: SearchRow, mode: Tab, terms: string[]) {
  if (r.kind === 'collection') return `/collections/${r.id}`;
  if (r.kind === 'book') return `/book/${r.book_slug}`;
  const params = new URLSearchParams();
  if (mode === 'semantic' && r.chunk_id) params.set('chunk', String(r.chunk_id));
  else if (terms.length) params.set('hl', terms.join('|'));
  const qs = params.toString();
  return `/book/${r.book_slug}${qs ? `?${qs}` : ''}#${r.heading_id}`;
}

const KIND_META: Record<SearchKind, { label: string; icon: React.ReactNode }> = {
  heading: { label: 'Finding', icon: <FileText size={12} /> },
  book: { label: 'Book', icon: <BookOpen size={12} /> },
  collection: { label: 'Collection', icon: <FolderOpen size={12} /> },
};

// ---------------------------------------------------------------------------
// Result item
// ---------------------------------------------------------------------------

function ResultItem({ r, mode, terms, threshold }: { r: SearchRow; mode: Tab; terms: string[]; threshold: number }) {
  const meta = KIND_META[r.kind];
  const sim = typeof r.similarity === 'number' ? r.similarity : null;
  const b = sim !== null ? band(sim, threshold) : null;
  const metaParts = r.kind === 'heading'
    ? [r.book_title, r.book_author, r.page_number ? `p. ${r.page_number}` : null].filter(Boolean)
    : [];

  return (
    <li className="sr-item">
      <Link to={resultHref(r, mode, terms)} className="sr-link">
        <div className="sr-thumb" aria-hidden="true">
          {r.image_url
            ? <img src={r.image_url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
            : <span className="sr-thumb-ph" style={r.color ? { background: r.color } : undefined} />}
        </div>
        <div className="sr-body">
          <div className="sr-top">
            <span className={`sr-kind sr-kind--${r.kind}`}>{meta.icon} {meta.label}</span>
            {b && sim !== null && (
              <span className={`sr-conf sr-conf--${b.level}`} title="Cosine similarity between your query and this passage">
                <span className="sr-conf-bar" aria-hidden="true"><span style={{ width: `${Math.max(4, Math.round(sim * 100))}%` }} /></span>
                <strong>{Math.round(sim * 100)}%</strong> <span className="sr-conf-label">{b.label}</span>
              </span>
            )}
          </div>
          <h3 className="sr-title"><Highlighted text={r.title || 'Untitled'} terms={terms} /></h3>
          {metaParts.length > 0 && <p className="sr-meta">{metaParts.join(' · ')}</p>}
          {r.snippet && (
            <p className={`sr-snippet ${mode === 'semantic' && r.kind === 'heading' ? 'hl-passage' : ''}`}>
              <Highlighted text={r.snippet} terms={terms} />
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

function ResultSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="sr-list" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="sr-item sr-item--sk">
          <div className="sr-link">
            <div className="sr-thumb skeleton-pulse" />
            <div className="sr-body">
              <div className="skeleton-pulse sk-line sm" style={{ width: 90 }} />
              <div className="skeleton-pulse sk-line lg" style={{ width: `${55 + ((i * 13) % 30)}%` }} />
              <div className="skeleton-pulse sk-line sm" style={{ width: '35%' }} />
              <div className="skeleton-pulse sk-line" style={{ width: '92%' }} />
              <div className="skeleton-pulse sk-line" style={{ width: '70%' }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Semantic loading panel — tells the reader what is happening while the
// query is embedded and compared (indeterminate: no fake percentages).
// ---------------------------------------------------------------------------

const SEMANTIC_STEPS = [
  'Reading the meaning of your query…',
  'Comparing it with every indexed passage…',
  'Ranking the closest passages…',
  'Almost there — gathering book details…',
];

function SemanticLoading() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setMs(Date.now() - start), 200);
    return () => clearInterval(t);
  }, []);
  const step = Math.min(SEMANTIC_STEPS.length - 1, Math.floor(ms / 1600));
  return (
    <div className="sem-loading" role="status" aria-live="polite">
      <div className="sem-loading-row">
        <span className="sem-orbit" aria-hidden="true"><span /><span /><span /></span>
        <span key={step} className="sem-step">{SEMANTIC_STEPS[step]}</span>
        <span className="sem-elapsed">{(ms / 1000).toFixed(1)}s</span>
      </div>
      <div className="sem-track" aria-hidden="true"><span /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin: semantic index status
// ---------------------------------------------------------------------------

function IndexPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading'); setError(null);
    try { setStatus(await embedIndex('status')); setState('idle'); }
    catch (e: any) { setError(e.message); setState('error'); }
  }, []);

  useEffect(() => { if (open && !status) load(); }, [open, status, load]);

  const runAll = async (reset = false) => {
    if (reset && !confirm('Re-embed every finding and collection? Existing results keep working until each item is replaced.')) return;
    setState('running'); setError(null);
    try {
      let s = reset ? await embedIndex('reset') : await embedIndex('status');
      setStatus(s);
      for (let i = 0; i < 200 && s.headingsPending + s.collectionsPending > 0; i++) {
        s = await embedIndex('run');
        setStatus(s);
      }
      cacheClearAll();   // new vectors → old cached results are stale
      setState('idle');
    } catch (e: any) {
      setError(e.message); setState('error');
    }
  };

  const pending = status ? status.headingsPending + status.collectionsPending : 0;

  return (
    <details className="idx-panel" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><Database size={14} /> Semantic index (admin) <ChevronDown size={14} className="idx-chev" /></summary>
      <div className="idx-body">
        {state === 'loading' && !status && <p className="muted"><Loader2 size={13} className="spin" /> Checking index…</p>}
        {status && (
          <dl className="idx-stats">
            <div><dt>Findings indexed</dt><dd>{status.headingsTotal - status.headingsPending} / {status.headingsTotal}</dd></div>
            <div><dt>Collections indexed</dt><dd>{status.collectionsTotal - status.collectionsPending} / {status.collectionsTotal}</dd></div>
            <div><dt>Passages</dt><dd>{status.chunksTotal}</dd></div>
            <div><dt>Model</dt><dd>{status.model}</dd></div>
          </dl>
        )}
        {state === 'running' && <p className="idx-running" role="status"><Loader2 size={13} className="spin" /> Indexing… {pending} item(s) left</p>}
        {error && <p className="form-error">Indexing failed: {error}</p>}
        <div className="idx-actions">
          <button className="primary" onClick={() => runAll(false)} disabled={state === 'running' || (status !== null && pending === 0)}>
            {status && pending === 0 ? 'Index is up to date' : 'Index now'}
          </button>
          <button className="secondary" onClick={() => runAll(true)} disabled={state === 'running'}><RefreshCw size={12} /> Re-index all</button>
          <button className="link-btn" onClick={load} disabled={state === 'running'}>Refresh</button>
        </div>
        <p className="muted idx-note">New and edited findings are indexed automatically a few seconds after you save them.</p>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Search page
// ---------------------------------------------------------------------------

interface ListState { rows: SearchRow[]; total: number; status: Status; error: string | null; }
const EMPTY: ListState = { rows: [], total: 0, status: 'idle', error: null };

export default function SearchPage() {
  const { isAdmin } = useAdmin();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const tab: Tab = params.get('tab') === 'keyword' ? 'keyword' : 'semantic';
  const terms = useMemo(() => splitTerms(q), [q]);
  useTrackView('site', 'search');

  const location = useLocation();
  const posKey = `sm_search_pos:${location.search}`;
  const savedPos = useRef(readPos(posKey));

  const [threshold, setThreshold] = useState(() => readNum('sm_sem_threshold', RECOMMENDED_THRESHOLD));
  const [includeCollections, setIncludeCollections] = useState(() => readBool('sm_sem_collections', true));
  const kindParam = params.get('kind');
  const kind: KindFilter = kindParam === 'heading' || kindParam === 'book' || kindParam === 'collection' ? kindParam : 'all';
  const setKind = (k: KindFilter) => {
    const p = new URLSearchParams(params);
    if (k === 'all') p.delete('kind'); else p.set('kind', k);
    setParams(p, { replace: true });
  };

  // Start from the cache synchronously, so Back shows results instantly.
  const fromCache = (key: string | null): ListState & { cached?: boolean; tookMs?: number } => {
    const hit = key ? cacheGet<CachedList>(key) : null;
    return hit ? { rows: hit.rows, total: hit.total, status: 'done', error: null, cached: true, tookMs: hit.tookMs } : EMPTY;
  };
  const [kw, setKw] = useState<ListState & { cached?: boolean }>(() => fromCache(q ? kwKey(q, kind) : null));
  const [sem, setSem] = useState<ListState & { cached?: boolean; tookMs?: number }>(() => fromCache(q.length >= 2 ? semKey(q) : null));
  const [semShown, setSemShown] = useState(() => savedPos.current?.semShown || SEMANTIC_PAGE);
  const kwReq = useRef(0);
  const semReq = useRef(0);
  const kwRef = useRef(kw); kwRef.current = kw;
  const semRef = useRef(sem); semRef.current = sem;

  useEffect(() => { try { localStorage.setItem('sm_sem_threshold', String(threshold)); } catch {} }, [threshold]);
  useEffect(() => { try { localStorage.setItem('sm_sem_collections', includeCollections ? '1' : '0'); } catch {} }, [includeCollections]);

  // ---- Keyword ----
  const runKeyword = useCallback(async (opts: { more?: boolean; force?: boolean } = {}) => {
    if (!q) { setKw(EMPTY); return; }
    const key = kwKey(q, kind);
    if (!opts.more && !opts.force) {
      const hit = cacheGet<CachedList>(key);
      if (hit) { setKw({ rows: hit.rows, total: hit.total, status: 'done', error: null, cached: true }); return; }
    }
    const id = ++kwReq.current;
    const offset = opts.more ? kwRef.current.rows.length : 0;
    setKw((st) => ({ ...st, status: opts.more ? 'more' : 'loading', error: null, ...(opts.more ? {} : { rows: [], total: 0 }) }));
    try {
      const page = await once(`${key}@${offset}`, () => keywordSearch(q, { limit: KEYWORD_PAGE, offset, kinds: kind === 'all' ? null : [kind] }));
      if (id !== kwReq.current) return;
      const rows = opts.more ? [...kwRef.current.rows, ...page.rows] : page.rows;
      cacheSet<CachedList>(key, { rows, total: page.total }, !!opts.more);
      setKw({ rows, total: page.total, status: 'done', error: null, cached: false });
    } catch (e: any) {
      if (id !== kwReq.current) return;
      setKw((st) => ({ ...st, status: 'error', error: e?.message || 'Keyword search failed' }));
    }
  }, [q, kind]);

  // ---- Semantic ----
  // Always fetched at the slider's minimum and with collections included;
  // the visible list is filtered below, so the slider costs no request.
  const runSemantic = useCallback(async (opts: { more?: boolean; force?: boolean } = {}) => {
    if (!q || q.length < 2) { setSem(EMPTY); return; }
    const key = semKey(q);
    if (!opts.more && !opts.force) {
      const hit = cacheGet<CachedList>(key);
      if (hit) { setSem({ rows: hit.rows, total: hit.total, status: 'done', error: null, cached: true, tookMs: hit.tookMs }); return; }
    }
    const id = ++semReq.current;
    const offset = opts.more ? semRef.current.rows.length : 0;
    setSem((st) => ({ ...st, status: opts.more ? 'more' : 'loading', error: null, ...(opts.more ? {} : { rows: [], total: 0 }) }));
    try {
      const res = await once(`${key}@${offset}`, () => semanticSearch(q, { threshold: THRESHOLD_MIN, limit: SEMANTIC_FETCH, offset, includeCollections: true }));
      if (id !== semReq.current) return;
      const rows = opts.more ? [...semRef.current.rows, ...res.rows] : res.rows;
      cacheSet<CachedList>(key, { rows, total: res.total, tookMs: res.tookMs }, !!opts.more);
      setSem({ rows, total: res.total, status: 'done', error: null, cached: false, tookMs: res.tookMs });
    } catch (e: any) {
      if (id !== semReq.current) return;
      setSem((st) => ({ ...st, status: 'error', error: e?.message || 'Semantic search failed' }));
    }
  }, [q]);

  useEffect(() => { runKeyword(); }, [runKeyword]);
  useEffect(() => { runSemantic(); }, [runSemantic]);

  // A new query starts with the first page of results.
  const firstQ = useRef(true);
  useEffect(() => {
    if (firstQ.current) { firstQ.current = false; return; }
    setSemShown(SEMANTIC_PAGE);
  }, [q]);

  // Client-side confidence filter (rows arrive sorted by similarity).
  const semVisible = useMemo(
    () => sem.rows.filter((r) => (r.similarity ?? 0) >= threshold && (includeCollections || r.kind !== 'collection')),
    [sem.rows, threshold, includeCollections]
  );
  const semLast = sem.rows[sem.rows.length - 1];
  const semServerMore = sem.rows.length < sem.total && (semLast?.similarity ?? 0) >= threshold;
  const semRows = semVisible.slice(0, semShown);
  const semCountLabel = `${semVisible.length}${semServerMore ? '+' : ''}`;

  const showMoreSemantic = async () => {
    if (semVisible.length <= semShown && semServerMore) await runSemantic({ more: true });
    setSemShown((n) => n + SEMANTIC_PAGE);
  };

  // ---- Remember scroll position + expanded count; restore on Back ----
  useEffect(() => {
    const save = () => {
      try { sessionStorage.setItem(posKey, JSON.stringify({ y: window.scrollY, semShown })); } catch {}
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => { window.removeEventListener('scroll', save); };
  }, [posKey, semShown]);

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    const active = tab === 'semantic' ? sem : kw;
    if (active.status !== 'done' && active.status !== 'error') return;
    restored.current = true;
    const y = savedPos.current?.y;
    if (y && y > 0) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [tab, sem.status, kw.status]);

  const submit = (next: string) => {
    const p = new URLSearchParams(params);
    p.set('q', next);
    setParams(p);
  };
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p, { replace: true });
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next: Tab = tab === 'semantic' ? 'keyword' : 'semantic';
      setTab(next);
      document.getElementById(`tab-${next}`)?.focus();
    }
  };

  const busy = kw.status === 'loading' || sem.status === 'loading';
  const recPos = ((RECOMMENDED_THRESHOLD - THRESHOLD_MIN) / (THRESHOLD_MAX - THRESHOLD_MIN)) * 100;

  const tabCount = (st: ListState, label: string | number) =>
    st.status === 'loading' ? <Loader2 size={12} className="spin" aria-label="loading" />
      : st.status === 'error' ? <span className="tab-count tab-count--err">!</span>
      : q ? <span className="tab-count">{label}</span> : null;

  return (
    <div className="page search-page">
      <style>{SEARCH_CSS}</style>

      <header className="sp-head">
        <h1>Search</h1>
        <p className="muted">Search every finding and collection — by meaning (works best in Bangla) or by exact words.</p>
        <SearchBox initialValue={q} onSubmit={submit} busy={busy} autoFocus={!q} />
      </header>

      {!q ? (
        <section className="sp-intro">
          <div className="sp-modes">
            <div>
              <h2><Sparkles size={15} /> Semantic search</h2>
              <p className="muted">Finds passages that mean the same thing even when the words differ — ask a question or describe an idea. Each result shows how confident the match is.</p>
            </div>
            <div>
              <h2><TextSearch size={15} /> Keyword search</h2>
              <p className="muted">Finds findings, books and collections that contain all of your words. Instant, and the matching words are highlighted.</p>
            </div>
          </div>
          <p className="sp-try">Try:</p>
          <div className="sp-examples">
            {SEARCH_EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="sp-example" onClick={() => submit(ex)}>{ex}</button>
            ))}
          </div>
          {isAdmin && <IndexPanel />}
        </section>
      ) : (
        <>
          <div className="sp-tabs" role="tablist" aria-label="Search type" onKeyDown={onTabKey}>
            <button id="tab-semantic" role="tab" aria-selected={tab === 'semantic'} aria-controls="panel-semantic"
              tabIndex={tab === 'semantic' ? 0 : -1} className={`sp-tab ${tab === 'semantic' ? 'active' : ''}`} onClick={() => setTab('semantic')}>
              <Sparkles size={14} /> Semantic {tabCount(sem, semCountLabel)}
            </button>
            <button id="tab-keyword" role="tab" aria-selected={tab === 'keyword'} aria-controls="panel-keyword"
              tabIndex={tab === 'keyword' ? 0 : -1} className={`sp-tab ${tab === 'keyword' ? 'active' : ''}`} onClick={() => setTab('keyword')}>
              <TextSearch size={14} /> Keyword {tabCount(kw, kw.total)}
            </button>
          </div>

          {/* ---------------- Semantic ---------------- */}
          <section id="panel-semantic" role="tabpanel" aria-labelledby="tab-semantic" hidden={tab !== 'semantic'}>
            <div className="sp-controls">
              <div className="thr">
                <label htmlFor="thr-range" className="thr-label">
                  Minimum confidence <strong>{Math.round(threshold * 100)}%</strong>
                </label>
                <div className="thr-track">
                  <input id="thr-range" type="range" min={THRESHOLD_MIN} max={THRESHOLD_MAX} step={0.01}
                    value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
                    aria-describedby="thr-help" />
                  <span className="thr-rec" style={{ left: `${recPos}%` }} aria-hidden="true" title="Recommended" />
                </div>
                <div className="thr-scale" id="thr-help">
                  <span>More results</span>
                  {Math.abs(threshold - RECOMMENDED_THRESHOLD) > 0.001 ? (
                    <button type="button" className="link-btn" onClick={() => setThreshold(RECOMMENDED_THRESHOLD)}>
                      <RotateCcw size={11} /> Recommended: {Math.round(RECOMMENDED_THRESHOLD * 100)}%
                    </button>
                  ) : (
                    <span className="thr-is-rec">Recommended ({Math.round(RECOMMENDED_THRESHOLD * 100)}%)</span>
                  )}
                  <span>Closer matches</span>
                </div>
              </div>
              <label className="check sp-check">
                <input type="checkbox" checked={includeCollections} onChange={(e) => setIncludeCollections(e.target.checked)} />
                Include collections
              </label>
            </div>

            {sem.status === 'loading' && (<><SemanticLoading /><ResultSkeleton count={4} /></>)}

            {sem.status === 'error' && (
              <div className="state-block error" role="alert">
                <h3>Semantic search isn't available right now</h3>
                <p>Keyword search still works — or try again in a moment.</p>
                {isAdmin && sem.error && <p className="sp-tech">Details: {sem.error}</p>}
                <div className="state-actions">
                  <button className="primary" onClick={() => runSemantic({ force: true })}>Try again</button>
                  <button className="link-btn" onClick={() => setTab('keyword')}>Use keyword search</button>
                </div>
              </div>
            )}

            {q.length < 2 && sem.status === 'idle' && (
              <div className="state-block"><p>Type at least two characters for semantic search.</p></div>
            )}

            {(sem.status === 'done' || sem.status === 'more') && semVisible.length === 0 && (
              <div className="state-block">
                <h3>No passage reached {Math.round(threshold * 100)}% confidence</h3>
                <p>Lower the minimum confidence to see looser matches, or search for the exact words instead.</p>
                <div className="state-actions">
                  {threshold > THRESHOLD_MIN + 0.001 && (
                    <button className="primary" onClick={() => setThreshold(Math.max(THRESHOLD_MIN, Math.round((threshold - 0.1) * 100) / 100))}>
                      Lower to {Math.round(Math.max(THRESHOLD_MIN, threshold - 0.1) * 100)}%
                    </button>
                  )}
                  <button className="link-btn" onClick={() => setTab('keyword')}>Try keyword search</button>
                </div>
              </div>
            )}

            {semVisible.length > 0 && (
              <>
                <p className="sp-summary" role="status">
                  {semCountLabel} result{semVisible.length === 1 && !semServerMore ? '' : 's'} at ≥ {Math.round(threshold * 100)}% confidence
                  <span className="muted">
                    {sem.cached ? ' · saved results' : typeof sem.tookMs === 'number' ? ` · ${(sem.tookMs / 1000).toFixed(1)}s` : ''}
                    {' · '}
                  </span>
                  <button type="button" className="link-btn sp-refresh" onClick={() => { setSemShown(SEMANTIC_PAGE); runSemantic({ force: true }); }}>Refresh</button>
                </p>
                <ul className="sr-list">
                  {semRows.map((r) => <ResultItem key={`${r.kind}-${r.id}`} r={r} mode="semantic" terms={terms} threshold={threshold} />)}
                </ul>
                {sem.status === 'more' && <ResultSkeleton count={2} />}
                <div className="list-status">
                  {semVisible.length > semShown || semServerMore ? (
                    <button className="load-more-btn" disabled={sem.status === 'more'} onClick={showMoreSemantic}>
                      {sem.status === 'more' ? <><Loader2 size={13} className="spin" /> Loading…</>
                        : semVisible.length > semShown ? `Show more (${semVisible.length - semShown}${semServerMore ? '+' : ''} left)` : 'Show more'}
                    </button>
                  ) : <span>End of results</span>}
                </div>
              </>
            )}

            {isAdmin && <IndexPanel />}
          </section>

          {/* ---------------- Keyword ---------------- */}
          <section id="panel-keyword" role="tabpanel" aria-labelledby="tab-keyword" hidden={tab !== 'keyword'}>
            <div className="sp-kinds" role="group" aria-label="Filter by type">
              {(['all', 'heading', 'book', 'collection'] as KindFilter[]).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} className={`sp-kind ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
                  {k === 'all' ? 'All' : k === 'heading' ? 'Findings' : k === 'book' ? 'Books' : 'Collections'}
                </button>
              ))}
            </div>

            {kw.status === 'loading' && <ResultSkeleton count={5} />}

            {kw.status === 'error' && (
              <div className="state-block error" role="alert">
                <h3>Keyword search failed</h3>
                <p>Check your connection and try again.</p>
                {isAdmin && kw.error && <p className="sp-tech">Details: {kw.error}</p>}
                <div className="state-actions"><button className="primary" onClick={() => runKeyword({ force: true })}>Try again</button></div>
              </div>
            )}

            {(kw.status === 'done' || kw.status === 'more') && kw.rows.length === 0 && (
              <div className="state-block">
                <h3>Nothing contains all of these words</h3>
                <p>Check the spelling, use fewer words, or search by meaning instead.</p>
                <div className="state-actions">
                  {kind !== 'all' && <button className="link-btn" onClick={() => setKind('all')}>Show all types</button>}
                  <button className="primary" onClick={() => setTab('semantic')}>Try semantic search</button>
                </div>
              </div>
            )}

            {kw.rows.length > 0 && (
              <>
                <p className="sp-summary" role="status">
                  {kw.total} result{kw.total === 1 ? '' : 's'} containing “{q}”
                  <span className="muted">{kw.cached ? ' · saved results' : ''} · </span>
                  <button type="button" className="link-btn sp-refresh" onClick={() => runKeyword({ force: true })}>Refresh</button>
                </p>
                <ul className="sr-list">
                  {kw.rows.map((r) => <ResultItem key={`${r.kind}-${r.id}`} r={r} mode="keyword" terms={terms} threshold={threshold} />)}
                </ul>
                {kw.status === 'more' && <ResultSkeleton count={2} />}
                <div className="list-status">
                  {kw.rows.length < kw.total ? (
                    <button className="load-more-btn" disabled={kw.status === 'more'} onClick={() => runKeyword({ more: true })}>
                      {kw.status === 'more' ? <><Loader2 size={13} className="spin" /> Loading…</> : `Show more (${kw.total - kw.rows.length} left)`}
                    </button>
                  ) : <span>End of results</span>}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const SEARCH_CSS = `
.search-page { max-width: 860px; }
.sp-head { padding: 0.4rem 0 1rem; }
.sp-head h1 { margin: 0 0 0.2rem; font-size: 1.5rem; }
.sp-head > p { margin: 0 0 0.9rem; }

.sp-intro { margin-top: 0.6rem; }
.sp-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 1.4rem; padding: 1rem 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.sp-modes h2 { font-size: 0.98rem; margin: 0 0 0.3rem; display: flex; align-items: center; gap: 0.4rem; }
.sp-modes h2 svg { color: var(--accent); }
.sp-modes p { margin: 0; }
.sp-try { font-size: 0.8rem; color: var(--muted); margin: 1rem 0 0.4rem; font-weight: 600; }
.sp-examples { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.sp-example { border: 1px solid var(--border); border-radius: 6px; padding: 0.35rem 0.7rem; font-size: 0.84rem; background: var(--surface); color: var(--fg); text-align: left; }
.sp-example:hover { border-color: var(--accent); color: var(--accent); }

.sp-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 0.9rem; }
.sp-tab { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.6rem 0.9rem; font-size: 0.9rem; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.sp-tab:hover { color: var(--fg); }
.sp-tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.tab-count { font-size: 0.72rem; font-weight: 600; background: color-mix(in srgb, var(--fg) 8%, transparent); color: var(--fg); border-radius: 4px; padding: 0 0.35rem; min-width: 1.3rem; text-align: center; }
.sp-tab.active .tab-count { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.tab-count--err { background: color-mix(in srgb, #c0392b 15%, transparent) !important; color: #c0392b !important; }

.sp-controls { display: flex; align-items: flex-end; gap: 1.2rem; flex-wrap: wrap; margin-bottom: 0.9rem; padding: 0.75rem 0.9rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
.thr { flex: 1; min-width: 240px; }
.thr-label { font-size: 0.82rem; color: var(--muted); display: block; margin-bottom: 0.3rem; }
.thr-label strong { color: var(--fg); font-variant-numeric: tabular-nums; }
.thr-track { position: relative; }
.thr-track input[type=range] { width: 100%; accent-color: var(--accent); margin: 0.3rem 0; height: 22px; }
.thr-rec { position: absolute; top: -2px; width: 2px; height: 8px; background: var(--fg); opacity: 0.55; transform: translateX(-1px); pointer-events: none; }
.thr-scale { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.72rem; color: var(--muted); }
.thr-scale .link-btn { font-size: 0.74rem; display: inline-flex; align-items: center; gap: 0.25rem; }
.thr-is-rec { color: var(--accent); font-weight: 600; }
.sp-check { font-size: 0.84rem; padding-bottom: 0.2rem; }

.sp-kinds { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.9rem; }
.sp-kind { border: 1px solid var(--border); border-radius: 6px; padding: 0.3rem 0.75rem; font-size: 0.82rem; color: var(--muted); background: var(--bg); }
.sp-kind:hover { color: var(--fg); border-color: color-mix(in srgb, var(--fg) 30%, var(--border)); }
.sp-kind.active { color: var(--accent); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--bg)); font-weight: 600; }

.sp-summary { font-size: 0.82rem; color: var(--fg); margin: 0 0 0.4rem; }
.sp-refresh { font-size: 0.78rem; }
.sp-tech { font-family: ui-monospace, monospace; font-size: 0.74rem !important; word-break: break-word; }

.sr-list { list-style: none; margin: 0; padding: 0; }
.sr-item { border-bottom: 1px solid var(--border); animation: srIn 0.25s ease both; }
.sr-item--sk { animation: none; }
@keyframes srIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.sr-link { display: flex; gap: 0.85rem; padding: 0.85rem 0.4rem; text-decoration: none; color: inherit; border-radius: 6px; }
a.sr-link:hover { background: color-mix(in srgb, var(--accent) 5%, transparent); }
a.sr-link:hover .sr-title { color: var(--accent); }
.sr-thumb { width: 44px; height: 60px; flex-shrink: 0; border-radius: 4px; overflow: hidden; background: var(--border); }
.sr-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sr-thumb-ph { display: block; width: 100%; height: 100%; opacity: 0.55; }
.sr-body { flex: 1; min-width: 0; }
.sr-top { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.2rem; }
.sr-kind { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.7rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.sr-title { margin: 0 0 0.15rem; font-size: 1.02rem; font-weight: 700; line-height: 1.4; word-break: break-word; }
.sr-meta { margin: 0 0 0.35rem; font-size: 0.8rem; color: var(--muted); }
.sr-snippet { margin: 0; font-size: 0.88rem; color: color-mix(in srgb, var(--fg) 82%, var(--muted)); line-height: 1.65;
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
.sr-conf { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.74rem; color: var(--muted); white-space: nowrap; }
.sr-conf strong { color: var(--fg); font-variant-numeric: tabular-nums; }
.sr-conf-bar { width: 56px; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--fg) 10%, transparent); overflow: hidden; }
.sr-conf-bar span { display: block; height: 100%; border-radius: 3px; background: var(--accent); transition: width 0.4s ease; }
.sr-conf--1 .sr-conf-bar span { opacity: 0.45; }
.sr-conf--2 .sr-conf-bar span { opacity: 0.75; }
.sr-conf--3 .sr-conf-label { color: var(--accent); font-weight: 600; }

.sem-loading { border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 0.9rem; margin-bottom: 0.4rem; background: var(--surface); }
.sem-loading-row { display: flex; align-items: center; gap: 0.7rem; font-size: 0.86rem; }
.sem-step { flex: 1; animation: semStep 0.35s ease; }
@keyframes semStep { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
.sem-elapsed { font-size: 0.74rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.sem-orbit { position: relative; width: 18px; height: 18px; flex-shrink: 0; }
.sem-orbit span { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); top: 6px; left: 6px; animation: semOrbit 1.2s linear infinite; }
.sem-orbit span:nth-child(2) { animation-delay: -0.4s; opacity: 0.7; }
.sem-orbit span:nth-child(3) { animation-delay: -0.8s; opacity: 0.4; }
@keyframes semOrbit { from { transform: rotate(0deg) translateX(7px) rotate(0deg); } to { transform: rotate(360deg) translateX(7px) rotate(-360deg); } }
.sem-track { position: relative; height: 2px; margin-top: 0.65rem; background: color-mix(in srgb, var(--fg) 8%, transparent); overflow: hidden; border-radius: 2px; }
.sem-track span { position: absolute; top: 0; bottom: 0; width: 30%; left: -30%; background: var(--accent); animation: sboxSlide 1.3s ease-in-out infinite; }

.idx-panel { margin-top: 1.4rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
.idx-panel summary { list-style: none; cursor: pointer; padding: 0.6rem 0.85rem; font-size: 0.85rem; font-weight: 600; display: flex; align-items: center; gap: 0.45rem; }
.idx-panel summary::-webkit-details-marker { display: none; }
.idx-chev { margin-left: auto; transition: transform 0.15s; }
.idx-panel[open] .idx-chev { transform: rotate(180deg); }
.idx-body { padding: 0 0.85rem 0.85rem; }
.idx-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.6rem; margin: 0 0 0.7rem; }
.idx-stats dt { font-size: 0.72rem; color: var(--muted); }
.idx-stats dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.idx-actions { display: flex; gap: 0.9rem; align-items: center; flex-wrap: wrap; }
.idx-actions .secondary { display: inline-flex; align-items: center; gap: 0.3rem; }
.idx-running { font-size: 0.84rem; display: flex; align-items: center; gap: 0.4rem; }
.idx-note { margin: 0.6rem 0 0; font-size: 0.78rem; }

@media (max-width: 640px) {
  .sp-modes { grid-template-columns: 1fr; gap: 0.9rem; }
  .sp-tab { flex: 1; justify-content: center; padding: 0.6rem 0.4rem; }
  .sr-thumb { width: 36px; height: 50px; }
  .sr-link { padding: 0.75rem 0.1rem; gap: 0.65rem; }
  .sr-conf-label { display: none; }
  .sp-controls { padding: 0.7rem; }
}
@media (prefers-reduced-motion: reduce) {
  .sr-item, .sem-step { animation: none; }
  .sem-orbit span, .sem-track span { animation: none; }
}
`;