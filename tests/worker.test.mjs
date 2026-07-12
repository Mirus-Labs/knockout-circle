import assert from 'node:assert/strict';
import test from 'node:test';

import { kickoffAt, latestNews, retryDelay, withinMatchWindow } from '../worker/index.mjs';

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

test('latestNews serves the current main-branch overlay', async () => {
  const upstream = { updated: '2026-07-12T20:00:00.000Z', news: [{ title: 'Latest' }] };
  const response = await latestNews(
    new Request('https://example.test/data/news.json'),
    { ASSETS: { fetch: () => assert.fail('static fallback should not be used') } },
    async () => Response.json(upstream),
  );
  assert.deepEqual(await response.json(), upstream);
  assert.equal(response.headers.get('x-news-source'), 'github-main');
});

test('latestNews falls back to the deployed asset when GitHub is unavailable', async () => {
  const fallback = Response.json({ updated: 'fallback', news: [{ title: 'Cached' }] });
  const response = await latestNews(
    new Request('https://example.test/data/news.json'),
    { ASSETS: { fetch: async () => fallback } },
    async () => new Response('unavailable', { status: 503 }),
  );
  assert.deepEqual(await response.json(), { updated: 'fallback', news: [{ title: 'Cached' }] });
});
