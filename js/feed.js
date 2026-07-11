/* Knockout Circle — live tournament feed (openfootball, public domain, no key) */
window.KC_FEED = (() => {
  const SRC = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
  const CACHE_KEY = 'kc-feed-v1';
  const TTL = 15 * 60 * 1000; // source updates ~daily; GitHub edge caches 5 min

  const KO_ROUNDS = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Match for third place', 'Final'];

  // winner of a knockout match: pens ("p") > extra time > full time
  const winner = (m) => {
    const s = m.score || {};
    const line = s.p || s.pen || s.et || s.ft;
    if (!line) return null;
    if (line[0] === line[1]) return null;
    return line[0] > line[1] ? m.team1 : m.team2;
  };

  const buildStandings = (matches) => {
    const groups = {};
    matches.filter((m) => m.group && m.score && m.score.ft).forEach((m) => {
      const rows = (groups[m.group] = groups[m.group] || {});
      const [a, b] = m.score.ft;
      [[m.team1, a, b], [m.team2, b, a]].forEach(([team, gf, ga]) => {
        const r = (rows[team] = rows[team] || { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
        r.p++; r.gf += gf; r.ga += ga;
        if (gf > ga) { r.w++; r.pts += 3; } else if (gf === ga) { r.d++; r.pts++; } else { r.l++; }
      });
    });
    const out = {};
    Object.keys(groups).sort().forEach((g) => {
      out[g] = Object.values(groups[g])
        .map((r) => ({ ...r, gd: r.gf - r.ga }))
        .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.team.localeCompare(y.team));
    });
    return out;
  };

  const buildScorers = (matches) => {
    const tally = {};
    matches.forEach((m) => {
      [['goals1', m.team1], ['goals2', m.team2]].forEach(([key, team]) => {
        (m[key] || []).forEach((g) => {
          if (g.owngoal) return;
          const r = (tally[g.name] = tally[g.name] || { name: g.name, team, goals: 0 });
          r.goals++;
        });
      });
    });
    return Object.values(tally).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
  };

  // resolve "W97"/"L98"-style placeholders once the referenced match is decided
  const resolvePlaceholders = (matches) => {
    const byNum = {};
    matches.forEach((m) => { if (m.num) byNum[m.num] = m; });
    return matches.map((m) => {
      const fix = (t) => {
        const ref = /^([WL])(\d+)$/.exec(t || '');
        if (!ref) return t;
        const src = byNum[+ref[2]];
        const w = src && winner(src);
        if (!w) return t;
        return ref[1] === 'W' ? w : (w === src.team1 ? src.team2 : src.team1);
      };
      return { ...m, team1: fix(m.team1), team2: fix(m.team2) };
    });
  };

  const shape = (raw, fetchedAt) => {
    const matches = resolvePlaceholders(raw.matches || []);
    const rounds = {};
    KO_ROUNDS.forEach((r) => { rounds[r] = matches.filter((m) => m.round === r); });
    const final = rounds['Final'][0];
    return {
      source: SRC,
      fetchedAt,
      name: raw.name,
      matches,
      played: matches.filter((m) => m.score && m.score.ft).length,
      standings: buildStandings(matches),
      rounds,
      scorers: buildScorers(matches),
      champion: final ? winner(final) : null,
    };
  };

  const fromCache = () => {
    try {
      const hit = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (hit && Date.now() - hit.fetchedAt < TTL) return hit;
    } catch (e) { /* ignore */ }
    return null;
  };

  const load = async () => {
    const cached = fromCache();
    if (cached) return shape(cached.raw, cached.fetchedAt);
    try {
      const res = await fetch(SRC);
      if (!res.ok) throw new Error('feed HTTP ' + res.status);
      const raw = await res.json();
      const fetchedAt = Date.now();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt, raw })); } catch (e) { /* quota */ }
      return shape(raw, fetchedAt);
    } catch (err) {
      console.warn('KC_FEED: live data unavailable, site falls back to authored data.', err);
      const stale = (() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; } })();
      return stale ? shape(stale.raw, stale.fetchedAt) : null;
    }
  };

  return { ready: load() };
})();
