import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { LogEntry, MatchPlayer } from "../types";
import { formatGameTime, heroIcon, heroName, itemImage, itemName, itemObtainedTime, rankTierColor, rankTierLabel, unitDisplayName } from "../dota";

// obs_placed/sen_placed (Wards) and observer_kills/sentry_kills
// (Destroyed - a ward is a killable unit, so OpenDota counts destroying
// one as a "kill") share the same "obs/sen" display: obs count in
// observer-ward yellow, sentry count in sentry-ward blue.
function WardStat({ obs, sen, bestObs, bestSen }: { obs: number; sen: number; bestObs: boolean; bestSen: boolean }) {
  return (
    <span className="ward-stat">
      <span className={`ward-obs${bestObs ? " stat-best" : ""}`}>{obs}</span>
      <span className="ward-stat-sep">/</span>
      <span className={`ward-sen${bestSen ? " stat-best" : ""}`}>{sen}</span>
    </span>
  );
}

// Every stat the scoreboard can underline as the best in the match, and how
// to read it off a player. Deaths is the one where lower is better.
const BEST_STATS = {
  level: (p: MatchPlayer) => p.level,
  kills: (p: MatchPlayer) => p.kills,
  deaths: (p: MatchPlayer) => p.deaths,
  assists: (p: MatchPlayer) => p.assists,
  netWorth: (p: MatchPlayer) => p.net_worth,
  obsPlaced: (p: MatchPlayer) => p.obs_placed ?? 0,
  senPlaced: (p: MatchPlayer) => p.sen_placed ?? 0,
  obsKilled: (p: MatchPlayer) => p.observer_kills ?? 0,
  senKilled: (p: MatchPlayer) => p.sentry_kills ?? 0,
  lastHits: (p: MatchPlayer) => p.last_hits,
  denies: (p: MatchPlayer) => p.denies,
  gpm: (p: MatchPlayer) => p.gold_per_min,
  xpm: (p: MatchPlayer) => p.xp_per_min,
  heroDamage: (p: MatchPlayer) => p.hero_damage,
  heroHealing: (p: MatchPlayer) => p.hero_healing,
  towerDamage: (p: MatchPlayer) => p.tower_damage,
} satisfies Record<string, (p: MatchPlayer) => number | null | undefined>;
export type BestStats = Partial<Record<keyof typeof BEST_STATS, number>>;

// The best value of each stat across all ten players (both teams): highest,
// except fewest deaths. A stat nobody scored in (best is 0 - e.g. no one
// did tower damage) has no best, so a column of zeros isn't underlined.
export function bestStats(players: MatchPlayer[]): BestStats {
  const best: BestStats = {};
  for (const [key, read] of Object.entries(BEST_STATS) as [keyof typeof BEST_STATS, (p: MatchPlayer) => number | null | undefined][]) {
    const values = players.map(read).filter((v): v is number => typeof v === "number");
    if (values.length === 0) continue;
    if (key === "deaths") {
      best[key] = Math.min(...values);
    } else {
      const max = Math.max(...values);
      if (max > 0) best[key] = max;
    }
  }
  return best;
}

// Inventory in the order the items were acquired (earliest first) rather
// than slot order. Items with no purchase-log time (unparsed match, or not
// bought - e.g. picked up) keep their slot order after the timed ones, and
// the neutral item always stays last since it's its own slot.
function itemIdsFor(
  entity: { item_0: number; item_1: number; item_2: number; item_3: number; item_4: number; item_5: number; item_neutral?: number },
  purchaseLog: LogEntry[] | undefined,
): number[] {
  const main = [entity.item_0, entity.item_1, entity.item_2, entity.item_3, entity.item_4, entity.item_5]
    .filter((id): id is number => Boolean(id))
    .map((id, slot) => ({ id, slot, time: itemObtainedTime(id, purchaseLog) }))
    .sort((a, b) => {
      if (a.time == null || b.time == null) return a.time == null ? (b.time == null ? a.slot - b.slot : 1) : -1;
      return a.time - b.time || a.slot - b.slot;
    })
    .map((x) => x.id);
  return entity.item_neutral ? [...main, entity.item_neutral] : main;
}

// Normally just the hero's own items, but a player with a persistent
// controllable summon that carries its own inventory (currently only
// Lone Druid's Spirit Bear) gets a second line stacked underneath for the
// summon's items - rather than a whole separate row, since there's no
// other bear-specific stat (kills/damage/etc) to justify one; OpenDota
// folds the whole "unit complex"'s performance into the hero's own row.
// Bear purchases are still logged under the hero's own purchase_log, so
// the same lookup works for both lines.
function ItemGroups({ player }: { player: MatchPlayer }) {
  const groups = [
    { key: "self", label: undefined as string | undefined, ids: itemIdsFor(player, player.purchase_log) },
    ...(player.additional_units ?? []).map((unit) => ({
      key: unit.unitname,
      label: unitDisplayName(unit.unitname),
      ids: itemIdsFor(unit, player.purchase_log),
    })),
  ];

  return (
    <div className="item-row">
      {groups.map((group) => (
        <div className="item-row-group" key={group.key} title={group.label ? `${group.label} inventory` : undefined}>
          {group.ids.map((id, idx) => {
            const img = itemImage(id);
            if (!img) return null;
            const time = itemObtainedTime(id, player.purchase_log);
            const title = group.label ? `${group.label}: ${itemName(id)}` : itemName(id);
            return (
              <span className="item-with-time" key={idx}>
                <img src={img} alt={itemName(id)} title={title} className="item-icon" />
                <span className="item-time">{time != null ? formatGameTime(time) : ""}</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Shared between the scoreboards that should scroll together - see the
// effect in Scoreboard below.
export interface ScrollGroup {
  members: Set<HTMLElement>;
  echoes: Set<HTMLElement>;
}

export function Scoreboard({
  players,
  teamLabel,
  className,
  scrollGroup,
  best = {},
}: {
  players: MatchPlayer[];
  teamLabel: string;
  className: string;
  scrollGroup?: ScrollGroup;
  // From bestStats() over the whole match - values equal to these get underlined.
  best?: BestStats;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const mark = (key: keyof typeof BEST_STATS, value: number | null | undefined) =>
    value != null && best[key] === value ? "stat-best" : undefined;
  const cell = (key: keyof typeof BEST_STATS, value: number | null | undefined) => (
    <span className={mark(key, value)}>{value ?? "-"}</span>
  );

  // Keeps both teams' scoreboards horizontally scrolled to the same spot:
  // scrolling either one scrolls the other by the same amount, live.
  // Programmatic scrolls are marked in `echoes` so the other table's
  // resulting scroll event isn't mirrored straight back (which would
  // fight the user's own scroll whenever one table can't scroll as far).
  useEffect(() => {
    const el = tableRef.current;
    if (!el || !scrollGroup) return;
    scrollGroup.members.add(el);
    const onScroll = () => {
      if (scrollGroup.echoes.delete(el)) return;
      for (const other of scrollGroup.members) {
        if (other === el || other.scrollLeft === el.scrollLeft) continue;
        scrollGroup.echoes.add(other);
        other.scrollLeft = el.scrollLeft;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      scrollGroup.members.delete(el);
      scrollGroup.echoes.delete(el);
    };
  }, [scrollGroup]);

  return (
    <table className={`scoreboard ${className}`} ref={tableRef}>
      <thead>
        <tr>
          <th colSpan={2}>{teamLabel}</th>
          <th>Lvl</th>
          <th className="scoreboard-kda-cell">K</th>
          <th className="scoreboard-kda-cell">D</th>
          <th className="scoreboard-kda-cell">A</th>
          <th>NW</th>
          <th className="scoreboard-items-cell">Items</th>
          <th>Wards</th>
          <th>Destroyed</th>
          <th>LH</th>
          <th>DN</th>
          <th>GPM</th>
          <th>XPM</th>
          <th>HD</th>
          <th>HL</th>
          <th>TD</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => {
          return (
            <tr key={p.player_slot}>
              <td className="hero-icon-cell">{heroIcon(p.hero_id) && <img src={heroIcon(p.hero_id)!} alt="" className="hero-icon" />}</td>
              <td className="hero-name-cell">
                <div title={heroName(p.hero_id)}>{heroName(p.hero_id)}</div>
                {(p.personaname || p.rank_tier) && (
                  <div className="player-meta text-dim small">
                    {p.personaname && (
                      <div className="player-name" title={p.personaname}>
                        {p.account_id ? <Link to={`/vs/${p.account_id}`}>{p.personaname}</Link> : p.personaname}
                      </div>
                    )}
                    {/* Own line rather than inline after the name - always
                        rendered (blank when there's no rank) so every
                        row's height stays the same regardless of whether
                        that particular player has a visible rank. */}
                    <div className="player-rank">
                      {p.rank_tier ? (
                        <span style={{ color: rankTierColor(p.rank_tier) ?? undefined }}>{rankTierLabel(p.rank_tier)}</span>
                      ) : (
                        " "
                      )}
                    </div>
                  </div>
                )}
              </td>
              <td>{cell("level", p.level)}</td>
              <td className="scoreboard-kda-cell">{cell("kills", p.kills)}</td>
              <td className="scoreboard-kda-cell">{cell("deaths", p.deaths)}</td>
              <td className="scoreboard-kda-cell">{cell("assists", p.assists)}</td>
              <td>{cell("netWorth", p.net_worth)}</td>
              <td className="scoreboard-items-cell">
                <ItemGroups player={p} />
              </td>
              <td>
                <WardStat
                  obs={p.obs_placed ?? 0}
                  sen={p.sen_placed ?? 0}
                  bestObs={Boolean(mark("obsPlaced", p.obs_placed ?? 0))}
                  bestSen={Boolean(mark("senPlaced", p.sen_placed ?? 0))}
                />
              </td>
              <td>
                <WardStat
                  obs={p.observer_kills ?? 0}
                  sen={p.sentry_kills ?? 0}
                  bestObs={Boolean(mark("obsKilled", p.observer_kills ?? 0))}
                  bestSen={Boolean(mark("senKilled", p.sentry_kills ?? 0))}
                />
              </td>
              <td>{cell("lastHits", p.last_hits)}</td>
              <td>{cell("denies", p.denies)}</td>
              <td>{cell("gpm", p.gold_per_min)}</td>
              <td>{cell("xpm", p.xp_per_min)}</td>
              <td>{cell("heroDamage", p.hero_damage)}</td>
              <td>{cell("heroHealing", p.hero_healing)}</td>
              <td>{cell("towerDamage", p.tower_damage)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
