// Single Vercel Serverless Function that serves every AI-facing endpoint.
// vercel.json rewrites the public URLs to /api/ai?route=…
import { createHash } from 'node:crypto';
import {
  HttpError, siteUrlOf, loadBook, renderBookJson, renderBookFull, renderBookPart, partForFinding, renderIndexPart, renderKeywordsPart,
  neighborBookUrl, renderMasterIndex, renderSynonyms, loadFinding, renderFindingTxt, loadCollection, collectionJson, renderCollectionTxt,
  renderLlms, renderOpenApi, qualityReport, exampleFindings, searchFindings, verifyText,
} from './_lib/core.js';
import * as docs from './_lib/docs.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': '*' };
const CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';
const TEXT = 'text/plain; charset=utf-8';
const JSONT = 'application/json; charset=utf-8';
const TSV = 'text/tab-separated-values; charset=utf-8';
const num = (v, d = 1) => (v === undefined || v === '' ? d : Number(v));
const safeName = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 60) || 'book';

function params(req) {
  const u = new URL(req.url || '/', 'http://local');
  return { ...Object.fromEntries(u.searchParams.entries()), ...(req.query || {}) };
}

function send(req, res, status, body, type, extra = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  for (const [k, v] of Object.entries({ ...CORS, ...extra })) res.setHeader(k, v);
  if (status === 200 && typeof body === 'string' && body.length > 0) {
    const etag = 'W/"' + createHash('sha1').update(body).digest('hex').slice(0, 20) + '"';
    res.setHeader('ETag', etag);
    if (req.headers?.['if-none-match'] === etag) { res.statusCode = 304; return res.end(); }
  }
  res.end(req.method === 'HEAD' ? undefined : body);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(req, res, 204, '', TEXT);
  const site = siteUrlOf(req);
  const p = params(req);
  const out = (body, type = TEXT, extra = {}) => send(req, res, 200, body, type, { 'Cache-Control': CACHE, ...extra });
  try {
    switch (p.route) {
      case 'llms': return out(await renderLlms(site, docs));
      case 'skill': return out(docs.skillMd(site, await exampleFindings(site)));
      case 'search-doc': return out(docs.searchMd(site));
      case 'citation-doc': return out(docs.citationMd(site));
      case 'master-index': return out(await renderMasterIndex(site), TSV);
      case 'synonyms': return out(renderSynonyms(site));
      case 'openapi': return out(await renderOpenApi(site), JSONT);
      case 'quality': return out(JSON.stringify(await qualityReport(site), null, 1), JSONT);
      case 'finding': return out(renderFindingTxt(await loadFinding(p.id, site)));

      case 'book': {
        const model = await loadBook(p.slug, site);
        const headers = { 'X-Content-Version': model.version.content_version };
        if (p.download === '1') {
          const fmt = p.format === 'json' ? 'json' : 'txt';
          return out(fmt === 'json' ? renderBookJson(model, site) : renderBookFull(model, site), fmt === 'json' ? JSONT : TEXT,
            { ...headers, 'Content-Disposition': `attachment; filename="${safeName(model.book.alias)}.${fmt}"` });
        }
        if (p.format === 'json') return out(renderBookJson(model, site), JSONT, headers);
        // .txt = part 1. Legacy ?from=<finding no.> jumps to the part that contains it.
        const n = p.from ? partForFinding(model, Math.max(0, num(p.from, 1) - 1)) : 1;
        return out(renderBookPart(model, site, n).text, TEXT, headers);
      }
      case 'part': { const m = await loadBook(p.slug, site); return out(renderBookPart(m, site, num(p.n)).text, TEXT, { 'X-Content-Version': m.version.content_version }); }
      case 'bindex': { const m = await loadBook(p.slug, site); return out(renderIndexPart(m, site, num(p.n), await neighborBookUrl(site, m.book.id, 'index')), TSV, { 'X-Content-Version': m.version.content_version }); }
      case 'bkeywords': { const m = await loadBook(p.slug, site); return out(renderKeywordsPart(m, site, num(p.n), await neighborBookUrl(site, m.book.id, 'keywords')), TSV, { 'X-Content-Version': m.version.content_version }); }
      case 'collection': {
        const m = await loadCollection(p.id, site);
        const full = p.full === '1';
        return p.format === 'json' ? out(collectionJson(m, site, full), JSONT) : out(renderCollectionTxt(m, site, full));
      }
      case 'search': return send(req, res, 200, JSON.stringify(await searchFindings(site, p), null, 1), JSONT, { 'Cache-Control': 'public, s-maxage=60' });
      case 'verify': return send(req, res, 200, JSON.stringify(await verifyText(site, p), null, 1), JSONT, { 'Cache-Control': 'public, s-maxage=60' });
      default: throw new HttpError(404, 'Unknown AI route.');
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const wantsJson = ['search', 'verify', 'quality'].includes(p.route) || p.format === 'json';
    const msg = e instanceof HttpError ? e.message : `Unexpected error: ${e.message}`;
    return send(req, res, status, wantsJson ? JSON.stringify({ error: msg }) : `Error ${status}: ${msg}\n`, wantsJson ? JSONT : TEXT);
  }
}
