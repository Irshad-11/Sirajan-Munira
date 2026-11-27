# TEST REPORT (mock Supabase + Playwright, Chromium; plus independent reviewer agent)

| # | Test | Result |
|---|------|--------|
| 1 | Importer: ```json fence + prose, smart quotes, bare array, bad JSON (reports line/column in Bengali+English), 501 items, >1 MB, unknown ID, wrong domain, duplicate, `<img onerror>`/`<script>` in note | PASS — all handled; no script executed, no dialog, no injected `<img>` in DOM |
| 2 | `first_words` mismatch → ⚠️ with "AI said / Site says" side-by-side; no first_words → "Not checked" (not a false ✅); wrong book slug → ⚠️ | PASS |
| 3 | Temporary / Local flows; export → re-import round trip (2/2 ✅) | PASS (Global = admin path; needs real Supabase admin login, not testable on mock) |
| 4 | Local store holds only ids+notes+dates (no titles/text); content is re-read live; deleted/hidden → "missing" | PASS |
| 5 | `#<id>` of finding 31 of a 36-finding lazy book force-loads, scrolls into view (top ≈ 90 px) | PASS |
| 6 | Whole-book search of not-yet-loaded content: দোয়া → 4, variant দুআ → 4, "অনুসন্ধান 31" → 1; result click loads, scrolls, highlights | PASS |
| 7 | Limited-agent simulation (opens only given URLs, 50 KB cap): ANSWER FORMAT inside first 1.5 KB of llms.txt; master index → per-book index chain; every book's part chain reaches `END OF BOOK` with all findings (self-test page `/ai-integration/test`: 19 pass / 1 warn / 0 fail) | PASS |
| 8 | No disclaimer text in llms.txt, SKILL/SEARCH/CITATION, part files; full permalinks; `CONTENT VERSION`; ETag → 304 | PASS |
| 9 | Old URLs: `/book/<slug>.txt`, `?from=`, `/download`, Bengali slug (percent-encoded) and `book-<id8>` alias, `/f/<id>.txt`, collection `.json` / `.txt?full=1`, search & verify GET with percent-encoded Bengali | PASS (HTTP 200) |
| 10 | 360 px: import, preview, book page, guide — no horizontal scroll | PASS |

Independent reviewer: no XSS / prototype-pollution / injection found. Fixed after review: local-store import hardening (fresh ids, caps), storage-full handling, theme-token contrast, false ✅ on empty/short claims, slug check, stale preview, null-collection crash, Esc on menu, tap targets, hidden-book wording, nested-JSON guard.

Known limits: Global import and admin buttons were not exercised against a real Supabase admin session; real raw (unencoded) Bengali URLs rely on Vercel's edge percent-encoding; Gemini cannot be prefilled via URL (prompt is copied instead).
