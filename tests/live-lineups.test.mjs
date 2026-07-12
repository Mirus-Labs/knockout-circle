import assert from 'node:assert/strict';
import test from 'node:test';

import { liveLineupWindow, parseLiveLineups } from '../scripts/live-lineups.mjs';

const player = (shirt, position, name, status = 1) => ({
  ShirtNumber: shirt, Position: position, Status: status,
  PlayerName: [{ Locale: 'en-GB', Description: name }],
});

const eleven = (prefix) => [
  player(1, 0, `${prefix} Keeper`),
  ...[2, 3, 4, 5].map((n) => player(n, 1, `${prefix} Back ${n}`)),
  ...[6, 8, 10].map((n) => player(n, 2, `${prefix} Mid ${n}`)),
  ...[7, 9, 11].map((n) => player(n, 3, `${prefix} Wing ${n}`)),
];

const liveMatch = () => ({
  MatchNumber: 99,
  HomeTeam: {
    TeamName: [{ Locale: 'en-GB', Description: 'Norway' }],
    Tactics: '4-1-2-3',
    Players: [player(12, 0, 'Norway Sub Keeper', 2), ...eleven('Norway')],
  },
  AwayTeam: {
    TeamName: [{ Locale: 'en-GB', Description: 'England' }],
    Tactics: '4-2-3-1',
    Players: [...eleven('England'), player(13, 3, 'England Sub Striker', 2)],
  },
});

test('parseLiveLineups maps an announced XI into the report lineup shape', () => {
  const parsed = parseLiveLineups(liveMatch());
  assert.equal(parsed.matchNumber, 99);
  assert.deepEqual(parsed.teams, ['Norway', 'England']);
  assert.deepEqual(parsed.formations, ['4-1-2-3', '4-2-3-1']);
  assert.equal(parsed.source, 'FIFA live match feed');
  assert.equal(parsed.lineups.a.length, 12);
  assert.deepEqual(parsed.lineups.a[0], { number: 1, position: 'GK', name: 'Norway Keeper', starter: true });
  // starters lead each sheet so the pitch's slice(0, 11) never picks up the bench
  assert.ok(parsed.lineups.a.slice(0, 11).every((p) => p.starter));
  assert.deepEqual(parsed.lineups.a.at(-1), { number: 12, position: 'GK', name: 'Norway Sub Keeper', starter: false });
  assert.deepEqual(parsed.lineups.b.at(-1), { number: 13, position: 'FW', name: 'England Sub Striker', starter: false });
});

test('parseLiveLineups waits until both starting elevens are announced', () => {
  const pending = liveMatch();
  pending.AwayTeam.Players = pending.AwayTeam.Players.slice(0, 6);
  assert.equal(parseLiveLineups(pending), null);
  assert.equal(parseLiveLineups(null), null);
  assert.equal(parseLiveLineups({ HomeTeam: {}, AwayTeam: {} }), null);
});

test('parseLiveLineups drops unusable tactics strings instead of the lineup', () => {
  const odd = liveMatch();
  odd.HomeTeam.Tactics = 'UNKNOWN';
  const parsed = parseLiveLineups(odd);
  assert.equal(parsed.formations, null);
  assert.equal(parsed.lineups.a.length, 12);
});

test('liveLineupWindow snaps to the whole hours the FIFA calendar API requires', () => {
  assert.deepEqual(liveLineupWindow(new Date('2026-07-11T21:00:00Z')), {
    from: '2026-07-11T17:00:00Z',
    to: '2026-07-12T00:00:00Z',
  });
  assert.deepEqual(liveLineupWindow(new Date('2026-07-11T21:47:13.512Z')), {
    from: '2026-07-11T17:00:00Z',
    to: '2026-07-12T00:00:00Z',
  });
});
