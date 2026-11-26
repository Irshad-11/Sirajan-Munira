// Single Vercel Serverless Function that serves every AI-facing endpoint.
// vercel.json rewrites the public URLs to /api/ai?route=…
import {
  HttpError, siteUrlOf, loadBook, renderBookJson, renderBookTxt, renderLlms,
  loadCollection, renderCollectionTxt, searchFindings, verifyText,
} from './_lib/core.js';
import { SKILL_MD, SEARCH_MD, CITATION_MD } from './_lib/docs.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': '*' };
const CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';
const TEXT = 'text/plain; charset=utf-8';

const fill = (md, site) => md.replaceAll('{{SITE}}', site);
const safeName = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 60) || 'book';

function params(req) {
  const u = new URL(req.url || '/', 'http://local');
  const p = Object.fromEntries(u.searchParams.entries());
  return { ...p, ...(req.query || {}) };
}

function send(res, status, body, type, extra = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  for (const [k, v] of Object.entries({ ...CORS, ...extra })) res.setHeader(k, v);
  res.end(body);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, '', TEXT);
  const site = siteUrlOf(req);
  const p = params(req);
  try {
    switch (p.route) {
      case 'llms': return send(res, 200, await renderLlms(site), TEXT, { 'Cache-Control': CACHE });
      case 'skill': return send(res, 200, fill(SKILL_MD, site), TEXT, { 'Cache-Control': CACHE });
      case 'search-doc': return send(res, 200, fill(SEARCH_MD, site), TEXT, { 'Cache-Control': CACHE });
      case 'citation-doc': return send(res, 200, fill(CITATION_MD, site), TEXT, { 'Cache-Control': CACHE });

      case 'book': {
        const model = await loadBook(p.slug, site);
        const format = p.format === 'json' ? 'json' : 'txt';
        const download = p.download === '1';
        const dl = download ? { 'Content-Disposition': `attachment; filename="${safeName(model.book.slug)}.${format}"` } : {};
        const headers = { 'Cache-Control': CACHE, 'X-Content-Version': model.version.content_version, ...dl };
        if (format === 'json') return send(res, 200, renderBookJson(model, site), 'application/json; charset=utf-8', headers);
        const { text, next } = renderBookTxt(model, site, { from: Math.max(0, Number(p.from) || 0) });
        return send(res, 200, text, TEXT, { ...headers, ...(next !== null ? { 'X-Next-Part': String(next) } : {}) });
      }
      case 'collection': {
        const m = await loadCollection(p.id, site);
        if (p.format === 'json') return send(res, 200, JSON.stringify({ schema: 'sirajan-munira/collection@1', ...m }, null, 1), 'application/json; charset=utf-8', { 'Cache-Control': CACHE });
        return send(res, 200, renderCollectionTxt(m), TEXT, { 'Cache-Control': CACHE });
      }
      case 'search': return send(res, 200, JSON.stringify(await searchFindings(site, p), null, 1), 'application/json; charset=utf-8', { 'Cache-Control': 'public, s-maxage=60' });
      case 'verify': return send(res, 200, JSON.stringify(await verifyText(site, p), null, 1), 'application/json; charset=utf-8', { 'Cache-Control': 'public, s-maxage=60' });
      default: throw new HttpError(404, 'Unknown AI route.');
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const wantsJson = p.route === 'search' || p.route === 'verify' || p.format === 'json';
    const msg = e instanceof HttpError ? e.message : `Unexpected error: ${e.message}`;
    return send(res, status, wantsJson ? JSON.stringify({ error: msg }) : `Error ${status}: ${msg}\n`, wantsJson ? 'application/json; charset=utf-8' : TEXT);
  }
}
