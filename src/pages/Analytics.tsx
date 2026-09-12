import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AnalyticsSummary, exportAllData, getAnalyticsSummary, getHeading, getBookBySlug, importAllData } from '../lib/supabase';
import { useAdmin } from '../lib/context';

export default function Analytics() {
  const { isAdmin, loading } = useAdmin();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [bookTitles, setBookTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isAdmin) return;
    getAnalyticsSummary().then(async (s) => {
      setSummary(s);
      const entries = await Promise.all(
        s.topHeadings.map(async (h) => {
          const heading = await getHeading(h.target_id).catch(() => null);
          return [h.target_id, heading ? `heading ${heading.id.slice(0, 8)}…` : h.target_id] as const;
        })
      );
      setBookTitles(Object.fromEntries(entries));
    });
  }, [isAdmin]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const doExport = async () => {
    setBusy(true);
    try {
      const blob = await exportAllData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sirajan-munira-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file: File) => {
    if (!confirm('Import will upsert records into your database. Continue?')) return;
    setBusy(true);
    try {
      const text = await file.text();
      await importAllData(JSON.parse(text));
      alert('Import complete.');
    } catch (e: any) {
      alert(e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page analytics-page">
      <h1>Analytics</h1>
      {summary ? (
        <div className="analytics-cards">
          <div className="stat-card"><span className="stat-num">{summary.totalVisits}</span><span>Total visits</span></div>
          <div className="stat-card"><span className="stat-num">{summary.uniqueVisitors}</span><span>Unique visitors (best-effort)</span></div>
        </div>
      ) : (
        <p className="muted">Loading…</p>
      )}

      <h3>Most-opened headings</h3>
      <ul className="analytics-list">
        {summary?.topHeadings.map((h) => <li key={h.target_id}>{bookTitles[h.target_id] || h.target_id} — {h.count} interactions</li>)}
        {summary && summary.topHeadings.length === 0 && <p className="muted">No interaction data yet.</p>}
      </ul>

      <h3>Most-opened books</h3>
      <ul className="analytics-list">
        {summary?.topBooks.map((b) => <li key={b.target_id}>{b.target_id} — {b.count} views</li>)}
        {summary && summary.topBooks.length === 0 && <p className="muted">No view data yet.</p>}
      </ul>

      <p className="muted">Scope note: detailed traffic-source breakdown, bounce rate, scroll depth, and device/browser/geo segmentation are intentionally out of scope for v1 (see SRS §4.11).</p>

      <hr />
      <h3>Data export / import</h3>
      <p className="muted">Export a portable JSON snapshot of everything except Storage binaries (covers, banners, detail images stay linked by URL).</p>
      <button className="primary" disabled={busy} onClick={doExport}>Export all data (JSON)</button>
      <label className="secondary import-btn">
        Import JSON
        <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
      </label>
    </div>
  );
}
