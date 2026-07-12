/* Knockout Circle — DOM construction & interaction */
(() => {
  const KC = window.KC;
  const { TEAMS, ORDER, ROUNDS } = KC;
  const D = window.KC_DATA;

  /* real-data mode: scores/bracket come from the daily feed (see adapter.js) */
  const REAL = !!D.REAL;
  const MF = window.KC_MATCH_FACTS;
  const RESULT = (key, idx) => (D.RESULTS || {})[key + '-' + idx];
  const KICKOFF = (key, idx) => (D.META || {})[key + '-' + idx] || {};
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (iso) => {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return MONTHS[+m - 1] + ' ' + (+d);
  };
  // kick-off meta stores venue-local time (e.g. "15:00 UTC-4"); the UI below shows it in the VIEWER's zone.
  const kickoffMs = (M) => {
    if (!M) return null;
    const iso = M.kickoffUtc || (MF && MF.kickoffIso ? MF.kickoffIso(M) : null);
    const ms = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(ms) ? null : ms;
  };
  // viewer-local calendar day of kick-off (YYYY-MM-DD), for TODAY/TOMORROW comparisons
  const localDayOf = (M) => {
    const ms = kickoffMs(M);
    if (ms == null) return (M && M.date) || '';
    const d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  // "Jul 14" in the viewer's zone (falls back to the raw venue date if conversion is unavailable)
  const localDateLabel = (M) => {
    const ms = kickoffMs(M);
    if (ms == null) return fmtDate(M && M.date);
    try { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(ms)); }
    catch { return fmtDate(M && M.date); }
  };
  // "3:00 PM EDT" in the viewer's zone; '' when the schedule has no wall-clock time
  const localTimeLabel = (M) => {
    if (!M || !M.time) return '';
    const ms = kickoffMs(M);
    if (ms == null) return M.time;
    try { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' }).format(new Date(ms)); }
    catch { return M.time; }
  };
  const goalLine = (list) => list.map(g =>
    `${g.name} ${g.minute}′${g.penalty ? ' (p)' : ''}${g.owngoal ? ' (og)' : ''}`).join(' · ');
  // the viewer's LOCAL calendar date — toISOString() is UTC and flips "today" too early in the evening
  const localDay = (offset) => {
    const d = new Date();
    if (offset) d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const localToday = () => localDay(0);
  // TODAY / TOMORROW / "JUL 14" for an upcoming tie; SOON when the schedule has no date (authored mode)
  const whenLabel = (key, idx) => {
    const M = KICKOFF(key, idx);
    if (!M.date) return 'SOON';
    const day = localDayOf(M);
    if (day === localDay(0)) return 'TODAY';
    if (day === localDay(1)) return 'TOMORROW';
    return localDateLabel(M).toUpperCase();
  };
  // news items from data/news.json carry an ISO timestamp; authored ones a "19m" string
  const newsTime = (n) => {
    if (!n.iso) return n.time;
    const mins = Math.max(1, Math.round((Date.now() - new Date(n.iso)) / 60000));
    return mins < 60 ? mins + 'm' : mins < 1440 ? Math.round(mins / 60) + 'h' : Math.round(mins / 1440) + 'd';
  };
  const updatedTime = (iso) => {
    if (!iso || Number.isNaN(Date.parse(iso))) return 'Update unavailable';
    const mins = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
    if (mins < 1) return 'Updated just now';
    if (mins < 60) return `Updated ${mins}m ago`;
    return `Updated ${Math.floor(mins / 60)}h ago`;
  };
  const attr = (value) => String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const newsImage = (n, className) => n.image
    ? `<img class="${className}" src="${attr(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '';
  const bindNewsImageFallback = (root) => {
    root.querySelectorAll('.news-thumb-image, .nm-image').forEach((image) => {
      image.addEventListener('error', () => image.remove(), { once: true });
    });
  };

  const $ = (s, c) => (c || document).querySelector(s);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  const bracket = $('#bracket');
  const cam = $('#bracketCam') || bracket; // zoom camera layer — transformed by js/zoom.js
  const wires = $('#wires');
  const tip = $('#tip');
  const overlay = $('#overlay');
  const modalCard = $('#modalCard');

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ================= BRACKET ================= */
  const chipEls = {};   // key-idx -> element
  const badgeEls = {};  // code -> element

  function buildWires() {
    const NS = 'http://www.w3.org/2000/svg';
    const frag = document.createDocumentFragment();
    const mk = (d, cls, key) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', 'wire' + (cls ? ' ' + cls : ''));
      p.dataset.wire = key;
      frag.appendChild(p);
    };
    const elbow = (cR, cA, pR, pA, cls, key) => {
      const A = KC.svgP(cR, cA), C = KC.svgP(pR, pA);
      let d;
      if (pR < 0.02) {
        d = `M${A[0].toFixed(1)} ${A[1].toFixed(1)}L500 500`;
      } else {
        const B = KC.svgP(pR, cA);
        const rad = (pR * 1000).toFixed(1);
        const sweep = pA > cA ? 1 : 0;
        d = `M${A[0].toFixed(1)} ${A[1].toFixed(1)}L${B[0].toFixed(1)} ${B[1].toFixed(1)}A${rad} ${rad} 0 0 ${sweep} ${C[0].toFixed(1)} ${C[1].toFixed(1)}`;
      }
      mk(d, cls, key);
    };
    // a wire is 'adv' when its team won through, 'next' when it feeds the next upcoming (VS) tie
    const wireCls = (adv, parentKey, parentIdx, childUpcoming) => adv ? 'adv'
      : (!childUpcoming && KC.statusOf(parentKey, parentIdx) === 'upcoming') ? 'next' : '';

    for (let i = 0; i < 32; i++) {
      const code = ORDER[i];
      const mi = Math.floor(i / 2);
      elbow(D.TEAM_R, i * D.UNIT, ROUNDS[0].R, KC.nodeAng(0, mi),
        wireCls(KC.winnerOf('r32', mi) === code, 'r32', mi, false), 't' + i);
    }
    for (let ri = 0; ri < ROUNDS.length - 1; ri++) {
      const r = ROUNDS[ri];
      for (let k = 0; k < r.count; k++) {
        const cw = KC.winnerOf(r.key, k);
        const pk = ROUNDS[ri + 1].key, pi = Math.floor(k / 2);
        const pw = KC.winnerOf(pk, pi);
        elbow(r.R, KC.nodeAng(ri, k), ROUNDS[ri + 1].R, KC.nodeAng(ri + 1, pi),
          wireCls(!!cw && cw === pw, pk, pi, KC.statusOf(r.key, k) === 'upcoming'), r.key + k);
      }
    }
    for (let ri = 0; ri < ROUNDS.length - 1; ri++) {
      for (let k = 0; k < ROUNDS[ri].count; k++) {
        const P = KC.svgP(ROUNDS[ri].R, KC.nodeAng(ri, k));
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', P[0]); c.setAttribute('cy', P[1]); c.setAttribute('r', 2.6);
        c.setAttribute('class', 'junction');
        frag.appendChild(c);
      }
    }
    wires.appendChild(frag);
  }

  function buildBadges() {
    for (let i = 0; i < 32; i++) {
      const code = ORDER[i];
      const t = TEAMS[code];
      const p = KC.teamPos(i);
      const st = KC.teamState(code);
      const b = el('button', `badge state-${st}`, `<span class="coin">${t.f}</span><span class="code">${code}</span>`);
      b.style.left = p.l + '%';
      b.style.top = p.t + '%';
      b.dataset.code = code;
      b.dataset.cursor = '';
      b.setAttribute('aria-label', `${t.n} — team profile`);
      b.title = t.n;
      b.addEventListener('click', () => openTeam(code));
      cam.appendChild(b);
      badgeEls[code] = b;
    }
  }

  function chipContent(key, idx) {
    const st = KC.statusOf(key, idx);
    const sc = KC.scoreOf(key, idx);
    if (st === 'finished') return `${sc.a}–${sc.b}${sc.pens ? '<span style="opacity:.7;font-size:9px"> p</span>' : ''}`;
    if (st === 'live') return `<span class="dot-live"></span>${sc.a}–${sc.b}<span class="chip-min">${sc.min}′</span>`;
    const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
    if (a && b) return `<span class="chip-flag">${TEAMS[a].f}</span><span class="chip-vs-sep">VS</span><span class="chip-flag">${TEAMS[b].f}</span>`;
    return 'VS';
  }

  function buildChips() {
    for (let ri = 0; ri < ROUNDS.length; ri++) {
      const r = ROUNDS[ri];
      for (let k = 0; k < r.count; k++) {
        if (r.key === 'final') {
          const f = el('button', 'final-node', `<span class="cup">🏆</span><span class="cup-label">FINAL</span>`);
          f.dataset.cursor = '';
          f.setAttribute('aria-label', 'The Final');
          f.addEventListener('click', () => openTie('final', 0));
          if (canHover) {
            f.addEventListener('mouseenter', () => showTip('final', 0));
            f.addEventListener('mouseleave', hideTip);
          }
          cam.appendChild(f);
          chipEls['final-0'] = f;
          continue;
        }
        const st = KC.statusOf(r.key, k);
        const p = KC.nodePos(ri, k);
        const c = el('button', 'chip' + (st === 'live' ? ' is-live' : st === 'upcoming' ? ' is-vs' : ''), chipContent(r.key, k));
        c.style.left = p.l + '%';
        c.style.top = p.t + '%';
        c.dataset.cursor = '';
        c.setAttribute('aria-label', `${r.name} tie ${k + 1}`);
        c.addEventListener('click', () => openTie(r.key, k));
        if (canHover) {
          c.addEventListener('mouseenter', () => showTip(r.key, k));
          c.addEventListener('mouseleave', hideTip);
        }
        cam.appendChild(c);
        chipEls[r.key + '-' + k] = c;
      }
    }
  }

  /* ================= TOOLTIP ================= */
  function tipBar(label, va, vb, pct) {
    const tot = pct ? 100 : (parseFloat(va) + parseFloat(vb)) || 1;
    const fa = pct ? va : (parseFloat(va) / tot * 100);
    return `<div class="tip-bar">
      <div class="tip-bar-nums"><span>${pct ? va + '%' : va}</span><span class="lbl">${label}</span><span>${pct ? vb + '%' : vb}</span></div>
      <div class="tip-track"><div class="tip-fill" style="width:${fa}%"></div><div class="tip-rest"></div></div>
    </div>`;
  }

  function showTip(key, idx) {
    if (window.KC_ZOOM && KC_ZOOM.level > 0) return; // tooltips are for the overview only
    const ri = KC.roundIdx(key);
    const p = KC.nodePos(ri, idx);
    const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
    const sc = KC.scoreOf(key, idx);
    const st = KC.statusOf(key, idx);
    const nm = (c) => c ? `${TEAMS[c].f} ${c}` : '—';
    const stLabel = st === 'live' ? `LIVE · ${sc.min}′` : st === 'finished' ? (sc.pens ? 'FULL TIME · PENS' : 'FULL TIME') : `KICK-OFF · ${whenLabel(key, idx)}`;
    let mid;
    if (REAL) {
      const R = RESULT(key, idx), M = KICKOFF(key, idx);
      if (R) {
        const rows = [goalLine(R.goalsA), goalLine(R.goalsB)].filter(Boolean);
        mid = `<div style="font-size:11px;line-height:1.55;opacity:.85;margin:6px 0 2px">
            ${rows.length ? rows.map(r => `⚽ ${r}`).join('<br>') : (R.pens ? 'Goalless — decided on penalties' : 'No goals')}
          </div>
          <div style="font-size:10px;opacity:.55">${localDateLabel(M)}${M.ground ? ' · ' + M.ground : ''}</div>`;
      } else {
        const t = localTimeLabel(M);
        mid = `<div style="font-size:11px;opacity:.85;margin:8px 0 2px">Kick-off ${localDateLabel(M)}${t ? ' · ' + t : ''}</div>
          <div style="font-size:10px;opacity:.55">${M.ground || ''}</div>`;
      }
    } else {
      const S = KC.matchStats(key, idx);
      mid = tipBar('POSS', S.possA, S.possB, true)
        + tipBar('SHOTS', S.shotsA, S.shotsB, false)
        + tipBar('xG', S.xgA, S.xgB, false);
    }
    tip.innerHTML = `
      <div class="tip-status${st === 'live' ? ' live' : ''}">${stLabel}</div>
      <div class="tip-teams"><span>${nm(a)}</span><span class="tip-score">${sc.a == null ? '–' : sc.a + '–' + sc.b}</span><span>${nm(b)}</span></div>
      ${mid}
      <div class="tip-cta">Click for full match & outcomes</div>`;
    const below = p.t < 24;
    tip.style.left = p.l + '%';
    tip.style.top = p.t + '%';
    tip.style.transform = `translate(-50%, ${below ? '18px' : 'calc(-100% - 16px)'})`;
    tip.hidden = false;
    tip.dataset.key = key; tip.dataset.idx = idx;
  }
  function hideTip() { tip.hidden = true; delete tip.dataset.key; }

  /* ================= MODALS ================= */
  let lastFocus = null;

  function openModal(html) {
    lastFocus = document.activeElement;
    modalCard.innerHTML = `<button class="modal-close" aria-label="Close">×</button>` + html;
    $('.modal-close', modalCard).addEventListener('click', closeModal);
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (window.gsap) {
      gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: .25, ease: 'power2.out' });
      gsap.fromTo(modalCard, { y: 26, opacity: 0, scale: .97 }, { y: 0, opacity: 1, scale: 1, duration: .38, ease: 'power3.out' });
    }
    $('.modal-close', modalCard).focus({ preventScroll: true });
  }

  function closeModal() {
    if (overlay.hidden) return;
    const done = () => { overlay.hidden = true; document.body.style.overflow = ''; if (lastFocus) lastFocus.focus({ preventScroll: true }); };
    if (window.gsap) {
      gsap.to(modalCard, { y: 14, opacity: 0, duration: .2, ease: 'power2.in' });
      gsap.to(overlay, { opacity: 0, duration: .22, ease: 'power2.in', onComplete: done });
    } else done();
  }

  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) closeModal(); });
  window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { closeModal(); hideTip(); } });

  /* ----- match modal ----- */
  function sbar(label, va, vb, pct) {
    const fa = pct ? va : (parseFloat(va) / ((parseFloat(va) + parseFloat(vb)) || 1) * 100);
    const aWin = parseFloat(va) >= parseFloat(vb);
    return `<div class="sbar">
      <div class="sbar-nums">
        <span class="va${aWin ? ' win' : ''}">${pct ? va + '%' : va}</span>
        <span class="lb">${label}</span>
        <span class="vb${!aWin ? ' win' : ''}">${pct ? vb + '%' : vb}</span>
      </div>
      <div class="sbar-track"><div class="sbar-fill" data-w="${fa}"></div><div class="sbar-rest"></div></div>
    </div>`;
  }

  function fakeStats(key, idx, st) {
    const S = KC.matchStats(key, idx);
    return `<div class="mm-sec">${st === 'upcoming' ? 'PROJECTED · FORM SNAPSHOT' : 'MATCH STATS'}</div>
      ${sbar('Possession', S.possA, S.possB, true)}
      ${sbar('Shots', S.shotsA, S.shotsB, false)}
      ${sbar('Shots on target', S.sotA, S.sotB, false)}
      ${sbar('Expected goals (xG)', S.xgA, S.xgB, false)}
      ${sbar('Corners', S.corA, S.corB, false)}
      ${sbar('Fouls', S.fouA, S.fouB, false)}
      ${sbar('Yellow cards', S.yelA, S.yelB, false)}`;
  }

  function realDetail(key, idx) {
    const R = RESULT(key, idx), M = KICKOFF(key, idx);
    const t = localTimeLabel(M);
    const when = `${localDateLabel(M)}${t ? ' · ' + t : ''}${M.ground ? ' · ' + M.ground : ''}`;
    if (!R) {
      return `<div class="mm-sec">KICK-OFF</div>
        <div style="font-size:14px;margin:4px 0 2px">${when}</div>`;
    }
    const col = (list, right) => list.length
      ? list.map(g => `<div>⚽ ${g.name} <span style="opacity:.6">${g.minute}′${g.penalty ? ' pen' : ''}${g.owngoal ? ' og' : ''}</span></div>`).join('')
      : `<div style="opacity:.5">No goals</div>`;
    return `<div class="mm-sec">GOALSCORERS</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;line-height:1.7">
        <div>${col(R.goalsA)}</div><div style="text-align:right">${col(R.goalsB, true)}</div>
      </div>
      ${R.pens ? '<div style="font-size:12px;opacity:.75;margin-top:8px">Decided on penalties.</div>' : ''}
      <div style="font-size:11px;opacity:.55;margin-top:8px">${when}</div>`;
  }

  /* shared builders — used by the match modal AND the zoomed match stage (js/zoom.js) */
  function matchFaceHTML(key, idx) {
    const ri = KC.roundIdx(key);
    const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
    const st = KC.statusOf(key, idx);
    const sc = KC.scoreOf(key, idx);
    const ta = a ? TEAMS[a] : null, tb = b ? TEAMS[b] : null;
    const stLabel = st === 'live' ? `LIVE · ${sc.min}′` : st === 'finished' ? (sc.pens ? 'FULL TIME (PENS)' : 'FULL TIME') : 'UPCOMING';
    const stCls = st === 'live' ? 'live' : st === 'finished' ? 'done' : '';

    const teamCol = (t, code) => `
      <button class="mm-team" data-team="${code || ''}" ${code ? '' : 'disabled'}>
        <span class="flag">${t ? t.f : '❔'}</span>
        <span class="name">${t ? t.n : 'To be decided'}</span>
        ${t ? `<span class="rank">FIFA #${t.rk}</span>` : ''}
      </button>`;

    return `<div class="mm-face">
        ${teamCol(ta, a)}
        <div class="mm-score">
          <div class="mm-status ${stCls}">${stLabel}</div>
          <div class="mm-digits">${sc.a == null ? '– : –' : sc.a + ' : ' + sc.b}</div>
          <div class="mm-round">${ROUNDS[ri].name}</div>
        </div>
        ${teamCol(tb, b)}
      </div>`;
  }

  function outcomesHTML(key, idx) {
    const ri = KC.roundIdx(key);
    const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
    const st = KC.statusOf(key, idx);
    const sc = KC.scoreOf(key, idx);
    const ta = a ? TEAMS[a] : null, tb = b ? TEAMS[b] : null;
    const w = KC.winnerOf(key, idx);
    const ni = KC.nextInfo(key, idx);

    const advText = (isFinalRound) => isFinalRound
      ? 'Lifts the World Cup 🏆 — champions of the world.'
      : `Advance to the ${ni.roundName}, facing ${ni.oppLabel}.`;
    const isFinalRound = ri >= ROUNDS.length - 1;

    const outcome = (title, desc, active, dim) => `
      <div class="outcome${active ? ' active' : ''}">
        <div class="oc-title${dim ? ' dim' : ''}">${title}</div>
        <div class="oc-desc">${desc}</div>
      </div>`;

    return `<div class="mm-sec mt">WHAT EACH RESULT UNLOCKS</div>
      <div class="outcomes">
        ${outcome((ta ? ta.n : 'Team A') + ' win', advText(isFinalRound), st === 'finished' && w === a)}
        ${outcome('Draw after 90′', st === 'finished' ? 'Decided in normal time.' : 'Level after 90 → extra time, then penalties decide who goes through.', false, true)}
        ${outcome((tb ? tb.n : 'Team B') + ' win', advText(isFinalRound), st === 'finished' && w === b)}
      </div>
      ${st === 'finished' ? `<div class="mm-advanced">✓ ${TEAMS[w].f} ${TEAMS[w].n} advanced${sc.pens ? ' on penalties' : ''}.</div>` : ''}`;
  }

  /* merged, minute-sorted goal list — real mode only (openfootball / ESPN shapes) */
  function goalTimelineHTML(key, idx) {
    const id = key + '-' + idx;
    const st = KC.statusOf(key, idx);
    const L = (D.LIVE || {})[id];
    const src = st === 'live' ? (L && L.goalsA ? L : null) : RESULT(key, idx);
    if (st === 'live' && !src) return `<div class="ms-note">Live — the goal timeline fills in at full-time.</div>`;
    if (!src) return '';
    const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
    const rows = [
      ...(src.goalsA || []).map(g => ({ g, code: a, side: 'a' })),
      ...(src.goalsB || []).map(g => ({ g, code: b, side: 'b' })),
    ].sort((x, y) => (parseInt(x.g.minute, 10) || 0) - (parseInt(y.g.minute, 10) || 0));
    if (!rows.length) {
      return `<div class="ms-note">${src.pens ? 'Goalless — decided on penalties.' : st === 'live' ? 'No goals yet.' : 'No goals.'}</div>`;
    }
    return rows.map(({ g, code, side }) => `
      <div class="tl-row ${side}">
        <span class="tl-min">${g.minute}′</span>
        <span class="tl-flag">${code && TEAMS[code] ? TEAMS[code].f : '⚽'}</span>
        <span class="tl-name">${g.name}${g.penalty ? ' <em>(pen)</em>' : ''}${g.owngoal ? ' <em>(og)</em>' : ''}</span>
      </div>`).join('');
  }

  /* form / rank / coach / star for both sides of a tie */
  function teamFactsHTML(key, idx) {
    const fc = { W: '#3fb968', D: '#caa83a', L: '#d65a4f' };
    const col = (code) => {
      if (!code || !TEAMS[code]) return `<div class="tf-col tf-tbd">To be decided</div>`;
      const t = TEAMS[code];
      return `<div class="tf-col">
        <div class="tf-team"><span class="tf-flag">${t.f}</span><span class="tf-code">${code}</span></div>
        <div class="form-row">${t.fm.map(r => `<span class="form-pill" style="background:${fc[r]}">${r}</span>`).join('')}</div>
        <div class="tf-meta"><span class="k">FIFA rank</span><span class="v">#${t.rk}</span></div>
        <div class="tf-meta"><span class="k">Coach</span><span class="v">${t.co}</span></div>
        <div class="tf-meta"><span class="k">Star</span><span class="v">${t.st}</span></div>
      </div>`;
    };
    const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
    return `<div class="tf-grid">${col(a)}${col(b)}</div>`;
  }

  /* desktop zoom flies into the game; everywhere else keeps the modal */
  function openTie(key, idx) {
    if (window.KC_ZOOM && KC_ZOOM.active()) { KC_ZOOM.flyToGame(key, idx); return; }
    openMatch(key, idx);
  }

  function openMatch(key, idx) {
    hideTip();
    const st = KC.statusOf(key, idx);

    openModal(`<div class="mm-wrap">
      ${matchFaceHTML(key, idx)}
      ${REAL ? realDetail(key, idx) : fakeStats(key, idx, st)}
      ${outcomesHTML(key, idx)}
      <a class="mm-story-link" href="match.html?round=${encodeURIComponent(key)}&match=${idx}">
        <span>View match detail</span><span aria-hidden="true">→</span>
      </a>
    </div>`);

    modalCard.querySelectorAll('.mm-team[data-team]').forEach(btn => {
      const code = btn.dataset.team;
      if (code) btn.addEventListener('click', () => openTeam(code));
    });
    if (window.gsap) {
      gsap.fromTo(modalCard.querySelectorAll('.sbar-fill'),
        { width: 0 },
        { width: (i, t) => t.dataset.w + '%', duration: .8, ease: 'power3.out', stagger: .05, delay: .15 });
    } else {
      modalCard.querySelectorAll('.sbar-fill').forEach(f => f.style.width = f.dataset.w + '%');
    }
  }

  /* ----- team modal ----- */
  function openTeam(code) {
    hideTip();
    const t = TEAMS[code];
    const st = KC.teamState(code);
    const path = KC.teamPath(code);
    const stMap = {
      live: ['IN A LIVE TIE', '#ff6a6a'],
      alive: ['STILL IN THE HUNT', 'var(--accent)'],
      out: ['ELIMINATED', '#8d8472'],
    };
    const sm = stMap[st] || stMap.alive;
    const fc = { W: '#3fb968', D: '#caa83a', L: '#d65a4f' };
    const meta = (k, v) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`;
    const rows = path.map(p => {
      const tag = p.st === 'live' ? ['LIVE', 'live'] : p.st === 'upcoming' ? ['NEXT', ''] : p.won ? ['WON', 'won'] : ['OUT', ''];
      const scCls = p.st === 'live' ? 'live' : p.won ? 'won' : '';
      return `<div class="path-row">
        <span class="pr-round">${p.round}</span>
        <span class="pr-flag">${p.opp ? TEAMS[p.opp].f : '❔'}</span>
        <span class="pr-opp">${p.opp ? 'v ' + TEAMS[p.opp].n : 'To be decided'}</span>
        <span class="pr-score ${scCls}">${p.st === 'upcoming' ? '—' : p.mine + '–' + p.theirs + (p.pens ? ' p' : '')}</span>
        <span class="pr-tag ${tag[1]}">${tag[0]}</span>
      </div>`;
    }).join('');

    openModal(`
      <div class="tm-head">
        <span class="tm-flag">${t.f}</span>
        <div>
          <span class="tm-status" style="color:${sm[1]}">${sm[0]}</span>
          <h2 class="tm-name">${t.n}</h2>
          <div class="tm-nick">${t.nk} · ${t.cf}</div>
        </div>
      </div>
      <div class="tm-meta">
        ${meta('FIFA Rank', '#' + t.rk)}
        ${meta('World Cups won', t.ti || '—')}
        ${meta('Head coach', t.co)}
        ${meta('Star player', t.st)}
        ${meta('Squad value', t.vl)}
      </div>
      <div class="tm-sec">
        <div class="tm-label">Recent form</div>
        <div class="form-row">${t.fm.map(r => `<span class="form-pill" style="background:${fc[r]}">${r}</span>`).join('')}</div>
      </div>
      <div class="tm-sec">
        <div class="tm-label">Road through the bracket</div>
        ${rows}
      </div>`);
  }

  /* ----- news modal ----- */
  function openNews(i) {
    const n = D.NEWS[i];
    openModal(`
      <div class="nm-banner" style="background:linear-gradient(135deg,${n.bg},#0b0b0d)">
        <span class="nm-fallback">${n.emoji}</span>${newsImage(n, 'nm-image')}
      </div>
      <div class="nm-body">
        <div class="nm-cat">${n.cat} · ${newsTime(n)} ago</div>
        <h2 class="nm-title">${n.title}</h2>
        ${n.lede ? `<p class="nm-lede">${n.lede}</p>` : ''}
        <div class="nm-meta">${n.link
          ? `<a href="${n.link}" target="_blank" rel="noopener" style="color:inherit">Read the full story ↗</a>`
          : `<span>💬 ${n.posts} posts</span><span>·</span><span>Developing story</span>`}</div>
      </div>`);
    bindNewsImageFallback(modalCard);
  }

  /* ================= HERO LIVE CARDS ================= */
  function upNextCard(key, idx) {
    const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
    const M = KICKOFF(key, idx);
    const isToday = localDayOf(M) === localToday();
    const rd = ROUNDS[KC.roundIdx(key)].name.toUpperCase();
    const fl = (c) => c ? TEAMS[c].f : '❔';
    const nm = (c) => c ? TEAMS[c].n : 'To be decided';
    const card = el('button', 'live-card', `
      <div class="lc-top">${isToday ? 'TODAY' : 'UP NEXT'} · ${rd}<span class="lc-min">${localDateLabel(M)}</span></div>
      <div class="lc-row">
        <span class="flags">${fl(a)}</span>
        <span class="lc-score">VS</span>
        <span class="flags">${fl(b)}</span>
      </div>
      <div class="lc-row lc-names">
        <span>${nm(a)}</span><span>${nm(b)}</span>
      </div>`);
    card.dataset.cursor = '';
    card.addEventListener('click', () => openMatch(key, idx));
    return card;
  }

  /* live tie first, otherwise the next scheduled tie */
  function liveOrNextCards(wrap) {
    wrap.innerHTML = '';
    if (REAL) {
      (D.UPNEXT || []).slice(0, 2).forEach(({ key, idx }) => {
        wrap.appendChild(KC.LIVE[key + '-' + idx] ? liveCard(key + '-' + idx) : upNextCard(key, idx));
      });
      return;
    }
    Object.keys(KC.LIVE).slice(0, 2).forEach(lk => wrap.appendChild(liveCard(lk)));
  }

  function buildHeroLive() {
    liveOrNextCards($('#heroLive'));
  }

  function liveCard(lk) {
    const dash = lk.lastIndexOf('-');
    const key = lk.slice(0, dash), idx = +lk.slice(dash + 1);
    const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
    const sc = KC.scoreOf(key, idx);
    const rd = ROUNDS[KC.roundIdx(key)].name.toUpperCase();
    const card = el('button', 'live-card', `
      <div class="lc-top"><span class="dot-live"></span>LIVE · ${rd}<span class="lc-min" data-live-min>${sc.min}′</span></div>
      <div class="lc-row">
        <span class="flags">${TEAMS[a].f}</span>
        <span class="lc-score">${sc.a} : ${sc.b}</span>
        <span class="flags">${TEAMS[b].f}</span>
      </div>
      <div class="lc-row lc-names">
        <span>${TEAMS[a].n}</span><span>${TEAMS[b].n}</span>
      </div>`);
    card.dataset.cursor = '';
    card.dataset.liveKey = lk;
    card.addEventListener('click', () => openMatch(key, idx));
    return card;
  }

  /* up to two current/upcoming ties pinned beside the circle (desktop only — hidden by CSS below 1280px) */
  function buildCircleLive() {
    const wrap = $('#circleLive');
    if (!wrap) return;
    liveOrNextCards(wrap);
  }

  /* ================= TICKER ================= */
  function buildTicker() {
    const track = $('#tickerTrack');
    const items = KC.tickerItems();
    const half = items.map(it =>
      `<span class="tick-item${it.live ? ' is-live' : ''}">${it.live ? '<span class="dot-live"></span>' : ''}${it.text}<span class="tick-sep">✦</span></span>`
    ).join('');
    track.innerHTML = half + half; // duplicate for seamless loop
  }

  /* ================= STATS ================= */
  let statTab = 'goals';
  function buildStatTabs() {
    const wrap = $('#statTabs');
    D.STAT_TABS.forEach(([k, label]) => {
      const b = el('button', 'stat-tab' + (k === statTab ? ' active' : ''), label);
      b.dataset.tab = k;
      b.dataset.cursor = '';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => { statTab = k; renderStatTab(); });
      wrap.appendChild(b);
    });
  }
  function renderStatTab() {
    document.querySelectorAll('.stat-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === statTab));
    const rows = D.STATS[statTab] || [];
    const wrap = $('#statRows');
    wrap.innerHTML = rows.map(p => `
      <div class="stat-row">
        <span class="rk">${p.rank}</span>
        <span class="fl">${p.flag}</span>
        <span class="who">
          <span class="nm"><span>${p.name}</span></span>
          ${p.handle ? `<span class="hd">${p.handle}</span>` : ''}
        </span>
        <span class="vl">${p.val}</span>
      </div>`).join('');
    if (window.gsap) {
      gsap.fromTo(wrap.children, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .4, ease: 'power2.out', stagger: .03 });
    }
  }

  /* ================= NEWS ================= */
  function buildNews() {
    const wrap = $('#newsList');
    const freshness = $('#newsPanel .updated');
    const renderFreshness = () => {
      if (!freshness) return;
      freshness.innerHTML = `<span class="dot-live" style="width:6px;height:6px"></span>${updatedTime(D.OVERLAY_UPDATED && D.OVERLAY_UPDATED.news)}`;
      freshness.title = D.OVERLAY_UPDATED?.news
        ? `News feed fetched ${new Date(D.OVERLAY_UPDATED.news).toLocaleString()}`
        : 'The news overlay could not be loaded';
    };
    renderFreshness();
    setInterval(renderFreshness, 60000);
    D.NEWS.forEach((n, i) => {
      const hue = (seed, j) => `hsl(${(seed * 53 + j * 90) % 360} 48% 48%)`;
      const hue2 = (seed, j) => `hsl(${(seed * 53 + j * 90 + 50) % 360} 48% 32%)`;
      const card = el('button', 'news-card', `
        <span class="news-body">
          <span class="news-cat">${n.cat}</span>
          <span class="news-title" style="display:block">${n.title}</span>
          <span class="news-meta">
            <span class="avatars">${[0, 1, 2].map(j => `<i style="background:linear-gradient(135deg,${hue(i + 2, j)},${hue2(i + 2, j)})"></i>`).join('')}</span>
            ${newsTime(n)} ago${n.posts ? ` · ${n.posts} posts` : ''}
          </span>
        </span>
        <span class="news-thumb" style="background:linear-gradient(135deg,${n.bg},#0b0b0d)">
          <span class="news-thumb-fallback">${n.emoji}</span>${newsImage(n, 'news-thumb-image')}
        </span>`);
      bindNewsImageFallback(card);
      card.dataset.cursor = '';
      card.addEventListener('click', () => openNews(i));
      wrap.appendChild(card);
    });
  }

  /* ================= GROUP STAGE ================= */
  /* renders the 12-group table only when the live feed supplied it (adapter.js
     sets D.GROUPS); the authored/offline fallback has no group results, so the
     section and its nav link are hidden rather than faked. */
  function buildGroups() {
    const grid = $('#groupsGrid');
    if (!grid) return;
    const groups = D.GROUPS;
    if (!groups || !groups.length) {
      const section = $('#groups');
      if (section) section.style.display = 'none';
      const navLink = $('#navGroups');
      if (navLink) navLink.style.display = 'none';
      return;
    }
    const gd = (n) => (n > 0 ? '+' + n : '' + n);
    grid.innerHTML = '';
    groups.forEach(g => {
      const rows = g.rows.map((r, i) => {
        const clickable = r.code && TEAMS[r.code];
        return `<button class="grow${r.adv ? ' adv' : ''}"${clickable ? ` data-code="${r.code}" data-cursor` : ' disabled'} aria-label="${r.name}${r.adv ? ' — advanced' : ' — eliminated'}">
          <span class="gr-pos">${i + 1}</span>
          <span class="gr-flag">${r.flag}</span>
          <span class="gr-name">${r.name}</span>
          <span class="gr-num">${r.p}</span>
          <span class="gr-num gr-gd">${gd(r.gd)}</span>
          <span class="gr-num gr-pts">${r.pts}</span>
          <span class="gr-mark">${r.adv ? '✓' : ''}</span>
        </button>`;
      }).join('');
      const card = el('article', 'group-card', `
        <div class="gc-head">
          <span class="gc-name">${g.name}</span>
          <span class="gc-col">P</span>
          <span class="gc-col">GD</span>
          <span class="gc-col">Pts</span>
          <span class="gc-col"></span>
        </div>
        <div class="gc-rows">${rows}</div>`);
      grid.appendChild(card);
    });
    grid.querySelectorAll('.grow[data-code]').forEach(b => {
      b.addEventListener('click', () => openTeam(b.dataset.code));
    });
  }

  /* ================= TOAST ================= */
  const toast = $('#toast');
  let toastClosed = false, toastReady = false;
  function buildToast() {
    const n = D.NEWS[0];
    toast.innerHTML = `
      <button class="toast-close" aria-label="Dismiss">×</button>
      <div class="toast-top"><span class="dot-live"></span><span class="toast-tag">BREAKING</span><span class="toast-time">${newsTime(n)} ago</span></div>
      <div class="toast-main">
        <div class="toast-title">${n.title}</div>
        <div class="toast-thumb" style="background:linear-gradient(135deg,${n.bg},#0b0b0d)">${n.emoji}</div>
      </div>
      <div class="toast-cta">Tap to read · scroll for the full feed ↓</div>`;
    toast.addEventListener('click', () => { openNews(0); dismissToast(); });
    $('.toast-close', toast).addEventListener('click', (ev) => { ev.stopPropagation(); dismissToast(); });
    setTimeout(() => { toastReady = true; syncToast(); }, 1600);
    window.addEventListener('scroll', syncToast, { passive: true });
  }
  function dismissToast() { toastClosed = true; syncToast(); }
  function syncToast() {
    const heroOut = window.scrollY > window.innerHeight * 0.5;
    toast.classList.toggle('show', toastReady && !toastClosed && !heroOut);
  }

  /* ================= DARK / LIGHT MODE ================= */
  $('#modeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('kc-mode', next); } catch (e) { /* private browsing */ }
    window.dispatchEvent(new CustomEvent('kc:theme', { detail: next }));
  });

  /* ================= MOBILE BRACKET (round-by-round list) ================= */
  let mTab = 'qf';
  const mWrap = $('#mobileBracket');

  function slotLabel(key, idx, slot) {
    const ri = KC.roundIdx(key);
    const prev = ROUNDS[ri - 1];
    return `Winner ${prev.short} ${idx * 2 + slot + 1}`;
  }

  function advanceLabel(key, idx) {
    const ri = KC.roundIdx(key);
    if (ri >= ROUNDS.length - 1) return 'World champions 🏆';
    return `${ROUNDS[ri + 1].short} ${Math.floor(idx / 2) + 1}`;
  }

  function mBar(label, va, vb, pct) {
    const fa = pct ? va : (parseFloat(va) / ((parseFloat(va) + parseFloat(vb)) || 1) * 100);
    return `<div class="mbar">
      <div class="mbar-nums"><span>${pct ? va + '%' : va}</span><span class="lb">${label}</span><span>${pct ? vb + '%' : vb}</span></div>
      <div class="mbar-track"><div class="mbar-fill" style="width:${fa}%"></div><div class="mbar-rest"></div></div>
    </div>`;
  }

  function mTieCard(key, idx) {
    const st = KC.statusOf(key, idx);
    const sc = KC.scoreOf(key, idx);
    const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
    const w = KC.winnerOf(key, idx);

    const status = st === 'live'
      ? `<span class="mstatus live" data-live-key="${key}-${idx}"><span class="dot-live"></span>LIVE <span data-live-min>${sc.min}′</span></span>`
      : st === 'finished'
        ? `<span class="mstatus">FT${sc.pens ? ' · P' : ''}</span>`
        : `<span class="mstatus soon">${whenLabel(key, idx)}</span>`;

    const teamRow = (code, slot, goals) => {
      const tbd = !code;
      const winner = st === 'finished' && code === w;
      const loser = st === 'finished' && code !== w;
      return `<div class="mteam${winner ? ' winner' : ''}${loser ? ' loser' : ''}${tbd ? ' tbd' : ''}">
        <span class="flag">${tbd ? '❔' : TEAMS[code].f}</span>
        <span class="name">${tbd ? slotLabel(key, idx, slot) : TEAMS[code].n}</span>
        <span class="sc">${goals == null ? '–' : goals}</span>
      </div>`;
    };

    const note = st === 'finished'
      ? `<div class="mtie-note won">✓ ${TEAMS[w].n} through to ${advanceLabel(key, idx)}${sc.pens ? ' · on pens' : ''}</div>`
      : `<div class="mtie-note">Winner advances to ${advanceLabel(key, idx)}</div>`;

    const inner = (() => {
      if (!REAL) {
        const S = KC.matchStats(key, idx);
        return mBar('Possession', S.possA, S.possB, true)
          + mBar('Shots', S.shotsA, S.shotsB, false)
          + mBar('Expected goals', S.xgA, S.xgB, false);
      }
      const R = RESULT(key, idx), M = KICKOFF(key, idx);
      const t = localTimeLabel(M);
      const when = `<div style="font-size:11px;opacity:.6;margin-bottom:6px">${localDateLabel(M)}${t ? ' · ' + t : ''}${M.ground ? ' · ' + M.ground : ''}</div>`;
      if (!R) return when;
      const rows = [goalLine(R.goalsA), goalLine(R.goalsB)].filter(Boolean);
      return `<div style="font-size:12px;line-height:1.7;margin-bottom:6px">
          ${rows.length ? rows.map(r => `⚽ ${r}`).join('<br>') : (R.pens ? 'Goalless — decided on penalties' : 'No goals')}
        </div>${when}`;
    })();

    const body = (a && b) ? `
      <div class="mtie-body"><div><div class="inner">
        ${inner}
        <a class="mtie-more" href="match.html?round=${encodeURIComponent(key)}&match=${idx}">Full match details</a>
      </div></div></div>` : '';

    const card = el('article', 'mtie' + (st === 'live' ? ' is-live' : ''), `
      <button class="mtie-head" aria-expanded="false">
        <span class="mtie-num">TIE ${idx + 1}</span>
        <span class="right">${status}<span class="mtie-chev">▼</span></span>
      </button>
      ${teamRow(a, 0, sc.a)}
      ${teamRow(b, 1, sc.b)}
      ${note}
      ${body}`);
    card.dataset.key = key;
    card.dataset.idx = idx;

    const head = card.querySelector('.mtie-head');
    head.addEventListener('click', () => {
      if (!a || !b) { openMatch(key, idx); return; }
      const open = card.classList.toggle('open');
      head.setAttribute('aria-expanded', open);
    });
    const more = card.querySelector('.mtie-more');
    if (more) more.addEventListener('click', (ev) => ev.stopPropagation());
    return card;
  }

  function renderMTies() {
    const list = $('#mtieList', mWrap);
    list.innerHTML = '';
    mWrap.querySelectorAll('.mtab').forEach(b => b.classList.toggle('active', b.dataset.round === mTab));
    const round = ROUNDS[KC.roundIdx(mTab)];
    for (let k = 0; k < round.count; k++) list.appendChild(mTieCard(mTab, k));
    if (window.gsap) {
      gsap.fromTo(list.children, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .4, ease: 'power2.out', stagger: .05 });
    }
  }

  function buildMobile() {
    if (!mWrap) return;
    const pills = Object.keys(KC.LIVE).map(lk => {
      const dash = lk.lastIndexOf('-');
      const key = lk.slice(0, dash), idx = +lk.slice(dash + 1);
      const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
      const sc = KC.scoreOf(key, idx);
      return `<button class="mlive-pill" data-jump="${key}-${idx}" data-live-key="${lk}">
        <span class="dot-live"></span>
        <span class="flag">${TEAMS[a].f}</span> ${sc.a}–${sc.b} <span class="flag">${TEAMS[b].f}</span>
        <span class="min" data-live-min>${sc.min}′</span>
      </button>`;
    }).join('');
    mWrap.innerHTML = `
      ${pills ? `<div class="mlive">${pills}</div>` : ''}
      <div class="mtabs" role="tablist" aria-label="Round">
        ${ROUNDS.map(r => `<button class="mtab" role="tab" data-round="${r.key}" aria-label="${r.name}">${r.short}</button>`).join('')}
      </div>
      <div id="mtieList"></div>`;
    mWrap.querySelectorAll('.mtab').forEach(b => {
      b.addEventListener('click', () => { mTab = b.dataset.round; renderMTies(); });
    });
    mWrap.querySelectorAll('[data-jump]').forEach(p => {
      p.addEventListener('click', () => {
        const [key, idx] = [p.dataset.jump.slice(0, p.dataset.jump.lastIndexOf('-')), +p.dataset.jump.slice(p.dataset.jump.lastIndexOf('-') + 1)];
        mTab = key;
        renderMTies();
        const card = mWrap.querySelector(`.mtie[data-key="${key}"][data-idx="${idx}"]`);
        if (card) {
          card.classList.add('open');
          card.querySelector('.mtie-head').setAttribute('aria-expanded', 'true');
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });
    renderMTies();
  }

  /* ================= LIVE TICK ================= */
  setInterval(() => {
    KC.tick();
    Object.keys(KC.LIVE).forEach(lk => {
      const dash = lk.lastIndexOf('-');
      const key = lk.slice(0, dash), idx = +lk.slice(dash + 1);
      const chipEl = chipEls[lk];
      if (chipEl) chipEl.innerHTML = chipContent(key, idx);
      const sc = KC.scoreOf(key, idx);
      document.querySelectorAll(`[data-live-key="${lk}"] [data-live-min]`).forEach(m => m.textContent = sc.min + '′');
    });
    if (!tip.hidden && tip.dataset.key) showTip(tip.dataset.key, +tip.dataset.idx);
    window.dispatchEvent(new CustomEvent('kc:tick')); // demo-mode heartbeat for the zoomed match stage
  }, 2600);

  /* ================= NAV SCROLL STATE ================= */
  const nav = $('#siteNav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });

  /* ================= NAV LIVE PILL ================= */
  function updateNavPill() {
    if (!REAL) return;
    const pill = $('#siteNav .nav-live');
    if (!pill) return;
    const liveN = Object.keys(KC.LIVE).length;
    const today = localToday();
    const todayN = (D.UPNEXT || []).filter(u => localDayOf(KICKOFF(u.key, u.idx)) === today).length;
    const next = (D.UPNEXT || [])[0];
    pill.innerHTML = liveN
      ? `<span class="dot-live"></span><span class="lbl">${liveN} LIVE</span>`
      : todayN
        ? `<span class="lbl">${todayN} TODAY</span>`
        : `<span class="lbl">${next ? 'NEXT ' + localDateLabel(KICKOFF(next.key, next.idx)).toUpperCase() : 'TOURNAMENT OVER'}</span>`;
  }

  /* ================= LIVE REFRESH ================= */
  /* the poller (js/live.js) mutates D.LIVE / D.RESULTS / D.PICK and fires kc:live */
  window.addEventListener('kc:live', () => {
    Object.keys(chipEls).forEach(id => {
      const dash = id.lastIndexOf('-');
      const key = id.slice(0, dash), idx = +id.slice(dash + 1);
      if (key === 'final') return; // trophy node has fixed content
      const st = KC.statusOf(key, idx);
      const c = chipEls[id];
      c.className = 'chip' + (st === 'live' ? ' is-live' : st === 'upcoming' ? ' is-vs' : '');
      c.innerHTML = chipContent(key, idx);
    });
    Object.keys(badgeEls).forEach(code => {
      badgeEls[code].className = 'badge state-' + KC.teamState(code);
    });
    document.querySelectorAll('#wires .wire').forEach(w => {
      const k = w.dataset.wire;
      let adv = false, next = false;
      const t = /^t(\d+)$/.exec(k);
      const r = /^(r32|r16|qf|sf)(\d+)$/.exec(k);
      if (t) {
        const mi = Math.floor(+t[1] / 2);
        adv = KC.winnerOf('r32', mi) === ORDER[+t[1]];
        next = !adv && KC.statusOf('r32', mi) === 'upcoming';
      } else if (r) {
        const ri = KC.roundIdx(r[1]), kk = +r[2];
        const cw = KC.winnerOf(r[1], kk);
        const pk = ROUNDS[ri + 1].key, pi = Math.floor(kk / 2);
        adv = !!cw && cw === KC.winnerOf(pk, pi);
        next = !adv && KC.statusOf(r[1], kk) !== 'upcoming' && KC.statusOf(pk, pi) === 'upcoming';
      }
      w.classList.toggle('adv', adv);
      w.classList.toggle('next', next);
      // wires that just became 'next' must shed the draw-in's inline dash so the CSS dashes show
      if (next && w.style.strokeDasharray) { w.style.strokeDasharray = ''; w.style.strokeDashoffset = ''; }
    });
    buildHeroLive();
    buildCircleLive();
    buildTicker();
    buildMobile();
    updateNavPill();
  });

  /* ================= SHARED UI SURFACE (consumed by js/zoom.js) ================= */
  window.KC_UI = {
    openMatch, openTeam, hideTip, chipEls, badgeEls, fmtDate, localDateLabel, localTimeLabel,
    matchFaceHTML, realDetail, fakeStats, outcomesHTML, goalTimelineHTML, teamFactsHTML,
    isReal: REAL,
  };

  /* ================= BOOT ================= */
  buildWires();
  buildBadges();
  buildChips();
  buildMobile();
  buildHeroLive();
  buildCircleLive();
  buildTicker();
  buildStatTabs();
  renderStatTab();
  buildNews();
  buildGroups();
  buildToast();
  updateNavPill();
})();
