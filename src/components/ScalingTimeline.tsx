import { useState } from "react";
import { formatGameTime, heroIcon, heroName, heroNameByUnit, itemByKey, itemName } from "../dota";
import type { MatchDetail, MatchPlayer } from "../types";

// Horizontal scale: pixels per game minute. Long games just scroll further.
const PX_PER_MIN = 26;
// Where the timeline starts - early enough to show starting-item purchases
// and pre-horn kills (both can happen before 0:00).
const START_SECONDS = -90;
const ITEM_SIZE = 18;
const ITEM_LANES = 3;
const BAR_AREA = 34;
// Sticky hero/player column - kept in sync with .scaling-label in styles.css.
const LABEL_WIDTH = 170;

// Bought constantly and gone soon after - they'd bury the actual build.
const CONSUMABLES = new Set([
  "tango",
  "tango_single",
  "flask",
  "clarity",
  "enchanted_mango",
  "faerie_fire",
  "tpscroll",
  "ward_observer",
  "ward_sentry",
  "ward_dispenser",
  "smoke_of_deceit",
  "dust",
  "blood_grenade",
  "tome_of_knowledge",
  "famango",
  "great_famango",
  "greater_famango",
  "cheese",
  "aegis",
  "bottle_refill",
]);

function x(seconds: number): number {
  return ((seconds - START_SECONDS) / 60) * PX_PER_MIN;
}

// "npc_dota_hero_axe" -> "Axe"; non-hero killers (creeps, towers, Roshan) ->
// a readable version of their unit name.
function unitLabel(unit: string): string {
  const hero = heroNameByUnit(unit);
  if (hero !== unit) return hero;
  return unit
    .replace(/^npc_dota_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Net worth gained in each minute, from the per-minute net worth samples
// (falls back to gold when a match has no net worth series).
function perMinuteGain(p: MatchPlayer): number[] {
  const series = p.networth_t?.length ? p.networth_t : (p.gold_t ?? []);
  return series.slice(1).map((v, i) => Math.max(0, v - series[i]));
}

interface PlacedItem {
  key: string;
  time: number;
  lane: number;
}

// Items placed left to right, each dropped into the first of a few stacked
// lanes where it won't overlap the previous icon - so items bought close
// together stack instead of covering each other.
function placeItems(purchases: { key: string; time: number }[]): PlacedItem[] {
  const laneEnds = new Array(ITEM_LANES).fill(-Infinity) as number[];
  const placed: PlacedItem[] = [];
  for (const p of purchases) {
    const left = x(p.time) - ITEM_SIZE / 2;
    let lane = laneEnds.findIndex((end) => left >= end + 1);
    if (lane < 0) lane = laneEnds.indexOf(Math.min(...laneEnds)); // all full: least-crowded lane
    laneEnds[lane] = left + ITEM_SIZE;
    placed.push({ ...p, lane });
  }
  return placed;
}

export function ScalingTimeline({ match, players }: { match: MatchDetail; players: MatchPlayer[] }) {
  const [finalOnly, setFinalOnly] = useState(false);

  const hasData = players.some((p) => p.purchase_log?.length || p.networth_t?.length || p.gold_t?.length);
  if (!hasData) {
    return <div className="empty-state">This match hasn't been parsed, so there's no timeline data for it.</div>;
  }

  const gains = new Map(players.map((p) => [p.player_slot, perMinuteGain(p)]));
  // One scale for everyone, so bar heights compare across players.
  const maxGain = Math.max(1, ...[...gains.values()].flat());
  const endSeconds = Math.max(match.duration, ...players.flatMap((p) => (p.purchase_log ?? []).map((e) => e.time)));
  const width = x(endSeconds) + 16;
  const ticks: number[] = [];
  for (let m = 0; m * 60 <= endSeconds; m += 5) ticks.push(m);

  return (
    <div className="scaling">
      <div className="scaling-controls">
        <label className="scaling-toggle">
          <input type="checkbox" checked={finalOnly} onChange={(e) => setFinalOnly(e.target.checked)} />
          Final items only
        </label>
        <span className="scaling-legend">
          <span className="scaling-kill">▲</span> kill · <span className="scaling-death">✕</span> death · bars = net worth
          gained per minute
        </span>
      </div>

      <div className="scaling-scroll">
        <div className="scaling-grid" style={{ width: width + LABEL_WIDTH }}>
          <div className="scaling-row-wrap scaling-axis-row">
            <div className="scaling-label" />
            <div className="scaling-axis" style={{ width }}>
              {ticks.map((m) => (
                <span key={m} className="scaling-tick" style={{ left: x(m * 60) }}>
                  {m}:00
                </span>
              ))}
            </div>
          </div>

          {players.map((p) => {
            const radiantSide = p.player_slot < 128;
            const finalKeys = new Set(
              [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5, p.backpack_0, p.backpack_1, p.backpack_2, p.item_neutral]
                .filter(Boolean)
                .map((id) => itemName(id)),
            );
            const purchases = (p.purchase_log ?? [])
              .filter((e) => !CONSUMABLES.has(e.key) && !e.key.startsWith("recipe_"))
              .filter((e) => !finalOnly || finalKeys.has(itemByKey(e.key).name))
              .sort((a, b) => a.time - b.time);
            const items = placeItems(purchases);
            const gain = gains.get(p.player_slot) ?? [];

            return (
              <div className="scaling-row-wrap" key={p.player_slot}>
                <div className={`scaling-label ${radiantSide ? "team-radiant" : "team-dire"}`}>
                  {heroIcon(p.hero_id) && <img src={heroIcon(p.hero_id)!} alt="" className="hero-icon" />}
                  <div className="scaling-label-text">
                    <div>{heroName(p.hero_id)}</div>
                    {p.personaname && <div className="text-dim small">{p.personaname}</div>}
                  </div>
                </div>
                <div className="scaling-track" style={{ width }}>
                  {ticks.map((m) => (
                    <span key={m} className="scaling-gridline" style={{ left: x(m * 60) }} />
                  ))}

                  {gain.map((g, minute) => (
                    <span
                      key={minute}
                      className={`scaling-bar ${radiantSide ? "scaling-bar-radiant" : "scaling-bar-dire"}`}
                      style={{
                        left: x(minute * 60) + 2,
                        width: PX_PER_MIN - 4,
                        height: Math.max(1, (g / maxGain) * BAR_AREA),
                      }}
                      title={`${minute}:00-${minute + 1}:00: +${g.toLocaleString()} net worth`}
                    />
                  ))}

                  {items.map((it, i) => {
                    const info = itemByKey(it.key);
                    return info.img ? (
                      <img
                        key={i}
                        src={info.img}
                        alt={info.name}
                        title={`${info.name} - ${formatGameTime(it.time)}`}
                        className="scaling-item"
                        style={{ left: x(it.time) - ITEM_SIZE / 2, top: 14 + it.lane * 14 }}
                        loading="lazy"
                      />
                    ) : null;
                  })}

                  {(p.kills_log ?? []).map((k, i) => (
                    <span
                      key={`k${i}`}
                      className="scaling-marker scaling-kill"
                      style={{ left: x(k.time) }}
                      title={`Killed ${unitLabel(k.key)} - ${formatGameTime(k.time)}`}
                    >
                      ▲
                    </span>
                  ))}
                  {(p.deaths_log ?? []).map((d, i) => (
                    <span
                      key={`d${i}`}
                      className="scaling-marker scaling-death"
                      style={{ left: x(d.time) }}
                      title={`Killed by ${unitLabel(d.key)} - ${formatGameTime(d.time)}`}
                    >
                      ✕
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
