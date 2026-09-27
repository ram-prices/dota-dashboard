# Dota Stats Dashboard

A personal, Dotabuff/OpenDota-style stats dashboard for your own Dota 2
matches — plus a few views neither of those sites gives you out of the box
(custom trend charts, a searchable chat log, filtered match views).

**No server, no database, no Docker.** It's a single static web page that
reads your match data from this repo's own `data` branch. That branch is
filled by GitHub Actions workflows that copy what the free
[OpenDota API](https://docs.opendota.com/) has parsed for your matches, so
there's no replay downloading or parsing to build or run yourself.

## How it works

```
 api.opendota.com ──▶ GitHub Actions workflows ──▶ data branch ──▶ your browser
                                                                    (cached in localStorage)
```

- **The site only reads from the `data` branch.** Match list, match
  details, profile, hero stats and teammate stats all come from files the
  workflows keep there (see **Owning your match data** below). Hero and
  teammate stats are computed in the browser from those files.
- **OpenDota is only contacted when you ask:** the **Sync games** button
  (pulls your newest matches into this browser right away), **Fetch from
  OpenDota** / **Request parse** on a match that isn't stored yet, and
  checking a new account in Settings. Nothing silently falls back to it,
  so the site keeps working when OpenDota is down or rate-limiting.
- New games show up on their own within about 20 minutes, once
  `request-parse.yml` has saved them (see below).
- Parsed matches never change, so they're cached in `localStorage`
  forever; everything else (indexes, profile) refreshes every 5 minutes.

Because there's no backend, "running" this just means opening the page —
locally with `npm run dev`, or as an actual deployed website (see
**Deploying** below) you can check from your phone.

## 1. Find your account

You need your **SteamID64** (or a Steam profile URL, or the shorter
`account_id` — the app accepts any of the three). Go to
<https://steamid.io/>, paste your Steam profile URL, and copy the
**steamID64** value.

Also make sure **"Expose Public Match Data"** is on in the Dota 2 client
(Settings → Options → Advanced) — without it, the API can't see your match
history.

## 2. Run it locally

You need [Node.js](https://nodejs.org/) 22+ installed.

```bash
npm install
npm run dev
```

Open the URL it prints (usually <http://localhost:5173>). On first load
it'll send you to **Settings** to enter your account — after that it
remembers you in this browser.

## What you get

- **Matches** — your recent games: hero, K/D/A, GPM/XPM, result, mode.
- **Match detail** — full 10-player scoreboard, item builds, skill build
  order, a gold-advantage and XP-advantage graph over the game, an item
  purchase timeline, kill feed, ward placements, and a searchable **chat
  log**.
- **Trends** — win rate by week over your recent matches, plus a
  hero/result filter over that same match set.
- **Heroes** — your per-hero games/win-rate, plus win rate with/against
  each hero.
- **Teammates** — win rate with and against people you've played with at
  least twice (players with private profiles can't be included).
- **Chat search** — full-text search across the chat logs of every match
  you've opened in this browser (search widens as you browse more
  matches).
- A **"Show raw OpenDota match data"** toggle on every match page, so
  nothing OpenDota returns is ever hidden even if the dashboard doesn't
  have a dedicated view for it yet.

## If a match isn't stored yet, or hasn't been parsed

A match that isn't in the `data` branch yet (usually one you finished in
the last 20 minutes) shows a **Fetch from OpenDota** button — that pulls it
live into this browser only. `request-parse.yml` saves it to the repo for
every device shortly after.

### "Hasn't been parsed yet"

OpenDota parses replays either automatically (for tracked/high-MMR
players) or on request. If a recent match of yours shows up with only
basic stats, click **Request parse** on that match page — it asks OpenDota
to fetch and parse the replay from Valve, which takes anywhere from a few
seconds to a couple minutes.

**This only works while Valve still hosts the replay** — roughly 8-14 days
after the match ends. After that window, a match can only ever show deep
stats if someone (you, or OpenDota itself) already requested the parse
while the replay was still available. There's no way to backfill parsing
for an old, never-parsed match — that data is gone for good on Valve's
end.

## Auto-requesting parses (optional)

`.github/workflows/request-parse.yml` runs on a schedule (every 20 minutes)
and asks OpenDota to parse a tracked account's newest match(es) — so new
games show up with full in-depth data without you ever clicking "Request
parse" by hand. It also saves each new game's full JSON to the `data`
branch (re-fetching it while it's still unparsed, for up to 6 hours after
the game), updates the indexes the site reads, and refreshes
`profile.json` whenever it saves a new game. It's hardcoded to account_id `90031862` by default; edit
the `default:` values in that file to point at a different account.

It's cost-aware: it tracks the highest match_id it's already handled in
`.github/request-parse-state.json`, and only spends a `/request` call on
a match newer than that. A quiet run (you haven't played since the last
check) costs exactly one list call, not a re-request of the same matches
every 20 minutes forever — relevant if you're using a paid API key (see
**Rate limits**), since blindly re-requesting on every tick would otherwise
cost the same whether or not anything actually happened.

Trigger it manually (Actions tab → "Request OpenDota parses" → Run
workflow) with `force_recheck` on to re-check the last `limit` matches
regardless of state — handy once, right after setting this up.

Two things worth knowing:
- It only requests a parse — it can't make Valve provide a replay that's
  already expired (~8-14 days post-match). Very old, never-parsed matches
  are gone for good regardless of how often this runs.
- GitHub automatically disables scheduled workflows after 60 days with no
  repo activity. For an actively-used personal project that's unlikely to
  matter, but if matches stop getting auto-parsed after a long break, check
  the Actions tab and re-enable it.

## Owning your match data

`.github/workflows/export-matches.yml` copies whatever OpenDota currently
has for each of an account's matches into this repo's `data` branch — one
minified JSON file per match, plus the indexes and `profile.json` the site
reads (see that branch's own README for the exact layout). Run it by hand
once for your full history; after that `request-parse.yml` keeps new games
coming in on its own.

Why this exists: it's a permanent copy independent of OpenDota's future
availability, rate limits, or API changes — and unlike the `localStorage`
cache, it's shared across every device/browser, not just the one that
happened to view a match first.

This only exports data OpenDota *already has* — it doesn't request new
parses (that's `request-parse.yml`, above) and can't recover a match
nobody ever parsed while its replay was still available. At large match
counts (thousands+), one run won't cover everything under OpenDota's free
rate limit; it skips matches already exported, so it's safe to just
re-run it (Actions tab → "Export OpenDota match JSON to the data branch" →
Run workflow) on subsequent days until the step summary says everything's
exported.

## Rate limits

The site itself only calls OpenDota when you click Sync games, Fetch from
OpenDota or Request parse, so the free (anonymous) tier is plenty. If you
ever hit limits there, paste a key into Settings (or set
`VITE_OPENDOTA_API_KEY`, see **Deploying**) — OpenDota's keys are a
paid, metered tier (roughly $0.01 per 100 calls at the time of writing;
check <https://www.opendota.com/api-keys> for current pricing), not a free
upgrade.

`export-matches.yml` uses a *separate* repo secret, `OPENDOTA_API_KEY`
(Settings → Secrets and variables → Actions), when it's set. Worth setting
there specifically because it makes thousands of calls in a tight loop for
a full history export, and CI runners share IP ranges with countless other
unrelated jobs — anonymous calls from Actions can get rate-limited by that
shared IP regardless of your own usage, and a metered key ties the limit
to you instead.

`request-parse.yml` deliberately does *not* use that key, even when it's
set — a quiet run makes one call, and a run after a new game only a
handful, a light enough,
steady-paced load that the free tier handles fine (a few games a day is
nowhere near any real limit), so it costs nothing. Both this and
`VITE_OPENDOTA_API_KEY` (the live site's key, if you set one) stay separate
from `OPENDOTA_API_KEY` on purpose, so nothing spends paid-tier calls
unless a workflow specifically needs to.

## Deploying (optional)

If you'd rather have a real URL than running `npm run dev` each time, this
repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`)
that publishes the built site to GitHub Pages on every push to `main`:

1. In the repo's GitHub settings: **Pages → Source → GitHub Actions**.
2. Push to `main`. Your dashboard will be live at
   `https://<you>.github.io/<repo-name>/`.

This deployment is set up for one account (`90031862`, hardcoded in
`deploy.yml`) — the live site loads straight to those stats on any device,
no Settings step needed. The Settings page still works if you ever want to
look at a different account_id in your own browser; it just won't change
what other devices/visitors see by default. To point the deployed site at
a different account permanently, change the `VITE_DEFAULT_ACCOUNT_ID` value
in `.github/workflows/deploy.yml` and push.

Note this doesn't add any real privacy: the deployed page reads a public
repo's `data` branch, holding the same public data anyone can get from
opendota.com.

## Project layout

```
src/
  opendota.ts       data layer: reads the data branch; explicit OpenDota calls
  cache.ts          localStorage caching (forever for parsed matches, 5min for the rest)
  settings.ts       account_id / API key storage + SteamID64 parsing
  dota.ts           hero/item/ability id -> name/icon lookups, formatting helpers
  data/             hero/item/ability name+image data (from odota/dotaconstants)
  pages/            one file per route (Dashboard, MatchDetail, Trends, ...)
  components/       Scoreboard, AdvantageChart (shared across pages)
```

To add your own view: add a `.tsx` file under `src/pages/`, wire it into
`src/App.tsx`'s `<Routes>`, and call the existing functions in
`src/opendota.ts`. New data should come from the `data` branch: if a view
needs something the indexes don't have, add it to a workflow (see
`.github/scripts/` for the index filters) rather than calling OpenDota
from the page.
