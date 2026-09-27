import { getApiKey } from "./settings";
import { cached, peekCached, writeCached } from "./cache";
import { isRadiant } from "./dota";
import type {
  HeroStat,
  MatchDetail,
  MatchExtras,
  MatchPlayersEntry,
  MatchSummary,
  PeerStat,
  PlayerProfile,
  WinLoss,
} from "./types";

// Everything the site shows comes from this repo's `data` branch (see
// .github/workflows/export-matches.yml, request-parse.yml, and the data
// branch's own README) - a permanent copy of whatever OpenDota had at
// export/poll time. OpenDota's live API is only ever called on an explicit
// user action: Sync games, Fetch from OpenDota / Request parse on a match
// that isn't stored yet, and checking a new account in Settings. Nothing
// here silently falls back to it.
const BASE = "https://api.opendota.com/api";

const DATA_BRANCH_ROOT = "https://raw.githubusercontent.com/ram-prices/dota-dashboard/data";
const DATA_BRANCH_MATCHES = `${DATA_BRANCH_ROOT}/matches`;
const DATA_BRANCH_INDEX = `${DATA_BRANCH_ROOT}/matches-index.json`;
const DATA_BRANCH_EXTRAS_INDEX = `${DATA_BRANCH_ROOT}/match-extras-index.json`;
const DATA_BRANCH_PLAYERS_INDEX = `${DATA_BRANCH_ROOT}/match-players-index.json`;
const DATA_BRANCH_PROFILE = `${DATA_BRANCH_ROOT}/profile.json`;

// The data branch changes as you play (request-parse.yml pushes every 20
// minutes), so indexes are only cached briefly.
const LIST_TTL_MS = 5 * 60 * 1000;

export class OpenDotaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Something the site needs isn't in the data branch (yet) - as opposed to
// the data branch itself being unreachable, which is a plain Error.
export class NotInRepoError extends Error {}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function shardFor(matchId: number): string {
  return String(matchId).slice(-2);
}

// null on 404 (file not in the data branch); throws when the data branch
// couldn't be reached at all.
async function fetchRepoJson<T>(url: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Couldn't reach the data repository (raw.githubusercontent.com). Check your connection and try again.");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Data repository request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

// The lightweight per-match summary list (kills/deaths/duration/hero_id/
// etc - the shape OpenDota's /players/{id}/matches returns, not the full
// match detail), newest first. Backs the Matches list, Trends, win/loss
// and hero stats.
async function getStoredMatchIndex(): Promise<MatchSummary[] | null> {
  return cached("match-index", LIST_TTL_MS, () => fetchRepoJson<MatchSummary[]>(DATA_BRANCH_INDEX));
}

async function requireMatchIndex(): Promise<MatchSummary[]> {
  const index = await getStoredMatchIndex();
  if (!index) {
    throw new NotInRepoError(
      "matches-index.json isn't in the data repository yet. Run the \"Export OpenDota match JSON to the data branch\" workflow once to create it.",
    );
  }
  return index;
}

// Team compositions + patch per match - see match-extras-index.json's
// README entry on the data branch. null when the file isn't there.
async function getStoredMatchExtrasIndex(): Promise<MatchExtras[] | null> {
  return cached("match-extras-index", LIST_TTL_MS, () => fetchRepoJson<MatchExtras[]>(DATA_BRANCH_EXTRAS_INDEX));
}

// Every non-anonymous player per match, for teammate stats. Deliberately
// memory-cached only, not localStorage: it's a couple of MB, which on top
// of the match index would blow through localStorage's ~5MB quota - and
// only the Teammates / player-vs pages need it.
let playersIndexPromise: { ts: number; promise: Promise<MatchPlayersEntry[] | null> } | null = null;
function getStoredMatchPlayersIndex(): Promise<MatchPlayersEntry[] | null> {
  if (!playersIndexPromise || Date.now() - playersIndexPromise.ts > LIST_TTL_MS) {
    const promise = fetchRepoJson<MatchPlayersEntry[]>(DATA_BRANCH_PLAYERS_INDEX);
    promise.catch(() => {
      playersIndexPromise = null; // don't pin a failed fetch
    });
    playersIndexPromise = { ts: Date.now(), promise };
  }
  return playersIndexPromise.promise;
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const apiKey = getApiKey();
  if (apiKey) url.searchParams.set("api_key", apiKey);

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new OpenDotaError("Couldn't reach OpenDota - it may be down. Try again in a bit.", 0);
  }
  if (res.status === 429) {
    throw new OpenDotaError(
      "OpenDota rate limit hit (60/min or daily cap). Wait a bit, or add an API key in Settings for a higher limit.",
      429,
    );
  }
  if (!res.ok) {
    throw new OpenDotaError(`OpenDota request failed: ${res.status} ${res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}

// The tracked account's profile (name/avatar/rank), from profile.json.
// null when it isn't there yet, or when it's for a different account than
// the one being viewed (the data branch only ever tracks one account) -
// callers just fall back to showing the bare account id.
export async function getProfile(accountId: number): Promise<PlayerProfile | null> {
  const profile = await cached("profile", LIST_TTL_MS, () => fetchRepoJson<PlayerProfile>(DATA_BRANCH_PROFILE));
  return profile?.profile?.account_id === accountId ? profile : null;
}

// Settings' "check this account exists" - an explicit user action, so it's
// allowed to go to OpenDota directly.
export function lookupProfileLive(accountId: number): Promise<PlayerProfile> {
  return get<PlayerProfile>(`/players/${accountId}`);
}

export async function getWinLoss(): Promise<WinLoss> {
  const index = await requireMatchIndex();
  let win = 0;
  let lose = 0;
  for (const m of index) {
    if (isRadiant(m.player_slot) === m.radiant_win) win++;
    else lose++;
  }
  return { win, lose };
}

export async function getMatches(limit?: number): Promise<MatchSummary[]> {
  const index = await requireMatchIndex();
  return limit != null && limit > 0 ? index.slice(0, limit) : index;
}

// The full stored match index, for the Matches tab's client-side
// filtering/pagination and the Hero Overview widget - the same cached
// ("match-index") entry getMatches() reads, not a separate fetch.
export function getMatchIndexForStats(): Promise<MatchSummary[]> {
  return requireMatchIndex();
}

export function getMatchExtrasIndex(): Promise<MatchExtras[] | null> {
  return getStoredMatchExtrasIndex();
}

function won(m: MatchSummary): boolean {
  return isRadiant(m.player_slot) === m.radiant_win;
}

// Per-hero games/wins for the account, plus win rate with/against each
// hero, computed from the match index and match-extras-index.json (each
// side's picks). With/against only covers matches the extras index has.
export async function getHeroStats(): Promise<HeroStat[]> {
  const [index, extras] = await Promise.all([requireMatchIndex(), getStoredMatchExtrasIndex()]);
  const extrasById = new Map((extras ?? []).map((e) => [e.match_id, e]));
  const stats = new Map<number, HeroStat>();
  const statFor = (heroId: number): HeroStat => {
    let s = stats.get(heroId);
    if (!s) {
      s = { hero_id: heroId, last_played: 0, games: 0, win: 0, with_games: 0, with_win: 0, against_games: 0, against_win: 0 };
      stats.set(heroId, s);
    }
    return s;
  };

  for (const m of index) {
    const w = won(m) ? 1 : 0;
    const mine = statFor(m.hero_id);
    mine.games++;
    mine.win += w;
    mine.last_played = Math.max(mine.last_played, m.start_time);

    const e = extrasById.get(m.match_id);
    if (!e) continue;
    const [allies, enemies] = isRadiant(m.player_slot) ? [e.radiant, e.dire] : [e.dire, e.radiant];
    for (const h of allies) {
      if (h === m.hero_id) continue;
      const s = statFor(h);
      s.with_games++;
      s.with_win += w;
    }
    for (const h of enemies) {
      const s = statFor(h);
      s.against_games++;
      s.against_win += w;
    }
  }
  return [...stats.values()];
}

// Everyone the account has played with or against, computed from
// match-players-index.json. Anonymous (private-profile) players aren't in
// that index, so they never show up here. No avatars - match data doesn't
// include them.
export async function getPeers(accountId: number): Promise<PeerStat[]> {
  const [index, players] = await Promise.all([requireMatchIndex(), getStoredMatchPlayersIndex()]);
  if (!players) {
    throw new NotInRepoError(
      "match-players-index.json isn't in the data repository yet. Run the \"Export OpenDota match JSON to the data branch\" workflow once to create it.",
    );
  }
  const playersById = new Map(players.map((p) => [p.match_id, p.players]));
  const peers = new Map<number, PeerStat>();

  // Index is newest-first, so the first name seen for a player is their latest one.
  for (const m of index) {
    const entry = playersById.get(m.match_id);
    if (!entry) continue;
    const w = won(m) ? 1 : 0;
    const myRadiant = isRadiant(m.player_slot);
    for (const [peerId, radiant, , name] of entry) {
      if (peerId === accountId) continue;
      let p = peers.get(peerId);
      if (!p) {
        p = {
          account_id: peerId,
          personaname: name,
          avatar: null,
          last_played: 0,
          win: 0,
          games: 0,
          with_win: 0,
          with_games: 0,
          against_win: 0,
          against_games: 0,
        };
        peers.set(peerId, p);
      }
      p.games++;
      p.win += w;
      p.last_played = Math.max(p.last_played, m.start_time);
      if ((radiant === 1) === myRadiant) {
        p.with_games++;
        p.with_win += w;
      } else {
        p.against_games = (p.against_games ?? 0) + 1;
        p.against_win = (p.against_win ?? 0) + w;
      }
    }
  }
  return [...peers.values()];
}

export function isParsedMatch(match: MatchDetail): boolean {
  return Boolean(match.version || match.players?.[0]?.purchase_log);
}

// A match's full detail, from the data branch only. A parsed match never
// changes, so it's cached forever; an unparsed one only briefly, so the
// parsed copy request-parse.yml saves shortly after shows up on its own.
// Throws NotInRepoError when the match isn't stored (yet) - the match page
// then offers fetchMatchLive() as an explicit action.
export async function getMatch(matchId: number): Promise<MatchDetail> {
  const key = `match:${matchId}`;
  const hit = peekCached<MatchDetail>(key);
  if (hit && (isParsedMatch(hit.data) || Date.now() - hit.ts < LIST_TTL_MS)) return hit.data;

  let stored: MatchDetail | null;
  try {
    stored = await fetchRepoJson<MatchDetail>(`${DATA_BRANCH_MATCHES}/${shardFor(matchId)}/${matchId}.json`);
  } catch (e) {
    if (hit) return hit.data;
    throw e;
  }
  if (!stored) {
    // Not in the repo, but fetched live earlier on request - keep showing that.
    if (hit) return hit.data;
    throw new NotInRepoError(`Match ${matchId} isn't in the data repository yet.`);
  }
  writeCached(key, stored);
  return stored;
}

// Explicit "Fetch from OpenDota" for a match that isn't stored yet (or to
// pick up a fresh parse). Cached in this browser like any other match.
export async function fetchMatchLive(matchId: number): Promise<MatchDetail> {
  const match = await get<MatchDetail>(`/matches/${matchId}`);
  writeCached(`match:${matchId}`, match);
  return match;
}

// Pulls the account's newest matches straight from OpenDota's live API and
// merges any not already in the cached index in immediately - the manual,
// on-demand equivalent of what request-parse.yml does every 20 minutes,
// for right after a game rather than waiting on that schedule. Only
// affects this browser's cached copy (the next index refresh from the
// data branch replaces it, by which point the workflow has usually caught
// up). Also fires off a parse request for each new match (best-effort,
// same as the "Request parse" button on a match's own page).
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
  return fresh.length;
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
