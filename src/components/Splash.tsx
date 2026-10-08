import React, { useEffect, useState } from 'react';

// Intro shown when the app opens: animated sketch logo on white, then the
// credit line "Developer | Maintenance — Irshad Hossain".
// Shown once per app launch (per browser session). Tap/click anywhere to skip.
// Set to true if you want it ONLY inside the installed app, not in the browser.
const ONLY_WHEN_INSTALLED = false;

const LOGO_SRC = '/icons/logo-sketch.png';
const SEEN_KEY = 'sm_splash_seen';

const ROLE_LEFT = 'Developer';
const ROLE_RIGHT = 'Maintenance';
const DEV_NAME = 'Irshad Hossain';

// Timeline (ms). Keep the CSS delays below in step with these.
const LEAVE_AT = 4400;
const REMOVE_AT = 4950;

function shouldShow(): boolean {
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return false;
    if (ONLY_WHEN_INSTALLED) {
      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      if (!standalone) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function Splash() {
  const [show, setShow] = useState(shouldShow);   // decided on first render => no content flash
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch {}
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t1 = window.setTimeout(() => setLeaving(true), reduce ? 1200 : LEAVE_AT);
    const t2 = window.setTimeout(() => setShow(false), reduce ? 1500 : REMOVE_AT);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [show]);

  if (!show) return null;
  const skip = () => { setLeaving(true); window.setTimeout(() => setShow(false), 350); };

  return (
    <div className={`sm-splash ${leaving ? 'sm-splash--out' : ''}`} onClick={skip} role="presentation">
      <style>{SPLASH_CSS}</style>
      <div className="sm-splash__inner">
        <div className="sm-splash__logo-wrap">
          <img className="sm-splash__logo" src={LOGO_SRC} alt="Sirājan Munīrā" draggable={false} />
          <span className="sm-splash__glow" aria-hidden="true" />
        </div>

        <div className="sm-splash__credit" aria-label={`${ROLE_LEFT} and ${ROLE_RIGHT}: ${DEV_NAME}`}>
          {/* Roles: the two words glide in from opposite sides, a thin rule grows between them */}
          <div className="sm-splash__roles" aria-hidden="true">
            <span className="sm-splash__role sm-splash__role--l">{ROLE_LEFT}</span>
            <span className="sm-splash__divider" />
            <span className="sm-splash__role sm-splash__role--r">{ROLE_RIGHT}</span>
          </div>

          {/* Name: letters rise in one by one, then an underline draws and a light sweeps across */}
          <div className="sm-splash__name" aria-hidden="true">
            {Array.from(DEV_NAME).map((ch, i) => (
              <span
                key={i}
                className="sm-splash__char"
                style={{ animationDelay: `${2250 + i * 55}ms` }}
              >
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
            <span className="sm-splash__sheen" />
          </div>
          <span className="sm-splash__underline" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

const SPLASH_CSS = `
.sm-splash { position:fixed; inset:0; z-index:100000; background:#fff; color:#1b1b1b;
  display:grid; place-items:center; transition:opacity .55s ease, transform .55s ease; }
.sm-splash--out { opacity:0; transform:scale(1.015); pointer-events:none; }
.sm-splash__inner { display:flex; flex-direction:column; align-items:center; gap:1.5rem; padding:1rem; }

/* logo: not rounded, plain square on white — sketches itself in with a circular wipe */
.sm-splash__logo-wrap { position:relative; width:min(72vw,340px); aspect-ratio:1/1; }
.sm-splash__logo { width:100%; height:100%; display:block; border-radius:0; user-select:none;
  animation: smLogoIn 1.9s cubic-bezier(.25,.7,.2,1) .15s both, smLogoBreathe 3.2s ease-in-out 2.1s infinite; }
@keyframes smLogoIn {
  0%   { clip-path: circle(0% at 50% 48%); opacity:0; transform:scale(.9) rotate(-2deg); filter:blur(7px) contrast(1.4); }
  35%  { opacity:1; }
  100% { clip-path: circle(75% at 50% 48%); opacity:1; transform:scale(1) rotate(0); filter:blur(0) contrast(1); }
}
@keyframes smLogoBreathe { 0%,100%{ transform:scale(1);} 50%{ transform:scale(1.018);} }

/* soft light behind the flame */
.sm-splash__glow { position:absolute; left:50%; top:6%; width:34%; height:34%; transform:translateX(-50%);
  background:radial-gradient(circle, rgba(255,190,80,.55), rgba(255,190,80,0) 70%); mix-blend-mode:multiply;
  opacity:0; animation: smGlow 2.2s ease-in-out 1.3s infinite; pointer-events:none; }
@keyframes smGlow { 0%,100%{opacity:0; transform:translateX(-50%) scale(.85);} 50%{opacity:.9; transform:translateX(-50%) scale(1.15);} }

/* ---- credit block ---- */
.sm-splash__credit { display:flex; flex-direction:column; align-items:center; gap:.35rem; }

.sm-splash__roles { display:flex; align-items:center; gap:.85rem; }
.sm-splash__role { font-size:.66rem; letter-spacing:.32em; text-transform:uppercase; color:#777; white-space:nowrap; }
.sm-splash__role--l { animation: smFromLeft .75s cubic-bezier(.2,.75,.25,1) 1.85s both; }
.sm-splash__role--r { animation: smFromRight .75s cubic-bezier(.2,.75,.25,1) 1.85s both; }
@keyframes smFromLeft  { from { opacity:0; transform:translateX(-18px); filter:blur(4px); letter-spacing:.6em; }
                         to   { opacity:1; transform:none; filter:blur(0); letter-spacing:.32em; } }
@keyframes smFromRight { from { opacity:0; transform:translateX(18px);  filter:blur(4px); letter-spacing:.6em; }
                         to   { opacity:1; transform:none; filter:blur(0); letter-spacing:.32em; } }

.sm-splash__divider { width:1px; height:.95rem; background:linear-gradient(#e0a24a, #b8742a);
  transform-origin:center; animation: smGrowY .5s ease 1.75s both; }
@keyframes smGrowY { from { transform:scaleY(0); opacity:0; } to { transform:scaleY(1); opacity:1; } }

.sm-splash__name { position:relative; display:flex; overflow:hidden; padding:.1rem .15rem;
  font-family:'Lora',Georgia,serif; font-size:1.3rem; font-weight:600; letter-spacing:.04em; perspective:400px; }
.sm-splash__char { display:inline-block; opacity:0; transform-origin:50% 100%;
  animation: smCharIn .6s cubic-bezier(.2,.8,.25,1) both; }
@keyframes smCharIn {
  0%   { opacity:0; transform:translateY(.9em) rotateX(-75deg); filter:blur(3px); }
  60%  { opacity:1; }
  100% { opacity:1; transform:none; filter:blur(0); }
}

/* a soft glint that sweeps across the finished name */
.sm-splash__sheen { position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(105deg, transparent 35%, rgba(255,255,255,.9) 50%, transparent 65%);
  transform:translateX(-120%); animation: smSheen 1.1s ease-in-out 3.35s both; }
@keyframes smSheen { to { transform:translateX(120%); } }

.sm-splash__underline { display:block; width:min(56vw,210px); height:1.5px; border-radius:2px;
  background:linear-gradient(90deg, rgba(224,162,74,0), #d48f3c 30%, #b8742a 70%, rgba(184,116,42,0));
  transform:scaleX(0); transform-origin:center; animation: smLine .7s cubic-bezier(.3,.7,.2,1) 3.05s both; }
@keyframes smLine { to { transform:scaleX(1); } }

@media (prefers-reduced-motion: reduce){
  .sm-splash__logo, .sm-splash__glow, .sm-splash__role, .sm-splash__divider,
  .sm-splash__char, .sm-splash__sheen, .sm-splash__underline { animation:none !important; opacity:1; filter:none; transform:none; }
  .sm-splash__glow, .sm-splash__sheen { opacity:0; }
}
`;