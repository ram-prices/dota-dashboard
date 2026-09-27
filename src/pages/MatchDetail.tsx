import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { errorMessage, fetchMatchLive, getMatch, getParseStatus, isParsedMatch, NotInRepoError, requestParse } from "../opendota";
import type { MatchDetail as MatchDetailType, MatchPlayer } from "../types";
import {
  abilityById,
  formatDuration,
  formatGameTime,
  matchModeLabel,
  matchRankTier,
  heroIcon,
  heroName,
  heroNameByUnit,
  isRadiant,
  itemByKey,
  laneRoleName,
  objectiveLabel,
  rankTierColor,
  rankTierLabel,
  skillBracketLabel,
} from "../dota";
import { Scoreboard, type ScrollGroup } from "../components/Scoreboard";
import { LaneMatchups } from "../components/LaneMatchups";
import { AdvantageChart } from "../components/AdvantageChart";
import { RemainingFields } from "../components/PrettyValue";
import { KeyedStatTable } from "../components/KeyedStatTable";
import { Tabs, type Tab } from "../components/Tabs";

// Fields already given a dedicated view somewhere on this page - everything
// else on a player/match object gets dumped generically in the "Everything
// else" tab, so nothing from OpenDota's response is hidden, even before it
// has a purpose-built view.
const SHOWN_PLAYER_FIELDS = new Set([
  "account_id",
  "player_slot",
  "hero_id",
  "personaname",
  "isRadiant",
  "win",
  "kills",
  "deaths",
  "assists",
  "last_hits",
  "denies",
  "gold_per_min",
  "xp_per_min",
  "level",
  "net_worth",
  "hero_damage",
  "tower_damage",
  "hero_healing",
  "item_0",
  "item_1",
  "item_2",
  "item_3",
  "item_4",
  "item_5",
  "backpack_0",
  "backpack_1",
  "backpack_2",
  "item_neutral",
  "aghanims_scepter",
  "aghanims_shard",
  "ability_upgrades_arr",
  "gold_t",
  "xp_t",
  "lh_t",
  "dn_t",
  "purchase_log",
  "kills_log",
  "runes_log",
  "buyback_log",
  "obs_log",
  "sen_log",
  "pings",
  "actions",
  "stuns",
  "damage",
  "damage_taken",
  "killed",
  "killed_by",
  "item_uses",
  "lane_role",
  "is_roaming",
  "benchmarks",
]);

const SHOWN_MATCH_FIELDS = new Set([
  "match_id",
  "duration",
  "start_time",
  "radiant_win",
  "game_mode",
  "lobby_type",
  "radiant_score",
  "dire_score",
  "radiant_gold_adv",
  "radiant_xp_adv",
  "chat",
  "objectives",
  "picks_bans",
  "teamfights",
  "players",
]);

function csAtMinute(arr: number[] | undefined, minute: number): number | null {
  if (!arr || arr.length === 0) return null;
  return arr[Math.min(minute, arr.length - 1)] ?? null;
}

export function MatchDetail() {
  const { matchId } = useParams();
  const [data, setData] = useState<MatchDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The match isn't in the data branch yet - nothing is fetched from
  // OpenDota unless asked to via the buttons shown for this state.
  const [missing, setMissing] = useState(false);
  const [fetchingLive, setFetchingLive] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestMsg, setRequestMsg] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [chatFilter, setChatFilter] = useState("");
  // The Radiant and Dire scoreboards scroll sideways together.
  const scoreboardScroll = useMemo<ScrollGroup>(() => ({ members: new Set(), echoes: new Set() }), []);

  useEffect(() => {
    if (!matchId) return;
    setData(null);
    setError(null);
    setMissing(false);
    setRequestMsg(null);
    getMatch(Number(matchId))
      .then(setData)
      .catch((e) => {
        if (e instanceof NotInRepoError) setMissing(true);
        else setError(errorMessage(e));
      });
  }, [matchId]);

  const isParsed = Boolean(data && isParsedMatch(data));

  const purchases = useMemo(() => {
    if (!data) return [];
    return data.players
      .flatMap((p) => (p.purchase_log ?? []).map((log) => ({ ...log, player: p })))
      .sort((a, b) => a.time - b.time);
  }, [data]);

  const kills = useMemo(() => {
    if (!data) return [];
    return data.players
      .flatMap((p) => (p.kills_log ?? []).map((log) => ({ ...log, killer: p })))
      .sort((a, b) => a.time - b.time);
  }, [data]);

  const wards = useMemo(() => {
    if (!data) return [];
    return data.players
      .flatMap((p) => [
        ...(p.obs_log ?? []).map((log) => ({ ...log, player: p, kind: "Observer" as const })),
        ...(p.sen_log ?? []).map((log) => ({ ...log, player: p, kind: "Sentry" as const })),
      ])
      .sort((a, b) => a.time - b.time);
  }, [data]);

  const filteredChat = useMemo(() => {
    const chat = data?.chat ?? [];
    if (!chatFilter.trim()) return chat;
    const needle = chatFilter.toLowerCase();
    return chat.filter((c) => c.key?.toLowerCase().includes(needle));
  }, [data, chatFilter]);

  async function handleFetchLive() {
    if (!matchId) return;
    setFetchingLive(true);
    setRequestMsg(null);
    try {
      setData(await fetchMatchLive(Number(matchId)));
      setMissing(false);
    } catch (e) {
      setRequestMsg(errorMessage(e));
    } finally {
      setFetchingLive(false);
    }
  }

  async function handleRequestParse() {
    if (!matchId) return;
    setRequesting(true);
    setRequestMsg("Asking OpenDota to parse this replay (only works if Valve still hosts it, ~8-14 days post-match)...");
    try {
      const jobId = await requestParse(Number(matchId));
      if (!jobId) {
        setRequestMsg("OpenDota didn't return a job id — it may already be parsed or queued. Try Fetch from OpenDota in a minute.");
        return;
      }
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const done = await getParseStatus(jobId);
        if (done) break;
      }
      const fresh = await fetchMatchLive(Number(matchId));
      setData(fresh);
      setMissing(false);
      setRequestMsg(isParsedMatch(fresh) ? "Parsed!" : "Still processing — try Fetch from OpenDota in a bit.");
    } catch (e) {
      setRequestMsg(errorMessage(e));
    } finally {
      setRequesting(false);
    }
  }

  if (error) return <div className="error-box">{error}</div>;
  if (missing) {
    return (
      <div className="empty-state">
        <h2>Match {matchId} isn't in your repository yet</h2>
        <p>
          New games are saved to the data branch automatically within about 20 minutes. You can also pull this one
          from OpenDota now (it'll be cached in this browser), or ask OpenDota to parse its replay first.
        </p>
        <div className="button-row">
          <button onClick={handleFetchLive} disabled={fetchingLive || requesting}>
            {fetchingLive ? "Fetching..." : "Fetch from OpenDota"}
          </button>
          <button onClick={handleRequestParse} disabled={fetchingLive || requesting}>
            {requesting ? "Requesting..." : "Request parse"}
          </button>
        </div>
        {requestMsg && <p className="text-dim small">{requestMsg}</p>}
      </div>
    );
  }
  if (!data) return <div className="loading">Loading match {matchId}...</div>;

  const radiant = data.players.filter((p) => p.isRadiant ?? isRadiant(p.player_slot));
  const dire = data.players.filter((p) => !(p.isRadiant ?? isRadiant(p.player_slot)));


  function playerLabel(p: MatchPlayer) {
    return (
      <div className="hero-cell">
        {heroIcon(p.hero_id) && <img src={heroIcon(p.hero_id)!} alt="" className="hero-icon" />}
        {heroName(p.hero_id)}
      </div>
    );
  }

  const overviewTab = (
    <>
      <Scoreboard players={radiant} teamLabel="Radiant" className="team-radiant" scrollGroup={scoreboardScroll} />
      <Scoreboard players={dire} teamLabel="Dire" className="team-dire" scrollGroup={scoreboardScroll} />

      {data.players.some((p) => (p.ability_upgrades_arr ?? []).length > 0) && (
        <div className="section">
          <h4>Skill builds</h4>
          {data.players
            .filter((p) => (p.ability_upgrades_arr ?? []).length > 0)
            .map((p) => (
              <div key={p.player_slot} className="skill-build-row">
                {playerLabel(p)}
                <div className="skill-build-list">
                  {(p.ability_upgrades_arr ?? []).map((abilityId, i) => {
                    const a = abilityById(abilityId);
                    return (
                      <span key={i} className="skill-pill" title={`Level ${i + 1}: ${a.name}`}>
                        {a.img ? <img src={a.img} alt={a.name} /> : a.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </>
  );

  const graphsTab = (
    <>
      {data.radiant_gold_adv ? (
        <AdvantageChart title="Gold advantage" values={data.radiant_gold_adv} />
      ) : (
        <p className="text-dim">No graph data — this match may not be parsed yet.</p>
      )}
      {data.radiant_xp_adv && <AdvantageChart title="Experience advantage" values={data.radiant_xp_adv} />}
    </>
  );

  const laningTab = (
    <>
      <LaneMatchups detail={data} />

      <div className="section">
        <h4>Every player's lane assignment</h4>
        <table className="match-list">
          <thead>
            <tr>
              <th>Player</th>
              <th>Lane</th>
              <th>CS @ 10min</th>
              <th>Denies @ 10min</th>
            </tr>
          </thead>
          <tbody>
            {data.players.map((p) => (
              <tr key={p.player_slot}>
                <td className="hero-cell">
                  {heroIcon(p.hero_id) && <img src={heroIcon(p.hero_id)!} alt="" className="hero-icon" />}
                  {heroName(p.hero_id)}
                </td>
                <td>
                  {laneRoleName(p.lane_role)}
                  {p.is_roaming ? " (roaming)" : ""}
                </td>
                <td>{csAtMinute(p.lh_t, 10) ?? "-"}</td>
                <td>{csAtMinute(p.dn_t, 10) ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const farmTab = (
    <>
      {purchases.length > 0 ? (
        <div className="section">
          <h4>Item purchase timeline</h4>
          <table className="log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Player</th>
                <th>Item</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p, i) => {
                const item = itemByKey(p.key);
                return (
                  <tr key={i}>
                    <td>{formatGameTime(p.time)}</td>
                    <td>{heroName(p.player.hero_id)}</td>
                    <td className="hero-cell">
                      {item.img && <img src={item.img} alt="" className="item-icon" />}
                      {item.name}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-dim">No purchase data.</p>
      )}

      {data.players.some((p) => p.item_uses) && (
        <div className="section">
          <h4>Active item uses</h4>
          {data.players.map((p) => (
            <details key={p.player_slot} className="section">
              <summary>{heroName(p.hero_id)}</summary>
              <KeyedStatTable data={p.item_uses} resolveLabel={(k) => itemByKey(k).name} />
            </details>
          ))}
        </div>
      )}
    </>
  );

  const combatTab = (
    <>
      {kills.length > 0 && (
        <div className="section">
          <h4>Kill feed</h4>
          <table className="log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Killer</th>
                <th>Victim</th>
              </tr>
            </thead>
            <tbody>
              {kills.map((k, i) => (
                <tr key={i}>
                  <td>{formatGameTime(k.time)}</td>
                  <td>{heroName(k.killer.hero_id)}</td>
                  <td>{heroNameByUnit(k.key)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.teamfights && data.teamfights.length > 0 && (
        <div className="section">
          <h4>Teamfights ({data.teamfights.length})</h4>
          <table className="log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Deaths</th>
                <th>Total damage</th>
              </tr>
            </thead>
            <tbody>
              {data.teamfights.map((tf, i) => (
                <tr key={i}>
                  <td>
                    {formatGameTime(tf.start)} - {formatGameTime(tf.end)}
                  </td>
                  <td>{tf.deaths}</td>
                  <td>{tf.players.reduce((sum, p) => sum + (p.damage ?? 0), 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section">
        <h4>Damage & kills by player</h4>
        {data.players.map((p) => (
          <details key={p.player_slot} className="section">
            <summary>
              {heroName(p.hero_id)} — {p.stuns ? `${p.stuns.toFixed(1)}s stun dealt` : "no stun data"}
            </summary>
            <div className="two-col">
              <div>
                <h4>Damage dealt to</h4>
                <KeyedStatTable data={p.damage} resolveLabel={heroNameByUnit} />
              </div>
              <div>
                <h4>Damage taken from</h4>
                <KeyedStatTable data={p.damage_taken} resolveLabel={heroNameByUnit} />
              </div>
              <div>
                <h4>Killed</h4>
                <KeyedStatTable data={p.killed} resolveLabel={heroNameByUnit} />
              </div>
              <div>
                <h4>Killed by</h4>
                <KeyedStatTable data={p.killed_by} resolveLabel={heroNameByUnit} />
              </div>
            </div>
          </details>
        ))}
      </div>
    </>
  );

  const objectivesTab =
    data.objectives && data.objectives.length > 0 ? (
      <table className="log-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>Team</th>
          </tr>
        </thead>
        <tbody>
          {data.objectives.map((o, i) => (
            <tr key={i}>
              <td>{formatGameTime(o.time)}</td>
              <td>{objectiveLabel(o.type)}</td>
              <td>{o.team === 2 ? "Radiant" : o.team === 3 ? "Dire" : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="text-dim">No objective events recorded.</p>
    );

  const visionTab =
    wards.length > 0 ? (
      <table className="log-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Player</th>
            <th>Type</th>
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          {wards.map((w, i) => (
            <tr key={i}>
              <td>{formatGameTime(w.time)}</td>
              <td>{heroName(w.player.hero_id)}</td>
              <td>{w.kind}</td>
              <td>
                {w.x ?? "-"}, {w.y ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="text-dim">No ward data.</p>
    );

  const draftTab = data.picks_bans && data.picks_bans.length > 0 && (
    <table className="log-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Team</th>
          <th>Type</th>
          <th>Hero</th>
        </tr>
      </thead>
      <tbody>
        {[...data.picks_bans]
          .sort((a, b) => a.order - b.order)
          .map((pb, i) => (
            <tr key={i}>
              <td>{pb.order + 1}</td>
              <td>{pb.team === 0 ? "Radiant" : "Dire"}</td>
              <td>{pb.is_pick ? "Pick" : "Ban"}</td>
              <td className="hero-cell">
                {heroIcon(pb.hero_id) && <img src={heroIcon(pb.hero_id)!} alt="" className="hero-icon" />}
                {heroName(pb.hero_id)}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );

  const chatTab = (
    <>
      <input
        className="chat-filter"
        placeholder="Search chat..."
        value={chatFilter}
        onChange={(e) => setChatFilter(e.target.value)}
      />
      {filteredChat.length > 0 ? (
        <table className="log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {filteredChat.map((c, i) => (
              <tr key={i}>
                <td>{formatGameTime(c.time)}</td>
                <td>{c.type === "chatwheel" ? `[chat wheel: ${c.key}]` : c.key}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-dim">No chat messages{chatFilter ? " match that search" : " recorded"}.</p>
      )}
    </>
  );

  const everythingElseTab = (
    <>
      <p className="text-dim small">
        Every field from this match's JSON that isn't already shown in another tab, in raw form. Unorganized for
        now; ask to have any of these turned into a proper view.
      </p>

      <h4>Match-level</h4>
      <RemainingFields obj={data} exclude={SHOWN_MATCH_FIELDS} />

      <h4>Per player</h4>
      {data.players.map((p) => (
        <details key={p.player_slot} className="section">
          <summary>{heroName(p.hero_id)}</summary>
          <RemainingFields obj={p as unknown as Record<string, unknown>} exclude={SHOWN_PLAYER_FIELDS} />
        </details>
      ))}

      <div className="raw-toggle">
        <button onClick={() => setShowRaw((v) => !v)}>{showRaw ? "Hide" : "Show"} full raw OpenDota JSON</button>
        {showRaw && <pre className="raw-json">{JSON.stringify(data, null, 2)}</pre>}
      </div>
    </>
  );

  const tabs: Tab[] = [
    { id: "overview", label: "Overview", content: overviewTab },
    { id: "graphs", label: "Graphs", content: graphsTab },
    { id: "laning", label: "Laning", content: laningTab },
    { id: "farm", label: "Farm", content: farmTab },
    { id: "combat", label: "Combat", content: combatTab },
    { id: "objectives", label: "Objectives", content: objectivesTab },
    { id: "vision", label: "Vision", content: visionTab },
    ...(draftTab ? [{ id: "draft", label: "Draft", content: draftTab }] : []),
    { id: "chat", label: "Chat", content: chatTab },
    { id: "everything", label: "Everything else", content: everythingElseTab },
  ];

  return (
    <div>
      <div className="match-header">
        <h2 className={data.radiant_win ? "radiant-won" : "dire-won"}>{data.radiant_win ? "Radiant Victory" : "Dire Victory"}</h2>
        <div className="match-meta">
          {formatDuration(data.duration)} &middot; {matchModeLabel(data.game_mode, data.lobby_type, data.start_time)} &middot; match {data.match_id}
          {(() => {
            const avgTier = matchRankTier(data.players.map((p) => p.rank_tier));
            if (avgTier != null) {
              return (
                <>
                  {" "}
                  &middot; ~<span style={{ color: rankTierColor(avgTier) ?? undefined }}>{rankTierLabel(avgTier)}</span> average
                </>
              );
            }
            // Fewer than 4 players have a visible rank - too few for a
            // meaningful average, so fall back to Valve's own lobby skill
            // bracket for this match (when OpenDota has it).
            const skillLabel = skillBracketLabel(data.skill);
            return skillLabel ? (
              <>
                {" "}
                &middot; {skillLabel}
              </>
            ) : null;
          })()}
        </div>
        {!isParsed && (
          <div className="error-box small">
            This match hasn't been parsed by OpenDota yet, so only basic stats are available.{" "}
            <button onClick={handleRequestParse} disabled={requesting}>
              {requesting ? "Requesting..." : "Request parse"}
            </button>
            {requestMsg && <div>{requestMsg}</div>}
          </div>
        )}
      </div>

      <Tabs tabs={tabs} />
    </div>
  );
}
