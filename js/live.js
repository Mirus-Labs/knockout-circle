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

  const statValue = (competitor, names) => {
    const wanted = names.map((name) => name.toLowerCase());
    const stat = (competitor?.statistics || []).find((item) => {
      const keys = [item.name, item.label, item.displayName, item.shortDisplayName].filter(Boolean).map((value) => String(value).toLowerCase());
      return keys.some((key) => wanted.includes(key));
    });
    if (!stat) return null;
    const raw = stat.value ?? stat.displayValue;
    if (raw == null) return null;
    const parsed = Number(String(raw).replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const statsFrom = (home, away) => {
    const side = (team) => ({
      possession: statValue(team, ['possessionpct', 'possession', 'possession %']),
      attempts: statValue(team, ['totalshots', 'shots', 'total shots']),
      onTarget: statValue(team, ['shotsontarget', 'shots on target']),
      xg: statValue(team, ['expectedgoals', 'expected goals', 'xg']),
      passCompletion: statValue(team, ['passpercentage', 'pass completion', 'pass accuracy']),
      cards: (() => {
        const yellow = statValue(team, ['yellowcards', 'yellow cards']) || 0;
        const red = statValue(team, ['redcards', 'red cards']) || 0;
        return yellow + red || null;
      })(),
    });
    return { home: side(home), away: side(away) };
  };

  const lineupFrom = (competitor) => {
    const roster = competitor?.roster?.entries || competitor?.roster || [];
    if (!Array.isArray(roster)) return [];
    return roster.map((entry) => {
      const athlete = entry.athlete || entry;
      return {
        name: athlete.displayName || athlete.fullName || athlete.name,
        number: athlete.jersey || entry.jersey || null,
        position: athlete.position?.abbreviation || athlete.position?.name || entry.position?.abbreviation || '',
        starter: entry.starter !== false,
      };
    }).filter((player) => player.name);
  };

  // ESPN details → normalized event timeline plus legacy goal lists.
  const eventsFrom = (comp, homeId) => {
    const out = { home: [], away: [], events: [] };
    (comp.details || []).forEach((d) => {
      const txt = (d.type && d.type.text || '').toLowerCase();
      const isGoal = d.scoringPlay || txt.includes('goal');
      const isCard = txt.includes('card') || txt.includes('yellow') || txt.includes('red');
      const isSub = txt.includes('substitution');
      if (!isGoal && !isCard && !isSub) return;
      const homeSide = String(d.team && d.team.id) === String(homeId);
      const clock = (d.clock && d.clock.displayValue || '').replace(/'$/, '');
      const player = (d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName) || (isSub ? 'Substitution' : isCard ? 'Card' : 'Goal');
      const event = {
        minute: clock,
        type: isGoal ? 'goal' : isSub ? 'substitution' : txt.includes('red') ? 'red-card' : 'yellow-card',
        side: homeSide ? 'home' : 'away',
        player,
        detail: d.text || d.shortText || '',
      };
      out.events.push(event);
      if (!isGoal) return;
      const g = { name: player, minute: clock };
      if (txt.includes('penalty')) g.penalty = true;
      if (txt.includes('own')) g.owngoal = true;
      (homeSide ? out.home : out.away).push(g);
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
      const g = eventsFrom(comp, home.team.id);
      const [goalsA, goalsB] = orient(g.home, g.away);
      const stats = statsFrom(home, away);
      const [statsA, statsB] = orient(stats.home, stats.away);
      const [lineupA, lineupB] = orient(lineupFrom(home), lineupFrom(away));
      const [formationA, formationB] = orient(home.formation || null, away.formation || null);
      const events = g.events.map((event) => ({ ...event, side: slotA === hc ? event.side : event.side === 'home' ? 'away' : 'home' }));
      const prev = D.LIVE[tie.id];
      const changed = !prev || prev.a !== a || prev.b !== b || prev.min !== min;
      D.LIVE[tie.id] = {
        a, b, min, goalsA, goalsB, events, teamStats: { a: statsA, b: statsB },
        lineups: lineupA.length || lineupB.length ? { a:lineupA, b:lineupB } : null,
        formations: formationA || formationB ? [formationA, formationB] : null,
        periodLabel: e.status?.type?.shortDetail || e.status?.type?.detail || 'Live',
        source: 'ESPN', updatedAt: D.LIVE_HEALTH?.fetchedAt || null,
      };
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
      const g = eventsFrom(comp, home.team.id);
      const [goalsA, goalsB] = orient(g.home, g.away);
      const stats = statsFrom(home, away);
      const [statsA, statsB] = orient(stats.home, stats.away);
      const [lineupA, lineupB] = orient(lineupFrom(home), lineupFrom(away));
      const [formationA, formationB] = orient(home.formation || null, away.formation || null);
      const events = g.events.map((event) => ({ ...event, side: slotA === hc ? event.side : event.side === 'home' ? 'away' : 'home' }));
      D.RESULTS[tie.id] = {
        a, b, pens, penScore: pens ? orient(hp, ap) : null, w: wc, goalsA, goalsB, events,
        teamStats: { a: statsA, b: statsB },
        lineups: lineupA.length || lineupB.length ? { a:lineupA, b:lineupB } : null,
        formations: formationA || formationB ? [formationA, formationB] : null,
        periodLabel: 'Full time', source: 'ESPN',
        updatedAt: D.LIVE_HEALTH?.fetchedAt || null,
      };
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
      D.LIVE_HEALTH = { stale: !!data.stale, fetchedAt: data.fetchedAt || null, lastError: data.lastError || null };
      if (data.stale || !Array.isArray(data.events)) {
        window.dispatchEvent(new CustomEvent('kc:live-health'));
        return;
      }
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
