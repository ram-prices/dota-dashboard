import heroesData from "./data/heroes.json";
import heroesByNameData from "./data/heroesByName.json";
import itemsData from "./data/items.json";
import itemsByNameData from "./data/itemsByName.json";
import abilitiesData from "./data/abilities.json";
import patchesData from "./data/patches.json";
import type { HeroPositionPriors, LogEntry, MatchDetail, MatchExtras, MatchPlayer, MatchSummary, ObjectiveEntry } from "./types";

const CDN = "https://cdn.cloudflare.steamstatic.com";

type HeroEntry = { id: number; name: string; img: string; icon: string };
type ItemEntry = { name: string; img: string };
type ItemByNameEntry = { id: number; name: string; img: string };
type AbilityEntry = { name: string; img: string | null };

const heroesById = heroesData as Record<string, HeroEntry>;
const heroesByName = heroesByNameData as Record<string, HeroEntry>;
const itemsById = itemsData as Record<string, ItemEntry>;
const itemsByName = itemsByNameData as Record<string, ItemByNameEntry>;
const abilitiesById = abilitiesData as Record<string, AbilityEntry>;
// OpenDota's own patch index -> version string mapping (odota/dotaconstants
// patch.json), bundled locally rather than fetched live since it changes
// maybe a handful of times a year.
const patchesById = patchesData as Record<string, string>;

export function patchLabel(patchId: number | undefined | null): string {
  if (patchId == null) return "Unknown";
  return patchesById[String(patchId)] ?? `Patch ${patchId}`;
}

export function heroName(heroId: number | undefined | null): string {
  if (!heroId) return "Unknown Hero";
  return heroesById[String(heroId)]?.name ?? `Hero #${heroId}`;
}

export function heroIcon(heroId: number | undefined | null): string | null {
  if (!heroId) return null;
  const h = heroesById[String(heroId)];
  return h ? `${CDN}${h.icon}` : null;
}

// The wider landscape portrait (256x144) rather than the small square icon.
export function heroPortrait(heroId: number | undefined | null): string | null {
  if (!heroId) return null;
  const h = heroesById[String(heroId)];
  return h?.img ? `${CDN}${h.img}` : null;
}

// kills_log / a hero's internal unit name (e.g. "npc_dota_hero_axe") -> display name
export function heroNameByUnit(unitName: string | undefined | null): string {
  if (!unitName) return "Unknown";
  return heroesByName[unitName]?.name ?? unitName;
}

// For a persistent summon's internal unit name (e.g. "spirit_bear",
// currently only ever Lone Druid's bear) rather than a hero's - these
// aren't in heroesByName, so just prettify the snake_case name itself.
export function unitDisplayName(unitName: string): string {
  return unitName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function itemName(itemId: number | undefined | null): string {
  if (!itemId) return "";
  return itemsById[String(itemId)]?.name ?? "";
}

export function itemImage(itemId: number | undefined | null): string | null {
  if (!itemId) return null;
  const it = itemsById[String(itemId)];
  return it?.img ? `${CDN}${it.img}` : null;
}

// purchase_log key is the item's internal shortname (e.g. "blink"), not its numeric id.
export function itemByKey(key: string | undefined | null): { name: string; img: string | null } {
  if (!key) return { name: "Unknown item", img: null };
  const it = itemsByName[key];
  if (!it) return { name: key, img: null };
  return { name: it.name, img: it.img ? `${CDN}${it.img}` : null };
}

// Reverse of itemsByName - numeric item id -> internal shortname, so an
// item currently sitting in an inventory slot (which only has the id) can
// be matched back against purchase_log entries (which only have the key).
const itemKeyById: Record<number, string> = {};
for (const [key, entry] of Object.entries(itemsByName)) {
  if (!(entry.id in itemKeyById)) itemKeyById[entry.id] = key;
}

// When an item currently in a slot was bought, per purchase_log. A slot's
// item can have been bought more than once (rebuys, or built up through
// components that share the final item's key on assembly), so this takes
// the most recent matching purchase as the one still held.
export function itemObtainedTime(itemId: number | undefined | null, purchaseLog: LogEntry[] | undefined): number | null {
  if (!itemId || !purchaseLog) return null;
  const key = itemKeyById[itemId];
  if (!key) return null;
  let latest: number | null = null;
  for (const entry of purchaseLog) {
    if (entry.key === key && (latest === null || entry.time > latest)) latest = entry.time;
  }
  return latest;
}

export function abilityById(id: number | undefined | null): { name: string; img: string | null } {
  if (!id) return { name: "Stat point", img: null };
  const a = abilitiesById[String(id)];
  if (!a) return { name: `Ability #${id}`, img: null };
  return { name: a.name, img: a.img ? `${CDN}${a.img}` : null };
}

export function isRadiant(playerSlot: number): boolean {
  return playerSlot < 128;
}

// actions is a per-action-type count (clicks/orders); APM is just the total
// rate of those over the game, same definition OpenDota's own site uses.
export function computeApm(actions: Record<string, number> | undefined, durationSeconds: number): number | null {
  if (!actions || durationSeconds <= 0) return null;
  const total = Object.values(actions).reduce((sum, n) => sum + n, 0);
  return Math.round(total / (durationSeconds / 60));
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.abs(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatGameTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  return `${sign}${formatDuration(Math.abs(seconds))}`;
}

export function formatRelativeTime(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

const GAME_MODES: Record<number, string> = {
  0: "Unknown",
  1: "All Pick",
  2: "Captains Mode",
  3: "Random Draft",
  4: "Single Draft",
  5: "All Random",
  7: "The Diretide",
  15: "Custom Game",
  16: "Captains Draft",
  18: "Ability Draft",
  19: "Event Game",
  20: "All Random Deathmatch",
  21: "1v1 Mid",
  // Valve's internal enum name for this one is genuinely "All Draft", not
  // "All Pick" - it's the mode that unified ranked/unranked queueing from
  // patch 7.00 onward and happens to look identical to old-school All
  // Pick (mode 1, still used by some bot/custom lobbies) in-game, but
  // they're distinct game_mode values. Whether a match was ranked is a
  // *separate* field (lobby_type === 7); see matchModeLabel().
  22: "All Draft",
  23: "Turbo",
  24: "Mutation",
};

export function gameModeName(mode: number | undefined | null): string {
  if (mode == null) return "Unknown";
  return GAME_MODES[mode] ?? `Mode ${mode}`;
}

// lobby_type is a different axis than game_mode - it's *where* the match
// was queued (normal matchmaking, ranked, bots, a tournament, ...), not
// the draft/pick rules. A bot match or tutorial still reports a normal
// game_mode (e.g. All Pick), so without this a bot game just reads as
// "Unranked" - indistinguishable from a real unranked PvP match.
const LOBBY_TYPES: Record<number, string> = {
  0: "Unranked",
  1: "Practice",
  2: "Tournament",
  3: "Tutorial",
  4: "Bot Match",
  5: "Team Match",
  6: "Solo Queue",
  7: "Ranked",
  8: "1v1 Mid",
  9: "Battle Cup",
  20: "Turbo Lobby",
  21: "Event",
};

export function lobbyTypeLabel(lobbyType: number | undefined | null): string {
  if (lobbyType == null) return "Unranked";
  return LOBBY_TYPES[lobbyType] ?? `Lobby ${lobbyType}`;
}

// Valve-run limited-time event modes/modifiers - The Diretide, the
// generic "Event Game" mode, and seasonal Mutations. These report
// ordinary-looking lobby_type values (0, 4, 12 in practice, not some
// dedicated "event" lobby type), so without this a Diretide match just
// reads as "Unranked" like any other.
const EVENT_GAME_MODES = new Set([7, 19, 24]);

// Valve ran a long string of seasonal/tournament minigames under the
// generic Custom Game (15) and Event Game (19) modes, with no field of
// their own to say WHICH one - only the date tells them apart. Windows
// below were identified by matching this account's actual game_mode-15/
// 19 match timestamps against public Dota 2 event dates (Liquipedia/Dota
// 2 Wiki/patch notes). Unlike Diretide/Mutation (always an event by
// game_mode alone), Custom Game and generic Event Game aren't reliably
// "an event" on their own - Custom Game is mostly real user-made Arcade
// content, and Event Game can mean any one-off Valve minigame - so a
// match only gets promoted out of the generic bucket when it falls in
// one of these specifically-verified windows.
const SEASONAL_EVENT_GAMES: { gameMode: number; key: string; label: string; start: number; end: number }[] = [
  { gameMode: 15, key: "frostivus-2013", label: "Frostivus 2013", start: Date.UTC(2013, 11, 1) / 1000, end: Date.UTC(2014, 0, 1) / 1000 },
  { gameMode: 15, key: "new-bloom-2014", label: "New Bloom 2014", start: Date.UTC(2014, 0, 25) / 1000, end: Date.UTC(2014, 2, 1) / 1000 },
  { gameMode: 19, key: "new-bloom-2017", label: "New Bloom 2017", start: Date.UTC(2017, 0, 20) / 1000, end: Date.UTC(2017, 1, 10) / 1000 },
  { gameMode: 19, key: "frostivus-2017", label: "Frostivus 2017", start: Date.UTC(2017, 11, 10) / 1000, end: Date.UTC(2018, 0, 5) / 1000 },
  { gameMode: 19, key: "underhollow-2018", label: "The Underhollow (TI8)", start: Date.UTC(2018, 5, 14) / 1000, end: Date.UTC(2018, 8, 10) / 1000 },
  { gameMode: 19, key: "frostivus-2018", label: "Frostivus 2018: Frosthaven", start: Date.UTC(2018, 11, 15) / 1000, end: Date.UTC(2019, 0, 10) / 1000 },
  { gameMode: 19, key: "morokai-2019", label: "Wrath of the Mo'rokai (TI9)", start: Date.UTC(2019, 5, 25) / 1000, end: Date.UTC(2019, 8, 5) / 1000 },
  { gameMode: 19, key: "diretide-2020", label: "Diretide 2020", start: Date.UTC(2020, 9, 25) / 1000, end: Date.UTC(2020, 11, 25) / 1000 },
  { gameMode: 19, key: "frostivus-2021", label: "Frostivus 2021", start: Date.UTC(2021, 11, 10) / 1000, end: Date.UTC(2022, 0, 10) / 1000 },
];

function seasonalEventGame(gameMode: number | undefined | null, startTime: number | undefined | null) {
  if (gameMode == null || startTime == null) return null;
  return SEASONAL_EVENT_GAMES.find((e) => e.gameMode === gameMode && startTime >= e.start && startTime < e.end) ?? null;
}

// A single match's "effective" game mode - the raw game_mode number,
// except a dated seasonal event match (Frostivus, New Bloom, a Battle
// Pass minigame, ...) gets its own distinct key instead of being lumped
// in with every other match sharing that generic game_mode. Number keys
// are real game_mode values; string keys are synthetic, only produced by
// seasonalEventGame() above.
export type GameModeKey = number | string;

export function effectiveGameModeKey(gameMode: number | undefined | null, startTime: number | undefined | null): GameModeKey {
  return seasonalEventGame(gameMode, startTime)?.key ?? (gameMode ?? 0);
}

export function gameModeKeyLabel(key: GameModeKey): string {
  if (typeof key === "string") return SEASONAL_EVENT_GAMES.find((e) => e.key === key)?.label ?? key;
  return gameModeName(key);
}

// True for anything that isn't a normal matchmade game - Diretide,
// Mutation, and the generic "Event Game" mode by game_mode alone, plus
// the seasonal minigames above (a string key only ever means one of
// those, so it's always an event).
export function isEventGameModeKey(key: GameModeKey): boolean {
  return typeof key === "string" || EVENT_GAME_MODES.has(key);
}

// The name shown for a single match's game mode - same as gameModeName(),
// except a dated seasonal Custom Game match shows its actual event name
// instead of the generic "Custom Game" bucket.
export function matchGameModeLabel(gameMode: number | undefined | null, startTime: number | undefined | null): string {
  return gameModeKeyLabel(effectiveGameModeKey(gameMode, startTime));
}

// What the Matches tab's "Mode" column shows - lobby_type-derived, except
// event/modifier games (including dated seasonal Custom Game matches)
// always read "Event" regardless of their (often misleading) lobby_type.
export function matchLobbyLabel(
  lobbyType: number | undefined | null,
  gameMode: number | undefined | null,
  startTime: number | undefined | null,
): string {
  if (isEventGameModeKey(effectiveGameModeKey(gameMode, startTime))) return "Event";
  return lobbyTypeLabel(lobbyType);
}

// Combines lobby_type with game_mode for an accurate label (e.g. "Ranked
// All Pick" vs plain "All Pick" vs "Bot Match All Pick") instead of
// assuming a mode.
export function matchModeLabel(
  mode: number | undefined | null,
  lobbyType: number | undefined | null,
  startTime?: number | undefined | null,
): string {
  const key = effectiveGameModeKey(mode, startTime);
  const base = gameModeKeyLabel(key);
  if (isEventGameModeKey(key)) return base;
  if (lobbyType === 7) return `Ranked ${base}`;
  if (lobbyType != null && lobbyType !== 0) return `${lobbyTypeLabel(lobbyType)} ${base}`;
  return base;
}

const LANE_ROLES: Record<number, string> = {
  1: "Safe Lane",
  2: "Mid Lane",
  3: "Off Lane",
  4: "Jungle",
};

export function laneRoleName(role: number | undefined | null): string {
  if (!role) return "-";
  return LANE_ROLES[role] ?? `Lane ${role}`;
}

// position_est (1-5) is OpenDota's estimate of standard Dota "position"
// (farm priority), which is what most players actually mean by "role" -
// distinct from lane_role (just which lane: safe/mid/off/jungle).
const POSITIONS: Record<number, string> = {
  1: "Carry",
  2: "Mid",
  3: "Offlane",
  4: "Soft Support",
  5: "Hard Support",
};

export function positionShort(pos: number | undefined | null): string | null {
  if (!pos || !POSITIONS[pos]) return null;
  return `P${pos}`;
}

export function positionLabel(pos: number | undefined | null): string | null {
  if (!pos || !POSITIONS[pos]) return null;
  return `Position ${pos} - ${POSITIONS[pos]}`;
}

// Estimates positions 1-5 for one team when OpenDota has none (unparsed
// matches), from how often each hero plays each position and how position
// relates to a player's farm (GPM) rank on their team - both learned from
// every stored match that does have positions (hero-positions.json). Picks
// the single most likely assignment for the whole team, each position used
// at most once, rather than guessing each player independently. Tested
// against matches with known positions: ~69% exact, ~91% core vs support.
// Returns positions aligned with `team` (0 = couldn't estimate).
function estimatePositions(team: { heroId: number; gpm: number }[], priors: HeroPositionPriors): number[] {
  if (team.length === 0 || team.length > 5) return team.map(() => 0);

  // Laplace-smoothed log P(position | counts) - a hero with few samples
  // falls back toward "any position", not to impossible.
  const logP = (counts: number[] | undefined, pos: number) => {
    const c = counts ?? [0, 0, 0, 0, 0];
    const total = c.reduce((a, b) => a + b, 0);
    return Math.log(((c[pos - 1] ?? 0) + 1) / (total + 5));
  };
  const ranked = [...team].sort((a, b) => b.gpm - a.gpm);
  const score = team.map((p) => {
    const rank = ranked.indexOf(p) + 1;
    return [1, 2, 3, 4, 5].map((pos) => logP(priors.hero[String(p.heroId)], pos) + logP(priors.gpmRank[String(rank)], pos));
  });

  // At most 5! = 120 assignments - just try them all.
  let best: number[] = team.map(() => 0);
  let bestScore = -Infinity;
  const used = new Set<number>();
  const current: number[] = [];
  const search = (i: number, total: number) => {
    if (i === team.length) {
      if (total > bestScore) {
        bestScore = total;
        best = [...current];
      }
      return;
    }
    for (let pos = 1; pos <= 5; pos++) {
      if (used.has(pos)) continue;
      used.add(pos);
      current.push(pos);
      search(i + 1, total + score[i][pos - 1]);
      current.pop();
      used.delete(pos);
    }
  };
  search(0, 0);
  return best;
}

// estimatePositions() for a team from a full match's players, keyed by player_slot.
export function estimateTeamPositions(team: MatchPlayer[], priors: HeroPositionPriors): Map<number, number> {
  const positions = estimatePositions(
    team.map((p) => ({ heroId: p.hero_id, gpm: p.gold_per_min ?? 0 })),
    priors,
  );
  const result = new Map<number, number>();
  team.forEach((p, i) => {
    if (positions[i]) result.set(p.player_slot, positions[i]);
  });
  return result;
}

export interface PlayedPosition {
  pos: number;
  // true when OpenDota had no position for this match and it was estimated
  estimated: boolean;
}

// The tracked account's position in a match, from match-extras-index.json's
// lineups (no full match file needed): OpenDota's own position_est when it
// has one, otherwise the same whole-team estimate as estimateTeamPositions().
// null when the match isn't in the extras index (not stored yet).
export function positionInMatch(
  match: MatchSummary,
  extras: MatchExtras | undefined,
  priors: HeroPositionPriors | null,
): PlayedPosition | null {
  const lineup = isRadiant(match.player_slot) ? extras?.radiant_lineup : extras?.dire_lineup;
  if (!lineup) return null;
  const mine = lineup.findIndex(([heroId]) => heroId === match.hero_id);
  if (mine < 0) return null;
  const known = lineup[mine][2];
  if (known && known >= 1 && known <= 5) return { pos: known, estimated: false };
  if (!priors) return null;
  const estimated = estimatePositions(
    lineup.map(([heroId, gpm]) => ({ heroId, gpm })),
    priors,
  )[mine];
  return estimated ? { pos: estimated, estimated: true } : null;
}

// rank_tier is a per-player field: tens digit = medal (1 Herald .. 8
// Immortal), ones digit = star within that medal (1-5; Immortal has no
// stars). This is the reliable "skill level" signal - the match-level
// `skill` estimate OpenDota also exposes is only computed for a subset of
// matches and is frequently null.
const MEDALS: Record<number, string> = {
  1: "Herald",
  2: "Guardian",
  3: "Crusader",
  4: "Archon",
  5: "Legend",
  6: "Ancient",
  7: "Divine",
  8: "Immortal",
};

export function rankTierLabel(tier: number | undefined | null): string {
  if (!tier) return "Unranked";
  const medal = Math.floor(tier / 10);
  const star = tier % 10;
  const name = MEDALS[medal];
  if (!name) return "Unranked";
  if (medal === 8) return "Immortal";
  return star > 0 ? `${name} ${star}` : name;
}

// Each medal's most distinctive color from its actual badge art (the small
// gem/leaf accent, not the overall gray/gold metal), for coloring rank text
// the way the in-game rank medal picker does.
// Saturation ramps up from Herald to Immortal - low tiers read as flat/
// washed-out, high tiers as bold/vivid, so the color itself signals rank
// weight at a glance instead of every medal competing equally for
// attention. Hues keep the same identity as before (Herald green,
// Guardian brown, Crusader cyan, ...); only saturation/lightness change.
const MEDAL_COLORS: Record<number, string> = {
  1: "hsl(100, 20%, 60%)", // Herald - flat, muted sage green
  2: "hsl(28, 25%, 52%)", // Guardian - flat, muted brown
  3: "hsl(187, 35%, 55%)", // Crusader - soft cyan
  4: "hsl(130, 40%, 45%)", // Archon - moderate green
  5: "hsl(0, 42%, 58%)", // Legend - softer red
  6: "hsl(235, 70%, 70%)", // Ancient - bold light blue with a violet tinge
  7: "hsl(45, 80%, 55%)", // Divine - bold gold
  8: "hsl(16, 90%, 50%)", // Immortal - boldest, most saturated red-gold
};

export function rankTierColor(tier: number | undefined | null): string | null {
  if (!tier) return null;
  const medal = Math.floor(tier / 10);
  return MEDAL_COLORS[medal] ?? null;
}

// Average rank across a team/match, as a raw tier number (medal*10+star) -
// see averageRankLabel below for why this can't just average the raw tier
// numbers directly. Exposed separately (not just as the formatted label) so
// callers can also look up its color via rankTierColor().
export function averageRankTier(tiers: Array<number | null | undefined>): number | null {
  const scores = tiers
    .filter((t): t is number => Boolean(t))
    .filter((t) => Math.floor(t / 10) >= 1 && Math.floor(t / 10) <= 8)
    .map((t) => {
      const medal0 = Math.floor(t / 10) - 1;
      const star0 = medal0 === 7 ? 0 : Math.max(0, (t % 10) - 1); // Immortal has no stars
      return medal0 * 5 + star0;
    });
  if (scores.length === 0) return null;

  const avgScore = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
  const medal = Math.floor(avgScore / 5) + 1;
  const star = (avgScore % 5) + 1;
  return medal * 10 + star;
}

// Average rank across a team/match, for an at-a-glance "skill level of
// this game" summary, e.g. "Ancient 5" or "Divine 2" - not just the medal.
// Can't just average the raw tier numbers: medal/star isn't a continuous
// scale (Ancient 5 is 65, the next real rank is Divine 1 at 71 - there's
// no 66-70), so naive averaging can land on a star that doesn't exist.
// Instead each rank becomes a continuous 0-based score (medal 0-7, star
// 0-4), gets averaged on that scale, then decoded back.
export function averageRankLabel(tiers: Array<number | null | undefined>): string | null {
  const tier = averageRankTier(tiers);
  return tier == null ? null : rankTierLabel(tier);
}

// Below this many players with a visible rank_tier, an "average" is too
// noisy to be meaningful (one or two outliers can swing it a whole medal),
// so display should fall back to skillBracketLabel() below instead of
// averageRankTier().
const MIN_RANKED_PLAYERS_FOR_MATCH_RANK = 4;

export function matchRankTier(tiers: Array<number | null | undefined>): number | null {
  const rankedCount = tiers.filter((t): t is number => Boolean(t)).length;
  if (rankedCount < MIN_RANKED_PLAYERS_FOR_MATCH_RANK) return null;
  return averageRankTier(tiers);
}

const SKILL_LABELS: Record<number, string> = {
  1: "Normal Skill",
  2: "High Skill",
  3: "Very High Skill",
};

// leaver_status: 0 none, 1 disconnected (a brief drop that reconnects -
// still a normal completed match, not treated as an abandon), 2
// disconnected too long, 3 abandoned, 4 AFK, 5/6 never connected (in
// time). 2 and up mean this account genuinely left/never played the
// match, as opposed to it finishing out normally.
export function isAbandoned(leaverStatus: number | undefined | null): boolean {
  return (leaverStatus ?? 0) >= 2;
}

// OpenDota's `skill` match field - Valve's own lobby skill bracket for
// (mostly unranked) matchmaking, assigned at match time. Unlike rank_tier
// (which reflects each player's rank as of whenever OpenDota last synced
// their profile - see above), this is a genuine historical snapshot, but
// it's only populated for a subset of matches.
export function skillBracketLabel(skill: number | undefined | null): string | null {
  if (!skill) return null;
  return SKILL_LABELS[skill] ?? null;
}

// Lane outcome - OpenDota has no direct "did you win your lane" field, only
// each player's lane_efficiency (a farm-vs-optimal-farm ratio, not a
// win/loss). Derived instead from each player's actual lane group (by
// lane_role, not assumed position) vs. the mirrored enemy group's combined
// net worth + XP at the 10 minute mark, with an early lane tower counted as
// a decisive, more concrete signal than a close gold/XP lead.
export type LaneOutcome = "won" | "draw" | "lost";

export const LANE_CUTOFF_MINUTE = 10;
const LANE_WIN_MARGIN = 0.15; // >15% combined net worth + XP lead to call it decisively

// Radiant's safe lane is the bottom lane, Dire's safe lane is the top lane
// (they mirror across the map) - mid is mid for both sides.
function physicalLane(radiant: boolean, laneRole: number): "top" | "mid" | "bot" | null {
  if (laneRole === 2) return "mid";
  if (laneRole === 1) return radiant ? "bot" : "top";
  if (laneRole === 3) return radiant ? "top" : "bot";
  return null;
}

// A lane_role's actual opponent: Radiant Safe (1) faces Dire Off (3) since
// they share the bottom lane, and vice versa; Mid (2) faces Mid.
const MIRROR_LANE_ROLE: Record<number, number> = { 1: 3, 2: 2, 3: 1 };

// Value of a per-minute cumulative array (gold_t, xp_t, lh_t, ...) at a given
// minute, clamped to the last entry if the game ended before then.
export function valueAtMinute(arr: number[] | undefined, minute: number): number | null {
  if (!arr || arr.length === 0) return null;
  return arr[Math.min(minute, arr.length - 1)] ?? null;
}

function laneValueAt(player: MatchPlayer, minute: number): number {
  return (valueAtMinute(player.networth_t, minute) ?? 0) + (valueAtMinute(player.xp_t, minute) ?? 0);
}

// Earliest tower in this physical lane destroyed before the cutoff, if any -
// whoever DIDN'T own that tower pushed it down, so they're the beneficiary.
function earlyLaneTowerBeneficiary(
  objectives: ObjectiveEntry[] | undefined,
  lane: "top" | "mid" | "bot",
): "radiant" | "dire" | null {
  if (!objectives) return null;
  const cutoffSeconds = LANE_CUTOFF_MINUTE * 60;
  let earliest: { time: number; ownerTeam: "radiant" | "dire" } | null = null;
  for (const o of objectives) {
    if (o.type !== "building_kill" || !o.key || o.time > cutoffSeconds) continue;
    if (!o.key.includes("tower") || !o.key.endsWith(`_${lane}`)) continue;
    const ownerTeam = o.key.includes("goodguys") ? "radiant" : o.key.includes("badguys") ? "dire" : null;
    if (!ownerTeam) continue;
    if (!earliest || o.time < earliest.time) earliest = { time: o.time, ownerTeam };
  }
  if (!earliest) return null;
  return earliest.ownerTeam === "radiant" ? "dire" : "radiant";
}

// Outcome from the RADIANT side's perspective: "won" = radiant took this
// lane, "lost" = dire took it. Shared by laneOutcome() (one player's own
// result) and laneMatchups() (the full head-to-head for a lane).
function laneResultForGroups(
  radiantGroup: MatchPlayer[],
  direGroup: MatchPlayer[],
  lane: "top" | "mid" | "bot",
  objectives: ObjectiveEntry[] | undefined,
): LaneOutcome | null {
  if (radiantGroup.length === 0 || direGroup.length === 0) return null;

  const radiantScore = radiantGroup.reduce((sum, p) => sum + laneValueAt(p, LANE_CUTOFF_MINUTE), 0);
  const direScore = direGroup.reduce((sum, p) => sum + laneValueAt(p, LANE_CUTOFF_MINUTE), 0);

  let result: LaneOutcome;
  if (radiantScore > direScore * (1 + LANE_WIN_MARGIN)) result = "won";
  else if (direScore > radiantScore * (1 + LANE_WIN_MARGIN)) result = "lost";
  else result = "draw";

  if (result === "draw") {
    const beneficiary = earlyLaneTowerBeneficiary(objectives, lane);
    if (beneficiary) result = beneficiary === "radiant" ? "won" : "lost";
  }

  return result;
}

export function laneOutcome(detail: MatchDetail, playerSlot: number): LaneOutcome | null {
  const me = detail.players.find((p) => p.player_slot === playerSlot);
  if (!me || !me.lane_role) return null;

  const myRadiant = isRadiant(playerSlot);
  const lane = physicalLane(myRadiant, me.lane_role);
  const enemyLaneRole = MIRROR_LANE_ROLE[me.lane_role];
  if (!lane || !enemyLaneRole) return null;

  const myGroup = detail.players.filter((p) => isRadiant(p.player_slot) === myRadiant && p.lane_role === me.lane_role);
  const enemyGroup = detail.players.filter((p) => isRadiant(p.player_slot) !== myRadiant && p.lane_role === enemyLaneRole);

  const radiantGroup = myRadiant ? myGroup : enemyGroup;
  const direGroup = myRadiant ? enemyGroup : myGroup;
  const radiantResult = laneResultForGroups(radiantGroup, direGroup, lane, detail.objectives);
  if (!radiantResult) return null;
  if (radiantResult === "draw") return "draw";

  const myTeamWon = myRadiant ? radiantResult === "won" : radiantResult === "lost";
  return myTeamWon ? "won" : "lost";
}

export function laneOutcomeLabel(outcome: LaneOutcome | null | undefined): string | null {
  if (outcome === "won") return "Won lane";
  if (outcome === "lost") return "Lost lane";
  if (outcome === "draw") return "Even lane";
  return null;
}

export interface LaneMatchup {
  lane: "top" | "mid" | "bot";
  label: string;
  radiantPlayers: MatchPlayer[];
  direPlayers: MatchPlayer[];
  // Radiant-side perspective: "won" = radiant took this lane.
  outcome: LaneOutcome | null;
}

const LANE_LABELS: Record<"top" | "mid" | "bot", string> = {
  top: "Top Lane",
  mid: "Mid Lane",
  bot: "Bottom Lane",
};

// The full head-to-head for all three lanes, for a dedicated match-up view -
// grouped the same way as laneOutcome() (by actual lane_role, not assumed
// position), so it agrees with the per-match W/L badge shown elsewhere.
export function laneMatchups(detail: MatchDetail): LaneMatchup[] {
  return (["top", "mid", "bot"] as const).map((lane) => {
    const radiantPlayers = detail.players.filter(
      (p) => isRadiant(p.player_slot) && p.lane_role != null && physicalLane(true, p.lane_role) === lane,
    );
    const direPlayers = detail.players.filter(
      (p) => !isRadiant(p.player_slot) && p.lane_role != null && physicalLane(false, p.lane_role) === lane,
    );
    const outcome = laneResultForGroups(radiantPlayers, direPlayers, lane, detail.objectives);
    return { lane, label: LANE_LABELS[lane], radiantPlayers, direPlayers, outcome };
  });
}

const OBJECTIVE_LABELS: Record<string, string> = {
  CHAT_MESSAGE_TOWER_KILL: "Tower destroyed",
  CHAT_MESSAGE_TOWER_DENY: "Tower deny",
  CHAT_MESSAGE_BARRACKS_KILL: "Barracks destroyed",
  CHAT_MESSAGE_ROSHAN_KILL: "Roshan killed",
  CHAT_MESSAGE_AEGIS: "Aegis picked up",
  CHAT_MESSAGE_AEGIS_STOLEN: "Aegis stolen",
  CHAT_MESSAGE_FIRSTBLOOD: "First blood",
  building_kill: "Building destroyed",
};

export function objectiveLabel(type: string | undefined | null): string {
  if (!type) return "Unknown event";
  return OBJECTIVE_LABELS[type] ?? type.replace(/^CHAT_MESSAGE_/, "").replace(/_/g, " ").toLowerCase();
}
