import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchResult, siteSearch } from '../lib/supabase';

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

  const grouped = {
    book: results.filter((r) => r.type === 'book'),
    category: results.filter((r) => r.type === 'category'),
    heading: results.filter((r) => r.type === 'heading'),
  };

  return (
    <div className="page search-page">
      <h1>সার্চ ফলাফল / Search results for "{q}"</h1>
      {loading && <p className="muted">খোঁজা হচ্ছে…</p>}
      {!loading && results.length === 0 && q && <p className="muted">কিছু পাওয়া যায়নি। / Nothing found.</p>}

      {grouped.book.length > 0 && (
        <section>
          <h3>বই / Books</h3>
          {grouped.book.map((r) => <Link key={r.id} to={r.href} className="search-result-row"><strong>{r.title}</strong>{r.subtitle && <span className="muted"> — {r.subtitle}</span>}</Link>)}
        </section>
      )}
      {grouped.category.length > 0 && (
        <section>
          <h3>কালেকশন / Collections</h3>
          {grouped.category.map((r) => <Link key={r.id} to={r.href} className="search-result-row"><strong>{r.title}</strong></Link>)}
        </section>
      )}
      {grouped.heading.length > 0 && (
        <section>
          <h3>ফাইন্ডিংস / Findings</h3>
          {grouped.heading.map((r) => (
            <Link key={r.id} to={r.href} className="search-result-row">
              <strong>{r.title}</strong>
              {r.subtitle && <p className="muted excerpt">{r.subtitle}</p>}
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
