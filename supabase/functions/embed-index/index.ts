// ============================================================================
// Edge Function: embed-index
// ----------------------------------------------------------------------------
// Builds / refreshes the semantic index with gemini-embedding-001
// (Gemini API free tier — batches are small and paced to stay under the
// free per-minute limits; a rate-limited run just stops early and the next
// run continues where it left off).
//
// POST { action: 'status' }  → counts of indexed / pending items
// POST { action: 'run' }     → embeds the next batch of new or edited
//                               findings + collections, returns counts
// POST { action: 'reset' }   → marks everything stale (re-index all)
//
// Who may call it: a signed-in admin (the app sends the login token
// automatically) or a scheduler that sends header `x-cron-secret` equal to
// the CRON_SECRET secret.
//
// Secrets needed:  GEMINI_API_KEY   (optional: CRON_SECRET)
// Auto-provided:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy with JWT verification OFF (auth is checked inside).
// Dashboard: Edge Functions → this function → Details → turn OFF
// "Enforce JWT Verification" (CLI: --no-verify-jwt).
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'gemini-embedding-001';
const DIMS = 1536;               // must match vector(1536) in the SQL migration
const HEADINGS_PER_RUN = 5;      // small runs: friendly to free-tier limits
const COLLECTIONS_PER_RUN = 10;
const EMBED_BATCH = 20;          // texts per Gemini batch request
const MAX_INPUT_CHARS = 3500;    // model limit is 2,048 tokens per text
const CHUNK_TARGET = 650;        // characters per passage (soft)
const CHUNK_HARD = 1100;         // characters per passage (hard)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SECRET_KEY') ?? '';
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function l2normalize(v: number[]) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

class RateLimited extends Error {}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY secret is not set');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;
  const body = JSON.stringify({
    requests: texts.map((text) => ({
      model: `models/${MODEL}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: DIMS,
    })),
  });
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body });
    if (res.ok) {
      const j = await res.json();
      const out = (j.embeddings ?? []).map((e: { values: number[] }) => l2normalize(e.values));
      if (out.length !== texts.length) throw new Error(`Gemini returned ${out.length} embeddings for ${texts.length} texts`);
      return out;
    }
    lastErr = `${res.status} ${await res.text()}`;
    if (res.status === 429 || res.status >= 500) { await sleep(4000 * (attempt + 1)); continue; }
    break;
  }
  if (lastErr.startsWith('429')) throw new RateLimited('Gemini free-tier rate limit reached — wait a minute and run again.');
  throw new Error(`Gemini embedding request failed: ${lastErr.slice(0, 300)}`);
}

async function embedAll(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    if (i > 0) await sleep(1200);   // pace requests for the free tier
    out.push(...(await embedBatch(texts.slice(i, i + EMBED_BATCH))));
  }
  return out;
}

// ---------------------------------------------------------------------------
// TipTap JSON → passages
// The text must match what the reader sees on the page (same order, no
// invented characters) so the book page can find and highlight a passage.
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type PMNode = { type?: string; text?: string; attrs?: any; content?: PMNode[] };

function inlineText(node: PMNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(inlineText).join('');
}

function blockTexts(doc: PMNode | null): string[] {
  const out: string[] = [];
  const visit = (node: PMNode) => {
    switch (node.type) {
      case 'heading':
      case 'paragraph':
        out.push(inlineText(node));
        break;
      case 'accordion':
        if (node.attrs?.title) out.push(String(node.attrs.title));
        (node.content ?? []).forEach(visit);
        break;
      default:
        (node.content ?? []).forEach(visit);
    }
  };
  (doc?.content ?? []).forEach(visit);
  return out.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function splitLong(text: string, hard: number): string[] {
  const sentences = text.split(/(?<=[.!?।॥])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (s.length > hard) {
      if (cur) { out.push(cur); cur = ''; }
      for (let i = 0; i < s.length; i += hard) out.push(s.slice(i, i + hard));
      continue;
    }
    if (cur && cur.length + s.length + 1 > hard) { out.push(cur); cur = s; }
    else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

function toChunks(blocks: string[]): string[] {
  const pieces = blocks.flatMap((b) => (b.length > CHUNK_HARD ? splitLong(b, CHUNK_HARD) : [b]));
  const chunks: string[] = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && cur.length + p.length + 1 > CHUNK_TARGET) { chunks.push(cur); cur = p; }
    else cur = cur ? `${cur}\n${p}` : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ---------------------------------------------------------------------------

async function status() {
  const { data, error } = await admin.rpc('sm_embedding_status', { p_model: MODEL });
  if (error) throw new Error(`sm_embedding_status: ${error.message}`);
  const s = (data ?? [])[0] ?? {};
  return {
    model: MODEL,
    headingsTotal: Number(s.headings_total ?? 0),
    headingsPending: Number(s.headings_pending ?? 0),
    collectionsTotal: Number(s.collections_total ?? 0),
    collectionsPending: Number(s.collections_pending ?? 0),
    chunksTotal: Number(s.chunks_total ?? 0),
  };
}

async function runBatch() {
  // ---- Findings (headings) ----
  const { data: pending, error } = await admin.rpc('sm_pending_headings', { p_model: MODEL, p_limit: HEADINGS_PER_RUN });
  if (error) throw new Error(`sm_pending_headings: ${error.message}`);

  // deno-lint-ignore no-explicit-any
  const items = (pending ?? []).map((h: any) => {
    const chunks = toChunks(blockTexts(h.content));
    const header = `${h.book_title ?? ''} — ${h.title_text ?? ''}`.trim();
    return {
      id: h.id as string,
      hash: h.content_hash as string,
      chunks,
      // The book + finding title gives each passage context.
      inputs: chunks.map((c) => `${header}\n${c}`.slice(0, MAX_INPUT_CHARS)),
    };
  });

  const allInputs = items.flatMap((it: { inputs: string[] }) => it.inputs);
  const vectors = allInputs.length ? await embedAll(allInputs) : [];

  let cursor = 0;
  let chunkCount = 0;
  for (const it of items) {
    const payload = it.chunks.map((content: string, index: number) => ({
      index, content, embedding: vectors[cursor + index],
    }));
    cursor += it.chunks.length;
    chunkCount += it.chunks.length;
    const { error: storeErr } = await admin.rpc('sm_store_heading_chunks', {
      p_heading_id: it.id, p_hash: it.hash, p_model: MODEL, p_chunks: payload,
    });
    if (storeErr) throw new Error(`sm_store_heading_chunks: ${storeErr.message}`);
  }

  // ---- Collections ----
  const { data: cats, error: catErr } = await admin.rpc('sm_pending_categories', { p_model: MODEL, p_limit: COLLECTIONS_PER_RUN });
  if (catErr) throw new Error(`sm_pending_categories: ${catErr.message}`);
  // deno-lint-ignore no-explicit-any
  const catRows = (cats ?? []) as any[];
  if (catRows.length) {
    const catVectors = await embedAll(catRows.map((c) => String(c.doc).slice(0, MAX_INPUT_CHARS)));
    for (let i = 0; i < catRows.length; i++) {
      const c = catRows[i];
      const { error: e2 } = await admin.rpc('sm_store_category_embedding', {
        p_category_id: c.id, p_hash: c.doc_hash, p_model: MODEL, p_content: c.doc,
        p_embedding: JSON.stringify(catVectors[i]),
      });
      if (e2) throw new Error(`sm_store_category_embedding: ${e2.message}`);
    }
  }

  return { processedHeadings: items.length, processedCollections: catRows.length, chunksWritten: chunkCount };
}

async function isAuthorized(req: Request) {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) return true;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (token.split('.').length !== 3) return false;
  const { data } = await admin.auth.getUser(token);
  return !!data?.user;   // every signed-in user is an admin in this app
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    if (!(await isAuthorized(req))) return json({ error: 'unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'run';
    const started = Date.now();

    if (action === 'status') return json(await status());
    if (action === 'reset') {
      const { error } = await admin.rpc('sm_mark_all_stale');
      if (error) throw new Error(`sm_mark_all_stale: ${error.message}`);
      return json(await status());
    }
    if (action === 'run') {
      try {
        const result = await runBatch();
        return json({ ...result, ...(await status()), tookMs: Date.now() - started });
      } catch (e) {
        // Rate limited: report it clearly (HTTP 429) so the app can wait and retry.
        if (e instanceof RateLimited) return json({ error: 'rate_limited', message: e.message, ...(await status()) }, 429);
        throw e;
      }
    }
    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'index_failed', message: e instanceof Error ? e.message : String(e) }, 500);
  }
});