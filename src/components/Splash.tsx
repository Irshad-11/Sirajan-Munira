import React, { useEffect, useState } from 'react';

// Intro shown when the app opens: animated sketch logo on white, then
// "Developer — Irshad Hossain". Shown once per app launch (per browser session).
// Set to true if you want it ONLY inside the installed app, not in the browser.
const ONLY_WHEN_INSTALLED = false;

const LOGO_SRC = '/icons/logo-sketch.png';
const SEEN_KEY = 'sm_splash_seen';

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
    const t1 = window.setTimeout(() => setLeaving(true), reduce ? 1200 : 3600);
    const t2 = window.setTimeout(() => setShow(false), reduce ? 1500 : 4100);
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
        <div className="sm-splash__dev">
          <span className="sm-splash__dev-label">Developer</span>
          <span className="sm-splash__dev-name">Irshad Hossain</span>
        </div>
      </div>
    </div>
  );
}

const SPLASH_CSS = `
.sm-splash { position:fixed; inset:0; z-index:100000; background:#fff; color:#1b1b1b;
  display:grid; place-items:center; transition:opacity .5s ease; }
.sm-splash--out { opacity:0; pointer-events:none; }
.sm-splash__inner { display:flex; flex-direction:column; align-items:center; gap:1.4rem; padding:1rem; }

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

.sm-splash__dev { display:flex; flex-direction:column; align-items:center; gap:.2rem; }
.sm-splash__dev-label { font-size:.68rem; letter-spacing:.32em; text-transform:uppercase; color:#777;
  opacity:0; animation: smUp .7s ease 1.9s both; }
.sm-splash__dev-name { font-family:'Lora',Georgia,serif; font-size:1.25rem; font-weight:600; letter-spacing:.04em;
  opacity:0; animation: smUp .8s ease 2.2s both; }
@keyframes smUp { from{opacity:0; transform:translateY(10px); letter-spacing:.5em;} to{opacity:1; transform:none;} }

@media (prefers-reduced-motion: reduce){
  .sm-splash__logo, .sm-splash__glow, .sm-splash__dev-label, .sm-splash__dev-name { animation:none; opacity:1; }
  .sm-splash__glow { opacity:0; }
}
`;