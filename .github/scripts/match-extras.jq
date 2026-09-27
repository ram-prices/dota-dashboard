# One match-extras-index.json entry from a full OpenDota match JSON: each
# side's hero picks and the patch index - fields that only live on the full
# match detail, not the lightweight matches-index.json summary. Shared by
# export-matches.yml (full rebuild) and request-parse.yml (incremental).
{
  match_id,
  radiant: ([.players[]? | select((.player_slot // 0) < 128) | .hero_id] | map(select(. != null))),
  dire: ([.players[]? | select((.player_slot // 0) >= 128) | .hero_id] | map(select(. != null))),
  patch
}
