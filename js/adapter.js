/* Knockout Circle — feed adapter: reshapes KC_FEED into KC_DATA, then boots the app.
   If the feed is missing or malformed the authored (illustrative) data renders untouched. */
(() => {
  const FEED_TIMEOUT = 4000;

  // group-stage-only nations (knockout nations get flags from TEAMS)
  const EXTRA_FLAGS = {
    'Curaçao': '🇨🇼', 'Czech Republic': '🇨🇿', 'Haiti': '🇭🇹', 'Iran': '🇮🇷', 'Iraq': '🇮🇶',
    'Jordan': '🇯🇴', 'New Zealand': '🇳🇿', 'Panama': '🇵🇦', 'Qatar': '🇶🇦', 'Saudi Arabia': '🇸🇦',
    'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Tunisia': '🇹🇳', 'Turkey': '🇹🇷', 'Uruguay': '🇺🇾', 'Uzbekistan': '🇺🇿',
  };

  // football-data.org (stats overlay) names → openfootball/roster names
  const NAME_ALIAS = {
    "Côte d'Ivoire": 'Ivory Coast', 'Korea Republic': 'South Korea', 'Türkiye': 'Turkey',
    'Czechia': 'Czech Republic', 'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
    'IR Iran': 'Iran', 'United States': 'USA', 'United States of America': 'USA',
  };
  const VENUE_TIME_ZONES = {
    Atlanta:'America/New_York', Boston:'America/New_York', 'Boston (Foxborough)':'America/New_York', Miami:'America/New_York',
    'New York':'America/New_York', 'New York (East Rutherford)':'America/New_York', Philadelphia:'America/New_York', Toronto:'America/Toronto',
    Dallas:'America/Chicago', 'Dallas (Arlington)':'America/Chicago', Houston:'America/Chicago', 'Kansas City':'America/Chicago',
    'Los Angeles':'America/Los_Angeles', 'Los Angeles (Inglewood)':'America/Los_Angeles', Seattle:'America/Los_Angeles',
    'San Francisco':'America/Los_Angeles', 'San Francisco (Santa Clara)':'America/Los_Angeles', Vancouver:'America/Vancouver',
    'Mexico City':'America/Mexico_City', Guadalajara:'America/Mexico_City', Monterrey:'America/Monterrey',
  };
  const flagOfName = (name) => {
    const D = window.KC_DATA;
    const n = NAME_ALIAS[name] || name;
    const code = Object.keys(D.TEAMS).find((c) => D.TEAMS[c].n === n);
    return code ? D.TEAMS[code].f : EXTRA_FLAGS[n] || '⚽';
  };
  const rankRows = (rows) => {
    rows.sort((a, b) => b.val - a.val || a.name.localeCompare(b.name));
    const out = [];
    rows.slice(0, 14).forEach((r, i) => {
      const prev = out[i - 1];
      out.push({ ...r, rank: prev && prev.val === r.val ? prev.rank : i + 1 });
    });
    return out;
  };

  const lineOf = (m) => { const s = m.score || {}; return s.et || s.ft || null; };
  const winnerName = (m) => {
    const s = m.score || {};
    const dec = s.p || s.et || s.ft;
    if (!dec || dec[0] === dec[1]) return null;
    return dec[0] > dec[1] ? m.team1 : m.team2;
  };

  function applyFeed(feed) {
    const D = window.KC_DATA;
    const codeOf = {};
    Object.keys(D.TEAMS).forEach((c) => { codeOf[D.TEAMS[c].n] = c; });
    const flagOf = (name) => {
      const c = codeOf[name];
      return c ? D.TEAMS[c].f : EXTRA_FLAGS[name] || '⚽';
    };

    const matches = feed.matches;
    const byNum = {};
    matches.forEach((m) => { if (m.num) byNum[m.num] = m; });

    /* ---- rebuild the bracket tree from the final downward ---- */
    const round = (name) => matches.filter((m) => m.round === name).sort((a, b) => a.num - b.num);
    const POOLS = {
      'Final': round('Semi-final'),
      'Semi-final': round('Quarter-final'),
      'Quarter-final': round('Round of 16'),
      'Round of 16': round('Round of 32'),
    };
    // a slot is either a "W101"-style ref or a real name matching a unique prev-round winner
    const childOf = (m, slot) => {
      const t = slot === 0 ? m.team1 : m.team2;
      const ref = /^([WL])(\d+)$/.exec(t || '');
      if (ref) return byNum[+ref[2]] || null;
      return (POOLS[m.round] || []).find((c) => winnerName(c) === t) || null;
    };

    const fin = round('Final');
    if (fin.length !== 1 || round('Round of 32').length !== 16) throw new Error('unexpected knockout shape');
    const tiers = { final: fin, sf: [], qf: [], r16: [], r32: [] };
    [['final', 'sf'], ['sf', 'qf'], ['qf', 'r16'], ['r16', 'r32']].forEach(([from, to]) => {
      tiers[from].forEach((m) => {
        const c0 = childOf(m, 0), c1 = childOf(m, 1);
        if (!c0 || !c1) throw new Error('bracket tree incomplete at ' + m.round);
        tiers[to].push(c0, c1);
      });
    });

    const ORDER = [];
    tiers.r32.forEach((m) => { ORDER.push(codeOf[m.team1], codeOf[m.team2]); });
    if (ORDER.length !== 32 || ORDER.some((c) => !c)) throw new Error('unmapped team in Round of 32');

    /* ---- statuses, results, winners, kick-off meta ---- */
    const PICK = {}, RESULTS = {}, STATUS = {}, META = {}, keyOfNum = {};
    Object.keys(tiers).forEach((key) => {
      tiers[key].forEach((m, i) => {
        const id = key + '-' + i;
        keyOfNum[m.num] = { key, idx: i };
        META[id] = {
          date: m.date, time: m.time, ground: m.ground, num: m.num, source: 'openfootball',
          venueTimeZone: VENUE_TIME_ZONES[m.ground] || null,
        };
        const line = lineOf(m);
        STATUS[id] = line ? 'finished' : 'upcoming';
        const w = winnerName(m);
        if (w && codeOf[w]) PICK[id] = codeOf[w];
        if (line) {
          RESULTS[id] = {
            a: line[0], b: line[1],
            pens: !!(m.score && m.score.p),
            penScore: (m.score && m.score.p) || null, // [a, b] shootout score when decided on pens
            w: codeOf[w] || null,
            goalsA: m.goals1 || [], goalsB: m.goals2 || [],
          };
        }
      });
    });

    /* ---- next fixtures (knockout, soonest first) ---- */
    const UPNEXT = matches
      .filter((m) => keyOfNum[m.num] && !lineOf(m))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.num - b.num))
      .map((m) => keyOfNum[m.num]);

    /* ---- real last-5 form for every rostered team ---- */
    const forms = {};
    matches
      .filter((m) => lineOf(m))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.num || 0) - (b.num || 0)))
      .forEach((m) => {
        const [ga, gb] = lineOf(m);
        [[m.team1, ga, gb], [m.team2, gb, ga]].forEach(([name, f, ag]) => {
          const c = codeOf[name];
          if (!c) return;
          (forms[c] = forms[c] || []).push(f > ag ? 'W' : f === ag ? 'D' : 'L');
        });
      });
    Object.keys(forms).forEach((c) => { D.TEAMS[c].fm = forms[c].slice(-5); });

    /* ---- real leader tables (goals + own goals; feed has no assists/cards) ---- */
    const goals = {}, owngoals = {};
    matches.forEach((m) => {
      [['goals1', m.team1, m.team2], ['goals2', m.team2, m.team1]].forEach(([k, team, opp]) => {
        (m[k] || []).forEach((g) => {
          // an own goal credited to team's tally was scored by an opponent player
          const bucket = g.owngoal ? owngoals : goals;
          const owner = g.owngoal ? opp : team;
          const row = (bucket[g.name] = bucket[g.name] || { name: g.name, flag: flagOf(owner), handle: null, verified: false, val: 0 });
          row.val++;
        });
      });
    });
    D.STATS = { goals: rankRows(Object.values(goals)), owngoals: rankRows(Object.values(owngoals)) };
    D.STAT_TABS = [['goals', 'Goals'], ['owngoals', 'Own Goals']];

    /* ---- group stage: all 48 nations, flagged by whether they reached the R32 ----
       a team "advanced" iff it appears in a Round-of-32 tie — this captures the
       top two of every group plus the eight best third-placed sides automatically */
    const advanced = new Set();
    round('Round of 32').forEach((m) => { advanced.add(m.team1); advanced.add(m.team2); });
    const GROUPS = Object.keys(feed.standings || {}).sort().map((g) => ({
      name: g,
      rows: feed.standings[g].map((r) => ({
        name: r.team,
        code: codeOf[r.team] || null,
        flag: flagOf(r.team),
        p: r.p, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, gd: r.gd, pts: r.pts,
        adv: advanced.has(r.team),
      })),
    }));

    /* ---- commit ---- */
    D.ORDER = ORDER;
    D.GROUPS = GROUPS;
    D.PICK = PICK;
    D.LIVE = {}; // daily feed — no in-match data
    D.RESULTS = RESULTS;
    D.STATUS = STATUS;
    D.META = META;
    D.UPNEXT = UPNEXT;
    D.REAL = { source: 'openfootball', fetchedAt: feed.fetchedAt };
  }

  /* optional overlays written by scripts/update-data.mjs (run it on a schedule) */
  async function applyOverlays() {
    const D = window.KC_DATA;
    const get = async (path) => {
      try {
        const separator = path.includes('?') ? '&' : '?';
        const r = await fetch(`${path}${separator}refresh=${Date.now()}`, { cache: 'no-store' });
        return r.ok ? await r.json() : null;
      } catch (e) { return null; }
    };
    const wantPlayerStats = document.body.dataset.page === 'match';
    const [news, stats, highlights, playerImages, stadiumImages, matchReports, playerStats] = await Promise.all([
      get('data/news.json'), get('data/stats.json'), get('data/highlights.json'), get('data/player-images.json'), get('data/stadium-images.json'), get('data/match-reports.json'),
      wantPlayerStats ? get('data/player-stats.json') : Promise.resolve(null),
    ]);
    if (playerStats && playerStats.players && typeof playerStats.players === 'object') D.PLAYER_STATS = playerStats.players;
    if (news && Array.isArray(news.news) && news.news.length) D.NEWS = news.news;
    if (highlights && highlights.matches && typeof highlights.matches === 'object') D.HIGHLIGHTS = highlights.matches;
    if (playerImages && playerImages.players && typeof playerImages.players === 'object') D.PLAYER_IMAGES = playerImages.players;
    if (stadiumImages && stadiumImages.stadiums && typeof stadiumImages.stadiums === 'object') D.STADIUM_IMAGES = stadiumImages.stadiums;
    if (matchReports && matchReports.matches && typeof matchReports.matches === 'object') D.MATCH_REPORTS = matchReports.matches;
    D.OVERLAY_UPDATED = {
      news: news && news.updated,
      stats: stats && stats.updated,
      highlights: highlights && highlights.updated,
      players: playerImages && playerImages.updated,
      stadiums: stadiumImages && stadiumImages.updated,
      matchReports: matchReports && matchReports.updated,
    };
    // only merge real leader tables when the bracket itself is real, never into the authored demo
    if (D.REAL && stats && stats.tabs) {
      const EXTRA_TABS = [['assists', 'Assists'], ['yellow', 'Yellow Cards'], ['red', 'Red Cards']];
      const tabs = [['goals', 'Goals']];
      EXTRA_TABS.forEach(([key, label]) => {
        const rows = stats.tabs[key];
        if (!Array.isArray(rows) || !rows.length) return;
        D.STATS[key] = rankRows(rows.map((r) => ({
          name: r.name, flag: flagOfName(r.team), handle: null, verified: false, val: r.val,
        })));
        tabs.push([key, label]);
      });
      tabs.splice(2, 0, ['owngoals', 'Own Goals']); // keep own goals next to goals/assists
      D.STAT_TABS = tabs;
    }
  }

  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('failed to load ' + src));
    document.body.appendChild(s);
  });

  window.KC_BOOT = (async () => {
    let feed = null;
    try {
      feed = await Promise.race([
        window.KC_FEED.ready,
        new Promise((r) => setTimeout(() => r(null), FEED_TIMEOUT)),
      ]);
    } catch (e) { /* fall through to authored data */ }
    if (feed) {
      try { applyFeed(feed); }
      catch (err) { console.warn('KC adapter: feed rejected, rendering authored data.', err); }
    }
    try { await applyOverlays(); }
    catch (err) { console.warn('KC adapter: overlays skipped.', err); }
    const detailPage = document.body.dataset.page === 'match';
    if (detailPage) {
      try { window.KC_MATCH_FACTS = await import('./match-facts.mjs?v=2'); }
      catch (err) { console.warn('KC match facts unavailable.', err); }
    }
    await loadScript('js/tournament.js?v=5');
    if (window.KC_DATA.REAL) {
      await loadScript('js/live.js?v=4');
      await Promise.race([
        window.KC_LIVE?.ready || Promise.resolve(),
        new Promise((resolve) => setTimeout(resolve, FEED_TIMEOUT)),
      ]);
    }
    const scripts = detailPage
      ? ['js/match-page.js?v=15']
      : ['js/app.js?v=11', 'js/fx.js?v=8', 'js/zoom.js?v=5'];
    for (const src of scripts) await loadScript(src);
  })();
})();
