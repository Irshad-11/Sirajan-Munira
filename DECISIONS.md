# DECISIONS

Format: **Chosen** / Rejected / Why. (Options were compared by an independent reviewer pass; see TEST_REPORT.md.)

1. **AI files are generated live by one serverless function (`api/ai.js`), not by a build script.**
   Rejected: static files via a build script (stale until next deploy; the DB is edited from the admin UI, so content changes would not show up). Why: content changes appear within ~5 min (s-maxage=300) and ETag/`CONTENT VERSION` tells agents what changed. No build step to remember.
2. **Chunked text parts (~60 KB, `AI_PART_BYTES` env to tune) chained with `NEXT:` / `END OF BOOK` markers.**
   Rejected: one giant file (agents truncate at ~50 KB), per-finding only (too many requests). Why: a limited agent can follow links one by one and *knows* when it reached the end.
3. **Index file (`index.tsv`: id, title, PDF page, first words, permalink) + keywords + synonyms as the primary discovery path**, search API as a bonus.
   Rejected: relying on query-building (`?q=`) — many agents can only open URLs they were given.
4. **ASCII alias `book-<first 8 id chars>` for Bengali slugs; old/Bengali slugs still work** (percent-encoded). Rejected: renaming slugs in the DB (breaks old links).
5. **Disclaimer text removed from all AI-facing files (D2).** Metadata is neutral; rules live in the ANSWER FORMAT block at the top of `llms.txt` and `SKILL.md` with two few-shot examples built from live findings (always real permalinks).
6. **Local collections store only `{id, note, addedAt, relevance, match}`.** Titles/pages/text are re-read from the DB on every view, so a content update never leaves stale copies; deleted findings show as "missing". Rejected: storing a snapshot (goes stale, bigger quota use).
7. **Pasted JSON is untrusted data.** Parsed with `JSON.parse` only; nothing from it is fetched; all text rendered through React (escaped); URLs are never turned into links from pasted data (only the DB-resolved permalink is used); only this site's host and the production host are accepted; ≤1 MB / ≤500 items.
8. **AI claims are verified, not trusted:** `first_words`, title and page are fuzzy-compared (Bengali-normalised) with the real finding → ✅ / ⚠️ with a side-by-side "AI said / Site says". The site's data always wins.
9. **Global (site-wide) import is admin-only, add/merge only** (never deletes), with a diff preview (new vs already present).
10. **Whole-book search = server-side `ilike` on `search_text`** with every word AND-ed and each word OR-ed over spelling variants + synonyms (not dependent on lazy-loaded batches). Results click → `jumpTo` loads the needed batch on demand, scrolls and highlights.
11. **`/guide` (Bengali) is separate from `/ai-integration` (English technical guide)**; they link to each other. Different accent colour (purple) for the new "AI এজেন্ট সিস্টেম" section.

## Chose NOT to build (and why)
- **MCP server** — optional in the brief; `openapi.json` + plain GET endpoints already work for coding agents and most chat tools. Adds hosting + auth surface.
- **Server-side storage of user collections / accounts** — Local + export/import covers it without a login system or personal-data storage.
- **Automatic rewriting/repair of data-quality problems** — the admin report (`/ai-integration/quality`) lists them; fixing content is an editorial decision.
- **Prebuilt static files + build script** — see decision 1.

## Round: use the site's own collection design
- Local/temporary collections now render through the existing `CategoryDetail` (same header, chips, list, side panel); the separate co-* collection view was removed. `/my-collections/:id` routes to it; `/my-collections` redirects to `/collections`.
- `/collections` gets an "On this device" section (same row design) and an "Import JSON" link; `/collections/import` stays a separate page.
- Added to the existing page for local collections only: notes, remove, search, book filter, copy links, export JSON, copy as AI context, save temp → device, delete. Group-by-book and sort were dropped.
- More menu: AI Integration + llms.txt (+ admin tester). Footer back to original links. No nav entries for guide / AI system (the landing page has them).
- Removed the per-heading Cite button; the Add menu is temp/local only (admins already have the existing "Collection" button for site collections).
- Removed left accent borders (help panel, notes, question box, test rows, selected item).

## Round: links-only import
- Import JSON is now `{"name": "...", "links": ["permalink", ...]}`; everything else comes from the database. Old formats (items/id/url) still parse. Export writes the same small shape.
- "Copy as AI context" removed (button, landing copy). llms.txt / SKILL.md / prompts tell AI to return only name + links.
- Collection side panel widened (up to ~52% of the page). Admins can save the imported collection as a site collection (import page, or "Save to site" on a local collection).
- Splash shows version v07.26.34 at the bottom.

## Round: universal finding-ID search
- `/f/<id>` (and `/find`) open the finding for people (same id as `/f/<id>.txt` for agents). Search page has a "Find by ID" panel; the nav quick-search jumps straight to the heading when it contains one id.
- Any pasted text works: bare id, "K<id>" (stray letter ignored), permalink, a whole AI answer (several ids; duplicates counted once). "Open in new tab" is remembered.
- Wrong/typo'd/partial id → nearest valid ids ("Did you mean", differing characters marked), using a lazily loaded id index.
- AI rules (llms.txt / SKILL.md): one compact line per finding: quote + FULL book title + PDF page + full 36-char id, no URLs, no letter prefixes, no duplicates. Collection JSON `links` accept bare ids.

## Round: ID search polish
- Input is one line (grows up to ~4 lines for pasted text). Nav quick-search clears after submit; /f/<id> and URL-driven jumps replace the history entry, so Back no longer re-redirects.
- "Find on paste" checkbox (default on, remembered): paste → jump after 0.7 s; off → press Find/Enter.
- Collections: import accepts a plain list/AI answer (every id found is taken); a local collection has an "Add by finding ID or link" box.
- IDs: Postgres `gen_random_uuid()` (UUIDv4, 122 random bits, ~5.3e36 values) plus a primary-key constraint, so duplicates are impossible. Editing runs UPDATE on the same row, so the id never changes. Only deleting and re-creating a finding gives a new id.

## Round: checkbox + AI defaults
- Checkbox 22px → 17px, checked mark is a star (radio unchanged, dot 7px).
- AI defaults: chat answers = quote + full book + page + id only (links only if the user asks); collection JSON = full permalinks by default (ids accepted if the user asks for ids).

## Round: scroll, search hints, AI docs trimmed
- Every page opens at its top, also after Back (history scroll restoration off; page held at top ~1.6 s unless the reader scrolls). Hash links (#id, #guide) still scroll themselves. Search page no longer restores its old scroll position.
- Search box: "Try:" chips removed; placeholder rotates short English phrases ("Try something here to search", "Powerful Search option available", ...).
- AI docs reviewed by 3 separate agents (efficiency, consistency, a simulated file-only AI). Changes: ANSWER FORMAT rewritten for topic questions (grouped sub-theme headings; “quote” (first 1–2 words of book, p.page) → id), quote rule (copy first_words, max 15 words, "title only" if none), id/page come from the book's index.tsv, one trailing "Read N of M" line only if incomplete. llms.txt 897 → ~490 words, SKILL.md 1033 → ~450. Index files: `short` column in the book list, `# SHORT:` in book indexes, first_words without "…", Bengali slugs percent-encoded in permalinks. CITATION.md/SEARCH.md aligned; copy-paste prompts on the site shortened.

## Round: landing AI guide for readers
- AI section rewritten as 5 user steps (ask -> paste in ChatGPT/Claude -> reply with IDs -> Find by ID -> collection), each with an animated replica (src/components/AiReplica.tsx). Developer file lists removed from the main flow (kept at /ai-integration).
- Replicas use generic chat UI (no brand UI); labelled "উদাহরণ". Mobile: nav/url bar hidden, canvas scaled.
- Hero: floating AI Agent badge (.lnd-aibadge) linking to #ai-agents.
- Verified by a review agent; fixed: step check/spinner states, Ctrl/⌘ hint, reply loop replay, tip timing. Known: text small at 360px (scaled canvas).
- Landing AI copy humanized: short, English terms (topic, paste, ID, search, collection), no filler lines.
