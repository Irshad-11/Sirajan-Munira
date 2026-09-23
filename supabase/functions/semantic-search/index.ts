// ============================================================================
// Edge Function: semantic-search
// ----------------------------------------------------------------------------
// POST { query, threshold?, limit?, offset?, includeCollections? }
//  → { results: SemanticRow[], total, cached, model, tookMs }
//
// 1. Normalises the query and embeds it with gemini-embedding-001
//    (Gemini API free tier; query embeddings are cached in
//    `search_query_cache`, so repeat searches cost no API call).
// 2. Calls the `sm_semantic_search` RPC. The caller's own login token is
//    forwarded when present, so admins also see hidden books; guests only
//    ever see visible content (normal RLS).
//
// Secrets needed:  GEMINI_API_KEY
// Auto-provided:   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Deploy with JWT verification OFF (the function is public).
// Dashboard: Edge Functions → this function → Details → turn OFF
// "Enforce JWT Verification" (CLI: --no-verify-jwt).
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'gemini-embedding-001';
const DIMS = 1536; // must match vector(1536) in the SQL migration

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SECRET_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function normalizeQuery(q: string) {
  return q.normalize('NFC').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
}

function clamp(n: number, lo: number, hi: number, fallback: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function l2normalize(v: number[]) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// gemini-embedding-001 takes a task type; outputs below 3072 dims must be
// L2-normalised by us (done in l2normalize).
async function embed(texts: string[], taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT'): Promise<number[][]> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY secret is not set');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;
  const body = JSON.stringify({
    requests: texts.map((text) => ({
      model: `models/${MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: DIMS,
    })),
  });
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body });
    if (res.ok) {
      const j = await res.json();
      return (j.embeddings ?? []).map((e: { values: number[] }) => l2normalize(e.values));
    }
    lastErr = `${res.status} ${await res.text()}`;
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
    break;
  }
  throw new Error(`Gemini embedding request failed: ${lastErr.slice(0, 300)}`);
}

async function queryEmbedding(query: string): Promise<{ embedding: number[]; cached: boolean }> {
  const hash = await sha256(`${MODEL}:${DIMS}:${query.toLowerCase()}`);
  const { data: hit } = await admin.from('search_query_cache').select('embedding, hits').eq('query_hash', hash).maybeSingle();
  if (hit?.embedding) {
    const embedding = typeof hit.embedding === 'string' ? JSON.parse(hit.embedding) : hit.embedding;
    const touch = admin.from('search_query_cache')
      .update({ hits: (hit.hits ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq('query_hash', hash);
    // Don't make the reader wait for bookkeeping.
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(touch); else await touch;
    return { embedding, cached: true };
  }
  const [embedding] = await embed([query], 'RETRIEVAL_QUERY');
  await admin.from('search_query_cache').upsert({
    query_hash: hash, query, model: MODEL, embedding: JSON.stringify(embedding),
  });
  return { embedding, cached: false };
}

// Forward the caller's token only when it is a signed-in user's JWT.
function rpcClientFor(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  let forward = false;
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      forward = payload?.role === 'authenticated';
    } catch { /* not a JWT */ }
  }
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: forward ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const started = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const query = normalizeQuery(String(body.query ?? ''));
    if (query.length < 2) return json({ error: 'query_too_short' }, 400);
    if (query.length > 300) return json({ error: 'query_too_long' }, 400);

    const threshold = clamp(Number(body.threshold), 0, 1, 0.55);
    const limit = Math.round(clamp(Number(body.limit), 1, 50, 20));
    const offset = Math.round(clamp(Number(body.offset), 0, 500, 0));
    const includeCollections = body.includeCollections !== false;

    const { embedding, cached } = await queryEmbedding(query);

    const { data, error } = await rpcClientFor(req).rpc('sm_semantic_search', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: threshold,
      match_count: limit,
      match_offset: offset,
      include_collections: includeCollections,
    });
    if (error) throw new Error(`sm_semantic_search: ${error.message}`);

    const rows = data ?? [];
    return json({
      results: rows,
      total: rows.length ? Number(rows[0].total_count) : 0,
      cached,
      model: MODEL,
      tookMs: Date.now() - started,
    });
  } catch (e) {
    console.error(e);
    return json({ error: 'search_failed', message: e instanceof Error ? e.message : String(e) }, 500);
  }
});