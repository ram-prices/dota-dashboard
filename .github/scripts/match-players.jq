# One match-players-index.json entry from a full OpenDota match JSON: every
# non-anonymous player as a compact [account_id, is_radiant (1/0), hero_id,
# personaname] tuple. Backs the dashboard's Teammates / player-vs pages, so
# they're computed from our own data instead of OpenDota's /peers endpoint.
# Kept separate from match-extras-index.json (and in tuple form) because
# it's several times larger, and only those two pages need it.
# 4294967295 is how OpenDota marks an anonymous (private profile) player.
{
  match_id,
  players: [
    .players[]?
    | select(.account_id != null and .account_id != 4294967295)
    | [.account_id, (if (.player_slot // 0) < 128 then 1 else 0 end), .hero_id, .personaname]
  ]
}
