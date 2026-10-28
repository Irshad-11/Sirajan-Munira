import React, { useEffect, useRef } from 'react';
import { SCENE_MARKUP } from './sceneMarkup';

// GSAP is loaded at runtime from the same CDN build the sample used
// (cdnjs, 3.12.5), so the project needs no extra npm dependency.
const GSAP_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
let gsapPromise: Promise<any> | null = null;
function loadGsap(): Promise<any> {
  const w = window as any;
  if (w.gsap) return Promise.resolve(w.gsap);
  if (!gsapPromise) {
    gsapPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = GSAP_SRC;
      el.async = true;
      el.onload = () => (w.gsap ? resolve(w.gsap) : reject(new Error('GSAP missing')));
      el.onerror = () => { gsapPromise = null; el.remove(); reject(new Error('GSAP failed to load')); };
      document.head.appendChild(el);
    });
  }
  return gsapPromise;
}

// ---------------------------------------------------------------------------
// Lamp + book hero animation.
//
// The artwork (sceneMarkup.ts) and the timeline below are a direct port of
// BOOK_SVG_ANIMATION_SAMPLE.html — same SVG, same CONFIG, same GSAP timeline
// (lamp chain pull + flicker, cover opens, highlighter sweeps, selection
// toolbar pops, pages turn, book closes, loop). Only the demo controls
// (play/pause, speed, lamp slider) are left out. Every id is prefixed "lbs-"
// and every lookup is scoped to this component's root, so the scene can't
// collide with anything else on the page.
// ---------------------------------------------------------------------------

/* CONFIG — identical to the sample */
const CONFIG = {
  coverHold: 2.4,
  openTime: 1.8,
  turnTime: 2.0,
  highlight: 0.8,
  iconsHold: 2.2,
  tilt: 26,
  spreads: 3,
  lampLevel: 100,
  textColor: '#847157',
  highlights: [{ side: 'R', row: 2 }, { side: 'L', row: 7 }, { side: 'R', row: 9 }] as { side: 'L' | 'R'; row: number }[],
};

const START_DELAY = 4;        // s before the first switch-on
const ROUNDS_PER_CYCLE = 2;   // book rounds between lights-on and lights-off
const LIGHTS_OFF = 3;         // s the lamp stays dark before it is switched on again
const CHAIN_PIVOT = '833 412'; // joint where the pull-chain hangs from the lamp (lamp viewBox units)

const ROWS_Y = [173, 204, 235, 267, 298, 329, 412, 444, 475, 506, 538, 569];
const PAGE_X = { L: 310, R: 845 } as const;
const FULL = 383, BAR_H = 14;
const NS = 'http://www.w3.org/2000/svg';

function seeded(seed: number) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
function pageLines(spread: number, side: 'L' | 'R') {
  if (spread === 0) {
    const w = [1, 1, 1, 1, 0.86, 0.39];
    return ROWS_Y.map((y, i) => ({ y, w: FULL * w[i % 6] }));
  }
  const rnd = seeded(spread * 97 + (side === 'L' ? 13 : 71));
  const out: { y: number; w: number }[] = [];
  [[0, 6], [6, 12]].forEach(([a]) => {
    const n = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const last = i === n - 1, pen = i === n - 2;
      const w = last ? 0.22 + rnd() * 0.4 : pen && rnd() > 0.5 ? 0.8 + rnd() * 0.12 : 1;
      out.push({ y: ROWS_Y[a + i], w: FULL * w });
    }
  });
  return out;
}
function lineWidth(spread: number, side: 'L' | 'R', row: number) {
  const l = pageLines(spread, side).find((x) => x.y === ROWS_Y[row]);
  return l ? l.w : FULL * 0.6;
}

export default function LampBookScene({ className = '' }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | null = null;
    loadGsap().then((gsap) => {
      if (!cancelled) teardown = start(gsap);
    }).catch(() => { /* offline: the scene simply stays as a still picture */ });
    return () => { cancelled = true; teardown?.(); };
  }, []);

  function start(gsap: any): (() => void) | null {
    const root = rootRef.current;
    if (!root) return null;
    const $ = (id: string) => root.querySelector<HTMLElement>(`#lbs-${id}`)!;
    const svgEl = (id: string) => root.querySelector<SVGElement>(`#lbs-${id}`)!;

    const writeText = (groupId: string, spread: number, side: 'L' | 'R') => {
      const g = svgEl(groupId);
      g.textContent = '';
      for (const l of pageLines(spread, side)) {
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', String(PAGE_X[side])); r.setAttribute('y', String(l.y));
        r.setAttribute('width', l.w.toFixed(1)); r.setAttribute('height', String(BAR_H));
        r.setAttribute('rx', '7'); r.setAttribute('fill', CONFIG.textColor);
        g.appendChild(r);
      }
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stage = $('stage-root');
    const bookBox = $('bookBox');
    const cover = $('cover'), leftHalf = $('leftHalf'), rightHalf = $('rightHalf');
    const front = $('turnFront'), back = $('turnBack'), shR = $('shadowR'), shL = $('shadowL');
    const hl = svgEl('hl'), icons = ['icon0', 'icon1', 'icon2'].map($);
    const bookShift = $('bookShift'), toolbar = $('toolbar'), chain = svgEl('chain');
    const shadowOpen = svgEl('shadowOpen'), glint = svgEl('glint');

    const motes: SVGCircleElement[] = [];
    const cleanups: (() => void)[] = [];
    let master: any | null = null;

    const ctx = gsap.context(() => {
      gsap.set([cover, leftHalf, rightHalf, front, back], { transformOrigin: '50% 50%' });
      gsap.set(icons, { transformOrigin: '50% 100%' });

      const fitPerspective = () => {
        bookShift.style.perspective = (bookBox.clientWidth * 2.6) + 'px';
        gsap.set(bookBox, { transformOrigin: '50% 100%', transformPerspective: stage.clientWidth * 1.3, rotationX: CONFIG.tilt });
      };
      fitPerspective();
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fitPerspective) : null;
      ro?.observe(stage);
      if (!ro) window.addEventListener('resize', fitPerspective);
      cleanups.push(() => { ro?.disconnect(); if (!ro) window.removeEventListener('resize', fitPerspective); });

      // Dust motes in the lamp light
      if (!reduceMotion) {
        for (let i = 0; i < 14; i++) {
          const c = document.createElementNS(NS, 'circle');
          const y = 360 + Math.random() * 360, k = (y - 320) / 450;
          const left = 1136 + (560 - 1136) * k, right = 1505 + (1580 - 1505) * k;
          c.setAttribute('cx', (left + 30 + Math.random() * (right - left - 60)).toFixed(1));
          c.setAttribute('cy', y.toFixed(1));
          c.setAttribute('r', (1.2 + Math.random() * 2).toFixed(1));
          svgEl('motes').appendChild(c); motes.push(c);
        }
      }

      /* Lamp light state */
      const lamp = { level: CONFIG.lampLevel / 100, on: 0, breath: 1 };
      const lampLight = svgEl('lampLight'), pool = svgEl('pool'), dimmer = svgEl('dimmer'), cone = svgEl('cone');
      const applyLight = () => {
        const k = lamp.on * lamp.level * lamp.breath;
        const vis = Math.min(1, k);
        lampLight.setAttribute('opacity', Math.min(1, k * 0.95).toFixed(3));
        pool.setAttribute('opacity', Math.min(1, k).toFixed(3));
        dimmer.setAttribute('opacity', ((1 - vis) * 0.62).toFixed(3));
        cone.setAttribute('opacity', Math.min(1, 0.75 + Math.max(0, k - 1) * 0.8).toFixed(3));
      };

      /* A. The pull-chain switch.
         A hand takes the chain, tugs it a little sideways and pulls it down;
         at the bottom of the pull the switch clicks (light flickers on, or
         dies). On release the chain springs back up past its rest point and
         swings like a pendulum from its joint, each swing smaller, until it
         hangs still again (~3 s). Same motion for on and off. */
      gsap.set(chain, { svgOrigin: CHAIN_PIVOT });
      const pullSwitch = (turnOn: boolean) => {
        const tl = gsap.timeline();
        const click = 0.52;                                  // chain fully down → switch clicks
        tl.to(chain, { rotation: -6, y: 4, duration: 0.24, ease: 'sine.out' }, 0)          // grab + small tug
          .to(chain, { y: 36, rotation: -2.5, duration: 0.28, ease: 'power2.in' }, 0.24)   // pull down
          .to(chain, { y: 36, duration: 0.08 }, click)                                    // held for a beat
          .to(chain, { y: 0, duration: 1.45, ease: 'elastic.out(1.15, 0.26)' }, click + 0.08)  // spring back
          .to(chain, {                                                                     // damped pendulum
            keyframes: [
              { rotation: 8, duration: 0.3, ease: 'sine.out' },
              { rotation: -5.5, duration: 0.42, ease: 'sine.inOut' },
              { rotation: 3.6, duration: 0.4, ease: 'sine.inOut' },
              { rotation: -2.2, duration: 0.38, ease: 'sine.inOut' },
              { rotation: 1.1, duration: 0.36, ease: 'sine.inOut' },
              { rotation: -0.4, duration: 0.32, ease: 'sine.inOut' },
              { rotation: 0, duration: 0.3, ease: 'sine.inOut' }],
          }, click + 0.08);
        if (turnOn) {
          tl.to(lamp, {
            keyframes: [
              { on: 0.7, duration: 0.06 }, { on: 0.1, duration: 0.08 },
              { on: 0.85, duration: 0.07 }, { on: 0.4, duration: 0.1 },
              { on: 1, duration: 0.5, ease: 'sine.out' }],
            onUpdate: applyLight,
          }, click);
        } else {
          tl.to(lamp, {
            keyframes: [
              { on: 0.35, duration: 0.05 }, { on: 0.75, duration: 0.07 },
              { on: 0.15, duration: 0.06 }, { on: 0, duration: 0.22, ease: 'power2.in' }],
            onUpdate: applyLight,
          }, click);
        }
        return tl;
      };

      /* B. Ambient: lamp breathing + floating dust */
      const buildAmbient = () => {
        const tl = gsap.timeline();
        tl.add(gsap.to(lamp, { breath: 0.93, duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut', onUpdate: applyLight }), 0);
        motes.forEach((m, i) => {
          tl.add(gsap.fromTo(m,
            { x: -12, y: 10, opacity: 0.05 },
            { x: 14, y: -24, opacity: 0.55, duration: gsap.utils.random(3.5, 6.5), repeat: -1, yoyo: true, ease: 'sine.inOut' }), i * 0.3);
        });
        return tl;
      };

      const pctX = (x: number) => ((x - 169) / 1201 * 100).toFixed(3) + '%';
      const pctY = (y: number) => ((y - 75) / 657 * 100).toFixed(3) + '%';
      const highlightIn = (tl: any, spread: number, at: number) => {
        const h = CONFIG.highlights[spread % CONFIG.highlights.length];
        const w = lineWidth(spread, h.side, h.row);
        tl.set(toolbar, { left: pctX(PAGE_X[h.side] + w / 2), top: pctY(ROWS_Y[h.row] - 14) }, at)
          .set(hl, { attr: { x: PAGE_X[h.side] - 8, y: ROWS_Y[h.row] - 8, width: 0 }, opacity: 0.55 }, at)
          .to(hl, { attr: { width: w + 16 }, duration: CONFIG.highlight, ease: 'power1.inOut' }, at);
      };
      const iconsUpDown = (tl: any, at: number) => {
        tl.fromTo(icons, { yPercent: 70, opacity: 0, scale: 0.3 },
          { yPercent: 0, opacity: 1, scale: 1, duration: 0.45, stagger: 0.09, ease: 'back.out(2.2)' }, at)
          .to(icons, { scale: 1.14, duration: 0.16, stagger: 0.22, yoyo: true, repeat: 1, ease: 'sine.inOut' }, at + 0.8)
          .to(icons, { yPercent: 40, opacity: 0, scale: 0.5, duration: 0.3, stagger: 0.05, ease: 'power2.in' }, at + 0.5 + CONFIG.iconsHold);
        return at + 0.9 + CONFIG.iconsHold;
      };
      const pageTurn = (tl: any, s: number, at: number) => {
        const half = CONFIG.turnTime / 2;
        tl.call(() => { writeText('textFront', s, 'R'); writeText('textBack', s + 1, 'L'); writeText('textR', s + 1, 'R'); }, undefined, at)
          .set(front, { autoAlpha: 1, rotationY: 0, filter: 'brightness(1)' }, at)
          .set(back, { autoAlpha: 1, rotationY: 90, filter: 'brightness(0.8)' }, at)
          .to(hl, { opacity: 0, duration: 0.2 }, at - 0.25)
          .to(front, { rotationY: -90, duration: half, ease: 'power2.in' }, at)
          .to(front, { filter: 'brightness(0.8)', duration: half, ease: 'power1.in' }, at)
          .to(shR, { opacity: 1, duration: half * 0.85, ease: 'sine.out' }, at)
          .to(shR, { opacity: 0, duration: half * 0.6, ease: 'sine.in' }, at + half)
          .fromTo(shL, { opacity: 1 }, { opacity: 0, duration: half, ease: 'power1.out' }, at + half)
          .to(back, { rotationY: 0, filter: 'brightness(1)', duration: half, ease: 'power2.out' }, at + half)
          .call(() => writeText('textL', s + 1, 'L'), undefined, at + CONFIG.turnTime)
          .set([front, back], { autoAlpha: 0 }, at + CONFIG.turnTime);
        return at + CONFIG.turnTime;
      };

      /* C. One round of the book: cover → open → (highlight + icons → page turn) × n → close */
      const closedState = (tl: any, at: number) => {
        tl.call(() => { writeText('textL', 0, 'L'); writeText('textR', 0, 'R'); }, undefined, at)
          .set(bookShift, { xPercent: -25 }, at)
          .set(cover, { autoAlpha: 1, rotationY: 0 }, at)
          .set(leftHalf, { autoAlpha: 0, rotationY: 90 }, at)
          .set(rightHalf, { autoAlpha: 0 }, at)
          .set([front, back], { autoAlpha: 0 }, at)
          .set([shR, shL], { opacity: 0 }, at)
          .set(hl, { opacity: 0 }, at)
          .set(icons, { yPercent: 70, opacity: 0, scale: 0.3 }, at)
          .set(shadowOpen, { attr: { rx: 330, cx: 1070 } }, at);
      };
      const buildBookRound = () => {
        const C = CONFIG, half = C.openTime / 2;
        const tl = gsap.timeline();
        tl.call(() => { writeText('textL', 0, 'L'); writeText('textR', 0, 'R'); }, undefined, 0)
          .set(bookShift, { xPercent: -25 }, 0)
          .set(cover, { autoAlpha: 1, rotationY: 0 }, 0)
          .set(leftHalf, { autoAlpha: 0, rotationY: 90 }, 0)
          .set(rightHalf, { autoAlpha: 0 }, 0)
          .set([front, back], { autoAlpha: 0 }, 0)
          .set([shR, shL], { opacity: 0 }, 0)
          .set(hl, { opacity: 0 }, 0)
          .set(icons, { yPercent: 70, opacity: 0, scale: 0.3 }, 0)
          .set(shadowOpen, { attr: { rx: 330, cx: 1070 } }, 0)
          .fromTo(glint, { x: 0 }, { x: 560, duration: 1.1, ease: 'power1.inOut' }, 0.6);

        let t = C.coverHold;
        tl.set(rightHalf, { autoAlpha: 1 }, t)
          .to(bookShift, { xPercent: 0, duration: C.openTime, ease: 'power2.inOut' }, t)
          .to(shadowOpen, { attr: { rx: 660, cx: 769 }, duration: C.openTime, ease: 'power2.inOut' }, t)
          .to(cover, { rotationY: -90, duration: half, ease: 'power2.in' }, t)
          .to(shR, { opacity: 0.8, duration: half, ease: 'sine.out' }, t)
          .set(cover, { autoAlpha: 0 }, t + half)
          .set(leftHalf, { autoAlpha: 1 }, t + half)
          .to(leftHalf, { rotationY: 0, duration: half, ease: 'power2.out' }, t + half)
          .to(shR, { opacity: 0, duration: half * 0.7 }, t + half)
          .fromTo(shL, { opacity: 0.8 }, { opacity: 0, duration: half, ease: 'power1.out' }, t + half);
        t += C.openTime + 0.4;

        for (let s = 0; s < C.spreads; s++) {
          highlightIn(tl, s, t);
          t = iconsUpDown(tl, t + C.highlight + 0.2) + 0.3;
          if (s < C.spreads - 1) t = pageTurn(tl, s, t) + 0.5;
        }

        tl.to(hl, { opacity: 0, duration: 0.3 }, t - 0.2)
          .to(leftHalf, { rotationY: 90, duration: half, ease: 'power2.in' }, t)
          .to(shR, { opacity: 0.8, duration: half, ease: 'sine.in' }, t)
          .set(leftHalf, { autoAlpha: 0 }, t + half)
          .set(cover, { autoAlpha: 1, rotationY: -90 }, t + half)
          .to(cover, { rotationY: 0, duration: half, ease: 'power2.out' }, t + half)
          .to(shR, { opacity: 0, duration: half * 0.6 }, t + half)
          .set(rightHalf, { autoAlpha: 0 }, t + C.openTime)
          .to(bookShift, { xPercent: -25, duration: C.openTime, ease: 'power2.inOut' }, t)
          .to(shadowOpen, { attr: { rx: 330, cx: 1070 }, duration: C.openTime, ease: 'power2.inOut' }, t)
          .to({}, { duration: 0.8 });
        return tl;
      };

      /* D. The show.
         First load: everything waits START_DELAY s (lamp off, book closed),
         then the chain is pulled, the light blinks on and the book opens.
         After ROUNDS_PER_CYCLE rounds the closed book rests, the chain is
         pulled again and the light goes out; after LIGHTS_OFF s it is pulled
         back on and the cycle repeats forever. */
      applyLight();
      master = gsap.timeline();
      closedState(master, 0);
      master.set(lamp, { on: 0, onComplete: applyLight }, 0);
      master.add(buildAmbient(), 0);

      const cycle = gsap.timeline({ repeat: -1 });
      cycle.add(pullSwitch(true), 0);
      let t = 0.3;                                   // book round starts while the switch is being pulled;
      for (let r = 0; r < ROUNDS_PER_CYCLE; r++) {   // its cover hold covers the flicker, so it opens ~1.4 s after the light settles
        const round = buildBookRound();
        cycle.add(round, t);
        t += round.duration();
      }
      cycle.add(pullSwitch(false), t + 0.4);
      cycle.to({}, { duration: LIGHTS_OFF }, '>');   // dark pause, then the cycle starts over with the light coming on
      master.add(cycle, START_DELAY);
      if (reduceMotion) master.timeScale(0.6); // same as the sample's reduced-motion default
    }, root);

    // Don't burn CPU while the hero is scrolled out of view (resumes exactly where it was).
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([e]) => { if (master) master.paused(!e.isIntersecting); }, { threshold: 0 });
      io.observe(root);
    }

    return () => {
      io?.disconnect();
      cleanups.forEach((fn) => fn());
      ctx.revert();
      motes.forEach((m) => m.remove());
    };
  }

  return (
    <div className={`lbs ${className}`} ref={rootRef}>
      <style>{LBS_CSS}</style>
      {/* The 16:10 stage has empty margins around the book and lamp; the crop
          box trims them so the objects fill the space they are given. */}
      <div className="lbs-crop">
        <div
          className="lbs-stage"
          id="lbs-stage-root"
          role="img"
          aria-label="A green banker's lamp switching on over a book that opens, highlights a line and turns its pages"
          dangerouslySetInnerHTML={{ __html: SCENE_MARKUP }}
        />
      </div>
    </div>
  );
}


const LBS_CSS = `
/* No room behind the scene: wall, desk and vignette are transparent, so the
   lamp and the book sit directly on whatever reading theme is active.
   Only the light is tuned per theme. */
.lbs {
  --lbs-wall-top: transparent; --lbs-wall-bot: transparent;
  --lbs-desk-0: transparent; --lbs-desk-1: transparent; --lbs-desk-2: transparent;
  --lbs-desk-edge: transparent; --lbs-grain: transparent;
  --lbs-shade: transparent; --lbs-dim: transparent;

  /* Dark themes: the sample's warm glow (pushed a touch brighter) */
  --lbs-cone-0: #ffc970; --lbs-cone-0a: .46;
  --lbs-cone-1: #ffb850; --lbs-cone-1a: .18;
  --lbs-bulb-0: #fff6d8; --lbs-bulb-1: #ffd27a; --lbs-bulb-2: #ffb347;
  --lbs-pool-0: #ffcf7a; --lbs-pool-0a: .5;
  --lbs-pool-1: #f0a948; --lbs-pool-1a: .18;
  --lbs-mote: #ffe6b0;
  --lbs-glow-blend: screen;
  width: 100%;
}
/* Light themes: pale light is invisible on paper, so the glow becomes a deeper
   amber that reads as lamplight on a light page. */
[data-theme-mode="light"] .lbs {
  --lbs-cone-0: #f0a030; --lbs-cone-0a: .55;
  --lbs-cone-1: #f2ad52; --lbs-cone-1a: .22;
  --lbs-bulb-0: #fff1c4; --lbs-bulb-1: #f5b84e; --lbs-bulb-2: #e8952c;
  --lbs-pool-0: #e9962f; --lbs-pool-0a: .5;
  --lbs-pool-1: #f0a948; --lbs-pool-1a: .16;
  --lbs-mote: #d98a2b;
  --lbs-glow-blend: multiply;
}
/* High-contrast themes: keep the glow, but quieter so text contrast wins */
[data-theme="high-contrast-light"] .lbs, [data-theme="high-contrast-dark"] .lbs { --lbs-cone-0a: .22; --lbs-pool-0a: .3; }

/* Crop window = stage x 11%–97.5%, y 17%–88% (everything the animation uses). */
.lbs-crop { position: relative; width: 100%; aspect-ratio: 13.84 / 7.1; overflow: hidden; }
.lbs-stage { position: absolute; overflow: hidden; aspect-ratio: 16 / 10;
  width: calc(100% / 0.865); left: calc(-11% / 0.865); top: calc(-17% / 0.71); }
.lbs-stage #lbs-coneGrad stop:nth-child(1) { stop-color: var(--lbs-cone-0); stop-opacity: var(--lbs-cone-0a); }
.lbs-stage #lbs-coneGrad stop:nth-child(2) { stop-color: var(--lbs-cone-1); stop-opacity: var(--lbs-cone-1a); }
.lbs-stage #lbs-coneGrad stop:nth-child(3) { stop-color: var(--lbs-cone-1); stop-opacity: 0; }
.lbs-stage #lbs-bulbGrad stop:nth-child(1) { stop-color: var(--lbs-bulb-0); }
.lbs-stage #lbs-bulbGrad stop:nth-child(2) { stop-color: var(--lbs-bulb-1); }
.lbs-stage #lbs-bulbGrad stop:nth-child(3) { stop-color: var(--lbs-bulb-2); }
.lbs-stage #lbs-poolGrad stop:nth-child(1) { stop-color: var(--lbs-pool-0); stop-opacity: var(--lbs-pool-0a); }
.lbs-stage #lbs-poolGrad stop:nth-child(2) { stop-color: var(--lbs-pool-1); stop-opacity: var(--lbs-pool-1a); }
.lbs-stage #lbs-poolGrad stop:nth-child(3) { stop-color: var(--lbs-pool-1); stop-opacity: 0; }
.lbs-stage #lbs-motes { fill: var(--lbs-mote); }
.lbs-stage #lbs-lightLayer { mix-blend-mode: var(--lbs-glow-blend); }
.lbs-stage > svg { position: absolute; width: 0 !important; height: 0 !important; }
.lbs-stage .abs { position: absolute; }
.lbs-stage .fill { position: absolute; inset: 0; }
.lbs-stage svg { display: block; width: 100%; height: 100%; overflow: visible; }
.lbs-stage #lbs-lampBox { left: 69.375%; top: 21%; width: 26.3125%; height: 56%; }
.lbs-stage #lbs-bookBox { left: 12.5%; top: 20%; width: 56.31%; height: 56%; }
.lbs-stage #lbs-toolbar { width: 19.48%; height: 10.65%; transform: translate(-50%, -100%);
  display: flex; justify-content: space-between; pointer-events: none; }
.lbs-stage .icon { width: 29.9%; height: 100%; filter: drop-shadow(0 3px 4px rgba(0,0,0,.35)); }
.lbs-stage .face, .lbs-stage .half, .lbs-stage #lbs-cover { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
`;