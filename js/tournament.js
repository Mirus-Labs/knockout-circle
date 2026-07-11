/* Knockout Circle — tournament logic (deterministic, seeded from data.js) */
window.KC = (() => {
  const D = window.KC_DATA;
  const { TEAMS, ORDER, PICK, LIVE, ROUNDS, TEAM_R, UNIT } = D;

  let liveTick = 0;

  /* ---------- deterministic rng ---------- */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- structure ---------- */
  const roundIdx = (key) => ROUNDS.findIndex(r => r.key === key);
  const winnerOf = (key, idx) => PICK[key + '-' + idx] || null;

  function statusOf(key, idx) {
    if (D.STATUS) {
      const id = key + '-' + idx;
      if (D.LIVE && D.LIVE[id]) return 'live';
      return D.STATUS[id] || 'upcoming';
    }
    if (key === 'r32' || key === 'r16') return 'finished';
    if (key === 'qf') return idx < 2 ? 'finished' : 'live';
    return 'upcoming';
  }

  function resolveSlot(key, idx, slot) {
    if (key === 'r32') return ORDER[idx * 2 + slot];
    const ri = roundIdx(key);
    const prev = ROUNDS[ri - 1].key;
    return winnerOf(prev, idx * 2 + slot);
  }

  /* ---------- geometry (percent of container / svg 1000-space) ---------- */
  function posAt(R, ang) {
    const r = (ang - 90) * Math.PI / 180;
    return { l: 50 + R * 100 * Math.cos(r), t: 50 + R * 100 * Math.sin(r) };
  }
  const teamPos = (i) => posAt(TEAM_R, i * UNIT);
  function nodeAng(ri, k) {
    const span = 32 / ROUNDS[ri].count;
    const center = k * span + (span - 1) / 2;
    return center * UNIT;
  }
  function nodePos(ri, k) {
    if (ROUNDS[ri].R === 0) return { l: 50, t: 50 };
    return posAt(ROUNDS[ri].R, nodeAng(ri, k));
  }
  function svgP(R, ang) {
    const r = (ang - 90) * Math.PI / 180;
    return [500 + R * 1000 * Math.cos(r), 500 + R * 1000 * Math.sin(r)];
  }

  /* ---------- scores & stats ---------- */
  function liveMin(key, idx) {
    const base = LIVE[key + '-' + idx];
    if (!base) return 0;
    return Math.min(90, base.min + Math.floor(liveTick * 2.6 / 60));
  }

  function scoreOf(key, idx) {
    if (D.RESULTS) {
      const id = key + '-' + idx;
      const L = D.LIVE && D.LIVE[id];
      if (L && L.a != null) return { a: L.a, b: L.b, st: 'live', min: L.min || 0 };
      const R = D.RESULTS[id];
      if (R) return { a: R.a, b: R.b, st: 'finished', w: R.w, pens: R.pens };
      return { a: null, b: null, st: statusOf(key, idx) };
    }
    const st = statusOf(key, idx);
    const a = resolveSlot(key, idx, 0), b = resolveSlot(key, idx, 1);
    if (st === 'finished') {
      const w = winnerOf(key, idx);
      const r = rng(hash(key + '-' + idx + '-g'));
      const wg = 1 + Math.floor(r() * 3);
      let lg = Math.floor(r() * wg);
      const pens = r() < 0.16;
      if (pens) lg = wg;
      const ga = a === w ? wg : lg, gb = b === w ? wg : lg;
      return { a: ga, b: gb, st, w, pens };
    }
    if (st === 'live') {
      const r = rng(hash(key + '-' + idx + '-lv'));
      const ga = Math.floor(r() * 3), gb = Math.floor(r() * 2);
      return { a: ga, b: gb, st, min: liveMin(key, idx) };
    }
    return { a: null, b: null, st };
  }

  function matchStats(key, idx) {
    const r = rng(hash(key + '-' + idx + '-s'));
    const a = resolveSlot(key, idx, 0), b = resolveSlot(key, idx, 1);
    const fav = winnerOf(key, idx) || (((TEAMS[a] || {}).rk || 99) <= ((TEAMS[b] || {}).rk || 99) ? a : b);
    const bias = (side) => side === fav ? 1 : 0;
    let possA = 44 + Math.floor(r() * 12) + bias(a) * 4 - bias(b) * 4;
    possA = Math.max(33, Math.min(67, possA));
    const st = statusOf(key, idx);
    if (st === 'live') {
      possA += Math.round(Math.sin(liveTick * 0.9 + idx) * 2);
      possA = Math.max(33, Math.min(67, possA));
    }
    const shotsA = 7 + Math.floor(r() * 10) + bias(a) * 3, shotsB = 7 + Math.floor(r() * 10) + bias(b) * 3;
    const sotA = 2 + Math.floor(r() * Math.min(6, shotsA - 1)), sotB = 2 + Math.floor(r() * Math.min(6, shotsB - 1));
    const xgA = (0.5 + r() * 2.3 + bias(a) * 0.6), xgB = (0.5 + r() * 2.3 + bias(b) * 0.6);
    const corA = 2 + Math.floor(r() * 8), corB = 2 + Math.floor(r() * 8);
    const fouA = 6 + Math.floor(r() * 11), fouB = 6 + Math.floor(r() * 11);
    const yelA = Math.floor(r() * 4), yelB = Math.floor(r() * 4);
    return { a, b, possA, possB: 100 - possA, shotsA, shotsB, sotA, sotB, xgA: xgA.toFixed(2), xgB: xgB.toFixed(2), corA, corB, fouA, fouB, yelA, yelB };
  }

  /* ---------- team status & journey ---------- */
  function teamState(code) {
    for (const lk of Object.keys(LIVE)) {
      const dash = lk.lastIndexOf('-');
      const k = lk.slice(0, dash), ii = +lk.slice(dash + 1);
      if (resolveSlot(k, ii, 0) === code || resolveSlot(k, ii, 1) === code) return 'live';
    }
    const pos = ORDER.indexOf(code);
    let mi = Math.floor(pos / 2);
    for (let ri = 0; ri < ROUNDS.length; ri++) {
      const key = ROUNDS[ri].key;
      const st = statusOf(key, mi);
      const inMatch = resolveSlot(key, mi, 0) === code || resolveSlot(key, mi, 1) === code;
      if (!inMatch) break;
      if (st === 'finished') { if (winnerOf(key, mi) !== code) return 'out'; mi = Math.floor(mi / 2); continue; }
      if (st === 'live') return 'live';
      if (st === 'upcoming') return 'alive';
    }
    return 'alive';
  }

  function teamPath(code) {
    const pos = ORDER.indexOf(code);
    let mi = Math.floor(pos / 2);
    const out = [];
    for (let ri = 0; ri < ROUNDS.length; ri++) {
      const key = ROUNDS[ri].key;
      const a = resolveSlot(key, mi, 0), b = resolveSlot(key, mi, 1);
      if (a !== code && b !== code) break;
      const opp = a === code ? b : a;
      const st = statusOf(key, mi);
      const sc = scoreOf(key, mi);
      const mine = a === code ? sc.a : sc.b, theirs = a === code ? sc.b : sc.a;
      const won = st === 'finished' && winnerOf(key, mi) === code;
      out.push({ round: ROUNDS[ri].name, opp, st, mine, theirs, key, idx: mi, won, pens: sc.pens });
      if (st === 'finished') { if (!won) break; mi = Math.floor(mi / 2); }
      else break;
    }
    return out;
  }

  function nextInfo(key, idx) {
    const ri = roundIdx(key);
    if (ri >= ROUNDS.length - 1) return null;
    const sib = idx ^ 1;
    const sibW = winnerOf(key, sib);
    const sa = resolveSlot(key, sib, 0), sb = resolveSlot(key, sib, 1);
    const oppLabel = sibW
      ? (TEAMS[sibW].f + ' ' + TEAMS[sibW].n)
      : ('the winner of ' + (sa ? TEAMS[sa].f + ' ' + sa : '?') + ' v ' + (sb ? TEAMS[sb].f + ' ' + sb : '?'));
    return { roundName: ROUNDS[ri + 1].name, oppLabel, decided: !!sibW };
  }

  /* ---------- feed items for the ticker ---------- */
  function tickerItems() {
    const items = [];
    const push = (key, idx) => {
      const a = resolveSlot(key, idx, 0), b = resolveSlot(key, idx, 1);
      if (!a || !b) return;
      const sc = scoreOf(key, idx);
      const rd = ROUNDS[roundIdx(key)].short;
      if (sc.st === 'live') items.push({ live: true, text: `${rd} · ${TEAMS[a].f} ${a} ${sc.a}–${sc.b} ${b} ${TEAMS[b].f} · ${sc.min}′` });
      else if (sc.st === 'finished') items.push({ live: false, text: `${rd} · ${TEAMS[a].f} ${a} ${sc.a}–${sc.b}${sc.pens ? ' (p)' : ''} ${b} ${TEAMS[b].f}` });
    };
    push('final', 0);
    for (let i = 0; i < 2; i++) push('sf', i);
    for (let i = 0; i < 4; i++) push('qf', i);
    for (let i = 0; i < 8; i++) push('r16', i);
    return items;
  }

  return {
    D, TEAMS, ORDER, ROUNDS, LIVE,
    hash, rng, roundIdx, winnerOf, statusOf, resolveSlot,
    posAt, teamPos, nodeAng, nodePos, svgP,
    scoreOf, matchStats, teamState, teamPath, nextInfo, tickerItems,
    get liveTick() { return liveTick; },
    tick() { liveTick++; },
  };
})();
