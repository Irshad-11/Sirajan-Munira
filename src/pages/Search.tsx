import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchResult, siteSearch } from '../lib/supabase';

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  book: 'Book',
  category: 'Collection',
  heading: 'Finding',
};

function ResultRow({ r }: { r: SearchResult }) {
  return (
    <Link to={r.href} className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
      {r.image ? <img src={r.image} alt="" className="row-thumb" /> : <div className="row-thumb-placeholder" />}
      <div className="row-body">
        <p className="row-meta">{TYPE_LABEL[r.type]}</p>
        <p className="row-title">{r.title}</p>
        {r.subtitle && <p className="row-excerpt">{r.subtitle}</p>}
      </div>
    </Link>
  );
}

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) return setResults([]);
    setLoading(true);
    siteSearch(q)
      .then(setResults)
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div className="page search-page">
      <div className="page-head">
        <h1>Search results for "{q}"</h1>
      </div>
      {loading && <p className="muted">Searching…</p>}
      {!loading && results.length === 0 && q && <p className="muted">Nothing found.</p>}
      <div className="row-list">
        {results.map((r) => <ResultRow key={`${r.type}-${r.id}`} r={r} />)}
      </div>
    </div>
  );
}