// Lane-tablet side of account sales: talks only to this app's /api/accounts routes.
// The tablet key (from Tates Prices > Tax exempt > Lane tablets) lives in localStorage.

export type AcctKind = "exempt" | "charge";
export type AcctRow = {
  id: string;
  name: string;
  number: string;
  kind: string;
  expiry: "ok" | "soon" | "expired";
  end_date: string | null;
  linked: string | null;
};

const KEY = "tates_acct_key";
const LANE = "tates_acct_lane";

export function getTabletSetup(): { key: string; lane: string } {
  try {
    return { key: localStorage.getItem(KEY) || "", lane: localStorage.getItem(LANE) || "" };
  } catch {
    return { key: "", lane: "" };
  }
}

export function saveTabletSetup(lane: string, key: string) {
  try {
    localStorage.setItem(LANE, lane.replace(/\D/g, ""));
    localStorage.setItem(KEY, key.trim().toUpperCase());
  } catch {}
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json as T;
}

export async function searchAccounts(kind: AcctKind, q: string): Promise<AcctRow[]> {
  const { key } = getTabletSetup();
  return (await post<{ rows: AcctRow[] }>("/api/accounts/search", { key, kind, q })).rows;
}

export async function saveTap(kind: AcctKind, id: string, purchaser: string, save = true) {
  const { key } = getTabletSetup();
  return post<{ id: number; number: string; lane: number; saved: boolean; full: boolean }>("/api/accounts/tap", {
    key,
    kind,
    id,
    purchaser,
    save,
  });
}

export async function listPurchasers(kind: AcctKind, id: string): Promise<string[]> {
  const { key } = getTabletSetup();
  return (await post<{ names: string[] }>("/api/accounts/purchasers", { key, kind, id })).names;
}
