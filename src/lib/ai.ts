// ---------------------------------------------------------------------------
// AI integration helpers: URLs + copy-paste prompts.
// Prompts are intentionally SHORT: they point the AI at plain-text endpoints
// (llms.txt, SKILL.md) and let it read the rules itself, so they never go stale.
// ---------------------------------------------------------------------------

export const siteOrigin = () =>
  typeof window !== 'undefined' ? window.location.origin : 'https://sirajan-munira.vercel.app';

export const aiUrls = (origin = siteOrigin()) => ({
  llms: `${origin}/llms.txt`,
  skill: `${origin}/ai-integration/SKILL.md`,
  search: `${origin}/ai-integration/SEARCH.md`,
  citation: `${origin}/ai-integration/CITATION.md`,
  guide: `${origin}/ai-integration`,
  searchApi: `${origin}/ai-integration/search`,
  verifyApi: `${origin}/ai-integration/verify`,
});

export const bookAiUrls = (slug: string, origin = siteOrigin()) => {
  const base = `${origin}/book/${slug}`;
  return { page: base, txt: `${base}.txt`, json: `${base}.json`, dlTxt: `${base}/download?format=txt`, dlJson: `${base}/download?format=json` };
};

export const collectionAiUrls = (id: string, origin = siteOrigin()) => ({
  page: `${origin}/collections/${id}`, txt: `${origin}/collections/${id}.txt`, json: `${origin}/collections/${id}.json`,
});

export const QUESTION_PLACEHOLDER = '[WRITE YOUR QUESTION HERE]';

const RULES = `Rules:
- The site publishes Bengali research FINDINGS written from original Arabic/Urdu books — they are NOT the original text and NOT a certified translation.
- Cite every claim: book, finding heading, heading ID, original PDF page number ("not recorded" if missing), permalink. Keep exact quotations separate from paraphrase.
- Say how many findings you actually read (each file header shows TOTAL FINDINGS). If you could not open a link or read everything, tell me — never guess or claim a complete search you did not do. If you cannot browse at all, say so and I will paste the text.
- Answer in the language of my question (Bengali by default). Present what the findings say; for personal religious rulings, advise consulting a qualified scholar.`;

const ASK = (q?: string) => `MY QUESTION:
${q?.trim() || QUESTION_PLACEHOLDER}
${q?.trim() ? '' : '(If the line above still shows the placeholder, reply only "Ready" and wait for my question.)'}`.trimEnd();

/** Prompt for ONE book: read the book's plain-text export, then answer. */
export function bookPrompt(opts: { title: string; slug: string; question?: string; origin?: string }) {
  const u = aiUrls(opts.origin);
  const b = bookAiUrls(opts.slug, opts.origin);
  return `You are a careful research assistant for the book "${opts.title}" on Sirājan Munīrā.

Step 1 — Read these raw files (plain text, no JavaScript; open them with your browsing/fetch tool):
1. ${u.llms}
2. ${u.skill}
3. This book's complete findings: ${b.txt}   (structured version: ${b.json})
If a file is split, follow its "CONTINUE WITH:" line until the end.

Step 2 — Using ONLY this book's findings, answer my question. Analyse across ALL findings, not just the first match; group related findings and note disagreements.

${RULES}

${ASK(opts.question)}`;
}

/** Prompt for a topic collection (e.g. a hadith topic across books). */
export function collectionPrompt(opts: { name: string; id: string; question?: string; origin?: string }) {
  const u = aiUrls(opts.origin);
  const c = collectionAiUrls(opts.id, opts.origin);
  return `You are a careful research assistant for the topic collection "${opts.name}" on Sirājan Munīrā.

Step 1 — Read these raw files (plain text, no JavaScript):
1. ${u.llms}
2. ${u.skill}
3. All findings in this collection: ${c.txt}   (structured version: ${c.json})

Step 2 — Using ONLY this collection's findings, answer my question. Cover every relevant finding and show which book each comes from.

${RULES}

${ASK(opts.question)}`;
}

/** High-accuracy search over every book. */
export function searchPrompt(opts: { query?: string; bookSlug?: string | null; bookTitle?: string | null; origin?: string }) {
  const u = aiUrls(opts.origin);
  const scope = opts.bookSlug
    ? `Restrict the search to the book "${opts.bookTitle || opts.bookSlug}" (add &book=${opts.bookSlug} to search calls; its full text is ${bookAiUrls(opts.bookSlug, opts.origin).txt}).`
    : 'Search ALL books listed in llms.txt.';
  return `You are a high-accuracy research assistant for Sirājan Munīrā, an archive of Bengali findings from original Arabic/Urdu books.

Step 1 — Read these raw files first (plain text, not JavaScript pages; use your browsing/fetch tool):
1. ${u.llms}   (all books, TXT/JSON/download URLs)
2. ${u.skill}   (how to search, cite and verify)
3. ${u.search}   (search API: exact / keyword / semantic)

Step 2 — Search carefully. ${scope}
- Rewrite my query into several Bengali phrasings, key words and spelling variants, and run each through ${u.searchApi}?q=<phrase>&mode=auto
- Open the top findings (permalinks) or the book TXT to confirm context before answering.
- Label every hit as exact match, keyword match or semantic (meaning-only) match.
- Do not stop at the first hit: collect all relevant findings across books.

${RULES}

MY SEARCH QUERY:
${opts.query?.trim() || QUESTION_PLACEHOLDER}
${opts.query?.trim() ? '' : '(If the line above still shows the placeholder, reply only "Ready" and wait for my query.)'}`.trimEnd();
}

/** Prompt that asks the AI to register the skill/instructions for a whole session. */
export function generalPrompt(origin?: string) {
  const u = aiUrls(origin);
  return `Please act as a research assistant for the Sirājan Munīrā archive (Bengali findings from original Arabic/Urdu books).
First read, as raw plain-text files: ${u.llms} and ${u.skill}. Follow the rules in them for the rest of this conversation: discover books via llms.txt, read each book's TXT/JSON export, search with the search API, cite book + heading ID + original PDF page + permalink, separate exact quotes from paraphrase, and never present findings as the original text or a certified translation. If you cannot access something, say so.
Confirm when you have read both files, then wait for my question.

${ASK()}`;
}

export const GENAI_APPS = [
  { id: 'chatgpt', name: 'ChatGPT', color: '#10a37f', prefill: true, open: (p: string) => { const u = `https://chatgpt.com/?q=${encodeURIComponent(p)}`; return u.length < 7000 ? u : 'https://chatgpt.com/'; }, plain: 'https://chatgpt.com/' },
  { id: 'claude', name: 'Claude', color: '#d97757', prefill: true, open: (p: string) => { const u = `https://claude.ai/new?q=${encodeURIComponent(p)}`; return u.length < 7000 ? u : 'https://claude.ai/new'; }, plain: 'https://claude.ai/new' },
  { id: 'gemini', name: 'Gemini', color: '#4285f4', prefill: false, open: (_p: string) => 'https://gemini.google.com/app', plain: 'https://gemini.google.com/app' },
] as const;
