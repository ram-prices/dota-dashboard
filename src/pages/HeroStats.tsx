import { useEffect, useState } from "react";
import { errorMessage, getHeroStats } from "../opendota";
import type { HeroStat } from "../types";
import { heroIcon, heroName } from "../dota";
import { HeroOverview } from "../components/HeroOverview";

type SortKey = "games" | "winrate" | "recent";

export function HeroStats({ accountId }: { accountId: number }) {
  const [heroes, setHeroes] = useState<HeroStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("games");

  useEffect(() => {
    getHeroStats()
      .then(setHeroes)
      .catch((e) => setError(errorMessage(e)));
  }, [accountId]);

  if (error) return <div className="error-box">{error}</div>;
  if (!heroes) return <div className="loading">Loading hero stats...</div>;

  const played = heroes.filter((h) => h.games > 0);
  const sorted = [...played].sort((a, b) => {
    if (sortKey === "games") return b.games - a.games;
    if (sortKey === "winrate") return b.win / b.games - a.win / a.games;
    return b.last_played - a.last_played;
  });

  return (
    <div>
      <HeroOverview accountId={accountId} showMoreLink={false} />

      <div className="toolbar">
        <h2>Hero stats</h2>
        <label>
          Sort by:{" "}
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="games">Games played</option>
            <option value="winrate">Win rate</option>
            <option value="recent">Recently played</option>
          </select>
        </label>
      </div>

      <table className="match-list">
        <thead>
          <tr>
            <th>Hero</th>
            <th>Games</th>
            <th>Win Rate</th>
            <th>With teammates</th>
            <th>Against</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => (
            <tr key={h.hero_id}>
              <td className="hero-cell">
                {heroIcon(h.hero_id) && <img src={heroIcon(h.hero_id)!} alt="" className="hero-icon" />}
                {heroName(h.hero_id)}
              </td>
              <td>{h.games}</td>
              <td>{Math.round((100 * h.win) / h.games)}%</td>
              <td>
                {h.with_games > 0 ? `${Math.round((100 * h.with_win) / h.with_games)}% (${h.with_games})` : "-"}
              </td>
              <td>
                {h.against_games > 0 ? `${Math.round((100 * h.against_win) / h.against_games)}% (${h.against_games})` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
