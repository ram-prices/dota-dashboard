# Match data (this branch)

This branch is separate from `main` on purpose: `main` holds the dashboard's
app code, this branch holds the actual exported match data, so cloning the
app doesn't mean downloading thousands of match files too.

## Layout

```
matches/<last two digits of match_id>/<match_id>.json
```

Sharded by the last two digits of the match_id so no single folder ends up
with thousands of entries. Each file is the raw response from OpenDota's
`GET /matches/{match_id}` for that match, minified (not pretty-printed) to
keep size down - it's a straight snapshot of whatever OpenDota had at
export time, not a bespoke format.

Populated by `.github/workflows/export-matches.yml` on the `main` branch
(full history, run by hand), and kept current by `request-parse.yml` (saves
each new game's JSON every 20 minutes, re-fetching it while it's still
unparsed for up to 6 hours after the game). The dashboard reads everything
from this branch (via `raw.githubusercontent.com`) and never silently falls
back to OpenDota's live API - a match that isn't here yet shows as missing,
with a button to fetch it live on request.

## `matches-index.json`

The lightweight per-match summary list for the account (kills/deaths/
duration/hero_id/game_mode/etc - not the full match detail, just what
OpenDota's `GET /players/{account_id}/matches` returns), newest match
first. This is what the dashboard's Matches list, Trends and win/loss
count read instead of calling that endpoint live on every page load.

Written by `export-matches.yml` (a full refresh each run) and kept current
between those runs by `request-parse.yml` (merges in whatever its own
20-minute new-match check just fetched - no extra API call for it).

## `match-extras-index.json`

A few extra per-match fields that only exist on the full match detail (not
the lightweight summary above), pulled out into their own small index so
the dashboard doesn't need to fetch all of `matches/` just to filter by
them: `radiant`/`dire` (each side's 5 hero_ids, for the teammate/enemy hero
filters) and `patch` (OpenDota's patch index - see `src/data/patches.json`
on `main` for the id-to-version-string mapping).

Rebuilt from scratch each `export-matches.yml` run by scanning every file
already under `matches/` (cheap - local file reads, no API calls), so it
always reflects the full exported set, not just what that run fetched.

## `match-players-index.json`

Every non-anonymous player in each match, as compact
`[account_id, is_radiant (1/0), hero_id, personaname]` tuples, newest match
first. Backs the dashboard's Teammates and player-vs pages (computed from
this instead of OpenDota's `/players/{id}/peers`). Kept out of
`match-extras-index.json` because it's several times larger and only those
two pages need it.

Rebuilt from scratch by `export-matches.yml` and updated incrementally by
`request-parse.yml`, both via the same jq filter
(`.github/scripts/match-players.jq` on `main`).

## `profile.json`

The raw OpenDota `GET /players/{account_id}` response (name, avatar, rank)
for the site header. Refreshed by `export-matches.yml` each run and by
`request-parse.yml` whenever it saves a new game.
