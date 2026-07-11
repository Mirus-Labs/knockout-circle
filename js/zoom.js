/* Knockout Circle — desktop zoom camera.
   Level 0: the full circle · Level 1: a bracket wedge / round ring · Level 2: match stage
   (game on the left, stats on the right), a takeover of the circle's stage area.

   The camera is one GSAP transform on #bracketCam. All frames live in fraction space
   (0..1 of the bracket square) with xPercent/yPercent, so window resizes need no math.
   Focus membership is carried in data-* attributes because the kc:live handler in
   app.js rewrites chip/badge classNames wholesale on every poll. */
(() => {
  const KC = window.KC;
  const D = window.KC_DATA;
  const UI = window.KC_UI;
  const cam = document.getElementById('bracketCam');
  const bracket = document.getElementById('bracket');
  const stageEl = document.querySelector('.bracket-stage');
  const matchStage = document.getElementById('matchStage');
  const msCard = document.getElementById('msCard');
  const msStats = document.getElementById('msStats');
  const msBack = document.getElementById('msBack');
  const controls = document.getElementById('circleControls');
  if (!KC || !UI || !cam || !bracket || !stageEl || !matchStage || !window.gsap) return;

  const { ROUNDS, TEAMS } = KC;
  const UNIT = 360 / 32;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ---------- tuning ---------- */
  const WHEEL_STEP = 140;      // accumulated deltaY per level step
  const WHEEL_COOLDOWN = 500;  // ms before the next step is accepted
  const IDLE_RESET = 180;      // wheel silence that clears the accumulator
  const PINCH_GAIN = 3;        // ctrl+wheel (trackpad pinch) deltas are tiny
  const CENTER_R = 0.13;       // cursor radius (fraction) that reads as "the middle"
  const PAD_WEDGE = 0.06;
  const PAD_ROUND = 0.07;
  const SCALE_GAME = 3.4;      // transient push-in scale for the L2 handoff

  const Z = { level: 0, focus: null, game: null, returnFocus: null, animating: false };
  let acc = 0, lastWheel = 0, coolUntil = 0;

  const active = () => finePointer.matches && window.innerWidth > 640;
  const dur = (x) => (reduced.matches ? 0 : x);

  /* ---------- membership: data-wedge (w0..w3 | c) + data-round ---------- */
  const wedgeOfSlot = (i) => 'w' + Math.floor(i / 8);
  const wedgeOfTie = (key, k) =>
    key === 'r32' ? 'w' + Math.floor(k / 4)
      : key === 'r16' ? 'w' + Math.floor(k / 2)
        : key === 'qf' ? 'w' + k
          : 'c';

  function tagMembership() {
    Object.keys(UI.badgeEls).forEach((code) => {
      const b = UI.badgeEls[code];
      const i = KC.ORDER.indexOf(code);
      b.dataset.wedge = wedgeOfSlot(i);
      b.dataset.round = 't';
    });
    Object.keys(UI.chipEls).forEach((id) => {
      const dash = id.lastIndexOf('-');
      const key = id.slice(0, dash), k = +id.slice(dash + 1);
      const c = UI.chipEls[id];
      c.dataset.wedge = wedgeOfTie(key, k);
      c.dataset.round = key;
    });
    document.querySelectorAll('#wires .wire').forEach((w) => {
      const id = w.dataset.wire || '';
      const t = /^t(\d+)$/.exec(id);
      const r = /^(r32|r16|qf|sf)(\d+)$/.exec(id);
      if (t) { w.dataset.wedge = wedgeOfSlot(+t[1]); w.dataset.round = 't'; }
      else if (r) { w.dataset.wedge = wedgeOfTie(r[1], +r[2]); w.dataset.round = r[1]; }
    });
    // junctions are appended in round order (buildWires): 16 r32, 8 r16, 4 qf, 2 sf
    const seq = [];
    for (let ri = 0; ri < ROUNDS.length - 1; ri++)
      for (let k = 0; k < ROUNDS[ri].count; k++) seq.push([ROUNDS[ri].key, k]);
    document.querySelectorAll('#wires .junction').forEach((j, n) => {
      if (!seq[n]) return;
      j.dataset.wedge = wedgeOfTie(seq[n][0], seq[n][1]);
      j.dataset.round = seq[n][0];
    });
  }

  /* ---------- camera frames (fraction space) ---------- */
  const IDENTITY = { fx: .5, fy: .5, s: 1 };
  const FRAMES = { wedge: [], round: {}, center: null };

  function wedgeFrame(w) {
    const pts = [];
    for (let i = w * 8; i < w * 8 + 8; i++) { const p = KC.teamPos(i); pts.push([p.l / 100, p.t / 100]); }
    const node = (ri, k) => { const p = KC.nodePos(ri, k); pts.push([p.l / 100, p.t / 100]); };
    for (let k = w * 4; k < w * 4 + 4; k++) node(0, k);
    for (let k = w * 2; k < w * 2 + 2; k++) node(1, k);
    node(2, w);
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    x0 -= PAD_WEDGE; y0 -= PAD_WEDGE; x1 += PAD_WEDGE; y1 += PAD_WEDGE;
    const s = Math.max(1.5, Math.min(2.2, Math.min(0.92 / (x1 - x0), 0.92 / (y1 - y0))));
    return { fx: (x0 + x1) / 2, fy: (y0 + y1) / 2, s };
  }

  function computeFrames() {
    for (let w = 0; w < 4; w++) FRAMES.wedge[w] = wedgeFrame(w);
    ROUNDS.forEach((r) => {
      FRAMES.round[r.key] = { fx: .5, fy: .5, s: Math.max(1.15, Math.min(2.6, 0.5 / (r.R + PAD_ROUND))) };
    });
    FRAMES.center = { fx: .5, fy: .5, s: Math.min(2.6, 0.5 / (ROUNDS[3].R + PAD_ROUND)) };
  }

  const gameFrame = (key, idx) => {
    const p = KC.nodePos(KC.roundIdx(key), idx);
    return { fx: p.l / 100, fy: p.t / 100, s: SCALE_GAME };
  };

  const focusId = (f) => (!f ? null : f.type === 'wedge' ? 'w' + f.w : f.type === 'center' ? 'c' : f.key);
  const frameOf = (f) => (f.type === 'wedge' ? FRAMES.wedge[f.w] : f.type === 'center' ? FRAMES.center : FRAMES.round[f.key]);

  function applyCamera(f, d, ease) {
    gsap.to(cam, {
      xPercent: (0.5 - f.s * f.fx) * 100,
      yPercent: (0.5 - f.s * f.fy) * 100,
      scale: f.s,
      transformOrigin: '0 0',
      duration: dur(d),
      ease: ease || 'expo.out',
      overwrite: 'auto',
    });
  }

  function setFocus(f) {
    Z.focus = f;
    if (f) bracket.dataset.focus = focusId(f);
    else delete bracket.dataset.focus;
    stageEl.classList.toggle('is-zoomed', Z.level > 0);
    syncControls();
  }

  /* ---------- cursor → content space → target ---------- */
  function contentPoint(ev) {
    const r = bracket.getBoundingClientRect();
    const px = (ev.clientX - r.left) / r.width;
    const py = (ev.clientY - r.top) / r.height;
    const s = Number(gsap.getProperty(cam, 'scaleX')) || 1;
    const tx = (Number(gsap.getProperty(cam, 'xPercent')) || 0) / 100;
    const ty = (Number(gsap.getProperty(cam, 'yPercent')) || 0) / 100;
    return { x: (px - tx) / s, y: (py - ty) / s };
  }

  function cursorTarget(ev) {
    const { x, y } = contentPoint(ev);
    const dx = x - 0.5, dy = y - 0.5;
    if (Math.hypot(dx, dy) < CENTER_R) return { type: 'center' };
    let ang = Math.atan2(dx, -dy) * 180 / Math.PI; // 0° = 12 o'clock, clockwise
    ang = (ang + 360 + UNIT / 2) % 360;
    return { type: 'wedge', w: Math.floor(ang / 90) };
  }

  function nearestChip(ev, focus) {
    let best = null, bd = Infinity;
    Object.keys(UI.chipEls).forEach((id) => {
      const dash = id.lastIndexOf('-');
      const key = id.slice(0, dash), k = +id.slice(dash + 1);
      if (focus) {
        if (focus.type === 'wedge' && wedgeOfTie(key, k) !== 'w' + focus.w) return;
        if (focus.type === 'center' && wedgeOfTie(key, k) !== 'c') return;
        if (focus.type === 'round' && key !== focus.key) return;
      }
      const r = UI.chipEls[id].getBoundingClientRect();
      const d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
      if (d < bd) { bd = d; best = { key, idx: k }; }
    });
    return best;
  }

  /* ---------- the circle's reveal must not fight the dim/camera ---------- */
  let revealDone = false;
  function ensureRevealDone() {
    if (revealDone) return;
    revealDone = true;
    if (!window.ScrollTrigger) return;
    ScrollTrigger.getAll().forEach((st) => {
      const t = st.trigger;
      if (t && typeof t.closest === 'function' && t.closest('#circle') && st.animation) {
        st.animation.progress(1);
      }
    });
  }

  /* ---------- level transitions ---------- */
  function toL1(focus) {
    UI.hideTip();
    ensureRevealDone();
    Z.level = 1;
    Z.game = null;
    setFocus(focus);
    applyCamera(frameOf(focus), .8);
  }

  function toL0() {
    Z.level = 0;
    Z.game = null;
    setFocus(null);
    applyCamera(IDENTITY, .65);
  }

  function toL2(key, idx) {
    const from = Z.level;
    UI.hideTip();
    ensureRevealDone();
    Z.level = 2;
    Z.game = { key, idx };
    const wid = wedgeOfTie(key, idx);
    Z.returnFocus = wid === 'c' ? { type: 'center' } : { type: 'wedge', w: +wid.slice(1) };
    setFocus(Z.focus || Z.returnFocus); // keep the circle dimmed sensibly beneath the takeover
    buildMatchStage(key, idx, false);

    Z.animating = true;
    const gf = gameFrame(key, idx);
    const push = from === 0 ? .7 : .55;
    matchStage.hidden = false;
    const digits = msCard.querySelector('.mm-digits');
    const tl = gsap.timeline({
      onComplete: () => { Z.animating = false; cam.style.visibility = 'hidden'; },
    });
    tl.to(cam, {
      xPercent: (0.5 - gf.s * gf.fx) * 100,
      yPercent: (0.5 - gf.s * gf.fy) * 100,
      scale: gf.s,
      transformOrigin: '0 0',
      duration: dur(push),
      ease: from === 0 ? 'expo.inOut' : 'power2.in',
      overwrite: 'auto',
    }, 0)
      .to(cam, { opacity: 0, duration: dur(.25) }, Math.max(0, dur(push) - dur(.25)))
      .fromTo(msCard, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: dur(.5), ease: 'expo.out' }, dur(push) * .6)
      .fromTo(msStats.children, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: dur(.45), ease: 'expo.out', stagger: dur(.04) }, dur(push) * .65);
    if (digits) {
      tl.fromTo(digits, { scale: .55, y: -18, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: dur(.6), ease: 'expo.out' }, dur(push) * .55);
    }
    msBack.focus({ preventScroll: true });
  }

  /* exit the match stage → L1 focus (or L0 when focus is null) */
  function leaveStage(focus) {
    const returnChip = Z.game && UI.chipEls[Z.game.key + '-' + Z.game.idx];
    Z.game = null;
    Z.animating = true;
    const tl = gsap.timeline({
      onComplete: () => {
        matchStage.hidden = true;
        Z.animating = false;
        if (returnChip) returnChip.focus({ preventScroll: true });
      },
    });
    tl.to([msCard, msStats], { y: 14, opacity: 0, duration: dur(.28), ease: 'power2.in' }, 0);
    cam.style.visibility = 'visible';
    tl.to(cam, { opacity: 1, duration: dur(.3) }, dur(.08));
    if (focus) {
      Z.level = 1;
      setFocus(focus);
      applyCamera(frameOf(focus), .7);
    } else {
      Z.level = 0;
      setFocus(null);
      applyCamera(IDENTITY, .75);
    }
  }

  function stepIn(ev) {
    if (Z.level === 0) toL1(cursorTarget(ev));
    else if (Z.level === 1) {
      const c = nearestChip(ev, Z.focus);
      if (c) toL2(c.key, c.idx);
    }
  }

  function stepOut() {
    if (Z.level === 2) leaveStage(Z.returnFocus);
    else if (Z.level === 1) toL0();
  }

  /* ---------- the match stage (game left · stats right) ---------- */
  function buildMatchStage(key, idx, isRefresh) {
    const id = key + '-' + idx;
    const st = KC.statusOf(key, idx);
    const sc = KC.scoreOf(key, idx);
    const M = (D.META || {})[id] || {};
    const R = (D.RESULTS || {})[id];
    const ri = KC.roundIdx(key);
    const real = !!D.REAL;

    const when = [UI.fmtDate(M.date), M.time, M.ground].filter(Boolean).join(' · ');
    const pens = sc.pens
      ? (R && Array.isArray(R.penScore) ? `${R.penScore[0]}–${R.penScore[1]} on penalties` : 'Decided on penalties')
      : '';
    msCard.innerHTML = `
      <div class="ms-round">${ROUNDS[ri].name}</div>
      ${UI.matchFaceHTML(key, idx)}
      ${pens ? `<div class="ms-pens">${pens}</div>` : ''}
      ${when ? `<div class="ms-when">${when}</div>` : ''}`;
    msCard.querySelectorAll('.mm-team[data-team]').forEach((btn) => {
      if (btn.dataset.team) btn.addEventListener('click', () => UI.openTeam(btn.dataset.team));
    });

    const secs = [];
    if (real) {
      if (st === 'upcoming') {
        if (when) secs.push(`<div class="mm-sec">KICK-OFF</div><div class="ms-note">${when}</div>`);
      } else {
        secs.push(`<div class="mm-sec">TIMELINE</div><div class="ms-timeline">${UI.goalTimelineHTML(key, idx)}</div>`);
      }
      secs.push(`<div class="mm-sec mt">TEAM FACTS</div>${UI.teamFactsHTML(key, idx)}`);
    } else {
      secs.push(UI.fakeStats(key, idx, st));
      secs.push(`<div class="mm-sec mt">TEAM FACTS</div>${UI.teamFactsHTML(key, idx)}`);
    }
    secs.push(UI.outcomesHTML(key, idx));

    const scroll = isRefresh ? msStats.scrollTop : 0;
    msStats.innerHTML = secs.join('');
    const fills = msStats.querySelectorAll('.sbar-fill');
    if (fills.length) {
      if (!isRefresh && !reduced.matches && window.gsap) {
        gsap.fromTo(fills, { width: 0 },
          { width: (i, t) => t.dataset.w + '%', duration: .8, ease: 'power3.out', stagger: .05, delay: .25 });
      } else {
        fills.forEach((f) => { f.style.width = f.dataset.w + '%'; });
      }
    }
    msStats.scrollTop = scroll;
  }

  function refreshMatchStage(force) {
    if (Z.level !== 2 || !Z.game) return;
    if (!force && KC.statusOf(Z.game.key, Z.game.idx) !== 'live') return;
    buildMatchStage(Z.game.key, Z.game.idx, true);
  }

  /* ---------- round pills + reset ---------- */
  function buildControls() {
    if (!controls) return;
    controls.innerHTML = ROUNDS.map((r) =>
      `<button class="zc-pill" data-round="${r.key}" data-cursor aria-pressed="false" aria-label="Focus the ${r.name}">${r.short}</button>`
    ).join('') + `<button class="zc-reset" data-cursor hidden>&#10554; Overview</button>`;
    controls.hidden = !active();
    controls.querySelectorAll('.zc-pill').forEach((b) => {
      b.addEventListener('click', () => {
        if (Z.animating) return;
        const key = b.dataset.round;
        const same = Z.level === 1 && Z.focus && Z.focus.type === 'round' && Z.focus.key === key;
        if (same) { toL0(); return; }
        if (Z.level === 2) { leaveStage({ type: 'round', key }); return; }
        toL1({ type: 'round', key });
      });
    });
    controls.querySelector('.zc-reset').addEventListener('click', () => {
      if (Z.animating) return;
      if (Z.level === 2) leaveStage(null);
      else toL0();
    });
  }

  function syncControls() {
    if (!controls) return;
    controls.querySelectorAll('.zc-pill').forEach((b) => {
      const on = !!(Z.focus && Z.focus.type === 'round' && Z.focus.key === b.dataset.round && Z.level === 1);
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('active', on);
    });
    const reset = controls.querySelector('.zc-reset');
    if (reset) reset.hidden = Z.level === 0;
  }

  /* ---------- input ---------- */
  function onWheel(ev) {
    if (!active()) return;
    if (Z.level === 2 && ev.target && ev.target.closest && ev.target.closest('.ms-stats')) return; // panel scrolls natively
    ev.preventDefault();
    const now = performance.now();
    if (Z.animating || now < coolUntil) return;
    if (now - lastWheel > IDLE_RESET) acc = 0;
    lastWheel = now;
    const gain = ev.ctrlKey ? PINCH_GAIN : 1;
    acc += (ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY) * gain;
    if (acc <= -WHEEL_STEP) { acc = 0; coolUntil = now + WHEEL_COOLDOWN; stepIn(ev); }
    else if (acc >= WHEEL_STEP) { acc = 0; coolUntil = now + WHEEL_COOLDOWN; stepOut(); }
  }

  bracket.addEventListener('wheel', onWheel, { passive: false });
  matchStage.addEventListener('wheel', onWheel, { passive: false });

  // at L1 a click on empty circle ground re-aims the wedge (chips/badges keep their own handlers)
  bracket.addEventListener('click', (ev) => {
    if (!active() || Z.level !== 1 || Z.animating) return;
    if (ev.target.closest && ev.target.closest('.chip, .badge, .final-node')) return;
    const t = cursorTarget(ev);
    if (focusId(t) !== focusId(Z.focus)) toL1(t);
  });

  msBack.addEventListener('click', () => { if (!Z.animating) leaveStage(Z.returnFocus); });

  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || Z.level === 0 || !active()) return;
    const overlay = document.getElementById('overlay');
    if (overlay && !overlay.hidden) return; // the modal's own Escape handler wins this round
    if (!Z.animating) stepOut();
  });

  let rsT = null;
  window.addEventListener('resize', () => {
    clearTimeout(rsT);
    rsT = setTimeout(() => {
      if (controls) controls.hidden = !active();
      if (Z.level > 0 && !active()) {
        gsap.killTweensOf(cam);
        gsap.set(cam, { xPercent: 0, yPercent: 0, scale: 1, opacity: 1 });
        cam.style.visibility = 'visible';
        matchStage.hidden = true;
        Z.level = 0;
        Z.game = null;
        Z.animating = false;
        setFocus(null);
      }
    }, 150);
  });

  window.addEventListener('kc:tick', () => refreshMatchStage(false));
  window.addEventListener('kc:live', () => refreshMatchStage(true));

  /* ---------- boot ---------- */
  tagMembership();
  computeFrames();
  buildControls();

  window.KC_ZOOM = {
    get level() { return Z.level; },
    get animating() { return Z.animating; },
    active,
    flyToGame(key, idx) {
      if (!active() || Z.animating) { UI.openMatch(key, idx); return; }
      if (Z.level === 2 && Z.game && Z.game.key === key && Z.game.idx === idx) return;
      toL2(key, idx);
    },
  };
})();
