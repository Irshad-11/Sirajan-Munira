// Markdown/text documents served to AI agents. Neutral metadata only — no disclaimers.

const exLine = (e) => (e ? `“${e.words.replace(/ …$/, '')}” (${String(e.book).split(/\s+/).slice(0, 2).join(' ')}, p.${e.page}) → ${e.id ?? '<finding id>'}` : '(example unavailable)');

export function answerFormat(site, ex = []) {
  const a = ex[0], b = ex[1] || ex[0];
  return `## ANSWER FORMAT
Topic question ("what do the books say about X"): show only what these books contain. No intro, summary, opinion or disclaimer.
Group the findings under short Bengali sub-theme headings. One line per finding, each id once:
“exact quote, max 15 words” (<short>, p.<pdf_page>) → <finding id>
- <short> = the "short" column of ${site}/index.tsv (first 1–2 words of the title), identical on every line of that book. Never a letter code.
- Quote = copied exactly from first_words in the book's index.tsv or from fetched text, never reworded. No exact text available (semantic hit): write “title only”.
- pdf_page and id come from the book's index.tsv (${site}/book/<key>/index.tsv), columns pdf_page and id. Page empty: "p.not recorded". The id is the full 36-character UUID: never shortened, prefixed or invented.
- No URLs unless the user asks for links; the reader pastes ids into the site's Find by ID.
- Only if you did not check everything, add one last line: Read N of M findings (N checked, M found in the books searched).
Collection JSON, only when asked, as a code block and nothing else: {"name":"short name","links":["<full permalink>"]}. Permalinks are copied from index.tsv or search results, never built (the id is the part after #). Bare ids instead if the user says so.

Example:
<sub-theme>
${exLine(a)}${b && b !== a ? '\n' + exLine(b) : ''}

## HOW TO SEARCH (cheapest first)
1. Read ${site}/index.tsv (books). 2. In each book's keywords file look up several word PREFIXES (Bengali inflects: নামাজ, নামাজের) and spellings/synonyms (${site}/synonyms.txt); note the finding numbers. 3. Read those rows of the book's index.tsv. 4. Open ${site}/f/<id>.txt only if the context is unclear. Read index and keyword files to their END marker ("NEXT:" = continues). Cover all books.`;
}

export function tiers(site) {
  return `Tools: browsing = follow the links; uploaded files only = use those; code execution = download the TSVs and grep by word prefix; API / GPT actions = ${site}/openapi.json.
Live search, only if you can build URLs (static files are enough otherwise): ${site}/ai-integration/search?q=<query>&mode=auto|exact|keyword|semantic&book=<key>&limit=20 (if next_offset is set, repeat with &offset=<next_offset>); ${site}/ai-integration/verify?text=<quote>&book=<key>. Percent-encode Bengali as UTF-8 first (space = %20).`;
}

export const skillMd = (site, ex) => `---
name: sirajan-munira-research
description: Research the Sirājan Munīrā archive (Bengali findings from Arabic/Urdu books). Use when the user asks what the books say about a topic, wants findings with ids and original-PDF pages, or wants a collection JSON.
---

# Sirājan Munīrā

Site: ${site}

${answerFormat(site, ex)}

## Files
- ${site}/index.tsv: books (short name, index and keywords URLs)
- ${site}/book/<key>/index.tsv: one line per finding: no, book, id, title, pdf_page, first_words, permalink
- ${site}/book/<key>/keywords.tsv: word → finding numbers
- ${site}/book/<key>/part-N.txt, ${site}/book/<key>.json: full text
- ${site}/f/<id>.txt: one finding. ${site}/collections/<id>.txt|.json: curated list, use only if the user names one
- <key> = ASCII book key (slug, or book-xxxxxxxx when the slug is Bengali)

${tiers(site)}
`;

export const searchMd = (site) => `# Search — Sirājan Munīrā

## Without any API (static files)
1. ${site}/index.tsv → book list. 2. \`${site}/book/<key>/keywords.tsv\` → word, count, finding numbers (parts chain through END markers). 3. Grep by word prefix and spelling variants; Bengali inflects. 4. Map numbers to rows in \`${site}/book/<key>/index.tsv\`. 5. Confirm with ${site}/f/<id>.txt.
Synonyms: ${site}/synonyms.txt. Spelling variants to try: ী/ি, ূ/ু, ড়/ঢ় written with or without nukta, য়, ো.

## With the API
GET ${site}/ai-integration/search — parameters: q (required), mode (auto|exact|keyword|semantic), book (key), limit 1–50, offset. The server accepts raw or percent-encoded Bengali, but fetch tools often reject raw Bengali and spaces, so ALWAYS percent-encode UTF-8 (space = %20) and keep the URL exactly as built. If next_offset is not null, repeat with &offset=<next_offset>.
mode: auto | exact (whole phrase) | keyword (all words; synonyms and spelling variants applied) | semantic (meaning only; never shown as a quote)
OpenAPI: ${site}/openapi.json
`;

export const citationMd = (site) => `# Citation — Sirājan Munīrā

One line per finding: “short exact quote” (BookName, p.<PDF page>) → <finding id>

BookName = the "short" column of ${site}/index.tsv. Page is required ("p.not recorded" if missing). The id is the full 36-character id from the book's index.tsv (${site}/book/<key>/index.tsv), with no letter in front. No URLs unless the user asks for links; the reader pastes the id into the site search or opens ${site}/f/<id>. Quote exactly or label a paraphrase. Full rules: ${site}/llms.txt (ANSWER FORMAT).
`;
