#!/usr/bin/env node
/* Knockout Circle — data updater.
   Writes static JSON overlays the site picks up on next page load:
     data/news.json   — World Cup headlines via Google News RSS (no key needed)
     data/stats.json  — assist / yellow-card / red-card leaders via ESPN's public
                        leaders API (no key needed)
     data/highlights.json — match-specific videos from FIFA's official YouTube playlist
     data/player-images.json — key-player thumbnails and attribution from Wikipedia
     data/stadium-images.json — venue photography from Wikimedia Commons

   Usage:  node scripts/update-data.mjs
   Scheduled hourly by ~/Library/LaunchAgents/com.knockoutcircle.update.plist

   data/match-reports.json blends two FIFA lineup sources: announced XIs from
   the live match API (about an hour before kick-off, --lineups-only polls
   just those) and the post-match Training Centre PDF, which replaces the
   live entry as the source of record once published.
*/
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverReportLinks, extractPdfText, parseReportText } from './match-report.mjs';
import { FIFA_LIVE_API, WORLD_CUP_2026, liveLineupWindow, parseLiveLineups } from './live-lineups.mjs';
import { matchesPlayerVideo } from './player-media.mjs';
import { enrichNewsArticles } from './news-images.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data');
const UA = { 'User-Agent': 'KnockoutCircle/1.0 (+static site data updater)' };

const log = (...a) => console.log(new Date().toISOString(), '-', ...a);
const deployRefresh = process.argv.includes('--deploy');

// A Wrangler custom build runs for both `dev` and `deploy`. Keep local startup
// fast and deterministic; only a real deployment should call remote sources.
if (deployRefresh && process.env.WRANGLER_COMMAND && process.env.WRANGLER_COMMAND !== 'deploy') {
  log(`data refresh skipped for wrangler ${process.env.WRANGLER_COMMAND}`);
  process.exit(0);
}

/* ---------------- news: Google News RSS ---------------- */
const NEWS_EMOJI = ['⚽', '🏆', '🏟️', '🔥', '🌎', '🎯', '📣', '🧤'];
const NEWS_BG = ['#1d6f42', '#3a2d6b', '#7a5b16', '#7a2424', '#1f4b7a', '#0c5c2e', '#5b2d6b', '#2f5d2a'];

const unescapeXml = (s) => s
  .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const stripTags = (s) => unescapeXml(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fetchJsonWithRetry(url, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { headers: UA });
      if (response.ok) return await response.json();
      if (response.status < 429 && response.status < 500) return null;
    } catch { /* retry transient network failures */ }
    if (attempt + 1 < attempts) await pause(350 * (attempt + 1));
  }
  return null;
}

async function updateNews() {
  const url = 'https://news.google.com/rss/search?q=%22world%20cup%22%20football%20when:2d&hl=en-US&gl=US&ceid=US:en';
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error('news RSS HTTP ' + res.status);
  const xml = await res.text();

  const items = [...xml.matchAll(/<item>(.*?)<\/item>/gs)].map(([, it]) => {
    const tag = (name) => {
      const m = it.match(new RegExp(`<${name}[^>]*>(.*?)</${name}>`, 's'));
      return m ? m[1].trim() : '';
    };
    const rawTitle = stripTags(tag('title'));
    const source = stripTags(tag('source'));
    const sourceUrl = unescapeXml(it.match(/<source[^>]*\burl=["']([^"']+)["']/i)?.[1] || '');
    // Google News titles end in " - Source"; trim it when it matches the source tag
    const title = source && rawTitle.endsWith(' - ' + source)
      ? rawTitle.slice(0, -(' - ' + source).length)
      : rawTitle;
    return {
      title,
      link: unescapeXml(tag('link')),
      source: source || 'Google News',
      sourceUrl,
      iso: new Date(tag('pubDate')).toISOString(),
      lede: stripTags(tag('description')).slice(0, 220),
    };
  });

  // pirate-stream spam that games Google News: "LIVE@STREAMs FREE", fullwidth-unicode titles, etc.
  const JUNK = /live\s*[-@ .]*stream|live.{0,16}\bfree\b|\bfree.{0,16}live|stream.{0,12}free|free.{0,12}stream|watch\s+online|\[\[|\]\]|[！-～]|@s\b/i;

  // newest first, drop spam and dupes by title, keep 8, decorate for the card layout
  const seen = new Set();
  const news = items
    .sort((a, b) => (a.iso < b.iso ? 1 : -1))
    .filter((n) => n.title && !JUNK.test(n.title) && !JUNK.test(n.source) && !seen.has(n.title) && seen.add(n.title))
    .slice(0, 8)
    .map((n, i) => ({
      cat: n.source.toUpperCase(),
      title: n.title,
      iso: n.iso,
      link: n.link,
      lede: n.lede && n.lede !== n.title ? n.lede : '',
      sourceUrl: n.sourceUrl,
      emoji: NEWS_EMOJI[i % NEWS_EMOJI.length],
      bg: NEWS_BG[i % NEWS_BG.length],
    }));

  if (!news.length) throw new Error('news RSS parsed to zero items');
  const enriched = await enrichNewsArticles(news);
  await writeFile(join(OUT, 'news.json'), JSON.stringify({ updated: new Date().toISOString(), news: enriched }, null, 1));
  log(`news.json written (${enriched.length} headlines, ${enriched.filter((item) => item.image).length} images, latest: "${enriched[0].title}")`);
}

/* ---------------- stats: ESPN season leaders (true leaderboards) ---------------- */
const ESPN_LEADERS = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/seasons/2026/types/1/leaders';
const WANT = { assists: 'assists', yellowCards: 'yellow', redCards: 'red' };
const NAME_CACHE = join(OUT, 'espn-names.json'); // $ref URL → display name (players & teams)

async function derefNames(refs, cache) {
  const missing = [...new Set(refs)].filter((r) => !(r in cache));
  const CHUNK = 8;
  for (let i = 0; i < missing.length; i += CHUNK) {
    await Promise.all(missing.slice(i, i + CHUNK).map(async (r) => {
      try {
        const res = await fetch(r, { headers: UA });
        const j = res.ok ? await res.json() : null;
        cache[r] = (j && (j.displayName || j.name)) || null;
      } catch { cache[r] = null; }
    }));
  }
  return missing.length;
}

async function updateStats() {
  const res = await fetch(ESPN_LEADERS, { headers: UA });
  if (!res.ok) throw new Error('ESPN leaders HTTP ' + res.status);
  const data = await res.json();
  const cats = {};
  (data.categories || []).forEach((c) => { cats[c.name] = c; });

  let cache = {};
  try { cache = JSON.parse(await readFile(NAME_CACHE, 'utf8')); } catch { /* first run */ }

  const picked = {}, refs = [];
  for (const [espnKey, tab] of Object.entries(WANT)) {
    const rows = ((cats[espnKey] || {}).leaders || []).filter((l) => l.value > 0).slice(0, 14);
    picked[tab] = rows;
    rows.forEach((l) => { refs.push(l.athlete.$ref, l.team.$ref); });
  }
  const fetched = await derefNames(refs, cache);
  await writeFile(NAME_CACHE, JSON.stringify(cache));

  const tabs = {};
  for (const [tab, rows] of Object.entries(picked)) {
    const list = rows
      .map((l) => ({ name: cache[l.athlete.$ref], team: cache[l.team.$ref], val: Math.round(l.value) }))
      .filter((r) => r.name && r.team);
    if (list.length) tabs[tab] = list;
  }

  await writeFile(join(OUT, 'stats.json'), JSON.stringify({
    updated: new Date().toISOString(), source: 'ESPN', tabs,
  }, null, 1));
  const summary = Object.entries(tabs).map(([k, v]) => `${k}: ${v.length} (top ${v[0].name} — ${v[0].val})`).join(' | ');
  log(`stats.json written via ESPN (${fetched} new name lookups) — ${summary}`);
}

/* ---------------- highlights: FIFA's official YouTube playlist ---------------- */
const FIFA_YOUTUBE_PLAYLIST_ID = 'PLBRLtDhTHh5o';
const FIFA_YOUTUBE_PLAYLIST = `https://www.youtube.com/playlist?list=${FIFA_YOUTUBE_PLAYLIST_ID}`;
const COMMUNITY_CHANNEL = 'https://www.youtube.com/@Raoulkarismo';
const TEAM_ALIASES = {
  'Cabo Verde': 'Cape Verde', "Côte d'Ivoire": 'Ivory Coast', 'Cote d’Ivoire': 'Ivory Coast',
  'Cote d\'Ivoire': 'Ivory Coast', 'Korea Republic': 'South Korea', 'United States': 'USA',
  'Türkiye': 'Turkey', 'IR Iran': 'Iran', 'Norvège': 'Norway',
};
const normalizeTeam = (name, known = []) => {
  const raw = name.trim();
  const alias = Object.entries(TEAM_ALIASES).find(([candidate]) => fold(candidate) === fold(raw));
  const normalized = alias ? alias[1] : raw;
  return known.find((candidate) => {
    const expected = fold(candidate), actual = fold(normalized);
    return actual === expected || actual.startsWith(`${expected} `);
  }) || normalized;
};

async function updateHighlights() {
  const page = await fetch(FIFA_YOUTUBE_PLAYLIST, { headers: UA });
  if (!page.ok) throw new Error(`FIFA YouTube playlist HTTP ${page.status}`);
  const html = await page.text();
  const ids = [...new Set([...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))];
  if (!ids.length) throw new Error('FIFA YouTube playlist contained no video IDs');
  const matches = {};
  const CHUNK = 8;
  for (let i = 0; i < ids.length; i += CHUNK) {
    await Promise.all(ids.slice(i, i + CHUNK).map(async (youtubeId) => {
      try {
        const oembed = new URL('https://www.youtube.com/oembed');
        oembed.searchParams.set('url', `https://www.youtube.com/watch?v=${youtubeId}`);
        oembed.searchParams.set('format', 'json');
        const res = await fetch(oembed, { headers: UA });
        const item = res.ok ? await res.json() : null;
        if (!item || item.author_name !== 'FIFA' || !/^Highlights\s*\|/i.test(item.title)) return;
        const clean = item.title.replace(/^Highlights\s*\|\s*/i, '').replace(/\s*\|\s*FIFA World Cup 2026.*$/i, '').trim();
        const pair = clean.match(/^(.+?)\s+(?:\(\d+\))?\d+\s*[-–]\s*\d+(?:\(\d+\))?\s+(.+)$/);
        if (!pair) return;
        const home = normalizeTeam(pair[1]), away = normalizeTeam(pair[2]);
        matches[[home, away].sort().join('|')] = {
          title: item.title,
          youtubeId,
          youtubeUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
        };
      } catch { /* a single unavailable regional video must not abort the refresh */ }
    }));
  }
  if (!Object.keys(matches).length) throw new Error('FIFA YouTube metadata contained no recognizable match highlights');
  // The official FIFA uploads can prohibit third-party embedding. Scan the
  // requested channel's latest uploads and attach only exact scoreline matches.
  try {
    const channel = await fetch(`${COMMUNITY_CHANNEL}/videos`, { headers: UA });
    const channelHtml = channel.ok ? await channel.text() : '';
    const channelIds = [...new Set([...channelHtml.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))].slice(0, 40);
    const knownTeams = [...new Set(Object.keys(matches).flatMap((key) => key.split('|')))];
    for (let i = 0; i < channelIds.length; i += CHUNK) {
      await Promise.all(channelIds.slice(i, i + CHUNK).map(async (embedYoutubeId) => {
        try {
          const embedYoutubeUrl = `https://www.youtube.com/watch?v=${embedYoutubeId}`;
          const oembed = new URL('https://www.youtube.com/oembed');
          oembed.searchParams.set('url', embedYoutubeUrl);
          oembed.searchParams.set('format', 'json');
          const response = await fetch(oembed, { headers: UA });
          const item = response.ok ? await response.json() : null;
          if (!item || item.type !== 'video' || !fold(item.author_url || '').includes('raoulkarismo')) return;
          const heading = item.title.split('|')[0].trim();
          const pair = heading.match(/^(.+?)\s+\d+(?:\s*\(\d+\))?\s*[-–]\s*\d+(?:\s*\(\d+\))?\s+(.+)$/);
          if (!pair) return;
          const home = normalizeTeam(pair[1], knownTeams), away = normalizeTeam(pair[2], knownTeams);
          const key = [home, away].sort().join('|');
          if (!matches[key]) return;
          Object.assign(matches[key], {
            embedYoutubeId,
            embedTitle: item.title,
            embedYoutubeUrl,
            embedChannel: item.author_name.trim(),
            embedChannelUrl: item.author_url,
          });
        } catch { /* a removed upload falls back to the verified FIFA link */ }
      }));
    }
  } catch { /* leave official watch buttons available if channel scan fails */ }
  await writeFile(join(OUT, 'highlights.json'), JSON.stringify({
    updated: new Date().toISOString(), source: 'FIFA YouTube', sourceUrl: FIFA_YOUTUBE_PLAYLIST, matches,
  }, null, 1));
  log(`highlights.json written (${Object.keys(matches).length} match-specific FIFA videos)`);
}

/* ---------------- key-player photography: Wikipedia page images ---------------- */
const fold = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

async function findFifaPlayerVideo(name) {
  const search = `https://www.youtube.com/@fifa/search?query=${encodeURIComponent(name)}`;
  const page = await fetch(search, { headers: UA });
  if (!page.ok) return null;
  const html = await page.text();
  const ids = [...new Set([...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))].slice(0, 8);
  for (const youtubeId of ids) {
    try {
      const oembed = new URL('https://www.youtube.com/oembed');
      oembed.searchParams.set('url', `https://www.youtube.com/watch?v=${youtubeId}`);
      oembed.searchParams.set('format', 'json');
      const res = await fetch(oembed, { headers: UA });
      const item = res.ok ? await res.json() : null;
      const exactPlayer = matchesPlayerVideo({ name, title:item?.title, authorName:item?.author_name });
      const embed = exactPlayer ? await fetch(`https://www.youtube.com/embed/${youtubeId}`, { headers: UA }) : null;
      const embedHtml = embed?.ok ? await embed.text() : '';
      const embedAllowed = embed?.ok && !/"playabilityStatus"\s*:\s*\{\s*"status"\s*:\s*"(?:ERROR|UNPLAYABLE|LOGIN_REQUIRED)"/i.test(embedHtml);
      if (item && item.author_name === 'FIFA' && exactPlayer && embedAllowed) return {
        videoTitle: item.title,
        youtubeId,
        youtubeUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
        videoChannel: 'FIFA',
        videoVerified: true,
        videoCheckedAt: new Date().toISOString(),
        videoVerifierVersion: 2,
      };
    } catch { /* try the next official result */ }
  }
  return null;
}

async function updatePlayerImages() {
  const dataSource = await readFile(join(ROOT, 'js/data.js'), 'utf8');
  const stars = [...dataSource.matchAll(/:\s*T\('[^']*',\s*'[^']*',\s*\d+,\s*'[^']*',\s*\d+,\s*'[^']*',\s*'([^']+)'/g)]
    .map((m) => m[1]);
  let previous = { players: {} };
  try { previous = JSON.parse(await readFile(join(OUT, 'player-images.json'), 'utf8')); } catch { /* first run */ }
  const players = { ...(previous.players || {}) };
  for (const name of [...new Set(stars)]) {
    if (!players[name]) players[name] = {};
    players[name] = {
      ...players[name],
      playerId: players[name].playerId || fold(name).replace(/[^a-z0-9]+/g, '-'),
      portraitSource: players[name].portraitSource || (players[name].attribution?.includes('Wikimedia') ? 'Wikimedia' : null),
      portraitType: players[name].portraitType || (players[name].portraitCurated ? 'official-portrait' : 'editorial'),
      focalPoint: players[name].focalPoint || '50% 20%',
      portraitCheckedAt: players[name].portraitCheckedAt || previous.refreshed || previous.updated || null,
    };
  }
  const refreshDue = !previous.refreshed || Date.now() - Date.parse(previous.refreshed) > 7 * 864e5;
  // A player entry may contain a video but no photograph. Treat that as
  // unresolved media instead of incorrectly skipping it for a week.
  const missing = [...new Set(stars)].filter((name) => refreshDue || !players[name]?.url || players[name]?.videoVerifierVersion !== 2);
  // Wikimedia rate-limits bursty CI clients. Smaller batches make it much more
  // likely that a single deployment fills every missing player photo.
  const CHUNK = 3;
  for (let i = 0; i < missing.length; i += CHUNK) {
    await Promise.all(missing.slice(i, i + CHUNK).map(async (name) => {
      try {
        if (!players[name]?.url || (refreshDue && !players[name]?.portraitCurated)) {
          const api = new URL('https://en.wikipedia.org/w/api.php');
          api.searchParams.set('action', 'query');
          api.searchParams.set('generator', 'search');
          api.searchParams.set('gsrsearch', `${name} footballer`);
          api.searchParams.set('gsrlimit', '1');
          api.searchParams.set('prop', 'pageimages');
          api.searchParams.set('piprop', 'thumbnail');
          api.searchParams.set('pithumbsize', '1400');
          api.searchParams.set('format', 'json');
          api.searchParams.set('origin', '*');
          const json = await fetchJsonWithRetry(api);
          const page = json && json.query && Object.values(json.query.pages || {})[0];
          if (page && page.thumbnail && page.thumbnail.source && !players[name]?.portraitCurated) players[name] = { ...players[name],
            url: page.thumbnail.source, page: `https://en.wikipedia.org/?curid=${page.pageid}`,
            attribution: 'Wikipedia / Wikimedia Commons', portraitSource: 'Wikimedia',
            portraitType: 'editorial', portraitCheckedAt: new Date().toISOString(),
          };
          if (!players[name]?.url) {
            const commons = new URL('https://commons.wikimedia.org/w/api.php');
            commons.searchParams.set('action', 'query'); commons.searchParams.set('generator', 'search');
            commons.searchParams.set('gsrsearch', `${name} footballer`); commons.searchParams.set('gsrnamespace', '6');
            commons.searchParams.set('gsrlimit', '1'); commons.searchParams.set('prop', 'imageinfo|info');
            commons.searchParams.set('iiprop', 'url'); commons.searchParams.set('iiurlwidth', '1400');
            commons.searchParams.set('inprop', 'url'); commons.searchParams.set('format', 'json'); commons.searchParams.set('origin', '*');
            const cj = await fetchJsonWithRetry(commons);
            const cp = cj && cj.query && Object.values(cj.query.pages || {})[0];
            const image = cp && cp.imageinfo && cp.imageinfo[0];
            if (image && (image.thumburl || image.url) && !players[name]?.portraitCurated) players[name] = { ...players[name],
              url: image.thumburl || image.url, page: cp.fullurl || `https://commons.wikimedia.org/?curid=${cp.pageid}`,
              attribution: 'Wikimedia Commons', portraitSource: 'Wikimedia', portraitType: 'editorial', portraitCheckedAt: new Date().toISOString(),
            };
          }
        }
        const video = await findFifaPlayerVideo(name);
        players[name] = {
          ...players[name],
          videoCheckedAt: new Date().toISOString(),
          ...(video || { videoVerified: false, videoVerifierVersion: 2 }),
        };
      } catch { /* preserve the visual fallback for this player */ }
    }));
  }
  await writeFile(join(OUT, 'player-images.json'), JSON.stringify({
    updated: new Date().toISOString(), refreshed: refreshDue ? new Date().toISOString() : previous.refreshed, source: 'Wikipedia / Wikimedia Commons', players,
  }, null, 1));
  const photos = Object.values(players).filter((player) => player.url).length;
  const videos = Object.values(players).filter((player) => player.youtubeId).length;
  log(`player-images.json written (${photos}/${stars.length} key-player photos; ${videos} FIFA videos)`);
}

/* ---------------- FIFA post-match reports: selected facts only ---------------- */
const FIFA_REPORT_HUB = 'https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub.php';

/* Team sheets from FIFA's live API for matches whose official PDF does not
   exist yet — announced XIs appear here about an hour before kick-off. The
   post-match PDF remains the source of record and replaces these entries. */
async function updateLiveLineups(matches) {
  const { from, to } = liveLineupWindow();
  const { competition, season } = WORLD_CUP_2026;
  const calendar = await fetchJsonWithRetry(
    `${FIFA_LIVE_API}/calendar/matches?idCompetition=${competition}&idSeason=${season}&from=${from}&to=${to}&language=en&count=20`,
  );
  let written = 0;
  for (const fixture of calendar?.Results || []) {
    const matchNumber = Number(fixture.MatchNumber);
    if (!matchNumber || !fixture.IdStage || !fixture.IdMatch) continue;
    if (matches[matchNumber]?.lineups) continue; // XI is fixed once announced; PDF entries stay authoritative
    const live = await fetchJsonWithRetry(
      `${FIFA_LIVE_API}/live/football/${competition}/${season}/${fixture.IdStage}/${fixture.IdMatch}?language=en`,
    );
    const parsed = parseLiveLineups(live);
    if (!parsed || parsed.matchNumber !== matchNumber) continue;
    const old = matches[matchNumber] || {};
    matches[matchNumber] = {
      ...old, ...parsed,
      formations: parsed.formations || old.formations || null,
      updatedAt: new Date().toISOString(),
    };
    written++;
  }
  return written;
}

async function updateMatchReports() {
  let previous = { matches: {} };
  try { previous = JSON.parse(await readFile(join(OUT, 'match-reports.json'), 'utf8')); } catch { /* first run */ }
  const matches = { ...(previous.matches || {}) };
  const hub = await fetch(FIFA_REPORT_HUB, { headers: UA });
  if (!hub.ok) throw new Error(`FIFA report hub HTTP ${hub.status}`);
  const hubHtml = await hub.text();
  const hubPages = [FIFA_REPORT_HUB];
  for (const item of hubHtml.matchAll(/href=["']([^"']*match-report-hub[^"']*)["']/gi)) {
    const url = new URL(item[1], FIFA_REPORT_HUB).href;
    if (!hubPages.includes(url)) hubPages.push(url);
  }
  const reportLinks = [];
  for (const url of hubPages.slice(0, 4)) {
    const response = url === FIFA_REPORT_HUB ? null : await fetch(url, { headers: UA });
    const html = url === FIFA_REPORT_HUB ? hubHtml : response?.ok ? await response.text() : '';
    reportLinks.push(...discoverReportLinks(html, url));
  }
  const unique = [...new Map(reportLinks.map((item) => [item.matchNumber, item])).values()];
  if (!unique.length) throw new Error('FIFA report hub contained no report links');

  for (const item of unique) {
    const old = matches[item.matchNumber];
    if (old?.reportUrl === item.reportUrl && old?.teamStats && old?.parserVersion === 4) continue;
    try {
      const response = await fetch(item.reportUrl, { headers: UA });
      if (!response.ok) throw new Error(`report HTTP ${response.status}`);
      const text = await extractPdfText(await response.arrayBuffer());
      const parsed = parseReportText(text, item.reportUrl);
      if (!parsed || parsed.matchNumber !== item.matchNumber) throw new Error('report identity did not validate');
      matches[item.matchNumber] = {
        ...parsed,
        // The official PDF wins, but a live-feed team sheet outlives a PDF
        // whose lineup table failed to extract.
        lineups: parsed.lineups || old?.lineups || null,
        formations: parsed.formations || old?.formations || null,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      matches[item.matchNumber] = {
        ...(old || {}), matchNumber: item.matchNumber, reportUrl: item.reportUrl,
        source: 'FIFA Training Centre', parseError: error.message,
      };
    }
  }
  let liveSheets = 0;
  try { liveSheets = await updateLiveLineups(matches); }
  catch (error) { log('live lineup refresh skipped:', error.message); }
  await writeFile(join(OUT, 'match-reports.json'), JSON.stringify({
    updated: new Date().toISOString(), source: 'FIFA Training Centre', sourceUrl: FIFA_REPORT_HUB, matches,
  }, null, 1));
  log(`match-reports.json written (${Object.keys(matches).length} official reports, ${liveSheets} live team sheets added)`);
}

/* A fast refresh for schedulers polling around kick-off: two or three FIFA
   API calls, no PDF hub crawl, and no write when nothing new appeared. */
async function updateLineupsOnly() {
  let previous = { matches: {} };
  try { previous = JSON.parse(await readFile(join(OUT, 'match-reports.json'), 'utf8')); } catch { /* first run */ }
  const matches = { ...(previous.matches || {}) };
  const liveSheets = await updateLiveLineups(matches);
  if (!liveSheets) { log('lineups: no newly announced team sheets'); return; }
  await writeFile(join(OUT, 'match-reports.json'), JSON.stringify({
    ...previous, updated: new Date().toISOString(), matches,
  }, null, 1));
  log(`match-reports.json written (${liveSheets} live team sheets added)`);
}

/* ---------------- venue photography: Wikimedia Commons ---------------- */
const WORLD_CUP_STADIUMS = {
  'Boston (Foxborough)': 'Gillette Stadium',
  'Dallas (Arlington)': 'AT&T Stadium',
  Atlanta: 'Mercedes-Benz Stadium',
  'New York (East Rutherford)': 'MetLife Stadium',
  'Los Angeles (Inglewood)': 'SoFi Stadium',
  Miami: 'Hard Rock Stadium',
  'Kansas City': 'Arrowhead Stadium',
  Houston: 'NRG Stadium',
  Philadelphia: 'Lincoln Financial Field',
  Seattle: 'Lumen Field',
  'San Francisco (Santa Clara)': "Levi's Stadium",
  Toronto: 'BMO Field',
  Vancouver: 'BC Place',
  'Mexico City': 'Estadio Azteca',
  Guadalajara: 'Estadio Akron',
  Monterrey: 'Estadio BBVA',
};

async function updateStadiumImages() {
  let previous = { stadiums: {} };
  try { previous = JSON.parse(await readFile(join(OUT, 'stadium-images.json'), 'utf8')); } catch { /* first run */ }
  const stadiums = { ...(previous.stadiums || {}) };
  const refreshDue = !previous.refreshed || Date.now() - Date.parse(previous.refreshed) > 7 * 864e5;
  const missing = Object.entries(WORLD_CUP_STADIUMS).filter(([ground]) => refreshDue || !stadiums[ground]);

  // Resolve all exact venue pages in one request to stay comfortably below
  // MediaWiki's API rate limits during scheduled refreshes.
  try {
    const wiki = new URL('https://en.wikipedia.org/w/api.php');
    wiki.searchParams.set('action', 'query');
    wiki.searchParams.set('titles', missing.map(([, venue]) => venue).join('|'));
    wiki.searchParams.set('prop', 'pageimages|info');
    wiki.searchParams.set('piprop', 'thumbnail');
    wiki.searchParams.set('pithumbsize', '2200');
    wiki.searchParams.set('inprop', 'url');
    wiki.searchParams.set('redirects', '1');
    wiki.searchParams.set('format', 'json');
    wiki.searchParams.set('origin', '*');
    const wr = await fetch(wiki, { headers: UA });
    const wj = wr.ok ? await wr.json() : null;
    const pages = Object.values((wj && wj.query && wj.query.pages) || {});
    for (const [ground, venue] of missing) {
      const page = pages.find((candidate) => fold(candidate.title || '') === fold(venue));
      if (page && page.thumbnail && page.thumbnail.source) stadiums[ground] = {
        name: venue,
        url: page.thumbnail.source,
        page: page.fullurl || `https://en.wikipedia.org/?curid=${page.pageid}`,
        attribution: 'Wikipedia / Wikimedia Commons',
      };
    }
  } catch { /* unresolved venues continue through the Commons fallback */ }

  // Some venue articles redirect to a title that does not exactly equal our
  // display name, so the batched exact-title pass above cannot associate them.
  // Resolve those one by one through Wikipedia search before trying Commons.
  let unresolved = missing.filter(([ground]) => !stadiums[ground]);
  for (const [ground, venue] of unresolved) {
    try {
      const wiki = new URL('https://en.wikipedia.org/w/api.php');
      wiki.searchParams.set('action', 'query');
      wiki.searchParams.set('generator', 'search');
      wiki.searchParams.set('gsrsearch', `${venue} stadium`);
      wiki.searchParams.set('gsrlimit', '1');
      wiki.searchParams.set('prop', 'pageimages|info');
      wiki.searchParams.set('piprop', 'thumbnail');
      wiki.searchParams.set('pithumbsize', '2200');
      wiki.searchParams.set('inprop', 'url');
      wiki.searchParams.set('format', 'json');
      wiki.searchParams.set('origin', '*');
      const json = await fetchJsonWithRetry(wiki);
      const page = json && json.query && Object.values(json.query.pages || {})[0];
      if (page?.thumbnail?.source) stadiums[ground] = {
        name: venue,
        url: page.thumbnail.source,
        page: page.fullurl || `https://en.wikipedia.org/?curid=${page.pageid}`,
        attribution: 'Wikipedia / Wikimedia Commons',
      };
    } catch { /* continue to Commons */ }
  }

  unresolved = missing.filter(([ground]) => !stadiums[ground]);
  const CHUNK = 2;
  for (let i = 0; i < unresolved.length; i += CHUNK) {
    await Promise.all(unresolved.slice(i, i + CHUNK).map(async ([ground, venue]) => {
      try {
        const api = new URL('https://commons.wikimedia.org/w/api.php');
        api.searchParams.set('action', 'query');
        api.searchParams.set('generator', 'search');
        api.searchParams.set('gsrsearch', `${venue} stadium`);
        api.searchParams.set('gsrnamespace', '6');
        api.searchParams.set('gsrlimit', '1');
        api.searchParams.set('prop', 'imageinfo|info');
        api.searchParams.set('iiprop', 'url|extmetadata');
        api.searchParams.set('iiurlwidth', '2200');
        api.searchParams.set('inprop', 'url');
        api.searchParams.set('format', 'json');
        api.searchParams.set('origin', '*');
        const json = await fetchJsonWithRetry(api);
        const page = json && json.query && Object.values(json.query.pages || {})[0];
        const image = page && page.imageinfo && page.imageinfo[0];
        if (!image || !(image.thumburl || image.url)) return;
        const artist = image.extmetadata && image.extmetadata.Artist && stripTags(image.extmetadata.Artist.value);
        stadiums[ground] = {
          name: venue,
          url: image.thumburl || image.url,
          page: page.fullurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
          attribution: `Wikimedia Commons${artist ? ` · ${artist}` : ''}`,
        };
      } catch { /* retain the generated fallback for this venue */ }
    }));
  }
  await writeFile(join(OUT, 'stadium-images.json'), JSON.stringify({
    updated: new Date().toISOString(), refreshed: refreshDue ? new Date().toISOString() : previous.refreshed, source: 'Wikipedia / Wikimedia Commons', stadiums,
  }, null, 1));
  log(`stadium-images.json written (${Object.keys(stadiums).length}/${Object.keys(WORLD_CUP_STADIUMS).length} venues resolved)`);
}

/* ---------------- run ---------------- */
await mkdir(OUT, { recursive: true });
let failures = 0;
const highlightsOnly = process.argv.includes('--highlights-only');
const reportsOnly = process.argv.includes('--reports-only');
const playersOnly = process.argv.includes('--players-only');
const lineupsOnly = process.argv.includes('--lineups-only');
const newsOnly = process.argv.includes('--news-only');

if (newsOnly) {
  try { await updateNews(); }
  catch (err) { failures++; console.error('news update failed:', err.message); }
  process.exit(failures ? 1 : 0);
}

if (lineupsOnly) {
  try { await updateLineupsOnly(); }
  catch (err) { failures++; console.error('live lineup update failed:', err.message); }
  process.exit(failures ? 1 : 0);
}

if (reportsOnly) {
  try { await updateMatchReports(); }
  catch (err) { failures++; console.error('match report update failed:', err.message); }
}

if (playersOnly) {
  try { await updatePlayerImages(); }
  catch (err) { failures++; console.error('player image update failed:', err.message); }
}

if (!reportsOnly && !playersOnly && !highlightsOnly) {
  try { await updateNews(); }
  catch (err) { failures++; console.error('news update failed:', err.message); }

  try { await updateStats(); }
  catch (err) { failures++; console.error('stats update failed:', err.message); }
}

if (!reportsOnly && !playersOnly) try { await updateHighlights(); }
catch (err) { failures++; console.error('highlights update failed:', err.message); }

if (!reportsOnly && !playersOnly && !highlightsOnly) {
  try { await updatePlayerImages(); }
  catch (err) { failures++; console.error('player image update failed:', err.message); }

  try { await updateStadiumImages(); }
  catch (err) { failures++; console.error('stadium image update failed:', err.message); }

  try { await updateMatchReports(); }
  catch (err) { failures++; console.error('match report update failed:', err.message); }
}

// During a deployment, publish every successful refresh and retain the
// last-known-good JSON for a source that is temporarily unavailable. Scheduled
// refreshes still return non-zero so GitHub Actions visibly reports the fault.
if (deployRefresh && failures) log(`${failures} source refresh(es) failed; deploying preserved last-known-good data for those sources`);
process.exit(failures && !deployRefresh ? 1 : 0);
