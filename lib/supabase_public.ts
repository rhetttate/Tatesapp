import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anon) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * Public (anon-only) client:
 * - Does NOT read stored sessions
 * - Does NOT persist sessions
 * - Never attaches an Authorization bearer token
 */
export const supabasePublic = createClient(url, anon, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "sunstop-public-noauth",
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  },
});