// Bengali text helpers shared by the server (api/) and, as a copy, the client (src/lib/bn.ts).
// KEEP BOTH FILES IN SYNC.

const INVISIBLE = /[​-‍⁠﻿­]/g;

/** Canonical text: NFC (unifies ড়/ঢ়/য়, ো/ৌ encodings), no zero-width chars, single spaces. */
export function bnNormalize(s) {
  return String(s ?? '').normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

/** Loose key for fuzzy comparison: also folds ী/ি, ূ/ু, ণ/ন, ষ/শ and ignores punctuation. */
export function bnFuzzy(s) {
  return bnNormalize(s).toLowerCase()
    .replace(/ী/g, 'ি').replace(/ূ/g, 'ু').replace(/ণ/g, 'ন').replace(/ষ/g, 'শ')
    .replace(/[^\p{L}\p{N}ঀ-৿\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export const bnWords = (s) => bnNormalize(s).toLowerCase().match(/[\p{L}\p{N}ঀ-৿]+/gu) || [];

/** Synonym groups (also published at /synonyms.txt). Words in a group are interchangeable in keyword search. */
export const SYNONYM_GROUPS = [
  ['আফজাল', 'শ্রেষ্ঠ', 'সর্বোত্তম', 'সবচেয়ে বেশি', 'সর্বাধিক', 'উত্তম'],
  ['নামাজ', 'নামায', 'সালাত', 'সলাত'],
  ['রোজা', 'রোযা', 'সাওম', 'সিয়াম'],
  ['যাকাত', 'জাকাত', 'যাকাত'],
  ['হাদিস', 'হাদীস', 'হাদীছ'],
  ['আল্লাহ', 'আল্লাহ্', 'আল্লাহু'],
  ['রাসুল', 'রসুল', 'রাসূল', 'নবী', 'নবি'],
  ['ঈমান', 'ইমান', 'বিশ্বাস'],
  ['ইলম', 'এলেম', 'জ্ঞান', 'ইল্ম'],
  ['দোয়া', 'দুআ', 'দোআ', 'দু\'আ'],
];

const SYN = SYNONYM_GROUPS.map((g) => g.map(bnFuzzy));
export function expandSynonyms(term) {
  const k = bnFuzzy(term);
  const i = SYN.findIndex((g) => g.includes(k));
  return i < 0 ? [term] : [...new Set([term, ...SYNONYM_GROUPS[i]])];
}

const PRE = [['ড়', 'ড়'], ['ঢ়', 'ঢ়'], ['য়', 'য়']];
const swapVowels = (s) => s.replace(/[িীুূ]/g, (c) => ({ 'ি': 'ী', 'ী': 'ি', 'ু': 'ূ', 'ূ': 'ু' }[c]));

/** Encoding + vowel-length spelling variants of one word/phrase, to OR together in a DB ILIKE. Max 8. */
export function bnVariants(term) {
  const base = bnNormalize(term);
  if (!base) return [];
  const pre = PRE.reduce((s, [a, b]) => s.split(a).join(b), base);
  const dec = base.replace(/ো/g, 'ো').replace(/ৌ/g, 'ৌ');
  const out = new Set();
  for (const f of [base, pre, dec, PRE.reduce((s, [a, b]) => s.split(a).join(b), dec)]) {
    out.add(f);
    out.add(swapVowels(f));
  }
  return [...out].slice(0, 8);
}
