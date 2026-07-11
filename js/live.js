/* Knockout Circle — in-match live scores via the centralized Cloudflare collector.
   The Worker polls ESPN once for the whole site; browsers only read /api/live.
   Polls every 60s, but only inside kickoff windows derived from the schedule; idle otherwise.
   Also applies just-finished (FT) results hours before the daily openfootball update.
   Runs only in real-data mode (see adapter.js). */
(() => {
  const D = window.KC_DATA;
  if (!D || !D.REAL) return;

  const LIVE_API = '/api/live';
  const POLL_MS = 60 * 1000;          // during a kickoff window
  const IDLE_MS = 15 * 60 * 1000;     // outside any window (cheap safety net)
  const WINDOW_BEFORE = 10 * 60 * 1000;
  const WINDOW_AFTER = 3.5 * 60 * 60 * 1000; // covers ET + pens + delays

  // ESPN display names → roster names in D.TEAMS
  const ALIAS = {
    'United States': 'USA', 'Türkiye': 'Turkey', 'Czechia': 'Czech Republic',
    "Côte d'Ivoire": 'Ivory Coast', 'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
    'Korea Republic': 'South Korea', 'IR Iran': 'Iran',
  };
  const codeOf = {};
  Object.keys(D.TEAMS).forEach((c) => { codeOf[D.TEAMS[c].n] = c; });
  const toCode = (name) => codeOf[ALIAS[name] || name] || null;

  // kickoff Date from openfootball meta ("2026-07-14" + "15:00 UTC-4")
  const kickoffAt = (M) => {
    if (!M.date) return null;
    const t = /^(\d\d):(\d\d)\s*UTC([+-]\d+)$/.exec(M.time || '');
    if (!t) return new Date(M.date + 'T12:00:00Z'); // date-only fallback
    const off = +t[3];
    return new Date(Date.UTC(...M.date.split('-').map((v, i) => +v - (i === 1 ? 1 : 0)), +t[1] - off, +t[2]));
  };

  const unfinished = () => Object.keys(D.STATUS).filter((id) => !D.RESULTS[id]);
  const inWindow = (now) => unfinished().some((id) => {
    const ko = kickoffAt(D.META[id] || {});
    return ko && now >= ko.getTime() - WINDOW_BEFORE && now <= ko.getTime() + WINDOW_AFTER;
  });

  // find the site match for a pair of team codes (unfinished ties only)
  const tieFor = (c1, c2) => {
    const KC = window.KC;
    return unfinished().map((id) => {
      const dash = id.lastIndexOf('-');
      return { id, key: id.slice(0, dash), idx: +id.slice(dash + 1) };
    }).find(({ key, idx }) => {
      const a = KC.resolveSlot(key, idx, 0), b = KC.resolveSlot(key, idx, 1);
      return (a === c1 && b === c2) || (a === c2 && b === c1);
    }) || null;
  };

  // scoring plays → the site's goal-list shape, split per side
  const goalsFrom = (comp, homeId) => {
    const out = { home: [], away: [] };
    (comp.details || []).forEach((d) => {
      const txt = (d.type && d.type.text || '').toLowerCase();
      if (!d.scoringPlay && !txt.includes('goal')) return;
      const g = {
        name: (d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName) || 'Goal',
        minute: (d.clock && d.clock.displayValue || '').replace(/'$/, ''),
      };
      if (txt.includes('penalty')) g.penalty = true;
      if (txt.includes('own')) g.owngoal = true;
      (String(d.team && d.team.id) === String(homeId) ? out.home : out.away).push(g);
    });
    return out;
  };

  function applyEvent(e) {
    const comp = e.competitions && e.competitions[0];
    if (!comp) return { live: null, changed: false };
    const home = comp.competitors && comp.competitors.find((c) => c.homeAway === 'home');
    const away = comp.competitors && comp.competitors.find((c) => c.homeAway === 'away');
    if (!home?.team || !away?.team) return { live: null, changed: false };
    const hc = toCode(home.team.displayName), ac = toCode(away.team.displayName);
    if (!hc || !ac) return { live: null, changed: false };
    const tie = tieFor(hc, ac);
    if (!tie) return { live: null, changed: false };

    const KC = window.KC;
    const slotA = KC.resolveSlot(tie.key, tie.idx, 0);
    const orient = (h, a) => slotA === hc ? [h, a] : [a, h];
    const state = e.status && e.status.type && e.status.type.state;
    const hs = +home.score, as = +away.score;

    if (state === 'in') {
      const [a, b] = orient(hs, as);
      const min = parseInt(e.status.displayClock, 10) || 0;
      const g = goalsFrom(comp, home.team.id);
      const [goalsA, goalsB] = orient(g.home, g.away);
      const prev = D.LIVE[tie.id];
      const changed = !prev || prev.a !== a || prev.b !== b || prev.min !== min;
      D.LIVE[tie.id] = { a, b, min, goalsA, goalsB }; // goal lists power the zoomed timeline mid-match
      return { live: tie.id, changed };
    }

    if (state === 'post') {
      // decide the winner: regulation/ET score, else penalty shootout
      let wc = hs !== as ? (hs > as ? hc : ac) : null;
      let pens = false;
      const hp = +(home.shootoutScore || 0), ap = +(away.shootoutScore || 0);
      if (!wc && (hp || ap)) { wc = hp > ap ? hc : ac; pens = true; }
      if (!wc) return { live: null, changed: false }; // can't model it — wait for openfootball

      const [a, b] = orient(hs, as);
      const g = goalsFrom(comp, home.team.id);
      const [goalsA, goalsB] = orient(g.home, g.away);
      D.RESULTS[tie.id] = { a, b, pens, w: wc, goalsA, goalsB };
      D.STATUS[tie.id] = 'finished';
      D.PICK[tie.id] = wc;
      D.UPNEXT = (D.UPNEXT || []).filter((u) => u.key + '-' + u.idx !== tie.id);
      return { live: null, changed: true };
    }

    return { live: null, changed: false }; // 'pre'
  }

  async function poll() {
    let changed = false;
    const alive = new Set();
    try {
      const res = await fetch(LIVE_API, { cache: 'no-store' });
      if (!res.ok) throw new Error('live API HTTP ' + res.status);
      const data = await res.json();
      if (data.stale || !Array.isArray(data.events)) return;
      (data.events || []).forEach((e) => {
        const r = applyEvent(e);
        if (r.live) alive.add(r.live);
        if (r.changed) changed = true;
      });
    } catch (err) {
      return; // network blip — keep last known state, try again next tick
    }
    // drop live entries ESPN no longer reports as in-progress
    Object.keys(D.LIVE).forEach((id) => {
      if (!alive.has(id)) { delete D.LIVE[id]; changed = true; }
    });
    if (changed) window.dispatchEvent(new CustomEvent('kc:live'));
  }

  function loop() {
    const active = Object.keys(D.LIVE).length > 0 || inWindow(Date.now());
    if (active) poll();
    setTimeout(loop, active ? POLL_MS : IDLE_MS);
  }
  const ready = poll();
  window.KC_LIVE = { ready, poll };
  setTimeout(loop, POLL_MS);
})();
