import { Link } from "react-router-dom";
import { heroName, heroPortrait, isAbandoned, isRadiant, positionInMatch, positionLabel } from "../dota";
import type { HeroPositionPriors, MatchExtras, MatchSummary } from "../types";

const TOP_N = 5;
const POSITIONS = [1, 2, 3, 4, 5] as const;
// The pastel palette from styles.css (--pastel-*), one per position
const POSITION_COLORS: Record<number, string> = {
  1: "var(--pastel-peach)",
  2: "var(--pastel-butter)",
  3: "var(--pastel-rose)",
  4: "var(--pastel-sky)",
  5: "var(--pastel-lavender)",
};

interface HeroRow {
  heroId: number;
  games: number;
  wins: number;
  // games that count toward win rate (abandons are neither a win nor a loss)
  decided: number;
  kills: number;
  deaths: number;
  assists: number;
  // games at each position (OpenDota's own, or estimated when it has none)
  positions: Record<number, number>;
  estimatedPositions: number;
}

// "Most played heroes" over whatever match list it's given - the Matches
// tab passes its filtered list, so this follows the filters. Positions come
// from match-extras-index.json's lineups, estimated where OpenDota has none
// (see positionInMatch() in dota.ts).
export function HeroOverview({
  matches,
  extras,
  priors,
  showMoreLink = true,
}: {
  matches: MatchSummary[];
  extras: Map<number, MatchExtras> | null;
  priors: HeroPositionPriors | null;
  showMoreLink?: boolean;
}) {
  const byHero = new Map<number, HeroRow>();
  for (const m of matches) {
    let row = byHero.get(m.hero_id);
    if (!row) {
      row = { heroId: m.hero_id, games: 0, wins: 0, decided: 0, kills: 0, deaths: 0, assists: 0, positions: {}, estimatedPositions: 0 };
      byHero.set(m.hero_id, row);
    }
    row.games++;
    if (!isAbandoned(m.leaver_status)) {
      row.decided++;
      if (isRadiant(m.player_slot) === m.radiant_win) row.wins++;
    }
    row.kills += m.kills;
    row.deaths += m.deaths;
    row.assists += m.assists;
    const played = positionInMatch(m, extras?.get(m.match_id), priors);
    if (played) {
      row.positions[played.pos] = (row.positions[played.pos] ?? 0) + 1;
      if (played.estimated) row.estimatedPositions++;
    }
  }
  const rows = [...byHero.values()].sort((a, b) => b.games - a.games).slice(0, TOP_N);
  if (rows.length === 0) return null;

  return (
    <div className="hero-overview">
      <div className="hero-overview-header">
        <span className="filter-label">Most played heroes</span>
        {showMoreLink && <Link to="/heroes">All heroes</Link>}
      </div>
      <div className="hero-overview-grid">
        {rows.map((r) => (
          <HeroTile key={r.heroId} row={r} />
        ))}
      </div>
    </div>
  );
}

function HeroTile({ row: r }: { row: HeroRow }) {
  const winRate = r.decided > 0 ? Math.round((100 * r.wins) / r.decided) : null;
  const kda = r.deaths > 0 ? (r.kills + r.assists) / r.deaths : r.kills + r.assists;
  const positionGames = POSITIONS.reduce((sum, pos) => sum + (r.positions[pos] ?? 0), 0);
  const mainPosition = positionGames > 0 ? POSITIONS.reduce((a, b) => ((r.positions[b] ?? 0) > (r.positions[a] ?? 0) ? b : a)) : null;
  const portrait = heroPortrait(r.heroId);

  return (
    <div className="hero-tile">
      <div className="hero-tile-name">
        {portrait && <img src={portrait} alt="" className="hero-portrait" loading="lazy" />}
        <span>{heroName(r.heroId)}</span>
      </div>
      <div className="hero-tile-stats">
        <span>
          <strong>{r.games}</strong> {r.games === 1 ? "game" : "games"}
        </span>
        {winRate != null && (
          <span className={winRate >= 50 ? "text-radiant" : "text-dire"}>
            <strong>{winRate}%</strong>
          </span>
        )}
        <span>
          <strong>{kda.toFixed(1)}</strong> KDA
        </span>
      </div>
      {mainPosition != null && (
        <div
          className="hero-tile-positions"
          title={
            POSITIONS.filter((pos) => r.positions[pos])
              .map((pos) => `P${pos}: ${r.positions[pos]}`)
              .join(" · ") + (r.estimatedPositions > 0 ? ` (${r.estimatedPositions} of ${positionGames} estimated)` : "")
          }
        >
          <div className="hero-tile-position-track">
            {POSITIONS.filter((pos) => r.positions[pos]).map((pos) => (
              <div
                key={pos}
                className="hero-tile-position-segment"
                style={{ width: `${(100 * r.positions[pos]) / positionGames}%`, background: POSITION_COLORS[pos] }}
              />
            ))}
          </div>
          <span className="hero-tile-position-label">
            Mostly {positionLabel(mainPosition)?.replace("Position ", "P")}
          </span>
        </div>
      )}
    </div>
  );
}
