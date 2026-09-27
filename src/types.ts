export interface PlayerProfile {
  profile: {
    account_id: number;
    personaname: string;
    name: string | null;
    avatarfull: string;
    loccountrycode: string | null;
  };
  rank_tier: number | null;
  leaderboard_rank: number | null;
  mmr_estimate?: { estimate?: number };
}

export interface WinLoss {
  win: number;
  lose: number;
}

export interface MatchSummary {
  match_id: number;
  player_slot: number;
  radiant_win: boolean;
  duration: number;
  game_mode: number;
  lobby_type: number;
  hero_id: number;
  start_time: number;
  kills: number;
  deaths: number;
  assists: number;
  xp_per_min: number;
  gold_per_min: number;
  hero_damage?: number;
  tower_damage?: number;
  last_hits?: number;
  lane_role?: number;
  party_size?: number | null;
  leaver_status?: number | null;
}

// A few fields that only exist on a match's full detail, not the
// lightweight MatchSummary above - see match-extras-index.json's README
// entry on the data branch.
export interface MatchExtras {
  match_id: number;
  radiant: number[];
  dire: number[];
  patch?: number;
}

// One match-players-index.json entry (see .github/scripts/match-players.jq):
// every non-anonymous player as [account_id, is_radiant (1/0), hero_id,
// personaname].
export type MatchPlayerTuple = [accountId: number, radiant: 0 | 1, heroId: number, personaname: string | null];
export interface MatchPlayersEntry {
  match_id: number;
  players: MatchPlayerTuple[];
}

export interface HeroStat {
  hero_id: number;
  last_played: number;
  games: number;
  win: number;
  with_games: number;
  with_win: number;
  against_games: number;
  against_win: number;
}

export interface PeerStat {
  account_id: number;
  personaname: string | null;
  avatar: string | null;
  last_played: number;
  win: number;
  games: number;
  with_win: number;
  with_games: number;
  against_win?: number;
  against_games?: number;
}

export interface LogEntry {
  time: number;
  key: string;
  x?: number;
  y?: number;
}

export interface ChatEntry {
  time: number;
  type: "chat" | "chatwheel" | string;
  key: string;
  player_slot?: number;
  unit?: string;
}

export interface MatchPlayer {
  account_id: number | null;
  player_slot: number;
  hero_id: number;
  personaname: string | null;
  isRadiant: boolean;
  win: number;
  rank_tier?: number | null;
  kills: number;
  deaths: number;
  assists: number;
  last_hits: number;
  denies: number;
  gold_per_min: number;
  xp_per_min: number;
  level: number;
  net_worth: number | null;
  hero_damage: number | null;
  tower_damage: number | null;
  hero_healing: number | null;
  item_0: number;
  item_1: number;
  item_2: number;
  item_3: number;
  item_4: number;
  item_5: number;
  backpack_0?: number;
  backpack_1?: number;
  backpack_2?: number;
  item_neutral?: number;
  aghanims_scepter?: number;
  aghanims_shard?: number;
  ability_upgrades_arr?: number[];
  gold_t?: number[];
  xp_t?: number[];
  networth_t?: number[];
  lh_t?: number[];
  dn_t?: number[];
  purchase_log?: LogEntry[];
  kills_log?: LogEntry[];
  runes_log?: LogEntry[];
  buyback_log?: LogEntry[];
  obs_log?: LogEntry[];
  sen_log?: LogEntry[];
  obs_placed?: number;
  sen_placed?: number;
  observer_kills?: number;
  sentry_kills?: number;
  pings?: number;
  actions?: Record<string, number>;
  stuns?: number;
  damage?: Record<string, number>;
  damage_taken?: Record<string, number>;
  killed?: Record<string, number>;
  killed_by?: Record<string, number>;
  item_uses?: Record<string, number>;
  lane_role?: number;
  is_roaming?: boolean;
  position_est?: number | null;
  benchmarks?: Record<string, { raw?: number; pct?: number }>;
  // Persistent controllable summons with their own inventory - currently
  // only ever populated for Lone Druid's Spirit Bear.
  additional_units?: AdditionalUnit[];
}

export interface AdditionalUnit {
  unitname: string;
  item_0: number;
  item_1: number;
  item_2: number;
  item_3: number;
  item_4: number;
  item_5: number;
  backpack_0?: number;
  backpack_1?: number;
  backpack_2?: number;
  item_neutral?: number;
  item_neutral2?: number;
}

export interface ObjectiveEntry {
  time: number;
  type: string;
  key?: string;
  slot?: number;
  player_slot?: number;
  team?: number;
  unit?: string;
}

export interface PickBanEntry {
  is_pick: boolean;
  hero_id: number;
  team: number;
  order: number;
  player_slot?: number;
}

export interface TeamfightPlayer {
  deaths: number;
  damage: number;
  healing: number;
  gold_delta: number;
  xp_delta: number;
}

export interface Teamfight {
  start: number;
  end: number;
  deaths: number;
  players: TeamfightPlayer[];
}

export interface MatchDetail {
  match_id: number;
  duration: number;
  start_time: number;
  radiant_win: boolean;
  game_mode: number;
  lobby_type: number;
  radiant_score?: number;
  dire_score?: number;
  skill?: number | null;
  radiant_gold_adv?: number[];
  radiant_xp_adv?: number[];
  chat?: ChatEntry[];
  objectives?: ObjectiveEntry[];
  picks_bans?: PickBanEntry[];
  teamfights?: Teamfight[];
  players: MatchPlayer[];
  // Anything else OpenDota includes that we don't have a typed field for
  // (objectives, teamfights, draft_timings, ...) is still present at
  // runtime; the raw-JSON viewer in the UI covers it.
  [key: string]: unknown;
}

export interface ParseRequestStatus {
  jobId?: string;
  queued: boolean;
}
