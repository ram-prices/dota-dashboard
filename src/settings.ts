const API_KEY_KEY = "dota-dash:settings:apiKey";

const STEAM64_BASE = 76561197960265728n;

// Accepts a SteamID64, a 32-bit account_id, or a full Steam profile URL
// (https://steamcommunity.com/profiles/7656119...) and returns the
// 32-bit account_id OpenDota's API expects.
export function parseAccountId(raw: string): number | null {
  const trimmed = raw.trim();
  const urlMatch = trimmed.match(/steamcommunity\.com\/profiles\/(\d+)/);
  const idStr = urlMatch ? urlMatch[1] : trimmed;

  if (!/^\d+$/.test(idStr)) return null;
  const n = BigInt(idStr);
  const accountId = n >= STEAM64_BASE ? n - STEAM64_BASE : n;
  if (accountId <= 0n || accountId > 4294967295n) return null;
  return Number(accountId);
}

// The one account this site tracks. The data branch (and the workflows that
// fill it) only ever hold this account's match history, so viewing any
// other account would just show this one's data under the wrong name -
// hence no way to change it from the UI. Set per build via
// VITE_DEFAULT_ACCOUNT_ID (see .github/workflows/deploy.yml).
const DEFAULT_TRACKED_ACCOUNT_ID = 90031862;
export const TRACKED_ACCOUNT_ID: number =
  parseAccountId(import.meta.env.VITE_DEFAULT_ACCOUNT_ID ?? "") ?? DEFAULT_TRACKED_ACCOUNT_ID;

export function getAccountId(): number {
  return TRACKED_ACCOUNT_ID;
}

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_KEY) || import.meta.env.VITE_OPENDOTA_API_KEY || null;
}

export function setApiKey(key: string): void {
  if (key) localStorage.setItem(API_KEY_KEY, key);
  else localStorage.removeItem(API_KEY_KEY);
}
