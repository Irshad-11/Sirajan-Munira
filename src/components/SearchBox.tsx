import React, { useEffect, useRef, useState } from 'react';
import { Search as SearchIcon, X, ArrowRight } from 'lucide-react';

// Example queries typed out in the empty field — they double as a hint that
// both Bangla and English, and both exact words and ideas, are searchable.
export const SEARCH_EXAMPLES = [
  'গাদীর-ই-খুম এবং ইসলাম পরিপূর্ন হওয়ার আয়াত',
  'আলীর ইমামত ও বেলায়াত',
  'আহলে বাইত রিসালাতের এবং জ্ঞানের উৎসস্থল',
  'আমার পক্ষ থেকে আমার দায়িত্ব পৌঁছে দেবে না, আলী ছাড়া।',
  'letters left behind',
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/** Types each example out, pauses, erases, moves to the next. */
function useTypewriter(lines: string[], active: boolean) {
  const reduced = usePrefersReducedMotion();
  const [text, setText] = useState('');
  useEffect(() => {
    if (!active || !lines.length) return;
    if (reduced) { setText(lines[0]); return; }
    let line = 0, i = 0, deleting = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = lines[line];
      if (!deleting) {
        i++;
        setText(full.slice(0, i));
        if (i >= full.length) { deleting = true; t = setTimeout(tick, 1700); return; }
        t = setTimeout(tick, 55);
      } else {
        i--;
        setText(full.slice(0, i));
        if (i <= 0) { deleting = false; line = (line + 1) % lines.length; t = setTimeout(tick, 350); return; }
        t = setTimeout(tick, 22);
      }
    };
    t = setTimeout(tick, 400);
    return () => clearTimeout(t);
  }, [active, lines, reduced]);
  return text;
}

export function SearchBox({
  initialValue = '',
  onSubmit,
  busy = false,
  autoFocus = false,
  compact = false,
  label = 'Search findings, books and collections',
  submitLabel = 'Search',
  examples = SEARCH_EXAMPLES,
}: {
  initialValue?: string;
  onSubmit: (q: string) => void;
  busy?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
  label?: string;
  submitLabel?: string;
  examples?: string[];
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const ghost = useTypewriter(examples, value === '');

  // Keep the field in sync when the URL query changes (back/forward).
  useEffect(() => { setValue(initialValue); }, [initialValue]);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (q.length >= 1) onSubmit(q);
  };

  return (
    <form className={`sbox ${compact ? 'sbox--compact' : ''}`} role="search" onSubmit={submit}>
      <div className="sbox-field">
        <SearchIcon size={18} className="sbox-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          className="sbox-input"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={label}
          placeholder={value ? '' : ' '}
          enterKeyHint="search"
          autoComplete="off"
          lang="bn"
        />
        {value === '' && (
          <span className="sbox-ghost" aria-hidden="true">
            {ghost}<span className="sbox-caret" />
          </span>
        )}
        {value && (
          <button type="button" className="sbox-clear" onClick={() => { setValue(''); inputRef.current?.focus(); }} aria-label="Clear search">
            <X size={16} />
          </button>
        )}
        <button type="submit" className="sbox-submit" disabled={!value.trim()}>
          <span>{submitLabel}</span> <ArrowRight size={15} />
        </button>
      </div>
      <div className={`sbox-progress ${busy ? 'on' : ''}`} aria-hidden="true" />
    </form>
  );
}