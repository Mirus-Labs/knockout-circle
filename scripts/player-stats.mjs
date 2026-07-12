/*
 * Build verified per-player performance stats for the match pages.
 *
 * Source: the public "fifaphy" dataset (fifaphy.vercel.app), which aggregates
 * FIFA's official Enhanced Football Intelligence (EFI) per-match player metrics
 * (line-breaks, threat, pressures, distributions, …) plus each player's minutes
 * and real position. The raw metric counts are official FIFA numbers.
 *
 * The four radar axes (Attacking / Creation / Line-breaking / Defending — and
 * Goalkeeping / Passing for keepers) are NOT published by FIFA: they are derived
 * here exactly as the reference implementation does — each raw metric is turned
 * into a per-90 value, ranked into a percentile against players in the same
 * position group, and the axis score is the mean of its metrics' percentiles.
 *
 * We deliberately do NOT emit the fifaphy "rating" (it is an admitted model
 * approximation, not an official FIFA figure).
 */

const FEEDS = {
  data: 'https://fifaphy.vercel.app/data.js',
  ratings: 'https://fifaphy.vercel.app/ratings.js',
  posreal: 'https://fifaphy.vercel.app/posreal.js',
};

// Raw FIFA metrics that make up each radar axis (mirrors the reference RADAR map).
export const RADAR = {
  att: ['Assists', 'Crosses', 'NumberOfShotEndingSequences', 'Threat', 'Goals'],
  cre: ['CompletedSwitchesOfPlay', 'DistributionsUnderPressure', 'NumberOfPossessionSequences', 'CompletedBallProgressions', 'Passes', 'NumberOfInvolvements'],
  lin: ['LinebreaksAttemptedAttackingLine', 'LinebreaksAttemptedDefensiveLine', 'LinebreaksAttemptedCompleted', 'LinebreaksAttemptedUnderPressure', 'LinebreaksAttempted', 'LinebreaksAttemptedMidfieldLine'],
  pas: ['ReceivedOffersToReceive', 'OffersToReceiveInside', 'OffersToReceiveOutside', 'OffersToReceiveInBetween', 'OffersToReceiveInBehind', 'OffersToReceiveTotal'],
  def: ['ForcedTurnovers', 'DefensivePressuresApplied', 'DirectDefensivePressuresApplied'],
  gk: ['GoalkeeperSaves', 'GoalkeeperSavesOnTarget', 'GoalkeeperDefensiveActionsOutsidePenaltyArea', 'GoalsConceded'],
};
export const MACRO_FIELD = ['att', 'cre', 'lin', 'def'];
export const MACRO_GK = ['gk', 'cre', 'pas', 'def'];
const AXIS_LABEL = { att: 'Attacking', cre: 'Creation', lin: 'Line-breaking', pas: 'Passing options', def: 'Defending', gk: 'Goalkeeping' };
const METRIC_LABEL = {
  Assists: 'Assists', Crosses: 'Crosses', NumberOfShotEndingSequences: 'Shot-ending sequences', Threat: 'Threat', Goals: 'Goals',
  CompletedSwitchesOfPlay: 'Switches of play', DistributionsUnderPressure: 'Distributions under pressure', NumberOfPossessionSequences: 'Possession sequences', CompletedBallProgressions: 'Ball progressions', Passes: 'Passes', NumberOfInvolvements: 'Involvements',
  LinebreaksAttemptedAttackingLine: 'Attacking-line breaks', LinebreaksAttemptedDefensiveLine: 'Defensive-line breaks', LinebreaksAttemptedCompleted: 'Line-breaks completed', LinebreaksAttemptedUnderPressure: 'Line-breaks under pressure', LinebreaksAttempted: 'Line-breaks attempted', LinebreaksAttemptedMidfieldLine: 'Midfield-line breaks',
  ReceivedOffersToReceive: 'Offers received', OffersToReceiveInside: 'Offers inside', OffersToReceiveOutside: 'Offers outside', OffersToReceiveInBetween: 'Offers in between', OffersToReceiveInBehind: 'Offers in behind', OffersToReceiveTotal: 'Offers to receive',
  ForcedTurnovers: 'Forced turnovers', DefensivePressuresApplied: 'Defensive pressures', DirectDefensivePressuresApplied: 'Direct defensive pressures',
  GoalkeeperSaves: 'Saves', GoalkeeperSavesOnTarget: 'Saves on target', GoalkeeperDefensiveActionsOutsidePenaltyArea: 'Sweeper actions', GoalsConceded: 'Goals conceded',
};
const DEC_METRICS = new Set(['Threat']);
const INV_METRICS = new Set(['GoalsConceded']); // less is better
const LINE_GROUP = { 0: 'GK', 1: 'DEF', 2: 'MID', 3: 'FWD' };

export const foldName = (value) => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

const groupFromPosStr = (s) => /goalkeeper/i.test(s) ? 'GK' : /defender/i.test(s) ? 'DEF' : /striker|forward/i.test(s) ? 'FWD' : 'MID';

function stripConst(js, name) {
  const m = js.match(new RegExp(`const ${name}\\s*=\\s*(\\{[\\s\\S]*\\})\\s*;?\\s*$`));
  if (!m) throw new Error(`${name}: object literal not found`);
  return JSON.parse(m[1]);
}

// ratings.js → summed minutes, rating count, and a real (non-substitute) position per player.
export function parseRatings(js) {
  const R = stripConst(js, 'RATINGS');
  const minSum = {}, rCnt = {}, posStr = {};
  for (const match of Object.values(R.matches || {})) {
    for (const [pid, pr] of Object.entries(match.players || {})) {
      minSum[pid] = (minSum[pid] || 0) + (+pr.min || 0);
      if (pr.r != null) rCnt[pid] = (rCnt[pid] || 0) + 1;
      const p = String(pr.pos || '');
      if (p && p !== 'Substitute') posStr[pid] = p;
    }
  }
  return { minSum, rCnt, posStr };
}

// posreal.js → main position string and line index (0=GK…3=FWD) per player.
export function parsePosreal(js) {
  const P = stripConst(js, 'POSREAL');
  const posLine = {}, posMain = {};
  for (const [pid, pp] of Object.entries(P.players || {})) {
    posLine[pid] = pp.line == null ? -1 : +pp.line;
    posMain[pid] = String(pp.main || '');
  }
  return { posLine, posMain };
}

// data.js → per-player summed official FIFA metrics (zeros dropped to stay small).
export function parseData(js) {
  const RE = /\{"playerId":"(\d+)","name":"([^"]*)","teamId":"[^"]*","teamName":"([^"]*)","teamCode":"([^"]*)","photo":"([^"]*)"[^{]*"metrics":\{([^{}]*)\}/g;
  const players = {};
  let r;
  while ((r = RE.exec(js))) {
    const pid = r[1];
    if (!players[pid]) players[pid] = { name: r[2], teamName: r[3], team: (r[4] || '').toUpperCase(), photo: r[5], m: {} };
    for (const kv of r[6].matchAll(/"([A-Za-z0-9]+)":(-?[0-9.]+)/g)) {
      const val = +kv[2];
      if (val === 0) continue;
      players[pid].m[kv[1]] = (players[pid].m[kv[1]] || 0) + val;
    }
  }
  return players;
}

const per90 = (m, key, min) => (m[key] || 0) * 90 / Math.max(1, min);
const fmtValue = (v, key) => DEC_METRICS.has(key) ? v.toFixed(2) : v >= 10 ? String(Math.round(v)) : v.toFixed(1);

// Combine the three feeds into a compact, page-ready map keyed by folded name.
export function buildStats({ dataPlayers, minSum, rCnt, posStr, posLine, posMain }) {
  const players = {};
  for (const [pid, pl] of Object.entries(dataPlayers)) {
    const min = +(minSum[pid] || 0);
    if (min <= 0) continue; // no minutes → no trustworthy per-90
    const line = posLine[pid];
    const grp = LINE_GROUP[line] ?? groupFromPosStr(posStr[pid] || '');
    players[pid] = { ...pl, min, mp: rCnt[pid] || 0, grp, pos: posMain[pid] || posStr[pid] || '' };
  }

  const allMetrics = new Set(Object.values(RADAR).flat());
  const cohorts = {}; // `${metric}|${grp}` → sorted per-90 values
  for (const key of allMetrics) {
    for (const grp of ['GK', 'DEF', 'MID', 'FWD']) {
      const vals = [];
      for (const pl of Object.values(players)) if (pl.grp === grp) vals.push(per90(pl.m, key, pl.min));
      vals.sort((a, b) => a - b);
      cohorts[`${key}|${grp}`] = vals;
    }
  }

  const pct = (pl, key) => {
    const v = per90(pl.m, key, pl.min);
    const vals = cohorts[`${key}|${pl.grp}`] || [];
    const n = vals.length;
    if (n < 3) return 50;
    let less = 0;
    for (const x of vals) if (x < v) less++;
    let p = Math.round(less / (n - 1) * 100);
    if (INV_METRICS.has(key)) p = 100 - p;
    return Math.max(0, Math.min(100, p));
  };
  const catScore = (pl, axis) => {
    const keys = RADAR[axis];
    return Math.round(keys.reduce((s, k) => s + pct(pl, k), 0) / keys.length);
  };

  const out = {};
  let collisions = 0;
  for (const [pid, pl] of Object.entries(players)) {
    const axes = pl.grp === 'GK' ? MACRO_GK : MACRO_FIELD;
    const radar = axes.map((ax) => ({ k: ax, l: AXIS_LABEL[ax], v: catScore(pl, ax) }));
    const metricKeys = [...new Set(axes.flatMap((ax) => RADAR[ax]))];
    const top = metricKeys
      .map((k) => ({ l: METRIC_LABEL[k], v: fmtValue(per90(pl.m, k, pl.min), k), p: pct(pl, k) }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 3);
    const key = foldName(pl.name);
    if (out[key]) { collisions++; if (out[key].min >= pl.min) continue; }
    out[key] = { n: pl.name, t: pl.team, tn: pl.teamName, g: pl.grp, pos: pl.pos, min: pl.min, mp: pl.mp, radar, top, photo: pl.photo, id: pid };
  }
  return { players: out, collisions };
}

export function buildFromFeeds({ dataJs, ratingsJs, posrealJs }) {
  const { minSum, rCnt, posStr } = parseRatings(ratingsJs);
  const { posLine, posMain } = parsePosreal(posrealJs);
  const dataPlayers = parseData(dataJs);
  return buildStats({ dataPlayers, minSum, rCnt, posStr, posLine, posMain });
}

// CLI: `node scripts/player-stats.mjs [--from-dir <dir>]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFile, writeFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const url = await import('node:url');
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const outPath = path.join(here, '..', 'data', 'player-stats.json');

  const dirIdx = process.argv.indexOf('--from-dir');
  const fromDir = dirIdx > -1 ? process.argv[dirIdx + 1] : null;
  const read = async (kind, file) => {
    if (fromDir) return readFile(path.join(fromDir, file), 'utf8');
    const res = await fetch(FEEDS[kind]);
    if (!res.ok) throw new Error(`${FEEDS[kind]} → HTTP ${res.status}`);
    return res.text();
  };

  console.error(fromDir ? `Reading feeds from ${fromDir}` : 'Fetching fifaphy feeds…');
  const [dataJs, ratingsJs, posrealJs] = await Promise.all([
    read('data', 'data.js'), read('ratings', 'ratings.js'), read('posreal', 'posreal.js'),
  ]);
  const { players, collisions } = buildFromFeeds({ dataJs, ratingsJs, posrealJs });
  const payload = {
    updated: new Date().toISOString(),
    source: 'FIFA Enhanced Football Intelligence metrics via the public fifaphy dataset; radar axes are per-90 position-cohort percentiles (derived, not an official FIFA rating).',
    count: Object.keys(players).length,
    players,
  };
  await writeFile(outPath, JSON.stringify(payload));
  console.error(`Wrote ${payload.count} players → ${outPath} (${collisions} name collisions resolved by minutes)`);
}
