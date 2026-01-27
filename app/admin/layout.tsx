"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      // Must be signed in
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id ?? null;
      if (!uid) {
        if (!alive) return;
        setOk(false);
        router.replace("/member");
        return;
      }

      // Check admin allowlist (RLS will allow only if is_admin policy says so)
      // Option A: select from admins
      const { data, error } = await supabase.from("admins").select("auth_user_id").eq("auth_user_id", uid).maybeSingle();

      if (!alive) return;

      if (error || !data) {
        setOk(false);
        router.replace("/member");
        return;
      }

      setOk(true);
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  if (ok === null) return null; // or a small "Loading..." UI
  if (ok === false) return null;

  return <>{children}</>;
}
