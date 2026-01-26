"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabasePublic } from "../../../lib/supabase_public";


type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  points: number;
  created_at: string;
};

export default function AdminMembersPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [status, setStatus] = useState("");

  const query = useMemo(() => q.trim(), [q]);

  async function load() {
    setStatus("");
    try {
      let req = supabasePublic
        .from("members")
        .select("id,name,email,points,created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      // Basic search: try name OR email OR id via ilike (works for text cols)
      // id is uuid; we still support exact match if user pastes a uuid
      if (query) {
        const looksUuid = query.length >= 8;
        if (looksUuid) {
          // Try exact id
          const { data: exact } = await supabasePublic
            .from("members")
            .select("id,name,email,points,created_at")
            .eq("id", query)
            .maybeSingle();

          if (exact) {
            setRows([exact as any]);
            return;
          }
        }

        req = supabasePublic
          .from("members")
          .select("id,name,email,points,created_at")
          .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
          .order("created_at", { ascending: false })
          .limit(50);
      }

      const { data, error } = await req;
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) {
      setStatus("Load error: " + (e?.message ?? String(e)));
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="card" style={{ padding: 16, borderRadius: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 22 }}>Members</div>
          <div className="muted" style={{ marginTop: 6 }}>Search by name or email (or paste member UUID).</div>
        </div>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      <div className="hr" />

      <input
        className="input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search..."
      />

      {status && <p style={{ marginTop: 10 }}>{status}</p>}

      <div className="hr" />

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((m) => (
          <Link
            key={m.id}
            href={`/admin/members/${m.id}`}
            className="card"
            style={{ padding: 14, borderRadius: 16, textDecoration: "none" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 950, fontSize: 18 }}>{m.name || "No name"}</div>
              <div style={{ fontWeight: 950, fontSize: 18 }}>{m.points ?? 0} pts</div>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>{m.email || "—"}</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {m.id}
            </div>
          </Link>
        ))}
        {rows.length === 0 && !status && <div className="muted">No members found.</div>}
      </div>
    </div>
  );
}