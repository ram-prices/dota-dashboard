import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, getMatches } from "../opendota";
import type { MatchSummary } from "../types";
import { formatDuration, formatRelativeTime, heroIcon, heroName, isRadiant, matchModeLabel } from "../dota";

function weekKey(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const day = (d.getUTCDay() + 6) % 7; // Monday-start week
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - day);
  return monday.toISOString().slice(0, 10);
}

export function Trends({ accountId }: { accountId: number }) {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heroFilter, setHeroFilter] = useState<number | "all">("all");
  const [resultFilter, setResultFilter] = useState<"all" | "win" | "loss">("all");

  useEffect(() => {
    getMatches(100)
      .then(setMatches)
      .catch((e) => setError(errorMessage(e)));
  }, [accountId]);

  const weekly = useMemo(() => {
    if (!matches) return [];
    const buckets = new Map<string, { win: number; total: number }>();
    for (const m of matches) {
      const won = isRadiant(m.player_slot) === m.radiant_win;
      const key = weekKey(m.start_time);
      const bucket = buckets.get(key) ?? { win: 0, total: 0 };
      bucket.total += 1;
      if (won) bucket.win += 1;
      buckets.set(key, bucket);
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [matches]);

  const heroOptions = useMemo(() => {
    if (!matches) return [];
    const ids = [...new Set(matches.map((m) => m.hero_id))];
    return ids.sort((a, b) => heroName(a).localeCompare(heroName(b)));
  }, [matches]);

  const filtered = useMemo(() => {
    if (!matches) return [];
    return matches.filter((m) => {
      if (heroFilter !== "all" && m.hero_id !== heroFilter) return false;
      const won = isRadiant(m.player_slot) === m.radiant_win;
      if (resultFilter === "win" && !won) return false;
      if (resultFilter === "loss" && won) return false;
      return true;
    });
  }, [matches, heroFilter, resultFilter]);

  if (error) return <div className="error-box">{error}</div>;
  if (!matches) return <div className="loading">Loading trends...</div>;

  const maxTotal = Math.max(1, ...weekly.map(([, b]) => b.total));

  return (
    <div>
      <h2>Trends (last {matches.length} matches)</h2>

      <div className="chart">
        <h3>Win rate by week</h3>
        <div className="bar-chart">
          {weekly.map(([week, b]) => {
            const winRate = Math.round((100 * b.win) / b.total);
            return (
              <div className="bar-col" key={week} title={`${week}: ${b.win}/${b.total} (${winRate}%)`}>
                <div className="bar-track" style={{ height: 120 }}>
                  <div
                    className="bar-fill"
                    style={{ height: `${(b.total / maxTotal) * 100}%` }}
                  >
                    <div className="bar-fill-win" style={{ height: `${winRate}%` }} />
                  </div>
                </div>
                <div className="bar-label">{week.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="toolbar">
        <h3>Filtered matches</h3>
        <div>
          <label>
            Hero:{" "}
            <select value={heroFilter} onChange={(e) => setHeroFilter(e.target.value === "all" ? "all" : Number(e.target.value))}>
              <option value="all">All heroes</option>
              {heroOptions.map((id) => (
                <option key={id} value={id}>
                  {heroName(id)}
                </option>
              ))}
            </select>
          </label>{" "}
          <label>
            Result:{" "}
            <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as "all" | "win" | "loss")}>
              <option value="all">All</option>
              <option value="win">Wins only</option>
              <option value="loss">Losses only</option>
            </select>
          </label>
        </div>
      </div>

      <table className="match-list">
        <thead>
          <tr>
            <th>Result</th>
            <th>Hero</th>
            <th>Mode</th>
            <th>K / D / A</th>
            <th>Duration</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((m, i) => {
            const won = isRadiant(m.player_slot) === m.radiant_win;
            return (
              <tr
                key={m.match_id}
                className={won ? "row-win" : "row-loss"}
                style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
              >
                <td className="result-cell">
                  <Link to={`/matches/${m.match_id}`}>{won ? "Win" : "Loss"}</Link>
                </td>
                <td className="hero-cell">
                  {heroIcon(m.hero_id) && <img src={heroIcon(m.hero_id)!} alt="" className="hero-icon" />}
                  {heroName(m.hero_id)}
                </td>
                <td>{matchModeLabel(m.game_mode, m.lobby_type, m.start_time)}</td>
                <td>
                  {m.kills} / {m.deaths} / {m.assists}
                </td>
                <td>{formatDuration(m.duration)}</td>
                <td>{formatRelativeTime(m.start_time)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
