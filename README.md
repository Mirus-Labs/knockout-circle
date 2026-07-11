# Knockout Circle — Road to the Final

An interactive tracker for the **FIFA World Cup 2026**: 48 nations, 12 groups, one
circle. Follow the group stage, the 32-team knockout bracket, live ties, match
stats and tournament leaders — rendered from real WC2026 data.

A zero-build static site: plain HTML, CSS and vanilla ES modules, with an
optional Node data updater for news and stat overlays.

## Structure

```
index.html            # the app shell
css/style.css         # all styling
js/
  app.js              # boot + view orchestration
  data.js             # tournament data model
  feed.js / adapter.js# live WC2026 data feed → app model
  tournament.js       # group stage + knockout bracket
  live.js             # live tie state
  fx.js               # background / motion effects
data/                 # news.json, stats.json overlays (refreshed by the updater)
scripts/update-data.mjs  # pulls headlines (Google News RSS) + stat leaders (ESPN)
```

## Run locally

It's a static site — serve the folder with anything:

```bash
npx serve .        # or: python3 -m http.server
```

## Refresh data overlays

```bash
node scripts/update-data.mjs   # writes data/news.json + data/stats.json
```

## Deploy

Configured for Cloudflare Workers static assets (`wrangler.jsonc`):

```bash
npx wrangler deploy
```

---

Designed and built by [Mirus Labs](https://miruslabs.io).
