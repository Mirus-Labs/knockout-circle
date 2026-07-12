import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRatings, parsePosreal, parseData, buildStats, buildFromFeeds, foldName } from '../scripts/player-stats.mjs';

const ratingsJs = `// header\nconst RATINGS = ${JSON.stringify({
  matches: {
    m1: { players: {
      '1': { min: 90, r: 7, pos: 'Midfielder', name: 'P ONE' },
      '2': { min: 90, r: 6, pos: 'Midfielder', name: 'P TWO' },
      '3': { min: 0, pos: 'Substitute', name: 'P THREE' },
    } },
    m2: { players: {
      '2': { min: 0, r: 6.5, pos: 'Substitute', name: 'P TWO' },
      '3': { min: 90, r: 8, pos: 'Midfielder', name: 'P THREE' },
    } },
  },
})};`;

const posrealJs = `const POSREAL = ${JSON.stringify({
  players: { '1': { main: 'CM', line: 2 }, '2': { main: 'CM', line: 2 }, '3': { main: 'CM', line: 2 } },
})};`;

const entry = (id, name, m) => `{"playerId":"${id}","name":"${name}","teamId":"t","teamName":"Team","teamCode":"AAA","photo":"http://p/${id}","matchId":"m1","position":2,"metrics":${JSON.stringify(m)}}`;
const dataJs = `const TOURNAMENTS = {"x":[${[
  entry('1', 'P ONE', { ForcedTurnovers: 1, DefensivePressuresApplied: 1, DirectDefensivePressuresApplied: 1, Goals: 0 }),
  entry('2', 'P TWO', { ForcedTurnovers: 5, DefensivePressuresApplied: 5, DirectDefensivePressuresApplied: 5 }),
  entry('3', 'P THREE', { ForcedTurnovers: 9, DefensivePressuresApplied: 9, DirectDefensivePressuresApplied: 9 }),
].join(',')}]};`;

test('parseRatings sums minutes, counts ratings, ignores Substitute for position', () => {
  const { minSum, rCnt, posStr } = parseRatings(ratingsJs);
  assert.equal(minSum['2'], 90); // 45 + 45 across two matches
  assert.equal(rCnt['2'], 2);
  assert.equal(posStr['1'], 'Midfielder');
  assert.equal(posStr['3'], 'Midfielder'); // m1 was Substitute, m2 real → keeps real
});

test('parseData sums metrics across the feed and drops zeros', () => {
  const players = parseData(dataJs);
  assert.equal(players['1'].m.ForcedTurnovers, 1);
  assert.equal('Goals' in players['1'].m, false); // zero dropped
  assert.equal(players['3'].team, 'AAA');
});

test('parsePosreal maps the line index', () => {
  const { posLine } = parsePosreal(posrealJs);
  assert.equal(posLine['2'], 2);
});

test('buildStats derives radar axes from per-90 cohort percentiles', () => {
  const { players } = buildFromFeeds({ dataJs, ratingsJs, posrealJs });
  const p3 = players[foldName('P THREE')];
  const p1 = players[foldName('P ONE')];
  const p2 = players[foldName('P TWO')];
  const def = (p) => p.radar.find((a) => a.k === 'def').v;
  // Highest defensive metrics → top of a 3-player cohort → 100th percentile.
  assert.equal(def(p3), 100);
  assert.equal(def(p1), 0);
  // P2 has 45'+45' = 90' minutes and mid metrics → middle percentile.
  assert.equal(def(p2), 50);
  // Field players carry the four outfield axes.
  assert.deepEqual(p3.radar.map((a) => a.k), ['att', 'cre', 'lin', 'def']);
  assert.equal(p3.g, 'MID');
});

test('buildStats excludes players with no minutes', () => {
  const noMinRatings = `const RATINGS = ${JSON.stringify({ matches: { m1: { players: { '1': { min: 0, pos: 'Midfielder', name: 'P ONE' } } } } })};`;
  const { players } = buildFromFeeds({ dataJs, ratingsJs: noMinRatings, posrealJs });
  assert.equal(players[foldName('P ONE')], undefined);
});
