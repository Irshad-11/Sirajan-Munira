import React from 'react';
import { Quote } from 'lucide-react';

// ---------------------------------------------------------------------------
// The author's own maxim. One shared component so the wording is identical
// wherever the author speaks (About → founder note, Landing → developer credit).
// ---------------------------------------------------------------------------

export const AUTHOR_MAXIM =
  'The biggest sign of intelligence is being able to change your mind when presented with new information. ' +
  'Not changing your mind despite facts means you are either stupid or brainwashed.';

export function AuthorQuote({ compact, attribution = 'Irshad Hossain' }: { compact?: boolean; attribution?: string | null }) {
  return (
    <figure className={`aq ${compact ? 'aq--compact' : ''}`} lang="en">
      <style>{AQ_CSS}</style>
      <Quote className="aq__mark" size={compact ? 16 : 18} aria-hidden="true" />
      <blockquote className="aq__text">{AUTHOR_MAXIM}</blockquote>
      {attribution && <figcaption className="aq__by">— {attribution}</figcaption>}
    </figure>
  );
}

const AQ_CSS = `
.aq { position:relative; margin:0; padding:1rem 1.15rem 1rem 2.7rem; border-radius:10px; text-align:left;
  background:color-mix(in srgb, var(--accent) 6%, var(--surface));
  border:1px solid color-mix(in srgb, var(--accent) 22%, var(--border)); }
.aq::before { content:''; position:absolute; left:0; top:16%; bottom:16%; width:3px; border-radius:0 3px 3px 0; background:var(--accent); }
.aq__mark { position:absolute; left:.95rem; top:1.05rem; color:var(--accent); opacity:.85; }
.aq__text { margin:0; font-family:var(--font-serif), Georgia, serif; font-style:italic; font-size:1rem; line-height:1.75; color:var(--fg); }
.aq__by { margin-top:.5rem; font-size:.8rem; font-weight:600; letter-spacing:.02em; color:var(--muted); }
.aq--compact { padding:.85rem 1rem .85rem 2.4rem; }
.aq--compact .aq__mark { left:.8rem; top:.95rem; }
.aq--compact .aq__text { font-size:.92rem; line-height:1.7; }
`;
