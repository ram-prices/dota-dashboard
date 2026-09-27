import { getApiKey } from "./settings";
import { cached, cachedForever, invalidate, invalidatePrefix, writeCached } from "./cache";
import { isRadiant } from "./dota";
import type { HeroStat, MatchDetail, MatchExtras, MatchSummary, PeerStat, PlayerProfile, WinLoss } from "./types";

const BASE = "https://api.opendota.com/api";

// Data exported to the `data` branch (see .github/workflows/export-matches.yml,
// request-parse.yml, and the data branch's own README) - a permanent copy of
// whatever OpenDota had at export/poll time, independent of OpenDota's own
// API being up, rate-limited, or otherwise flaky.
const DATA_BRANCH_ROOT = "https://raw.githubusercontent.com/ram-prices/dota-dashboard/data";
const DATA_BRANCH_MATCHES = `${DATA_BRANCH_ROOT}/matches`;
const DATA_BRANCH_INDEX = `${DATA_BRANCH_ROOT}/matches-index.json`;
const DATA_BRANCH_EXTRAS_INDEX = `${DATA_BRANCH_ROOT}/match-extras-index.json`;

// Lists change as you play, so cache them briefly rather than forever.
const LIST_TTL_MS = 5 * 60 * 1000;

function shardFor(matchId: number): string {
  return String(matchId).slice(-2);
}

async function getStoredMatch(matchId: number): Promise<MatchDetail | null> {
  try {
    const res = await fetch(`${DATA_BRANCH_MATCHES}/${shardFor(matchId)}/${matchId}.json`);
    if (!res.ok) return null; // 404 (not exported yet) or any hiccup - fall back to the live API
    return (await res.json()) as MatchDetail;
  } catch {
    return null;
  }
}

// The lightweight per-match summary list (kills/deaths/duration/hero_id/
// etc - the same shape OpenDota's own /players/{id}/matches returns, not
// the full match detail), newest first. Backs getMatches() and
// getWinLoss() below so neither needs a live OpenDota call on every page
// load - only cached briefly (not forever, like getStoredMatch) since a
// match played in the last few minutes might not be in it yet.
async function getStoredMatchIndex(): Promise<MatchSummary[] | null> {
  return cached("match-index", LIST_TTL_MS, async () => {
    try {
      const res = await fetch(DATA_BRANCH_INDEX);
      if (!res.ok) return null;
      return (await res.json()) as MatchSummary[];
    } catch {
      return null;
    }
  });
}

// Team compositions + patch per match - see match-extras-index.json's
// README entry on the data branch. Only exists for matches that were
// fully exported (all of them, as of this account's last export run);
// null when the file itself isn't available.
async function getStoredMatchExtrasIndex(): Promise<MatchExtras[] | null> {
  return cached("match-extras-index", LIST_TTL_MS, async () => {
    try {
      const res = await fetch(DATA_BRANCH_EXTRAS_INDEX);
      if (!res.ok) return null;
      return (await res.json()) as MatchExtras[];
    } catch {
      return null;
    }
  });
}

export class OpenDotaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const apiKey = getApiKey();
  if (apiKey) url.searchParams.set("api_key", apiKey);

  const res = await fetch(url);
  if (res.status === 429) {
    throw new OpenDotaError(
      "OpenDota rate limit hit (60/min or daily cap). Wait a bit, or add a free API key in Settings for a higher limit.",
      429,
    );
  }
  if (!res.ok) {
    throw new OpenDotaError(`OpenDota request failed: ${res.status} ${res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}

export function getProfile(accountId: number): Promise<PlayerProfile> {
  return cached(`profile:${accountId}`, LIST_TTL_MS, () => get<PlayerProfile>(`/players/${accountId}`));
}

// Derived from the same stored match index as getMatches() below (no
// separate call needed - win/loss is just a count over it) when available,
// falling back to OpenDota's live /wl endpoint otherwise.
export function getWinLoss(accountId: number, params: Record<string, string | number> = {}): Promise<WinLoss> {
  const key = `wl:${accountId}:${JSON.stringify(params)}`;
  return cached(key, LIST_TTL_MS, async () => {
    const index = await getStoredMatchIndex();
    if (index) {
      let win = 0;
      let lose = 0;
      for (const m of index) {
        if (isRadiant(m.player_slot) === m.radiant_win) win++;
        else lose++;
      }
      return { win, lose };
    }
    return get<WinLoss>(`/players/${accountId}/wl`, params);
  });
}

export function getMatches(
  accountId: number,
  params: Record<string, string | number> = { limit: 30 },
): Promise<MatchSummary[]> {
  const key = `matches:${accountId}:${JSON.stringify(params)}`;
  return cached(key, LIST_TTL_MS, async () => {
    const index = await getStoredMatchIndex();
    if (index) {
      const limit = Number(params.limit);
      return Number.isFinite(limit) && limit > 0 ? index.slice(0, limit) : index;
    }
    return get<MatchSummary[]>(`/players/${accountId}/matches`, params);
  });
}

// Exposes the same stored match index getMatches()/getWinLoss() use, for
// the Matches tab's client-side filtering/pagination and the Hero Overview
// widget's KDA/lane breakdown - free to call since it's the same
// cached("match-index", ...) entry, not a separate fetch. Returns null
// when the index isn't available (both callers fall back to the live API
// path instead, which doesn't expose the full history needed for these).
export function getMatchIndexForStats(): Promise<MatchSummary[] | null> {
  return getStoredMatchIndex();
}

export function getMatchExtrasIndex(): Promise<MatchExtras[] | null> {
  return getStoredMatchExtrasIndex();
}

// Pulls the account's newest matches straight from OpenDota's live API and
// merges any not already in the cached index in immediately - the manual,
// on-demand equivalent of what request-parse.yml already does automatically
// every 20 minutes, for right after a game finishes rather than waiting on
// that schedule or this list's own 5-minute cache TTL. Also fires off a
// parse request for each new match (best-effort, same as the "Request
// parse" button on a match's own page) so full details show up soon.
// Returns how many new matches were found.
export async function syncRecentMatches(accountId: number, limit = 20): Promise<number> {
  const live = await get<MatchSummary[]>(`/players/${accountId}/matches`, { limit });
  const existing = (await getStoredMatchIndex()) ?? [];
  const existingIds = new Set(existing.map((m) => m.match_id));
  const fresh = live.filter((m) => !existingIds.has(m.match_id));

  if (fresh.length > 0) {
    const merged = [...fresh, ...existing].sort((a, b) => b.match_id - a.match_id);
    writeCached("match-index", merged);
    for (const m of fresh) {
      requestParse(m.match_id).catch(() => {});
    }
  }

  // Everything else derived from the match list (win/loss, hero/peer
  // stats, the live-API fallback list) needs to be re-derived against the
  // merge above rather than serving its own still-cached copy.
  invalidatePrefix(`wl:${accountId}`);
  invalidatePrefix(`matches:${accountId}`);
  invalidate(`heroes:${accountId}`);
  invalidate(`peers:${accountId}`);

  return fresh.length;
}

export function getHeroStats(accountId: number): Promise<HeroStat[]> {
  return cached(`heroes:${accountId}`, LIST_TTL_MS, () => get<HeroStat[]>(`/players/${accountId}/heroes`));
}

export function getPeers(accountId: number): Promise<PeerStat[]> {
  return cached(`peers:${accountId}`, LIST_TTL_MS, () => get<PeerStat[]>(`/players/${accountId}/peers`));
}

// A match's parsed data never changes once OpenDota has parsed it, so this
// is cached forever (until the user explicitly clears the cache). Checks
// our own exported copy on the `data` branch first - shared across every
// device/browser, unlike the localStorage cache below - before falling
// back to OpenDota's live API for anything not exported yet.
export function getMatch(matchId: number): Promise<MatchDetail> {
  return cachedForever(`match:${matchId}`, async () => {
    const stored = await getStoredMatch(matchId);
    if (stored) return stored;
    return get<MatchDetail>(`/matches/${matchId}`);
  });
}

// Asks OpenDota to (re-)parse a match's replay. Only works while Valve
// still hosts the replay (roughly 8-14 days after the match ends).
// Returns a job id you can poll via getParseStatus.
export async function requestParse(matchId: number): Promise<number | null> {
  const url = new URL(`${BASE}/request/${matchId}`);
  const apiKey = getApiKey();
  if (apiKey) url.searchParams.set("api_key", apiKey);
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new OpenDotaError(`Parse request failed: ${res.status}`, res.status);
  const body = (await res.json()) as { job?: { jobId?: number } };
  return body.job?.jobId ?? null;
}

export async function getParseStatus(jobId: number): Promise<boolean> {
  // OpenDota returns an empty body/array once the job has finished.
  const url = new URL(`${BASE}/request/${jobId}`);
  const res = await fetch(url);
  if (!res.ok) return true;
  const body = await res.json().catch(() => null);
  const stillQueued = body && typeof body === "object" && Object.keys(body).length > 0;
  return !stillQueued;
}
