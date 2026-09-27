# One match-extras-index.json entry from a full OpenDota match JSON: fields
# that only live on the full match detail, not the lightweight
# matches-index.json summary. Shared by export-matches.yml (full rebuild)
# and request-parse.yml (incremental).
#   radiant / dire: each side's hero picks (for the teammate/enemy hero filters)
#   patch: OpenDota's patch index
#   radiant_lineup / dire_lineup: every player on that side, in slot order,
#     as [hero_id, gold_per_min, position_est or null] - enough for the site
#     to show (or, when OpenDota has none, estimate) each player's position
#     without downloading every full match file.
{
  match_id,
  radiant: ([.players[]? | select((.player_slot // 0) < 128) | .hero_id] | map(select(. != null))),
  dire: ([.players[]? | select((.player_slot // 0) >= 128) | .hero_id] | map(select(. != null))),
  patch,
  radiant_lineup: [.players[]? | select((.player_slot // 0) < 128) | [.hero_id, (.gold_per_min // 0), .position_est]],
  dire_lineup: [.players[]? | select((.player_slot // 0) >= 128) | [.hero_id, (.gold_per_min // 0), .position_est]]
}
