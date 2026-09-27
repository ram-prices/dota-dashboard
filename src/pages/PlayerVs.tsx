import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { errorMessage, getPeers } from "../opendota";
import type { PeerStat } from "../types";
import { formatRelativeTime } from "../dota";

function pct(win: number | undefined, games: number | undefined): string {
  if (!games) return "-";
  return `${Math.round((100 * (win ?? 0)) / games)}%`;
}

export function PlayerVs({ accountId }: { accountId: number }) {
  const { targetAccountId } = useParams();
  const [peer, setPeer] = useState<PeerStat | null | undefined>(undefined); // undefined = loading
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetAccountId) return;
    setPeer(undefined);
    getPeers(accountId)
      .then((peers) => setPeer(peers.find((p) => p.account_id === Number(targetAccountId)) ?? null))
      .catch((e) => setError(errorMessage(e)));
  }, [accountId, targetAccountId]);

  if (Number(targetAccountId) === accountId) {
    return <div className="empty-state">That's you.</div>;
  }

  if (error) return <div className="error-box">{error}</div>;
  if (peer === undefined) return <div className="loading">Loading shared match history...</div>;

  if (peer === null) {
    return (
      <div className="empty-state">
        <h2>No shared match history</h2>
        <p>
          Account <code>{targetAccountId}</code> doesn't show up in any match stored in your data repository (or
          their profile is private, which hides their account id from match data).
        </p>
      </div>
    );
  }

  const withGames = peer.with_games ?? peer.games;
  const withWin = peer.with_win ?? peer.win;

  return (
    <div>
      <div className="profile-header">
        {peer.avatar && <img src={peer.avatar} alt="" className="avatar" />}
        <div>
          <h2>{peer.personaname ?? `Account ${peer.account_id}`}</h2>
          <p className="text-dim">Last played together {formatRelativeTime(peer.last_played)}</p>
        </div>
      </div>

      <div className="two-col">
        <div className="chart">
          <h3>As teammates</h3>
          <p className="vs-stat">{pct(withWin, withGames)}</p>
          <p className="text-dim">
            {withWin} - {withGames - withWin} in {withGames} games together
          </p>
        </div>
        <div className="chart">
          <h3>As opponents</h3>
          {peer.against_games ? (
            <>
              <p className="vs-stat">{pct(peer.against_win, peer.against_games)}</p>
              <p className="text-dim">
                {peer.against_win} - {(peer.against_games ?? 0) - (peer.against_win ?? 0)} in {peer.against_games}{" "}
                games against each other
              </p>
            </>
          ) : (
            <p className="text-dim">Never on opposing teams in your stored matches.</p>
          )}
        </div>
      </div>
    </div>
  );
}
