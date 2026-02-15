"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  points: number;
  created_at: string;
};

function showEmail(email: string | null | undefined) {
  const e = (email ?? "").trim();
  return e.length ? e : "—";
}

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

export default function AdminMembersPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [status, setStatus] = useState("");

  // inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pointsDraft, setPointsDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const query = useMemo(() => q.trim(), [q]);

  async function load() {
    setStatus("");
    try {
      let req = supabase
        .from("members")
        .select("id,name,email,points,created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (query) {
        // UUID exact match attempt
        const looksUuid = query.length >= 8 && /^[0-9a-fA-F-]+$/.test(query);

        if (looksUuid) {
          const { data: exact, error: exactErr } = await supabase
            .from("members")
            .select("id,name,email,points,created_at")
            .eq("id", query)
            .maybeSingle();

          if (exactErr) throw exactErr;
          if (exact) {
            setRows([exact as any]);
            return;
          }
        }

        // name OR email partial match
        req = supabase
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function startEdit(m: MemberRow) {
    setStatus("");
    setEditingId(m.id);
    setPointsDraft(String(m.points ?? 0));
  }

  function cancelEdit() {
    setEditingId(null);
    setPointsDraft("");
  }

  async function savePoints(memberId: string) {
    setStatus("");
    setSaving(true);
    try {
      const raw = pointsDraft.trim();
      const clean = raw === "" ? "0" : digitsOnly(raw);
      const pts = Number(clean);
      if (!Number.isFinite(pts) || pts < 0) throw new Error("Points must be 0 or more.");

      // optimistic update
      setRows((prev) => prev.map((m) => (m.id === memberId ? { ...m, points: pts } : m)));

      const { error } = await supabase.from("members").update({ points: pts }).eq("id", memberId);
      if (error) throw error;

      setEditingId(null);
      setPointsDraft("");
      setStatus("Points updated.");
    } catch (e: any) {
      setStatus("Update error: " + (e?.message ?? String(e)));
      await load(); // resync if something failed
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, borderRadius: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 22 }}>Members</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Search by <b>name</b> or <b>email</b> (or paste member UUID). Edit points inline.
          </div>
        </div>
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="hr" />

      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, or UUID..." />

      {status && <p style={{ marginTop: 10 }}>{status}</p>}

      <div className="hr" />

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((m) => {
          const isEditing = editingId === m.id;

          return (
            <div key={m.id} className="card" style={{ padding: 14, borderRadius: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <div style={{ fontWeight: 950, fontSize: 18 }}>{m.name ?? "No name"}</div>

                {!isEditing ? (
                  <div style={{ fontWeight: 950, fontSize: 18 }}>{m.points ?? 0} pts</div>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      className="input"
                      style={{ width: 120, fontWeight: 950, textAlign: "right" }}
                      value={pointsDraft}
                      onChange={(e) => setPointsDraft(e.target.value)}
                      inputMode="numeric"
                      placeholder="Points"
                      disabled={saving}
                    />
                    <span className="muted" style={{ fontWeight: 900 }}>
                      pts
                    </span>
                  </div>
                )}
              </div>

              <div className="muted" style={{ marginTop: 6 }}>
                {showEmail(m.email)}
              </div>

              <div
                className="muted"
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {m.id}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <Link href={`/admin/members/${m.id}`} className="btn" style={{ textDecoration: "none" }}>
                  Open
                </Link>

                {!isEditing ? (
                  <button className="btn" onClick={() => startEdit(m)}>
                    Edit Points
                  </button>
                ) : (
                  <>
                    <button className="btn btnPrimary" onClick={() => savePoints(m.id)} disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button className="btn" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {rows.length === 0 && !status && <div className="muted">No members found.</div>}
      </div>
    </div>
  );
}

