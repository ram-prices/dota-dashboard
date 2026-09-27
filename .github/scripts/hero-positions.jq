# Per-match rows for hero-positions.json: one [hero_id, gpm_rank, position]
# for every player whose position OpenDota estimated (position_est 1-5),
# where gpm_rank is that player's farm rank on their own team (1 = highest
# gold per minute). export-matches.yml totals these across all stored
# matches into per-hero and per-farm-rank position counts, which the site
# uses to estimate a position for matches that don't have one.
[
  (.players // []) as $players
  | (true, false) as $radiant
  | [$players[] | select(((.player_slot // 0) < 128) == $radiant)] as $team
  | ($team | sort_by(-(.gold_per_min // 0)) | map(.player_slot)) as $ranked_slots
  | $team[]
  | select(.position_est != null and .position_est >= 1 and .position_est <= 5)
  | [.hero_id, (.player_slot as $slot | ($ranked_slots | index($slot)) + 1), .position_est]
]
