import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, getHeroStats, getMatchIndexForStats } from "../opendota";
import { heroIcon, heroName } from "../dota";

const TOP_N = 5;
// lane_role: 1 Safe, 2 Mid, 3 Off, 4 Jungle - 0 stands in for "unknown"
// (older/unparsed matches don't always have it).
const LANE_ORDER = [1, 2, 3, 4, 0] as const;
const LANE_NAMES: Record<number, string> = {
  0: "Unknown Lane",
  1: "Safe Lane",
  2: "Mid Lane",
  3: "Off Lane",
  4: "Jungle",
};
// The pastel palette from styles.css (--pastel-*)
const LANE_COLORS: Record<number, string> = {
  0: "var(--md-outline)",
  1: "var(--pastel-sky)",
  2: "var(--pastel-butter)",
  3: "var(--pastel-peach)",
  4: "var(--pastel-lavender)",
};

interface HeroRow {
  heroId: number;
  games: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  laneSamples: number;
  lanes: Record<number, number>;
}

export function HeroOverview({ accountId, showMoreLink = true }: { accountId: number; showMoreLink?: boolean }) {
  const [rows, setRows] = useState<HeroRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);

    Promise.all([getHeroStats(), getMatchIndexForStats()])
      .then(([heroStats, index]) => {
        // Matches/win totals, KDA and the lane breakdown all come from
        // the stored match index - already fetched for the Matches tab,
        // so this widget doesn't cost any extra requests.
        const extra = new Map<number, { kills: number; deaths: number; assists: number; lanes: Record<number, number> }>();
        for (const m of index) {
          let e = extra.get(m.hero_id);
          if (!e) {
            e = { kills: 0, deaths: 0, assists: 0, lanes: {} };
            extra.set(m.hero_id, e);
          }
          e.kills += m.kills;
          e.deaths += m.deaths;
          e.assists += m.assists;
          const lane = m.lane_role ?? 0;
          e.lanes[lane] = (e.lanes[lane] ?? 0) + 1;
        }

        const built: HeroRow[] = heroStats
          .filter((h) => h.games > 0)
          .map((h) => {
            const e = extra.get(h.hero_id);
            const lanes = e?.lanes ?? {};
            return {
              heroId: h.hero_id,
              games: h.games,
              win: h.win,
              kills: e?.kills ?? 0,
              deaths: e?.deaths ?? 0,
              assists: e?.assists ?? 0,
              laneSamples: Object.values(lanes).reduce((s, n) => s + n, 0),
              lanes,
            };
          })
          .sort((a, b) => b.games - a.games);

        setRows(built);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [accountId]);

  // Non-critical widget - fail quietly rather than blocking the whole
  // Matches tab over it.
  if (error || (rows && rows.length === 0)) return null;

  return (
    <div className="chart hero-overview">
      <div className="toolbar hero-overview-header">
        <h3>Most Played Heroes</h3>
        {showMoreLink && <Link to="/heroes">+ More</Link>}
      </div>

      {!rows ? <div className="loading">Loading hero stats...</div> : <HeroOverviewList rows={rows.slice(0, TOP_N)} />}
    </div>
  );
}

function heroKda(r: Pick<HeroRow, "kills" | "deaths" | "assists">): number {
  return r.deaths > 0 ? (r.kills + r.assists) / r.deaths : r.kills + r.assists;
}

function HeroOverviewList({ rows }: { rows: HeroRow[] }) {
  const maxGames = Math.max(...rows.map((r) => r.games), 1);
  const maxKda = Math.max(...rows.map(heroKda), 1);

  return (
    <div className="hero-overview-list">
      {rows.map((r) => {
        const winRate = r.games > 0 ? (100 * r.win) / r.games : 0;
        const kda = heroKda(r);
        const topLane = Object.entries(r.lanes).sort((a, b) => b[1] - a[1])[0];
        const topLaneKey = topLane ? Number(topLane[0]) : null;

        return (
          <div className="hero-overview-row" key={r.heroId}>
            <div className="hero-overview-row-header">
              {heroIcon(r.heroId) && <img src={heroIcon(r.heroId)!} alt="" className="hero-icon" />}
              <span>{heroName(r.heroId)}</span>
            </div>

            <div className="hero-overview-stats">
              <div className="hero-overview-stat">
                <div className="hero-overview-value">{r.games}</div>
                <div className="hero-overview-bar-track">
                  <div className="hero-overview-bar hero-overview-bar-matches" style={{ width: `${(100 * r.games) / maxGames}%` }} />
                </div>
                <div className="hero-overview-label">Matches</div>
              </div>
              <div className="hero-overview-stat">
                <div className="hero-overview-value">{winRate.toFixed(1)}%</div>
                <div className="hero-overview-bar-track">
                  <div className="hero-overview-bar hero-overview-bar-winrate" style={{ width: `${winRate}%` }} />
                </div>
                <div className="hero-overview-label">Win %</div>
              </div>
              <div className="hero-overview-stat">
                <div className="hero-overview-value">{r.laneSamples > 0 ? kda.toFixed(2) : "-"}</div>
                <div className="hero-overview-bar-track">
                  <div
                    className="hero-overview-bar hero-overview-bar-kda"
                    style={{ width: r.laneSamples > 0 ? `${(100 * kda) / maxKda}%` : "0%" }}
                  />
                </div>
                <div className="hero-overview-label">KDA</div>
              </div>
            </div>

            {r.laneSamples > 0 && (
              <div className="hero-overview-lane">
                <div className="hero-overview-lane-name">{topLaneKey != null ? LANE_NAMES[topLaneKey] : "-"}</div>
                <div className="hero-overview-lane-track">
                  {LANE_ORDER.filter((l) => r.lanes[l]).map((l) => (
                    <div
                      key={l}
                      className="hero-overview-lane-segment"
                      style={{ width: `${(100 * r.lanes[l]) / r.laneSamples}%`, background: LANE_COLORS[l] }}
                      title={`${LANE_NAMES[l]}: ${r.lanes[l]}`}
                    />
                  ))}
                </div>
                <div className="hero-overview-label">Lane</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
