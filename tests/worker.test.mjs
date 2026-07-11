import assert from 'node:assert/strict';
import test from 'node:test';

import { kickoffAt, retryDelay, withinMatchWindow } from '../worker/index.mjs';

test('kickoffAt applies an explicit UTC offset', () => {
  assert.equal(
    kickoffAt({ date: '2026-07-11', time: '15:00 UTC-4' }),
    Date.parse('2026-07-11T19:00:00Z'),
  );
});

test('withinMatchWindow activates shortly before kickoff and expires after four hours', () => {
  const matches = [{ date: '2026-07-11', time: '15:00 UTC-4' }];
  assert.equal(withinMatchWindow(matches, Date.parse('2026-07-11T18:51:00Z')), true);
  assert.equal(withinMatchWindow(matches, Date.parse('2026-07-11T23:01:00Z')), false);
});

test('retryDelay backs off and caps at fifteen minutes', () => {
  assert.equal(retryDelay(1), 60_000);
  assert.equal(retryDelay(3), 240_000);
  assert.equal(retryDelay(99), 900_000);
});
