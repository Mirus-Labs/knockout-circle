/* Knockout Circle — centralized live-score collector.
   Cloudflare calls scheduled() once a minute. A single Durable Object owns the
   upstream ESPN request and serves the last-known-good snapshot to every user. */

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const OPENFOOTBALL_SCHEDULE = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const NEWS_OVERLAY = 'https://raw.githubusercontent.com/Mirus-Labs/knockout-circle/main/data/news.json';
const USER_AGENT = 'KnockoutCircle/1.0 (+https://github.com/Mirus-Labs/knockout-circle)';
const SNAPSHOT_KEY = 'snapshot';
const SCHEDULE_KEY = 'schedule';
const CONTROL_KEY = 'control';
const SCHEDULE_TTL = 6 * 60 * 60 * 1000;
const DISCOVERY_INTERVAL = 15 * 60 * 1000;
const WINDOW_BEFORE = 10 * 60 * 1000;
const WINDOW_AFTER = 4 * 60 * 60 * 1000;
const STALE_AFTER = 3 * 60 * 1000;

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(init.headers || {}),
  },
});

export function kickoffAt(match) {
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(match.date || '')) return null;
  const parts = match.date.split('-').map(Number);
  const clock = /^(\d{2}):(\d{2})(?:\s*UTC([+-]\d+))?$/.exec(match.time || '');
  if (!clock) return Date.UTC(parts[0], parts[1] - 1, parts[2], 12);
  const offset = clock[3] == null ? 0 : Number(clock[3]);
  return Date.UTC(parts[0], parts[1] - 1, parts[2], Number(clock[1]) - offset, Number(clock[2]));
}

export function withinMatchWindow(matches, now) {
  return (matches || []).some((match) => {
    const kickoff = kickoffAt(match);
    return kickoff != null && now >= kickoff - WINDOW_BEFORE && now <= kickoff + WINDOW_AFTER;
  });
}

export function retryDelay(failures) {
  return Math.min(15 * 60 * 1000, 60 * 1000 * (2 ** Math.max(0, failures - 1)));
}

function retryAfter(response, now) {
  const value = response.headers.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return now + Math.max(0, seconds) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : null;
}

function singleton(env) {
  return env.LIVE_STATE.get(env.LIVE_STATE.idFromName('world-cup-2026'));
}

export async function latestNews(request, env, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(NEWS_OVERLAY, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`news overlay HTTP ${response.status}`);
    const data = await response.json();
    if (!data?.updated || !Array.isArray(data.news) || !data.news.length) {
      throw new Error('news overlay was malformed');
    }
    return json(data, {
      headers: {
        'cache-control': 'public, max-age=60, stale-while-revalidate=300',
        'x-news-source': 'github-main',
      },
    });
  } catch (error) {
    console.warn('Latest news overlay unavailable:', error.message);
    return env.ASSETS.fetch(request);
  }
}

export class LiveState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/tick') return this.tick();
    if (request.method === 'GET' && url.pathname === '/snapshot') return this.snapshot();
    return json({ error: 'Not found' }, { status: 404 });
  }

  async loadSchedule(now) {
    const cached = await this.state.storage.get(SCHEDULE_KEY);
    if (cached && now - cached.fetchedAt < SCHEDULE_TTL) return cached.matches;

    try {
      const response = await fetch(OPENFOOTBALL_SCHEDULE, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`schedule HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.matches) || !data.matches.length) throw new Error('schedule contained no matches');
      const matches = data.matches.map((match) => ({ date: match.date, time: match.time }));
      await this.state.storage.put(SCHEDULE_KEY, { fetchedAt: now, matches });
      return matches;
    } catch (error) {
      if (cached && Array.isArray(cached.matches)) return cached.matches;
      throw error;
    }
  }

  async tick() {
    const now = Date.now();
    const control = await this.state.storage.get(CONTROL_KEY) || {
      failures: 0,
      retryAt: 0,
      lastDiscoveryAt: 0,
      forceActiveUntil: 0,
    };

    if (control.retryAt > now) {
      return json({ ok: true, skipped: 'backoff', retryAt: new Date(control.retryAt).toISOString() });
    }

    let scheduledActive = false;
    try {
      scheduledActive = withinMatchWindow(await this.loadSchedule(now), now);
    } catch (error) {
      console.warn('Live schedule unavailable:', error.message);
    }

    const forcedActive = control.forceActiveUntil > now;
    const discoveryDue = now - control.lastDiscoveryAt >= DISCOVERY_INTERVAL;
    if (!scheduledActive && !forcedActive && !discoveryDue) {
      return json({ ok: true, skipped: 'outside-match-window' });
    }

    control.lastAttemptAt = now;
    if (!scheduledActive && !forcedActive) control.lastDiscoveryAt = now;

    try {
      const response = await fetch(ESPN_SCOREBOARD, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        const error = new Error(`ESPN HTTP ${response.status}`);
        error.response = response;
        throw error;
      }

      const data = await response.json();
      if (!Array.isArray(data.events)) throw new Error('ESPN response had no events array');
      const live = data.events.some((event) => event?.status?.type?.state === 'in');
      const snapshot = {
        fetchedAt: new Date(now).toISOString(),
        source: 'ESPN',
        events: data.events,
      };
      control.failures = 0;
      control.retryAt = 0;
      control.lastSuccessAt = now;
      control.lastError = null;
      control.forceActiveUntil = live ? now + WINDOW_AFTER : 0;
      await this.state.storage.put({
        [SNAPSHOT_KEY]: snapshot,
        [CONTROL_KEY]: control,
      });
      return json({ ok: true, fetchedAt: snapshot.fetchedAt, events: snapshot.events.length, live });
    } catch (error) {
      control.failures = (control.failures || 0) + 1;
      control.lastError = error.message;
      control.retryAt = retryAfter(error.response || { headers: new Headers() }, now)
        || now + retryDelay(control.failures);
      await this.state.storage.put(CONTROL_KEY, control);
      console.error('Live-score refresh failed:', error.message);
      return json({
        ok: false,
        error: error.message,
        retryAt: new Date(control.retryAt).toISOString(),
      }, { status: 502 });
    }
  }

  async snapshot() {
    const [snapshot, control] = await Promise.all([
      this.state.storage.get(SNAPSHOT_KEY),
      this.state.storage.get(CONTROL_KEY),
    ]);
    if (!snapshot) return json({ error: 'Live scores have not been collected yet' }, { status: 503 });
    const age = Date.now() - Date.parse(snapshot.fetchedAt);
    return json({
      ...snapshot,
      stale: !Number.isFinite(age) || age > STALE_AFTER,
      lastError: control?.lastError || null,
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/data/news.json' && request.method === 'GET') {
      return latestNews(request, env);
    }
    if (url.pathname === '/api/live' && request.method === 'GET') {
      const response = await singleton(env).fetch('https://live.internal/snapshot');
      return new Response(response.body, response);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, { status: 404 });
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil((async () => {
      const response = await singleton(env).fetch('https://live.internal/tick', { method: 'POST' });
      if (!response.ok) throw new Error(`Live-score cron failed: ${await response.text()}`);
    })());
  },
};
