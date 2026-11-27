// Markdown/text documents served to AI agents. Neutral metadata only — no disclaimers.

const exLine = (e) => (e ? `${e.link}\n   Book: ${e.book}, original PDF page ${e.page}. First words: "${e.words.replace(/ …$/, '')}"` : '(example unavailable)');

export function answerFormat(site, ex = []) {
  const a = ex[0], b = ex[1] || ex[0];
  return `## ANSWER FORMAT (strict — read before answering)
1. Reply in the user's language as natural prose or lists. Do NOT wrap normal answers in code blocks, JSON or any structural wrapper unless the user explicitly asks for a JSON / collection export.
2. For EVERY finding you cite give: (a) the FULL clickable permalink as a plain URL, never shortened or rewritten; (b) the book name and the original-PDF page ("not recorded" if missing); (c) the first words of the finding copied exactly, in quotation marks, at most ~12 words. Do not print the ID separately (it is inside the link). Never invent a link: use only permalinks that appeared in site data.
3. Mention the book's original-source PDF link once per book you used.
4. No generic disclaimers, no filler. Exception: if your reading was incomplete, add ONE short line saying how many findings you actually read out of the total.
5. Internally classify each hit as exact / keyword / semantic. Never present a semantic-only hit as an exact quote.
6. Search strategy: read ${site}/index.tsv first (then the book keyword files), try several Bengali phrasings and synonyms (${site}/synonyms.txt), open only the findings you need to confirm context, collect ALL relevant findings across ALL books, order them by relevance.
7. If the user asks for JSON / a collection export, output exactly ONE JSON object in schema "sirajan-collection/1" (see below) and nothing around it except the one-line "read X of Y" statement.
8. Never alter quoted text: quote exactly, or paraphrase and label it as a paraphrase.

### Example 1 — prose answer
User: "Which findings cover ${JSON.stringify(a?.title ?? 'this topic')}?"
Answer:
Two findings in the archive deal with this.
1. ${exLine(a)}
2. ${exLine(b)}
Original PDF of ${a?.book ?? 'the book'}: <the book's PDF link from index.tsv>.
(I read 2 of 2 candidate findings found through the index.)

### Example 2 — JSON answer (only when the user asks for JSON / a collection)
{"schema":"sirajan-collection/1","name":${JSON.stringify((a?.title ?? 'Topic').slice(0, 40))},"query":${JSON.stringify(`Which findings cover ${a?.title ?? 'this topic'}?`)},"items":[{"url":"${a?.link ?? `${site}/book/<book-slug>#<heading-id>`}","book":"${a?.slug ?? '<book-slug>'}","title":${JSON.stringify(a?.title ?? '<title>')},"pdf_page":"${a?.page ?? 'not recorded'}","first_words":${JSON.stringify((a?.words ?? '<first words>').replace(/ …$/, ''))},"match":"exact","note":"one-line reason"}]}
Read 2 of 2 findings.

### Collection JSON schema "sirajan-collection/1"
{"schema":"sirajan-collection/1","name":"...","description":"optional","query":"user's question","items":[{"url":"full permalink (or \\"id\\": heading UUID)","book":"book slug","title":"finding heading","pdf_page":"41 | 36-37 | not recorded","first_words":"exact first words","match":"exact|keyword|semantic","relevance":1,"note":"one-line reason"}]}
Only "url" or "id" is required per item. Use the real permalinks. The site checks every item against its database.`;
}

export function tiers(site) {
  return `## CAPABILITY TIERS — adapt to your tools
- Browsing agent (can open URLs you were given): follow the links in this file. Open ${site}/index.tsv, then a book's index and keyword files, then single findings (${site}/f/<id>.txt) or book text parts. You cannot build query URLs? Then do not use the search API; the static files are enough.
- Agent with only uploaded files: use the files the user attached (index, keywords, book parts). Every file ends with an END marker that says whether more parts exist.
- Agent with code execution: download index.tsv / keywords TSV / book JSON and grep, awk, jq or Python over them; search by word PREFIX (Bengali inflects: নামাজ, নামাজের, নামাজে).
- Agent with API / MCP / custom-GPT actions: use ${site}/openapi.json (search, verify, finding, part endpoints).
Always read to the END marker of each file. If a file has "NEXT:" it continues there; "END OF ... complete" means nothing is missing. If you could not read everything, say how much you did read.`;
}

export const skillMd = (site, ex) => `---
name: sirajan-munira-research
description: Research the Sirājan Munīrā archive (Bengali findings from Arabic/Urdu books). Use when the user asks about a book or topic on ${site}, wants findings with permalinks and original-PDF pages, or wants a collection JSON.
---

# Sirājan Munīrā — working method

Site: ${site}

${answerFormat(site, ex)}

${tiers(site)}

## Data model
- Book → findings. A finding has: title (heading), ID (UUID), original-PDF page, permalink \`${site}/book/<book-slug>#<id>\`, passages.
- Each book has an ASCII **book key** (its slug, or \`book-xxxxxxxx\` when the slug is Bengali). Both work in URLs.
- All files carry CONTENT VERSION. Compare it to know whether data changed.

## Static files (preferred)
| File | Content |
|---|---|
| ${site}/llms.txt | this entry point |
| ${site}/index.tsv | books with index / text / keyword URLs |
| ${site}/book/<key>/index.tsv | one line per finding: no, book, id, title, pdf_page, first_words, permalink. Parts chain via END markers (also to the next book). |
| ${site}/book/<key>/keywords.tsv | word → finding numbers (use prefix search) |
| ${site}/book/<key>/part-N.txt | full text, ~60 KB parts, END marker per part |
| ${site}/f/<id>.txt | one finding |
| ${site}/book/<key>.json | whole book, structured |
| ${site}/collections/<id>.txt / .json | topic collection, light by default (add ?full=1 for text) |
| ${site}/synonyms.txt | synonym groups |

## Method
1. Read ${site}/index.tsv → choose books (or all). 2. Read each book's keywords file; look up several words/prefixes and synonyms; collect finding numbers. 3. Read the index rows for those numbers (titles, first words). 4. Open ${site}/f/<id>.txt (or the book part) only to confirm context. 5. Answer in the ANSWER FORMAT above.

## Live search (only if you can call constructed URLs)
\`${site}/ai-integration/search?q=<query>&mode=auto|exact|keyword|semantic&book=<key>&limit=20\` — Bengali may be raw or percent-encoded. Each result: match_type, title, book, pdf_page_number, first_words, permalink. \`${site}/ai-integration/verify?text=<quote>&book=<key>\` → exact_match | partial_match | no_match with the real text.
See ${site}/ai-integration/SEARCH.md.
`;

export const searchMd = (site) => `# Search — Sirājan Munīrā

## Without any API (static files)
1. ${site}/index.tsv → book list. 2. \`${site}/book/<key>/keywords.tsv\` → word, count, finding numbers (parts chain through END markers). 3. Grep by word prefix and spelling variants; Bengali inflects. 4. Map numbers to rows in \`${site}/book/<key>/index.tsv\`. 5. Confirm with ${site}/f/<id>.txt.
Synonyms: ${site}/synonyms.txt. Spelling variants to try: ী/ি, ূ/ু, ড়/ঢ় written with or without nukta, য়, ো.

## With the API
GET ${site}/ai-integration/search — parameters: q (required), mode (auto|exact|keyword|semantic), book (key), limit 1–50, offset. Bengali raw or percent-encoded both work.
- exact — whole phrase present (encoding differences ignored)
- keyword_all / keyword_any — all / some words (synonyms and spelling variants applied)
- semantic — meaning only; never present as a quote
Exact and keyword run over every finding in the database (not limited by file size).
OpenAPI: ${site}/openapi.json
`;

export const citationMd = (site) => `# Citation — Sirājan Munīrā

For each finding give: full permalink, book name, original-PDF page ("not recorded" if missing), first words in quotation marks (≤ 12 words, copied exactly). Mention the book's original-source PDF link once per book. Do not print the heading ID separately; it is part of the permalink.

Format:
\`<permalink>\` — <book>, PDF p. <page> — "<first words>"

Quote exactly or paraphrase and say so. Collection JSON format: ${site}/llms.txt (section ANSWER FORMAT).
`;
