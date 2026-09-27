import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAccountId, getApiKey, parseAccountId, setAccountId, setApiKey } from "../settings";
import { clearAllCache } from "../cache";
import { lookupProfileLive } from "../opendota";

export function Settings() {
  const navigate = useNavigate();
  const [accountInput, setAccountInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey() ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const currentAccountId = getAccountId();

  async function handleSave() {
    setError(null);
    const accountId = parseAccountId(accountInput);
    if (accountId == null) {
      setError("Couldn't parse that. Paste your SteamID64, a steamcommunity.com/profiles/... URL, or a 32-bit account_id.");
      return;
    }

    setChecking(true);
    setStatus("Checking OpenDota has this account...");
    try {
      const profile = await lookupProfileLive(accountId);
      setApiKey(apiKeyInput.trim());
      setAccountId(accountId);
      setStatus(`Found ${profile.profile?.personaname ?? "player"} — redirecting...`);
      setTimeout(() => navigate("/"), 600);
    } catch (e) {
      setError(
        `Couldn't find that account on OpenDota (${String(e)}). Make sure "Expose Public Match Data" is on in ` +
          "the Dota 2 client, and that you've played at least one match OpenDota has seen.",
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="settings">
      <h2>Settings</h2>

      {currentAccountId && (
        <p className="current-account">
          Currently tracking account_id <code>{currentAccountId}</code>.
        </p>
      )}

      <div className="field">
        <label htmlFor="account">Your Steam / OpenDota account</label>
        <input
          id="account"
          placeholder="SteamID64, profile URL, or account_id"
          value={accountInput}
          onChange={(e) => setAccountInput(e.target.value)}
        />
        <p className="hint">
          Find your SteamID64 at{" "}
          <a href="https://steamid.io/" target="_blank" rel="noreferrer">
            steamid.io
          </a>{" "}
          (paste your profile URL there).
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
          Free tier is 2,000 calls/day, 60/min — plenty for personal use. Get a key at{" "}
          <a href="https://www.opendota.com/api-keys" target="_blank" rel="noreferrer">
            opendota.com/api-keys
          </a>{" "}
          if you want a higher limit.
        </p>
      </div>

      <button onClick={handleSave} disabled={checking}>
        {checking ? "Checking..." : "Save"}
      </button>

      {status && <p className="status-ok">{status}</p>}
      {error && <div className="error-box small">{error}</div>}

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
        Match details are cached in your browser forever (they never change once parsed) to save API calls. Recent
        match lists and stats refresh every 5 minutes on their own.
      </p>
    </div>
  );
}
