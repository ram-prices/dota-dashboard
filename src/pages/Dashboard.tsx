import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  errorMessage,
  getHeroPositionPriors,
  getMatch,
  getMatchExtrasIndex,
  getMatchIndexForStats,
  getProfile,
  getWinLoss,
  syncRecentMatches,
} from "../opendota";
import { HeroOverview } from "../components/HeroOverview";
import type { HeroPositionPriors, MatchExtras, MatchSummary, PlayerProfile, WinLoss } from "../types";
import { HeroMultiSelect } from "../components/HeroMultiSelect";
import { MultiSelect } from "../components/MultiSelect";
import {
  effectiveGameModeKey,
  formatDuration,
  formatRelativeTime,
  gameModeKeyLabel,
  heroPortrait,
  heroName,
  isAbandoned,
  isEventGameModeKey,
  lineupPositions,
  positionInMatch,
  isRadiant,
  laneOutcome,
  laneOutcomeLabel,
  matchGameModeLabel,
  matchLobbyLabel,
  matchRankTier,
  patchLabel,
  positionLabel,
  positionShort,
  rankTierColor,
  rankTierLabel,
  skillBracketLabel,
  type GameModeKey,
  type LaneOutcome,
} from "../dota";

const PAGE_SIZE = 30;

// A match's rank column: the average rank tier when there are enough
// ranked players to average, otherwise Valve's own skill bracket label -
// see matchRankTier()/skillBracketLabel() in dota.ts. null means neither
// was available for that match.
type RankBadge = { label: string; color: string | null } | null;

type ResultFilter = "all" | "win" | "loss" | "abandoned";
type FactionFilter = "all" | "radiant" | "dire";
type PartyFilter = "all" | "solo" | "party";
type TimeRangeFilter = "all" | "7d" | "30d" | "90d" | "180d" | "365d";

// Mode is multi-select (any combination, or none = no filtering) rather
// than a single dropdown value, since "show me Ranked and Bot Match but
// not Unranked" is a perfectly normal thing to want. Ranked/Unranked/Bot
// Match are lobby_type values; "event" is special-cased since event/
// modifier games (Diretide, Mutation, ...) don't have a lobby_type of
// their own - see isEventGameModeKey() in dota.ts.
type ModeFilterKey = number | "event";
const MODE_OPTIONS: { value: ModeFilterKey; label: string }[] = [
  { value: 7, label: "Ranked" },
  { value: 0, label: "Unranked" },
  { value: 4, label: "Bot" },
  { value: "event", label: "Event" },
];
const DEFAULT_MODE: ModeFilterKey[] = [7, 0];
type HeroJoin = "and" | "or";

const TIME_RANGE_LABELS: Record<Exclude<TimeRangeFilter, "all">, string> = {
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "90d": "Last 3 Months",
  "180d": "Last 6 Months",
  "365d": "Last Year",
};
const TIME_RANGE_DAYS: Record<Exclude<TimeRangeFilter, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

function matchWon(m: MatchSummary): boolean {
  return isRadiant(m.player_slot) === m.radiant_win;
}

function parseHeroIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((token) => Math.floor(Number(token)))
    .filter((id) => id > 0);
}

export function Dashboard({ accountId }: { accountId: number }) {
  // Page + filters are all mirrored into the URL so that clicking into a
  // match and then hitting the browser's back button lands you back on
  // the same page with the same filters, instead of resetting - React
  // Router unmounts/remounts this component on that round trip, so plain
  // state alone can't survive it, but the URL does.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPage = Math.max(1, Math.floor(Number(searchParams.get("page"))) || 1);
  const initialHero = parseHeroIds(searchParams.get("hero"));
  const initialResult = (searchParams.get("result") as ResultFilter) || "all";
  // null (param never set) defaults to Ranked+Unranked; "" is a deliberate
  // "cleared to none" (see updateParams below, which writes "" rather than
  // deleting the param so a deliberate clear doesn't spring back to the
  // default on the next load).
  const rawModeParam = searchParams.get("mode");
  const initialMode: ModeFilterKey[] =
    rawModeParam === null
      ? DEFAULT_MODE
      : rawModeParam
        ? rawModeParam
            .split(",")
            .map((token): ModeFilterKey => (token === "event" ? "event" : Number(token)))
            .filter((v) => MODE_OPTIONS.some((o) => o.value === v))
        : [];
  // Game Mode values are usually numeric (a raw game_mode), but a dated
  // seasonal Custom Game match (Frostivus, New Bloom, ...) uses a
  // synthetic string key instead - see effectiveGameModeKey() in dota.ts.
  const rawGameModeParam = searchParams.get("gm");
  const initialGameMode: GameModeKey[] = rawGameModeParam
    ? rawGameModeParam
        .split(",")
        .map((token): GameModeKey => (Number.isNaN(Number(token)) ? token : Math.floor(Number(token))))
    : [];
  // Off (Turbo hidden) unless explicitly turned on - Turbo has its own
  // separate hero stats in Dota itself, so it's excluded from the default
  // view same as Bot Match/Event are (via the Mode chips).
  const initialTurbo = searchParams.get("turbo") === "1";
  const initialFaction = (searchParams.get("faction") as FactionFilter) || "all";
  const initialParty = (searchParams.get("party") as PartyFilter) || "all";
  const initialTimeRange = (searchParams.get("time") as TimeRangeFilter) || "all";
  const initialTeammateHero = parseHeroIds(searchParams.get("teamHero"));
  const initialEnemyHero = parseHeroIds(searchParams.get("enemyHero"));
  const parsePos = (raw: string | null) => {
    const n = Math.floor(Number(raw));
    return n >= 1 && n <= 5 ? n : 0;
  };
  const initialTeammatePos = parsePos(searchParams.get("teamPos"));
  const initialHeroJoin: HeroJoin = searchParams.get("heroJoin") === "or" ? "or" : "and";
  const initialEnemyPos = parsePos(searchParams.get("enemyPos"));
  const initialPatch = Math.floor(Number(searchParams.get("patch"))) || 0;

  // Secondary filters live behind "More filters" - opened from the start
  // when the URL already has one of them set, so it's never hidden.
  const [showMoreFilters, setShowMoreFilters] = useState(
    Boolean(
      initialTeammateHero.length ||
        initialEnemyHero.length ||
        initialTeammatePos ||
        initialEnemyPos ||
        initialGameMode.length ||
        initialFaction !== "all" ||
        initialParty !== "all" ||
        initialPatch,
    ),
  );

  // undefined while loading; null when profile.json isn't in the data
  // branch (or is for another account) - the header then just shows the
  // account id rather than blocking the whole page on it.
  const [profile, setProfile] = useState<PlayerProfile | null | undefined>(undefined);
  const [wl, setWl] = useState<WinLoss | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The full match history from the data branch - undefined while loading.
  const [allMatches, setAllMatches] = useState<MatchSummary[] | undefined>(undefined);
  // Team compositions + patch per match - a separate, optional index (see
  // match-extras-index.json's README on the data branch). Filters that
  // need it (teammate/enemy hero, patch) just don't match anything for a
  // match this doesn't cover, rather than the whole page depending on it.
  const [extrasIndex, setExtrasIndex] = useState<MatchExtras[] | null>(null);

  const [page, setPage] = useState(initialPage);
  const [heroFilter, setHeroFilter] = useState<number[]>(initialHero);
  const [resultFilter, setResultFilter] = useState<ResultFilter>(initialResult);
  const [modeFilter, setModeFilter] = useState<ModeFilterKey[]>(initialMode);
  const [gameModeFilter, setGameModeFilter] = useState<GameModeKey[]>(initialGameMode);
  const [turboFilter, setTurboFilter] = useState(initialTurbo);
  const [factionFilter, setFactionFilter] = useState<FactionFilter>(initialFaction);
  const [partyFilter, setPartyFilter] = useState<PartyFilter>(initialParty);
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangeFilter>(initialTimeRange);
  const [teammateHeroFilter, setTeammateHeroFilter] = useState<number[]>(initialTeammateHero);
  const [enemyHeroFilter, setEnemyHeroFilter] = useState<number[]>(initialEnemyHero);
  // 0 = any. With teammate/enemy heroes picked, the position applies to
  // those heroes; on its own, to any teammate/enemy.
  const [teammatePosFilter, setTeammatePosFilter] = useState(initialTeammatePos);
  const [enemyPosFilter, setEnemyPosFilter] = useState(initialEnemyPos);
  // How the teammate condition (hero/position) and the enemy condition
  // combine when both are set: both must match ("and") or either ("or").
  const [heroJoin, setHeroJoin] = useState<HeroJoin>(initialHeroJoin);
  const [patchFilter, setPatchFilter] = useState(initialPatch);

  // undefined = still loading, null = loaded but no rank/skill data available
  const [ranks, setRanks] = useState<Record<number, RankBadge | undefined>>({});
  // For estimating positions in matches OpenDota has none for - see
  // positionInMatch() in dota.ts. null until loaded (or if unavailable).
  const [positionPriors, setPositionPriors] = useState<HeroPositionPriors | null>(null);
  const [lanes, setLanes] = useState<Record<number, LaneOutcome | null | undefined>>({});

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  function updateParams(next: {
    page?: number;
    hero?: number[];
    result?: ResultFilter;
    mode?: ModeFilterKey[];
    gameMode?: GameModeKey[];
    turbo?: boolean;
    faction?: FactionFilter;
    party?: PartyFilter;
    time?: TimeRangeFilter;
    teammateHero?: number[];
    enemyHero?: number[];
    teammatePos?: number;
    enemyPos?: number;
    heroJoin?: HeroJoin;
    patch?: number;
  }) {
    const merged = {
      page,
      hero: heroFilter,
      result: resultFilter,
      mode: modeFilter,
      gameMode: gameModeFilter,
      turbo: turboFilter,
      faction: factionFilter,
      party: partyFilter,
      time: timeRangeFilter,
      teammateHero: teammateHeroFilter,
      enemyHero: enemyHeroFilter,
      teammatePos: teammatePosFilter,
      enemyPos: enemyPosFilter,
      heroJoin,
      patch: patchFilter,
      ...next,
    };
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (merged.page <= 1) params.delete("page");
        else params.set("page", String(merged.page));
        if (merged.hero.length === 0) params.delete("hero");
        else params.set("hero", merged.hero.join(","));
        if (merged.result === "all") params.delete("result");
        else params.set("result", merged.result);
        // "" (not deleted) marks a deliberate clear-to-none, distinct from
        // the param being absent (which defaults to Ranked+Unranked - see
        // initialMode above).
        if (merged.mode.length === 0) params.set("mode", "");
        else params.set("mode", merged.mode.join(","));
        if (merged.gameMode.length === 0) params.delete("gm");
        else params.set("gm", merged.gameMode.join(","));
        if (!merged.turbo) params.delete("turbo");
        else params.set("turbo", "1");
        if (merged.faction === "all") params.delete("faction");
        else params.set("faction", merged.faction);
        if (merged.party === "all") params.delete("party");
        else params.set("party", merged.party);
        if (merged.time === "all") params.delete("time");
        else params.set("time", merged.time);
        if (merged.teammateHero.length === 0) params.delete("teamHero");
        else params.set("teamHero", merged.teammateHero.join(","));
        if (merged.enemyHero.length === 0) params.delete("enemyHero");
        else params.set("enemyHero", merged.enemyHero.join(","));
        if (!merged.teammatePos) params.delete("teamPos");
        else params.set("teamPos", String(merged.teammatePos));
        if (!merged.enemyPos) params.delete("enemyPos");
        else params.set("enemyPos", String(merged.enemyPos));
        if (merged.heroJoin === "and") params.delete("heroJoin");
        else params.set("heroJoin", merged.heroJoin);
        if (!merged.patch) params.delete("patch");
        else params.set("patch", String(merged.patch));
        return params;
      },
      { replace: true },
    );
    if (next.page !== undefined) setPage(next.page);
    if (next.hero !== undefined) setHeroFilter(next.hero);
    if (next.result !== undefined) setResultFilter(next.result);
    if (next.mode !== undefined) setModeFilter(next.mode);
    if (next.gameMode !== undefined) setGameModeFilter(next.gameMode);
    if (next.turbo !== undefined) setTurboFilter(next.turbo);
    if (next.faction !== undefined) setFactionFilter(next.faction);
    if (next.party !== undefined) setPartyFilter(next.party);
    if (next.time !== undefined) setTimeRangeFilter(next.time);
    if (next.teammateHero !== undefined) setTeammateHeroFilter(next.teammateHero);
    if (next.enemyHero !== undefined) setEnemyHeroFilter(next.enemyHero);
    if (next.teammatePos !== undefined) setTeammatePosFilter(next.teammatePos);
    if (next.enemyPos !== undefined) setEnemyPosFilter(next.enemyPos);
    if (next.heroJoin !== undefined) setHeroJoin(next.heroJoin);
    if (next.patch !== undefined) setPatchFilter(next.patch);
  }

  // How many of the filters behind "More filters" are set (shown on the
  // toggle so a hidden active filter is never a surprise).
  const moreFiltersActive =
    (teammateHeroFilter.length > 0 ? 1 : 0) +
    (enemyHeroFilter.length > 0 ? 1 : 0) +
    (teammatePosFilter ? 1 : 0) +
    (enemyPosFilter ? 1 : 0) +
    (gameModeFilter.length > 0 ? 1 : 0) +
    (factionFilter !== "all" ? 1 : 0) +
    (partyFilter !== "all" ? 1 : 0) +
    (patchFilter ? 1 : 0);
  const filtersAreDefault =
    moreFiltersActive === 0 &&
    heroFilter.length === 0 &&
    resultFilter === "all" &&
    timeRangeFilter === "all" &&
    !turboFilter &&
    modeFilter.length === DEFAULT_MODE.length &&
    DEFAULT_MODE.every((m) => modeFilter.includes(m));

  function resetFilters() {
    updateParams({
      page: 1,
      hero: [],
      result: "all",
      mode: DEFAULT_MODE,
      gameMode: [],
      turbo: false,
      faction: "all",
      party: "all",
      time: "all",
      teammateHero: [],
      enemyHero: [],
      teammatePos: 0,
      enemyPos: 0,
      heroJoin: "and",
      patch: 0,
    });
  }

  // Shared by the initial load and the "Sync games" button below - the
  // button just doesn't reset everything to null first, so the page stays
  // on the current data instead of flashing back to the loading screen.
  function loadData() {
    getProfile(accountId)
      .then(setProfile)
      .catch(() => setProfile(null));

    Promise.all([getWinLoss(), getMatchIndexForStats()])
      .then(([w, matches]) => {
        setWl(w);
        setAllMatches(matches);
      })
      .catch((e) => setError(errorMessage(e)));

    getMatchExtrasIndex()
      .then(setExtrasIndex)
      .catch(() => setExtrasIndex(null));

    getHeroPositionPriors()
      .then(setPositionPriors)
      .catch(() => setPositionPriors(null));
  }

  useEffect(() => {
    setProfile(undefined);
    setWl(null);
    setError(null);
    setAllMatches(undefined);
    setExtrasIndex(null);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Pulls the account's newest matches live and merges them in right away
  // - see syncRecentMatches() in opendota.ts for why this is needed at all
  // (the data branch/its 5-minute cache TTL can otherwise lag a fresh game
  // by up to 20 minutes).
  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const newCount = await syncRecentMatches(accountId);
      loadData();
      setSyncMessage(newCount > 0 ? `Found ${newCount} new match${newCount === 1 ? "" : "es"}.` : "No new matches.");
    } catch (e) {
      setSyncMessage(errorMessage(e));
    } finally {
      setSyncing(false);
    }
  }

  const heroOptions = useMemo(() => {
    if (!allMatches) return [];
    return Array.from(new Set(allMatches.map((m) => m.hero_id))).sort((a, b) => heroName(a).localeCompare(heroName(b)));
  }, [allMatches]);

  const extrasByMatchId = useMemo(() => {
    if (!extrasIndex) return null;
    return new Map(extrasIndex.map((e) => [e.match_id, e]));
  }, [extrasIndex]);

  // Every hero that's ever shared your side (teammate) or the other side
  // (enemy) across your whole history - only as accurate as the extras
  // index's coverage (all matches, as of this account's last export run).
  const teammateHeroOptions = useMemo(() => {
    if (!allMatches || !extrasByMatchId) return [];
    const ids = new Set<number>();
    for (const m of allMatches) {
      const extra = extrasByMatchId.get(m.match_id);
      if (!extra) continue;
      const mySide = isRadiant(m.player_slot) ? extra.radiant : extra.dire;
      for (const h of mySide) if (h !== m.hero_id) ids.add(h);
    }
    return Array.from(ids).sort((a, b) => heroName(a).localeCompare(heroName(b)));
  }, [allMatches, extrasByMatchId]);

  const enemyHeroOptions = useMemo(() => {
    if (!allMatches || !extrasByMatchId) return [];
    const ids = new Set<number>();
    for (const m of allMatches) {
      const extra = extrasByMatchId.get(m.match_id);
      if (!extra) continue;
      const enemySide = isRadiant(m.player_slot) ? extra.dire : extra.radiant;
      for (const h of enemySide) ids.add(h);
    }
    return Array.from(ids).sort((a, b) => heroName(a).localeCompare(heroName(b)));
  }, [allMatches, extrasByMatchId]);

  const patchOptions = useMemo(() => {
    if (!extrasIndex) return [];
    const ids = new Set<number>();
    for (const e of extrasIndex) if (e.patch != null) ids.add(e.patch);
    return Array.from(ids).sort((a, b) => b - a);
  }, [extrasIndex]);

  const isEventModeActive = modeFilter.includes("event");
  const isNormalModeActive = modeFilter.some((v) => v !== "event");

  // Game Mode options are gated by which Mode chip category is active -
  // event modes (Diretide, Mutation, ...) only appear once "Event" is
  // toggled on, and everything else (All Pick, Turbo, ...) only appears
  // once at least one of Ranked/Unranked/Bot Match is on. With no Mode
  // chip active at all, the dropdown stays empty (just "All Game Modes")
  // rather than listing every mode the account has ever played - picking
  // a specific mode only makes sense once you've narrowed down which
  // category of game you're looking at.
  const gameModeOptions = useMemo(() => {
    if (!allMatches) return [];
    const keys = new Set<GameModeKey>();
    for (const m of allMatches) keys.add(effectiveGameModeKey(m.game_mode, m.start_time));
    const visible = Array.from(keys).filter((k) => (isEventGameModeKey(k) ? isEventModeActive : isNormalModeActive));
    return visible.sort((a, b) => gameModeKeyLabel(a).localeCompare(gameModeKeyLabel(b)));
  }, [allMatches, isEventModeActive, isNormalModeActive]);

  const filtered = useMemo(() => {
    if (!allMatches) return null;
    const cutoff = timeRangeFilter !== "all" ? Date.now() / 1000 - TIME_RANGE_DAYS[timeRangeFilter] * 86400 : null;
    return allMatches.filter((m) => {
      if (heroFilter.length > 0 && !heroFilter.includes(m.hero_id)) return false;
      if (resultFilter !== "all") {
        if (resultFilter === "abandoned") {
          if (!isAbandoned(m.leaver_status)) return false;
        } else {
          const won = matchWon(m);
          if (resultFilter === "win" && !won) return false;
          if (resultFilter === "loss" && won) return false;
        }
      }
      if (modeFilter.length > 0) {
        const matchesMode = modeFilter.some((key) =>
          key === "event" ? isEventGameModeKey(effectiveGameModeKey(m.game_mode, m.start_time)) : m.lobby_type === key,
        );
        if (!matchesMode) return false;
      }
      const effectiveMode = effectiveGameModeKey(m.game_mode, m.start_time);
      if (gameModeFilter.length > 0 && !gameModeFilter.includes(effectiveMode)) return false;
      // Turbo hidden by default (it has its own separate hero stats in
      // Dota itself) - explicitly picking it in the Game Mode filter still
      // shows it regardless of this toggle.
      if (!turboFilter && effectiveMode === 23 && !gameModeFilter.includes(23)) return false;
      if (factionFilter !== "all") {
        const radiant = isRadiant(m.player_slot);
        if (factionFilter === "radiant" && !radiant) return false;
        if (factionFilter === "dire" && radiant) return false;
      }
      if (partyFilter !== "all") {
        const solo = !m.party_size || m.party_size <= 1;
        if (partyFilter === "solo" && !solo) return false;
        if (partyFilter === "party" && solo) return false;
      }
      if (cutoff != null && m.start_time < cutoff) return false;
      const teamCondition = teammateHeroFilter.length > 0 || teammatePosFilter > 0;
      const enemyCondition = enemyHeroFilter.length > 0 || enemyPosFilter > 0;
      if (teamCondition || enemyCondition || patchFilter) {
        const extra = extrasByMatchId?.get(m.match_id);
        if (!extra) return false;
        if (patchFilter && extra.patch !== patchFilter) return false;

        // One side's condition: one of its picked heroes (any hero, if none
        // picked) is on that side - and, with a position picked, played that
        // position (real or estimated, the same positions the table shows).
        const sideMatches = (side: "team" | "enemy"): boolean => {
          const heroes = side === "team" ? teammateHeroFilter : enemyHeroFilter;
          const pos = side === "team" ? teammatePosFilter : enemyPosFilter;
          const onMySide = side === "team";
          if (!pos) {
            const heroIds = isRadiant(m.player_slot) === onMySide ? extra.radiant : extra.dire;
            return heroes.some((h) => (!onMySide || h !== m.hero_id) && heroIds.includes(h));
          }
          const lineup = isRadiant(m.player_slot) === onMySide ? extra.radiant_lineup : extra.dire_lineup;
          if (!lineup) return false;
          const positions = lineupPositions(lineup, positionPriors);
          return lineup.some(
            ([heroId], i) =>
              (!onMySide || heroId !== m.hero_id) &&
              positions[i]?.pos === pos &&
              (heroes.length === 0 || heroes.includes(heroId)),
          );
        };

        if (teamCondition && enemyCondition) {
          const ok = heroJoin === "or" ? sideMatches("team") || sideMatches("enemy") : sideMatches("team") && sideMatches("enemy");
          if (!ok) return false;
        } else if (teamCondition && !sideMatches("team")) {
          return false;
        } else if (enemyCondition && !sideMatches("enemy")) {
          return false;
        }
      }
      return true;
    });
  }, [
    allMatches,
    heroFilter,
    resultFilter,
    modeFilter,
    gameModeFilter,
    turboFilter,
    factionFilter,
    partyFilter,
    timeRangeFilter,
    teammateHeroFilter,
    enemyHeroFilter,
    teammatePosFilter,
    enemyPosFilter,
    heroJoin,
    patchFilter,
    extrasByMatchId,
    positionPriors,
  ]);

  const totalPages = filtered ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : null;
  const clampedPage = totalPages != null ? Math.min(page, totalPages) : page;

  const pageMatches = useMemo(() => {
    if (filtered) return filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
    return null;
  }, [filtered, clampedPage]);

  // Average skill/rank, and this account's own played role, aren't in the
  // lightweight match-list response - only the full match detail has every
  // player's rank_tier/position_est. Fetch each one from the data branch
  // (a match that isn't stored yet just leaves these blank) and fill the
  // columns in as they resolve rather than blocking the table.
  useEffect(() => {
    if (!pageMatches) return;
    setRanks({});
    setLanes({});
    for (const match of pageMatches) {
      getMatch(match.match_id)
        .then((detail) => {
          const tier = matchRankTier(detail.players.map((p) => p.rank_tier));
          const badge: RankBadge =
            tier != null
              ? { label: rankTierLabel(tier), color: rankTierColor(tier) }
              : (() => {
                  const skillLabel = skillBracketLabel(detail.skill);
                  return skillLabel ? { label: skillLabel, color: null } : null;
                })();
          setRanks((prev) => ({ ...prev, [match.match_id]: badge }));

          setLanes((prev) => ({ ...prev, [match.match_id]: laneOutcome(detail, match.player_slot) }));
        })
        .catch(() => {
          setRanks((prev) => ({ ...prev, [match.match_id]: null }));
          setLanes((prev) => ({ ...prev, [match.match_id]: null }));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMatches]);

  if (error) return <div className="error-box">{error}</div>;
  if (profile === undefined || !wl || allMatches === undefined || !pageMatches) return <div className="loading">Loading matches...</div>;

  // The stat row reflects whatever filters are currently applied (the
  // unfiltered all-time wl record is only a fallback for when there's no
  // filtered set to derive it from).
  const isFiltered = Boolean(
    heroFilter.length > 0 ||
      resultFilter !== "all" ||
      modeFilter.length > 0 ||
      gameModeFilter.length > 0 ||
      !turboFilter ||
      factionFilter !== "all" ||
      partyFilter !== "all" ||
      timeRangeFilter !== "all" ||
      teammateHeroFilter.length > 0 ||
      enemyHeroFilter.length > 0 ||
      teammatePosFilter ||
      enemyPosFilter ||
      patchFilter,
  );
  // A personally-abandoned match doesn't reflect a real win or loss (see
  // isAbandoned() in dota.ts), so it's pulled out of both before figuring
  // win rate, rather than counted toward either - it's its own bucket,
  // shown as its own stat tile below instead.
  const filteredAbandonedCount = filtered?.filter((m) => isAbandoned(m.leaver_status)).length ?? 0;
  const filteredScored = filtered?.filter((m) => !isAbandoned(m.leaver_status)) ?? null;
  const filteredWins = filteredScored?.filter(matchWon).length ?? 0;
  const displayWl = filteredScored ? { win: filteredWins, lose: filteredScored.length - filteredWins } : wl;
  const winRate = displayWl.win + displayWl.lose > 0 ? Math.round((100 * displayWl.win) / (displayWl.win + displayWl.lose)) : 0;
  const hasNext = totalPages != null && clampedPage < totalPages;
  const hasPrev = clampedPage > 1;

  return (
    <div>
      <div className="profile-header">
        <div className="profile-header-info">
          {profile?.profile?.avatarfull && <img src={profile.profile.avatarfull} alt="" className="avatar" />}
          <div>
            <h2>{profile?.profile?.personaname ?? `Account ${accountId}`}</h2>
          </div>
        </div>
        <div className="profile-header-sync">
          <button type="button" onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync games"}
          </button>
          {syncMessage && <div className="status-ok small">{syncMessage}</div>}
        </div>
      </div>

      {/* Summary: overall record for the current filters, plus the most
          played heroes within them. */}
      <div className="summary-box">
        <div className="profile-stats">
          <div className="profile-stat">
            <div className="profile-stat-value text-radiant">{displayWl.win}</div>
            <div className="profile-stat-label">Wins</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-value text-dire">{displayWl.lose}</div>
            <div className="profile-stat-label">Losses</div>
          </div>
          <div className="profile-stat profile-stat-winrate">
            <div className="profile-stat-value">{winRate}%</div>
            <div className="profile-stat-bar-track">
              <div className="profile-stat-bar" style={{ width: `${winRate}%` }} />
            </div>
            <div className="profile-stat-label">Win Rate</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-value">{filtered ? filtered.length : displayWl.win + displayWl.lose}</div>
            <div className="profile-stat-label">{isFiltered ? "Filtered Matches" : "Total Matches"}</div>
          </div>
          {filtered && (
            <div className="profile-stat">
              <div className="profile-stat-value text-dim">{filteredAbandonedCount}</div>
              <div className="profile-stat-label">Abandoned</div>
            </div>
          )}
        </div>
        {filtered && <HeroOverview matches={filtered} extras={extrasByMatchId} priors={positionPriors} />}
      </div>

      {allMatches && (
        <div className="filter-panel">
          <div className="filter-grid">
            <div className="filter-field filter-field-wide">
              <span className="filter-label">Queue</span>
              <div className="filter-chip-group">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`filter-chip ${modeFilter.includes(opt.value) ? "filter-chip-active" : ""}`}
                    onClick={() => {
                      const isActive = modeFilter.includes(opt.value);
                      const next = isActive ? modeFilter.filter((v) => v !== opt.value) : [...modeFilter, opt.value];
                      // Toggling off the last chip in a category (Event, or
                      // Ranked/Unranked/Bot Match) while the Game Mode filter
                      // has a selection from that now-hidden category would
                      // leave it stuck on a hidden option - drop just those.
                      const eventStillVisible = next.includes("event");
                      const normalStillVisible = next.some((v) => v !== "event");
                      const nextGameMode = gameModeFilter.filter((gm) => (isEventGameModeKey(gm) ? eventStillVisible : normalStillVisible));
                      const gameModeChanged = nextGameMode.length !== gameModeFilter.length;
                      updateParams(gameModeChanged ? { mode: next, gameMode: nextGameMode, page: 1 } : { mode: next, page: 1 });
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`filter-chip ${turboFilter ? "filter-chip-active" : ""}`}
                  onClick={() => updateParams({ turbo: !turboFilter, page: 1 })}
                >
                  Turbo
                </button>
              </div>
            </div>
            <label className="filter-field">
              <span className="filter-label">Result</span>
              <select value={resultFilter} onChange={(e) => updateParams({ result: e.target.value as ResultFilter, page: 1 })}>
                <option value="all">All</option>
                <option value="win">Wins</option>
                <option value="loss">Losses</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-label">Time</span>
              <select value={timeRangeFilter} onChange={(e) => updateParams({ time: e.target.value as TimeRangeFilter, page: 1 })}>
                <option value="all">All time</option>
                {(Object.keys(TIME_RANGE_LABELS) as Array<keyof typeof TIME_RANGE_LABELS>).map((key) => (
                  <option key={key} value={key}>
                    {TIME_RANGE_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <div className="filter-field">
              <span className="filter-label">Hero</span>
              <HeroMultiSelect
                label="Any hero"
                options={heroOptions}
                selected={heroFilter}
                onChange={(next) => updateParams({ hero: next, page: 1 })}
              />
            </div>
          </div>

          {showMoreFilters && (
            <div className="filter-grid filter-grid-more">
              {extrasByMatchId && (
                <>
                  <div className="filter-field">
                    <span className="filter-label">Teammate hero</span>
                    <HeroMultiSelect
                      label="Any"
                      options={teammateHeroOptions}
                      selected={teammateHeroFilter}
                      onChange={(next) => updateParams({ teammateHero: next, page: 1 })}
                    />
                  </div>
                  <label
                    className="filter-field"
                    title="With teammate heroes picked: one of them played this position. Otherwise: any teammate did."
                  >
                    <span className="filter-label">Teammate position</span>
                    <select value={teammatePosFilter} onChange={(e) => updateParams({ teammatePos: Number(e.target.value), page: 1 })}>
                      <option value={0}>Any</option>
                      {[1, 2, 3, 4, 5].map((pos) => (
                        <option key={pos} value={pos}>
                          {positionLabel(pos)?.replace("Position ", "P")}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(teammateHeroFilter.length > 0 || teammatePosFilter > 0) && (enemyHeroFilter.length > 0 || enemyPosFilter > 0) && (
                    <div className="filter-field">
                      <span className="filter-label">Teammate &amp; enemy</span>
                      <div className="filter-chip-group">
                        {(["and", "or"] as const).map((join) => (
                          <button
                            key={join}
                            type="button"
                            className={`filter-chip ${heroJoin === join ? "filter-chip-active" : ""}`}
                            onClick={() => updateParams({ heroJoin: join, page: 1 })}
                          >
                            {join === "and" ? "Both match" : "Either matches"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="filter-field">
                    <span className="filter-label">Enemy hero</span>
                    <HeroMultiSelect
                      label="Any"
                      options={enemyHeroOptions}
                      selected={enemyHeroFilter}
                      onChange={(next) => updateParams({ enemyHero: next, page: 1 })}
                    />
                  </div>
                  <label
                    className="filter-field"
                    title="With enemy heroes picked: one of them played this position. Otherwise: any enemy did."
                  >
                    <span className="filter-label">Enemy position</span>
                    <select value={enemyPosFilter} onChange={(e) => updateParams({ enemyPos: Number(e.target.value), page: 1 })}>
                      <option value={0}>Any</option>
                      {[1, 2, 3, 4, 5].map((pos) => (
                        <option key={pos} value={pos}>
                          {positionLabel(pos)?.replace("Position ", "P")}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <div className="filter-field">
                <span className="filter-label">Game mode</span>
                <MultiSelect
                  label="Any"
                  options={gameModeOptions.map((key) => ({ value: key, label: gameModeKeyLabel(key) }))}
                  selected={gameModeFilter}
                  onChange={(next) => updateParams({ gameMode: next, page: 1 })}
                />
              </div>
              <label className="filter-field">
                <span className="filter-label">Side</span>
                <select value={factionFilter} onChange={(e) => updateParams({ faction: e.target.value as FactionFilter, page: 1 })}>
                  <option value="all">Either</option>
                  <option value="radiant">Radiant</option>
                  <option value="dire">Dire</option>
                </select>
              </label>
              <label className="filter-field">
                <span className="filter-label">Solo / Party</span>
                <select value={partyFilter} onChange={(e) => updateParams({ party: e.target.value as PartyFilter, page: 1 })}>
                  <option value="all">Either</option>
                  <option value="solo">Solo</option>
                  <option value="party">Party</option>
                </select>
              </label>
              {extrasByMatchId && (
                <label className="filter-field">
                  <span className="filter-label">Patch</span>
                  <select value={patchFilter} onChange={(e) => updateParams({ patch: Number(e.target.value), page: 1 })}>
                    <option value={0}>All</option>
                    {patchOptions.map((id) => (
                      <option key={id} value={id}>
                        {patchLabel(id)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <div className="filter-actions">
            <button type="button" className="filter-more-toggle" onClick={() => setShowMoreFilters((v) => !v)}>
              {showMoreFilters ? "Fewer filters" : "More filters"}
              {moreFiltersActive > 0 && <span className="filter-count">{moreFiltersActive}</span>}
            </button>
            {!filtersAreDefault && (
              <button type="button" className="filter-reset" onClick={resetFilters}>
                Reset
              </button>
            )}
          </div>
        </div>
      )}


      {pageMatches.length === 0 ? (
        <div className="empty-state">No matches match these filters.</div>
      ) : (
        <table className="match-table">
          <thead>
            <tr>
              {/* Full labels, with shorter ones swapped in on narrow screens
                  so the header row isn't what forces the table to scroll.
                  Position / result / lane are self-explanatory badges, so
                  their headers are left blank (screen-reader text only). */}
              <th className="match-row-hero-cell">Hero</th>
              <th className="match-row-pos-cell">
                <span className="sr-only">Position</span>
              </th>
              <th className="match-row-result-cell">
                <span className="sr-only">Result</span>
              </th>
              <th className="match-row-lane-cell">
                <span className="sr-only">Lane outcome</span>
              </th>
              <th className="match-row-spacer" aria-hidden="true" />
              <th className="match-row-kda-cell" title="Kills">K</th>
              <th className="match-row-kda-cell" title="Deaths">D</th>
              <th className="match-row-kda-cell" title="Assists">A</th>
              <th className="match-row-spacer" aria-hidden="true" />
              <th className="match-row-duration-cell">
                <span className="th-long">Duration</span>
                <span className="th-short">Time</span>
              </th>
              <th className="match-row-mode-cell" title="Lobby type, game mode, and average rank">
                <span className="th-long">Type / Mode / Rank</span>
                <span className="th-short">Mode</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageMatches.map((m, i) => {
              const won = matchWon(m);
              const abandoned = isAbandoned(m.leaver_status);
              const role = positionInMatch(m, extrasByMatchId?.get(m.match_id), positionPriors);
              return (
                <tr
                  key={m.match_id}
                  className={`match-row ${won ? "row-win" : "row-loss"} ${abandoned ? "row-abandoned" : ""}`}
                  style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
                >
                  <td className="match-row-hero-cell">
                    {/* Covers the whole row so the entire match is one click
                        target, while still being a real <a> (browser back/
                        forward, open-in-new-tab, keyboard nav all just work) -
                        a <tr> can't be wrapped in an <a> directly. */}
                    <Link
                      to={`/matches/${m.match_id}`}
                      className="match-row-link"
                      aria-label={`${heroName(m.hero_id)} - ${abandoned ? "Abandoned" : won ? "Win" : "Loss"} - ${formatRelativeTime(m.start_time)}`}
                    />
                    <span className="match-row-hero">
                      {heroPortrait(m.hero_id) && (
                        <img src={heroPortrait(m.hero_id)!} alt={heroName(m.hero_id)} className="hero-portrait" loading="lazy" />
                      )}
                      <span className="match-row-hero-name">{heroName(m.hero_id)}</span>
                    </span>
                  </td>
                  <td className="match-row-pos-cell">
                    {role && (
                      <span
                        className={`role-badge${role.estimated ? " role-badge-estimated" : ""}`}
                        title={
                          role.estimated
                            ? `${positionLabel(role.pos)} (estimated from hero and farm - OpenDota has no position for this match)`
                            : (positionLabel(role.pos) ?? undefined)
                        }
                      >
                        {positionShort(role.pos)}
                      </span>
                    )}
                  </td>
                  <td className="match-row-result-cell">
                    <span className="result-badge" title={abandoned ? "Abandoned" : undefined}>
                      {abandoned ? "✕" : won ? "W" : "L"}
                    </span>
                  </td>
                  <td className="match-row-lane-cell">
                    {/* An arrow rather than W/L letters, so it can't be
                        mistaken for the match result next to it. */}
                    {lanes[m.match_id] && (
                      <span
                        className={`lane-arrow lane-${lanes[m.match_id]}`}
                        title={laneOutcomeLabel(lanes[m.match_id]) ?? undefined}
                        aria-label={laneOutcomeLabel(lanes[m.match_id]) ?? undefined}
                        role="img"
                      >
                        {lanes[m.match_id] === "won" ? "▲" : lanes[m.match_id] === "lost" ? "▼" : "▬"}
                      </span>
                    )}
                  </td>
                  <td className="match-row-spacer" aria-hidden="true" />
                  <td className="match-row-kda-cell">{m.kills}</td>
                  <td className="match-row-kda-cell">{m.deaths}</td>
                  <td className="match-row-kda-cell">{m.assists}</td>
                  <td className="match-row-spacer" aria-hidden="true" />
                  <td className="match-row-duration-cell">
                    <div className="match-row-stacked">
                      <span>{formatDuration(m.duration)}</span>
                      <span className="text-dim small">{formatRelativeTime(m.start_time)}</span>
                    </div>
                  </td>
                  <td className="match-row-mode-cell">
                    <div className="match-row-stacked">
                      <span>{matchLobbyLabel(m.lobby_type, m.game_mode, m.start_time)}</span>
                      <span className="text-dim small">{matchGameModeLabel(m.game_mode, m.start_time)}</span>
                      <span className="small" style={{ color: ranks[m.match_id]?.color ?? "var(--text-dim)" }}>
                        {ranks[m.match_id] === undefined ? "…" : (ranks[m.match_id] ? ranks[m.match_id]!.label : "-")}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {allMatches && (
        <div className="pagination">
          <button onClick={() => updateParams({ page: 1 })} disabled={!hasPrev}>
            First
          </button>
          <button onClick={() => updateParams({ page: clampedPage - 1 })} disabled={!hasPrev}>
            Prev
          </button>
          <span className="pagination-page">{totalPages != null ? `Page ${clampedPage} of ${totalPages}` : `Page ${clampedPage}`}</span>
          <button onClick={() => updateParams({ page: clampedPage + 1 })} disabled={!hasNext}>
            Next
          </button>
          <button onClick={() => totalPages != null && updateParams({ page: totalPages })} disabled={totalPages == null || clampedPage === totalPages}>
            Last
          </button>
        </div>
      )}
    </div>
  );
}
