import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Languages, MoveHorizontal } from 'lucide-react';

// ---------------------------------------------------------------------------
// About page banner — the Hadith of the Ark, illuminated.
//   Desktop: Arabic original is shown; drag the handle (or use ← →) to reveal
//            the Bangla translation underneath.
//   Mobile : Arabic original is shown; the floating "Translate" button in the
//            bottom-right flips the panel over to the Bangla translation.
// ---------------------------------------------------------------------------

const AR_SRC = 'https://raw.githubusercontent.com/Irshad-11/Documents/refs/heads/main/Ottoman%20Illuminated%20Calligraphy%20and%20Ship%20Panel.png';
const BN_SRC = 'https://raw.githubusercontent.com/Irshad-11/Documents/refs/heads/main/Bengali%20Calligraphy%20on%20a%20Golden%20Ottoman%20Manuscript.png';
const AR_ALT = 'Illuminated Ottoman panel with the Arabic Hadith of the Ark: “The likeness of my Ahl al-Bayt is like the Ark of Nuh…”';
const BN_ALT = 'একই প্যানেলে বাংলা অনুবাদ: “নিশ্চয়ই আমার আহলে বাইতের দৃষ্টান্ত হচ্ছে নূহের নৌকার মতো…”';
const MOBILE_Q = '(max-width: 720px)';

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_Q).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_Q);
    const on = () => setM(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return m;
}

export function CalligraphyBanner() {
  const isMobile = useIsMobile();
  const [entered, setEntered] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(t); }, []);

  return (
    <section className={`cb ${entered ? 'cb--in' : ''}`} aria-label="Hadith of the Ark — Arabic original and Bangla translation">
      <style>{CB_CSS}</style>
      {isMobile ? <FlipPanel /> : <RevealPanel />}
    </section>
  );
}

/* ---------------- Desktop: drag-to-reveal ---------------- */
function RevealPanel() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(0);            // % of the Bangla image revealed, from the left
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const [hint, setHint] = useState(false);

  // A one-time nudge after the entry animation, so the handle is discoverable.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = setTimeout(() => { setHint(true); setPos(16); }, 1500);
    const b = setTimeout(() => { setPos(0); }, 2500);
    const c = setTimeout(() => setHint(false), 3300);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, []);

  const setFromX = useCallback((clientX: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setTouched(true); setHint(false); setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setFromX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => { if (dragging) setFromX(e.clientX); };
  const endDrag = () => setDragging(false);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 20 : 5;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = pos + step;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = pos - step;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = 100;
    if (next !== null) { e.preventDefault(); setTouched(true); setHint(false); setPos(Math.max(0, Math.min(100, next))); }
  };

  const w = boxRef.current?.clientWidth || 900;
  const px = (pos / 100) * w;
  const knobShift = px < 23 ? 23 - px : px > w - 23 ? (w - 23) - px : 0;

  return (
    <div
      ref={boxRef}
      className={`cb-frame cb-reveal ${dragging ? 'is-dragging' : ''} ${hint ? 'is-hinting' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ ['--pos' as any]: `${pos}%` }}
    >
      <img className="cb-img" src={AR_SRC} alt={AR_ALT} draggable={false} decoding="async" />
      <img className="cb-img cb-img--top" src={BN_SRC} alt={BN_ALT} draggable={false} decoding="async" lang="bn" />
      <div
        className="cb-handle"
        role="slider"
        tabIndex={0}
        aria-label="Reveal the Bangla translation"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`${Math.round(pos)}% Bangla translation shown`}
        onKeyDown={onKey}
      >
        <span className="cb-handle__line" aria-hidden="true" />
        {/* keep the knob fully inside the frame at either end */}
        <span className="cb-handle__knob" aria-hidden="true" style={{ translate: `${knobShift}px 0` }}><MoveHorizontal size={18} /></span>
      </div>
      <span className={`cb-tag cb-tag--ar ${pos > 88 ? 'is-off' : ''}`} aria-hidden="true">العربية</span>
      <span className={`cb-tag cb-tag--bn ${pos < 12 ? 'is-off' : ''}`} aria-hidden="true" lang="bn">বাংলা</span>
      {!touched && (
        <span className="cb-cue" aria-hidden="true"><MoveHorizontal size={13} /> Drag to reveal the Bangla translation</span>
      )}
    </div>
  );
}

/* ---------------- Mobile: flip with a translate button ---------------- */
function FlipPanel() {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="cb-flip-wrap">
      <div className={`cb-frame cb-flip ${flipped ? 'is-flipped' : ''}`}>
        <div className="cb-face cb-face--front" aria-hidden={flipped}>
          <img className="cb-img" src={AR_SRC} alt={AR_ALT} draggable={false} decoding="async" />
        </div>
        <div className="cb-face cb-face--back" aria-hidden={!flipped}>
          <img className="cb-img" src={BN_SRC} alt={BN_ALT} draggable={false} decoding="async" lang="bn" />
        </div>
      </div>
      <button
        type="button"
        className="cb-translate"
        onClick={() => setFlipped((v) => !v)}
        aria-pressed={flipped}
        aria-label={flipped ? 'Show the Arabic original' : 'Translate to Bangla'}
      >
        <Languages size={16} aria-hidden="true" />
        <span>{flipped ? 'Original' : 'Translate'}</span>
      </button>
    </div>
  );
}

const CB_CSS = `
.cb { max-width: 860px; margin: 1rem auto 0; padding: 0 .2rem; }
.cb-frame { position: relative; width: 100%; aspect-ratio: 3 / 2; border-radius: 12px; overflow: hidden;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  box-shadow: 0 18px 40px -18px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.08); }
.cb-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block;
  user-select: none; -webkit-user-drag: none; }

/* entry animation: unveil from the centre, settle from a slight zoom */
.cb .cb-frame, .cb .cb-flip-wrap { opacity: 0; transform: translateY(16px) scale(.985);
  clip-path: inset(0 50% 0 50% round 12px);
  transition: opacity .7s ease, transform 1s cubic-bezier(.2,.7,.2,1), clip-path 1.15s cubic-bezier(.65,0,.25,1); }
.cb .cb-flip-wrap .cb-frame.cb-flip { opacity: 1; clip-path: none; transform: rotateY(0deg); transition: transform .8s cubic-bezier(.4,.1,.2,1); }
.cb .cb-flip-wrap .cb-frame.cb-flip.is-flipped { transform: rotateY(180deg); }
.cb--in .cb-frame, .cb--in .cb-flip-wrap { opacity: 1; transform: none; clip-path: inset(0 0 0 0 round 12px); }
.cb .cb-img { transform: scale(1.06); transition: transform 1.6s cubic-bezier(.2,.7,.2,1); }
.cb--in .cb-img { transform: scale(1); }

/* desktop reveal */
.cb-reveal { cursor: ew-resize; touch-action: pan-y; }
.cb-img--top { clip-path: inset(0 calc(100% - var(--pos)) 0 0); }
.cb-reveal.is-hinting .cb-img--top { transition: transform 1.6s cubic-bezier(.2,.7,.2,1), clip-path .9s cubic-bezier(.45,0,.2,1); }
.cb-handle { position: absolute; top: 0; bottom: 0; left: var(--pos); width: 44px; margin-left: -22px; z-index: 3;
  display: grid; place-items: center; outline: none; }
.cb-reveal.is-hinting .cb-handle { transition: left .9s cubic-bezier(.45,0,.2,1); }
.cb-handle__line { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; margin-left: -1px;
  background: linear-gradient(transparent, #f3dc9a 12%, #f3dc9a 88%, transparent); box-shadow: 0 0 10px rgba(0,0,0,.45); }
.cb-handle__knob { position: relative; width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center;
  color: #3a240d; background: radial-gradient(circle at 35% 30%, #fbe9b7, #d9ad52 70%, #a97b2c);
  border: 2px solid #fff6dc; box-shadow: 0 4px 14px rgba(0,0,0,.45); transition: transform .15s ease; }
.cb-handle:focus-visible .cb-handle__knob { outline: 3px solid var(--accent); outline-offset: 3px; }
.cb-reveal:hover .cb-handle__knob, .cb-reveal.is-dragging .cb-handle__knob { transform: scale(1.08); }
.cb-tag { position: absolute; top: .8rem; z-index: 2; padding: .2rem .65rem; border-radius: 999px; font-size: .75rem; font-weight: 700;
  color: #fff6dc; background: rgba(40,22,8,.62); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  transition: opacity .25s ease; pointer-events: none; }
.cb-tag--ar { right: .8rem; font-family: 'Amiri', 'Scheherazade New', serif; }
.cb-tag--bn { left: .8rem; font-family: 'Hind Siliguri', sans-serif; }
.cb-tag.is-off { opacity: 0; }
.cb-cue { position: absolute; left: 50%; bottom: .9rem; transform: translateX(-50%); z-index: 2; white-space: nowrap;
  display: inline-flex; align-items: center; gap: .35rem; padding: .35rem .8rem; border-radius: 999px;
  font-size: .78rem; font-weight: 600; color: #fff6dc; background: rgba(40,22,8,.66); pointer-events: none;
  animation: cbCue 2.6s ease-in-out 2s infinite; }
@keyframes cbCue { 0%,100% { opacity: .95; } 50% { opacity: .6; } }

/* mobile flip */
.cb-flip-wrap { position: relative; perspective: 1400px; }
.cb-flip { overflow: visible; background: none; border: none; box-shadow: none;
  transform-style: preserve-3d; transition: transform .8s cubic-bezier(.4,.1,.2,1); }
.cb-flip.is-flipped { transform: rotateY(180deg); }
.cb-face { position: absolute; inset: 0; border-radius: 12px; overflow: hidden; backface-visibility: hidden; -webkit-backface-visibility: hidden;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border)); box-shadow: 0 14px 30px -14px rgba(0,0,0,.45); }
.cb-face--back { transform: rotateY(180deg); }
.cb-translate { position: absolute; right: .7rem; bottom: .7rem; z-index: 5; display: inline-flex; align-items: center; gap: .35rem;
  padding: .5rem .85rem; border-radius: 999px; font-size: .82rem; font-weight: 700; color: #3a240d;
  background: linear-gradient(135deg, #fbe9b7, #d9ad52); border: 1.5px solid #fff6dc;
  box-shadow: 0 6px 16px rgba(0,0,0,.35); }
.cb-translate:active { transform: scale(.96); }

@media (prefers-reduced-motion: reduce) {
  .cb .cb-frame, .cb .cb-flip-wrap, .cb .cb-img, .cb-flip, .cb-img--top, .cb-handle { transition: none !important; }
  .cb-cue { animation: none; }
}
`;
