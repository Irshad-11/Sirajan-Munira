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
