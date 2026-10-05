// Server-only: calls the Tates Prices Supabase project with its SERVICE key, for
// app/api/accounts/*. Lane tablets never hold a Tates Prices key; the functions called
// here check the tablet key themselves. Never import this from a client component.
// Env (Vercel, NOT NEXT_PUBLIC_): TP_SUPABASE_URL, TP_SERVICE_KEY.

export class TpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function tpRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const url = process.env.TP_SUPABASE_URL;
  const key = process.env.TP_SERVICE_KEY;
  if (!url || !key) throw new TpError("Accounts aren't set up on the server yet.", 500);
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body && typeof body.message === "string" && body.message) || `Tates Prices error ${res.status}`;
    if (body?.code === "23505" || /duplicate key/i.test(msg)) {
      throw new TpError("That number is already on file for another customer", 400);
    }
    throw new TpError(msg, /bad tablet key/i.test(msg) ? 401 : 400);
  }
  return body as T;
}
