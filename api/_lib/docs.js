// Markdown documents served to AI agents. Written for an AI reader: precise,
// imperative, and explicit about limits. {{SITE}} is replaced per request.

export const SKILL_MD = `---
name: sirajan-munira-research
description: Research the Sirājan Munīrā archive of Bengali findings (extracted from original Arabic/Urdu books). Use when the user asks a question about a book on {{SITE}}, wants hadith/topic findings, wants sources with original-PDF page numbers, or wants a quotation verified.
---

# Sirājan Munīrā — research skill

Site: {{SITE}}

## 1. What this content is (read carefully)

- The site does **not** publish the original Arabic/Urdu books. Editors read the original PDFs and write **Findings in Bengali**: facts, explanations and research statements, each tied to the original book's **PDF page number** and to a **permanent heading link** on the website.
- A Finding is therefore **not** the original text and **not** a certified translation. Never call it "the original text", "the author's words" or "a translation of the book". Say "the website's Bengali finding states…", and give the PDF page so the user can check the original.
- Quotation rules: text copied word-for-word from a finding is an **exact quotation of the website finding**. Anything you reword is a **paraphrase**. Label which is which.

## 2. Discover content (no JavaScript needed)

1. GET \`{{SITE}}/llms.txt\` — lists every public book and topic collection with its TXT, JSON, download and (if any) original-PDF URLs.
2. Choose the book(s) relevant to the question. If unsure, use the search API (section 4) instead of guessing.

## 3. Read content

| Need | URL | Notes |
|---|---|---|
| Whole book, plain text | \`{{SITE}}/book/<slug>.txt\` | Every finding: title, HEADING ID, PDF PAGE, LINK, passages \`[<id>.pN]\`. Large books are split; follow the \`CONTINUE WITH:\` line at the end (\`?from=N\`). |
| Whole book, structured | \`{{SITE}}/book/<slug>.json\` | Has \`findings[].heading_id\`, \`pdf_page_number\`, \`permalink\`, \`passages[]\`, \`citation\`, \`version\`. |
| Download file | \`{{SITE}}/book/<slug>/download?format=txt\\|json\` | For agents that can save files. |
| Topic collection | \`{{SITE}}/collections/<id>.txt\` or \`.json\` | Findings on one topic gathered from many books (e.g. a hadith topic). |

If a file is cut off, truncated by your fetch tool, or you could not read all of it, **tell the user exactly how much you read**. Do not claim to have searched everything.

## 4. Search — choose the right kind

Server-side search (works across every book at once, independent of your fetch/context limits):

\`GET {{SITE}}/ai-integration/search?q=<query>&mode=auto|exact|keyword|semantic&book=<slug>&limit=20&offset=0\`

| Mode | Meaning | Use when |
|---|---|---|
| \`exact\` | The whole phrase appears character-for-word in a finding | Verifying or locating a known sentence |
| \`keyword\` | Every word appears somewhere in the finding (any order). Falls back to "any word" if none match | Topic words, names, terms |
| \`semantic\` | Meaning-based match; wording may differ completely | Questions, concepts, paraphrases |
| \`auto\` (default) | Runs all three and labels each result with \`match_type\` | Normal research |

Each result has \`match_type\`: \`exact\`, \`keyword_all\`, \`keyword_any\` or \`semantic\`. **Never present a \`semantic\` hit as a quotation or as an exact match.**

High-accuracy procedure for a user question:
1. Turn the question into 3–6 Bengali (and, if useful, Arabic-transliterated or English) search phrases: the exact phrase, key nouns, synonyms, alternate Bengali spellings.
2. Run \`mode=auto\` for each phrase (add \`book=<slug>\` when the user named a book).
3. Open the best hits' \`permalink\`s or read the relevant book TXT section to confirm context; compare multiple findings.
4. Answer from what the findings actually say. If findings disagree or are silent, say so.

Bengali spelling varies (e.g. যুক্তাক্ষর, ও/ো, ড়/ড়). Try spelling variants before concluding something is absent.

## 5. Cite every claim

For each finding you rely on, give:
- Finding heading title
- Book title (and author if present)
- Passage / heading ID
- **Original PDF page number** (say "not recorded" if null — never guess)
- Website permalink
- Content version (from the JSON \`version.content_version\`) when precision matters

Cite the **website finding** and the **original book** as two separate references. The JSON \`citation\` field already holds both. See {{SITE}}/ai-integration/CITATION.md.

## 6. Verify quotations

\`GET {{SITE}}/ai-integration/verify?text=<exact text>&book=<slug>\` returns \`exact_match\`, \`partial_match\` (with missing/extra words) or \`no_match\`, plus the finding's real text, permalink and PDF page. It compares only against the website's **Bengali** findings — never say a quote was checked against the original Arabic/Urdu PDF.

## 7. Hard rules

1. Findings are Bengali research summaries, never the original text or a certified translation.
2. Do not invent page numbers, authors, IDs, URLs or quotes. If metadata is null, say it is unavailable.
3. If you cannot fetch or verify something, state the limitation instead of guessing.
4. Do not claim a "complete" or "exhaustive" search unless you read every page of the relevant TXT/JSON or relied on the server-side search's \`coverage\` block, and say which.
5. Keep exact quotations (copied text) visibly separate from your paraphrase.
6. Religious rulings: present what the findings say and where; do not issue your own fatwa. Suggest consulting a qualified scholar for personal rulings.

## 8. Quick recipe

1. \`GET {{SITE}}/llms.txt\`
2. \`GET {{SITE}}/ai-integration/search?q=<phrase>&mode=auto\`
3. \`GET {{SITE}}/book/<slug>.txt\` (if you need surrounding context)
4. Answer with citations; flag partial access or semantic-only evidence.
`;

export const SEARCH_MD = `# Search documentation — Sirājan Munīrā

Base: {{SITE}}/ai-integration/search (HTTP GET, JSON, no JavaScript, CORS open)

## Parameters
- \`q\` (required) — query, at least 2 characters. Bengali, English or Arabic script.
- \`mode\` — \`auto\` (default) | \`exact\` | \`keyword\` | \`semantic\`
- \`book\` — optional book slug to restrict the search (slugs are in {{SITE}}/llms.txt)
- \`limit\` — 1–50 (default 20), \`offset\` — for paging (\`next_offset\` in the response)

## Match types
- **exact** — the full phrase occurs in the finding (whitespace/zero-width characters ignored, case-insensitive for Latin).
- **keyword_all** — every query word occurs in the finding.
- **keyword_any** — only returned when nothing matched all words; at least one word occurs.
- **semantic** — nearest by meaning (embedding similarity, threshold 0.55). Not a text match.

## Coverage
exact and keyword searches run in the database over **all** findings in scope, so they are not limited by an AI's fetch size. The \`coverage\` object states what ran. Semantic search returns only the closest matches above a threshold and is not exhaustive. If semantic search is unavailable the response says so in \`notes\`.

## Response fields
\`results[]\`: \`match_type\`, \`heading_id\`, \`title\`, \`book{slug,title,author}\`, \`pdf_page_number\`, \`permalink\`, \`snippet\` (and \`similarity\` for semantic).

## Tips
- Search several phrasings and spellings; combine \`book=\` filters once the right book is known.
- Always confirm context by opening the \`permalink\` or reading the relevant book TXT before quoting.
- Verify quotations with {{SITE}}/ai-integration/verify?text=…
`;

export const CITATION_MD = `# Citation guidelines — Sirājan Munīrā

Always cite two things separately.

## 1. The website finding (what you actually read)
\`Finding "<heading title>", in "<book title>" (Sirājan Munīrā, Bengali findings), Passage ID <heading_id>, original PDF p. <n>, content version <v>, <permalink>\`

## 2. The original book (where the finding comes from)
\`Original book: <title>, author: <author>, PDF page <n>, PDF: <original_source_pdf_url>\`

The JSON export (\`{{SITE}}/book/<slug>.json\`) provides both strings in \`findings[].citation\`.

## Rules
- Use the finding's \`heading_id\` as the Passage ID (individual paragraphs are \`<heading_id>.p<N>\`).
- If the PDF page number, author or PDF URL is null/"not recorded", write that. Never infer it.
- Mark **exact quotation** (copied) vs **paraphrase**. Do not put quotation marks around paraphrase.
- Do not cite a finding as the original Arabic/Urdu text, or as a certified translation.
- Cite the content version when the user may need to re-check later; findings can be corrected over time and the permalink always shows the latest text.
`;
