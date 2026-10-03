import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anon) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * fetch that quietly retries a request that never reached the server.
 *
 * After a page sits idle, the browser can reuse a connection Supabase already
 * closed; the first request then dies with "TypeError: Load failed" (Safari) /
 * "TypeError: Failed to fetch" (Chrome) and a second click works. That showed
 * up in admin as "Save error: TypeError: …". A network-level TypeError means
 * no response came back, so we just try again on a fresh connection.
 */
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const delays = [250, 750];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      const retryable = e instanceof TypeError && !init?.signal?.aborted;
      if (!retryable || attempt >= delays.length) throw e;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

// Auth-enabled client (for members + admin)
export const supabase = createClient(url, anon, {
  global: { fetch: fetchWithRetry },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "sunstop-auth",
  },
});
