import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchFacts, decidingFact, kickoffIso, localKickoff } from '../js/match-facts.mjs';

test('kickoffIso applies source UTC offsets', () => {
  assert.equal(kickoffIso({ date: '2026-07-11', time: '15:00 UTC-4' }), '2026-07-11T19:00:00.000Z');
});

test('localKickoff formats the same instant in viewer and venue zones', () => {
  const value = localKickoff(
    { kickoffUtc: '2026-07-11T19:00:00.000Z', venueTimeZone: 'America/New_York' },
    { locale: 'en-US', timeZone: 'Europe/London' },
  );
  assert.match(value.local, /8:00 PM/);
  assert.match(value.venue, /3:00 PM/);
  assert.equal(value.timeZone, 'Europe/London');
});

test('kickoff and local formatting fail safely when schedule data is malformed', () => {
  assert.equal(kickoffIso({ date: 'July 11', time: 'soon' }), null);
  assert.deepEqual(localKickoff({ date: 'July 11' }), { iso: null, local: null, venue: null, timeZone: null });
});

test('FIFA report facts override live team statistics without losing events', () => {
  const facts = buildMatchFacts({
    meta: { date: '2026-07-11', time: '15:00 UTC-4' }, status: 'finished',
    score: { a: 2, b: 1 },
    source: { events: [{ type: 'goal', player: 'A' }], teamStats: { a: { xg: 1, cards:2 }, b: { xg: 1, cards:1 } }, source: 'ESPN' },
    report: { teamStats: { a: { xg: 2.4 }, b: { xg: 0.7 } }, reportUrl: 'https://example.test/report.pdf', source: 'FIFA Training Centre' },
  });
  assert.equal(facts.teamStats.a.xg, 2.4);
  assert.equal(facts.teamStats.a.cards, 2);
  assert.equal(facts.events[0].player, 'A');
  assert.deepEqual(facts.sources, ['FIFA Training Centre', 'ESPN']);
});

test('decidingFact only speaks when the comparison clears a conservative threshold', () => {
  assert.match(decidingFact({ a: { xg: 2.5 }, b: { xg: 0.5 } }), /chance quality/i);
  assert.equal(decidingFact({ a: { xg: 1.2, onTarget: 4 }, b: { xg: 1, onTarget: 3 } }), null);
});
