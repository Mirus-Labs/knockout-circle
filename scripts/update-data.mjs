#!/usr/bin/env node
/* Knockout Circle — data updater.
   Writes static JSON overlays the site picks up on next page load:
     data/news.json   — World Cup headlines via Google News RSS (no key needed)
     data/stats.json  — assist / yellow-card / red-card leaders via ESPN's public
                        leaders API (no key needed)

   Usage:  node scripts/update-data.mjs
   Scheduled hourly by ~/Library/LaunchAgents/com.knockoutcircle.update.plist
*/
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data');
const UA = { 'User-Agent': 'KnockoutCircle/1.0 (+static site data updater)' };

const log = (...a) => console.log(new Date().toISOString(), '-', ...a);

/* ---------------- news: Google News RSS ---------------- */
const NEWS_EMOJI = ['⚽', '🏆', '🏟️', '🔥', '🌎', '🎯', '📣', '🧤'];
const NEWS_BG = ['#1d6f42', '#3a2d6b', '#7a5b16', '#7a2424', '#1f4b7a', '#0c5c2e', '#5b2d6b', '#2f5d2a'];

const unescapeXml = (s) => s
  .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const stripTags = (s) => unescapeXml(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

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
    // Google News titles end in " - Source"; trim it when it matches the source tag
    const title = source && rawTitle.endsWith(' - ' + source)
      ? rawTitle.slice(0, -(' - ' + source).length)
      : rawTitle;
    return {
      title,
      link: unescapeXml(tag('link')),
      source: source || 'Google News',
      iso: new Date(tag('pubDate')).toISOString(),
      lede: stripTags(tag('description')).slice(0, 220),
    };
  });

  // pirate-stream spam that games Google News: "LIVE@STREAMs FREE", fullwidth-unicode titles, etc.
  const JUNK = /live\s*[-@ .]*stream|stream.{0,12}free|free.{0,12}stream|watch\s+online|\[\[|\]\]|[！-～]|@s\b/i;

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
      emoji: NEWS_EMOJI[i % NEWS_EMOJI.length],
      bg: NEWS_BG[i % NEWS_BG.length],
    }));

  if (!news.length) throw new Error('news RSS parsed to zero items');
  await writeFile(join(OUT, 'news.json'), JSON.stringify({ updated: new Date().toISOString(), news }, null, 1));
  log(`news.json written (${news.length} headlines, latest: "${news[0].title}")`);
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

/* ---------------- run ---------------- */
await mkdir(OUT, { recursive: true });
let failures = 0;

try { await updateNews(); }
catch (err) { failures++; console.error('news update failed:', err.message); }

try { await updateStats(); }
catch (err) { failures++; console.error('stats update failed:', err.message); }

process.exit(failures ? 1 : 0);
