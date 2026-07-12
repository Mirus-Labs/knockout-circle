# Knockout Circle — Road to the Final

An interactive tracker for the **FIFA World Cup 2026**: 48 nations, 12 groups, one
circle. Follow the group stage, the 32-team knockout bracket, live ties, match
stats and tournament leaders — rendered from real WC2026 data.

A zero-build static site: plain HTML, CSS and vanilla ES modules, plus a Node
data updater that layers news, stats, media and official reports on top of the
live feed. Kick-off dates and times render in each **viewer's own timezone**;
the underlying schedule is stored in venue-local time and converted in the
browser.

Live scores are centralized in the Cloudflare Worker: a once-per-minute Cron
Trigger asks one Durable Object to refresh the scoreboard during match windows,
and every browser reads the shared last-known-good snapshot from `/api/live`.

## Structure

```
index.html            # the app shell (bracket, groups, live ties, leaders)
match.html            # per-match detail page (line-ups, player radar, report, media)
css/style.css         # all styling
js/
  app.js              # boot + view orchestration (home)
  data.js             # tournament data model
  feed.js / adapter.js# live WC2026 feed → app model; loads the rest once data resolves
  tournament.js       # group stage + knockout bracket
  live.js             # live tie state
  match-facts.mjs     # normalized match facts + local-time (timezone) formatting
  match-page.js       # match.html rendering
  zoom.js             # match overlay / detail zoom on the home page
  fx.js               # background / motion effects
  nav.js              # shared nav pill
data/                 # JSON overlays (see "Data sources" below)
scripts/
  update-data.mjs     # main updater: news, stats, reports, videos, player & stadium media
  match-report.mjs    # parses FIFA Training Centre post-match report PDFs
  live-lineups.mjs    # announced XIs from FIFA's live match API (pre-match & in-play)
  player-media.mjs    # matches player-specific highlight videos
  player-stats.mjs    # standalone: builds per-player FIFA-style stats → player-stats.json
worker/index.mjs      # Cloudflare Worker: /api/live, cron scoreboard refresh, static assets
```

## Data sources

Everything is real WC2026 data. Different surfaces pull from different providers:

| Surface | File / endpoint | Source |
| --- | --- | --- |
| Schedule, fixtures & final results | live feed (`js/feed.js`, worker) | [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) (penalties marked with score key `p`) |
| Live scores (in-match) | `/api/live` (worker) | [ESPN scoreboard API](https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard) |
| Tournament leaders / stat tabs | `data/stats.json` | ESPN core API (`sports.core.api.espn.com` leaders) |
| Player & team display names | `data/espn-names.json` | ESPN (name cache for the leaders feed) |
| News | `data/news.json` | Google News RSS |
| Per-player stats & radar | `data/player-stats.json` | FIFA Enhanced Football Intelligence metrics via the public [fifaphy](https://fifaphy.vercel.app) dataset — radar axes are **derived** per-90 position-cohort percentiles, not an official FIFA rating |
| Official post-match reports | `data/match-reports.json` | [FIFA Training Centre](https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub.php) match-report PDFs |
| Line-ups before & during a match | `data/match-reports.json` | FIFA live match API (`api.fifa.com/api/v3/live/football/…`) — announced XIs land ~1h before kick-off (`--lineups-only` polls just these); the Training Centre PDF replaces the entry as the source of record once published |
| Match & player highlight videos | `data/highlights.json` | FIFA's official YouTube playlist and channel, with a community-channel fallback for player clips |
| Player photography | `data/player-images.json` | Wikipedia / Wikimedia Commons |
| Stadium photography | `data/stadium-images.json` | Wikipedia / Wikimedia Commons |

## Run locally

It's a static site — serve the folder with anything:

```bash
npx serve .        # or: python3 -m http.server
```

## Refresh data overlays

```bash
node scripts/update-data.mjs   # news, stats, reports, videos, player & stadium media
node scripts/player-stats.mjs  # rebuild data/player-stats.json (run separately, as needed)
```

The GitHub Actions workflow in `.github/workflows/update-data.yml` runs the main
updater twice hourly. News and stats refresh every run; match videos and official
post-match reports are rechecked each run for in-window matches, and player/venue
photography is rechecked weekly.
When an overlay changes, the workflow commits it so a Git-connected deployment can
publish the update, and (when a Cloudflare token is configured) deploys directly.
A Wrangler custom build also runs `update-data.mjs` immediately before every
production deploy, so a manual or Git-connected redeploy cannot ship stale
checked-in overlays. `player-stats.json` is not part of that cadence — rebuild it
with `scripts/player-stats.mjs` when the roster or attributes change.

## Deploy

Configured for Cloudflare Workers static assets (`wrangler.jsonc`):

```bash
npx wrangler deploy
```

The first deployment creates the `LiveState` Durable Object and installs the
once-per-minute Cron Trigger declared in `wrangler.jsonc`. Static overlays still
use the scheduled GitHub Actions workflow; live scores do not require commits or
site redeployments.

---

Designed and built by [Mirus Labs](https://miruslabs.io).
