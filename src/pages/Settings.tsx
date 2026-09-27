import { useEffect, useState } from "react";
import { getAccountId, getApiKey, setApiKey } from "../settings";
import { clearAllCache } from "../cache";
import { getProfile } from "../opendota";

export function Settings() {
  const accountId = getAccountId();
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey() ?? "");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getProfile(accountId)
      .then((p) => setPlayerName(p?.profile?.personaname ?? null))
      .catch(() => setPlayerName(null));
  }, [accountId]);

  return (
    <div className="settings">
      <h2>Settings</h2>

      <div className="field">
        <label>Tracked account</label>
        <p className="current-account">
          This site only tracks one account: {playerName && <strong>{playerName} </strong>}
          (account_id <code>{accountId}</code>). All match data comes from this repo's data branch, which only holds
          that account's history, so the account can't be changed here.
        </p>
      </div>

      <div className="field">
        <label htmlFor="apikey">OpenDota API key (optional)</label>
        <input
          id="apikey"
          placeholder="Leave blank to use the free tier"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
        />
        <p className="hint">
          Only used when you ask the site to contact OpenDota (Sync games, Fetch from OpenDota, Request parse) - the
          free tier is plenty for that. Get a key at{" "}
          <a href="https://www.opendota.com/api-keys" target="_blank" rel="noreferrer">
            opendota.com/api-keys
          </a>{" "}
          if you ever hit its limits.
        </p>
      </div>

      <button
        onClick={() => {
          setApiKey(apiKeyInput.trim());
          setStatus("Saved.");
        }}
      >
        Save
      </button>

      {status && <p className="status-ok">{status}</p>}

      <hr />

      <button
        className="danger"
        onClick={() => {
          clearAllCache();
          setStatus("Cache cleared.");
        }}
      >
        Clear cached match data
      </button>
      <p className="hint">
        Parsed match details are cached in your browser forever (they never change). Match lists and stats refresh
        every 5 minutes on their own.
      </p>
    </div>
  );
}
