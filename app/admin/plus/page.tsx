"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Plu = {
  id: string;
  plu: string;
  name: string;
  price: number | null;
  department: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
};

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

function priceOrNull(raw: string) {
  const t = (raw || "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error("Price must be a valid number.");
  return n;
}

export default function AdminPlusPage() {
  const [items, setItems] = useState<Plu[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  // add form
  const [name, setName] = useState("");
  const [plu, setPlu] = useState("");
  const [price, setPrice] = useState("");
  const [department, setDepartment] = useState("");

  // edit modal
  const [editing, setEditing] = useState<Plu | null>(null);
  const [eName, setEName] = useState("");
  const [ePlu, setEPlu] = useState("");
  const [ePrice, setEPrice] = useState("");
  const [eDept, setEDept] = useState("");
  const [eActive, setEActive] = useState(true);
  const [eSort, setESort] = useState("100");

  async function load() {
    setLoading(true);
    setStatus("");
    const { data, error } = await supabase
      .from("plus")
      .select("id,plu,name,price,department,active,sort_order,created_at")
      .order("active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) setStatus("Load error: " + error.message + " — did you run the PLU migration?");
    setItems((data as any) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;
    if (q) {
      list = list.filter((it) =>
        `${it.name} ${it.plu} ${it.department ?? ""}`.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const ao = Number(a.sort_order ?? 0);
      const bo = Number(b.sort_order ?? 0);
      if (ao !== bo) return ao - bo;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [items, query]);

  async function add() {
    setStatus("");
    try {
      if (!name.trim()) throw new Error("Enter a name.");
      const code = digitsOnly(plu);
      if (code.length < 3 || code.length > 6) throw new Error("PLU should be 3–6 digits.");
      const p = priceOrNull(price);

      const nextSort = Math.max(items.filter((x) => x.active).length + 1, 1);

      const { error } = await supabase.from("plus").insert({
        name: name.trim(),
        plu: code,
        price: p,
        department: department.trim() || null,
        active: true,
        sort_order: nextSort,
      });
      if (error) throw error;

      setName("");
      setPlu("");
      setPrice("");
      setDepartment("");
      setStatus("Added ✅");
      await load();
    } catch (e: any) {
      setStatus("Save error: " + (e?.message ?? String(e)));
    }
  }

  async function toggle(it: Plu) {
    setStatus("");
    const { error } = await supabase.from("plus").update({ active: !it.active }).eq("id", it.id);
    if (error) setStatus("Update error: " + error.message);
    await load();
  }

  async function remove(it: Plu) {
    if (!window.confirm(`Delete "${it.name}" (PLU ${it.plu})?`)) return;
    const { error } = await supabase.from("plus").delete().eq("id", it.id);
    if (error) setStatus("Delete error: " + error.message);
    await load();
  }

  function openEdit(it: Plu) {
    setEditing(it);
    setEName(it.name || "");
    setEPlu(it.plu || "");
    setEPrice(it.price != null ? String(Number(it.price)) : "");
    setEDept(it.department || "");
    setEActive(!!it.active);
    setESort(String(it.sort_order ?? 100));
  }

  async function saveEdit() {
    if (!editing) return;
    setStatus("");
    try {
      if (!eName.trim()) throw new Error("Enter a name.");
      const code = digitsOnly(ePlu);
      if (code.length < 3 || code.length > 6) throw new Error("PLU should be 3–6 digits.");
      const p = priceOrNull(ePrice);
      const soNum = Number(digitsOnly(eSort) || "0");

      const { error } = await supabase
        .from("plus")
        .update({
          name: eName.trim(),
          plu: code,
          price: p,
          department: eDept.trim() || null,
          active: eActive,
          sort_order: soNum,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editing.id);
      if (error) throw error;

      setEditing(null);
      setStatus("Saved ✅");
      await load();
    } catch (e: any) {
      setStatus("Save error: " + (e?.message ?? String(e)));
    }
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div className="title">PLU Codes</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Produce / lookup codes. Cashiers search these on the tablet and tap to ring up.
          </div>
        </div>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      <div className="divider" />

      {/* add form */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
        <div style={{ gridColumn: "span 6" }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 2 }}>Item name</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bananas" />
        </div>
        <div style={{ gridColumn: "span 6" }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 2 }}>PLU code (3–6 digits)</div>
          <input className="input" value={plu} onChange={(e) => setPlu(e.target.value)} inputMode="numeric" placeholder="4011" />
        </div>
        <div style={{ gridColumn: "span 6" }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 2 }}>Price (optional)</div>
          <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0.59" />
        </div>
        <div style={{ gridColumn: "span 6" }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 2 }}>Department (optional)</div>
          <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Produce" />
        </div>
        <div style={{ gridColumn: "span 12" }}>
          <button className="btn btnPrimary" onClick={add} style={{ width: "100%" }}>Add PLU</button>
        </div>
      </div>

      {status && <div className="statusMsg">{status}</div>}

      <div className="divider" />

      <div style={{ marginBottom: 12 }}>
        <input
          className="input"
          placeholder="Search PLUs by name or code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginTop: 0 }}
        />
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : (
        <div className="grid">
          {filtered.map((it) => (
            <div key={it.id} className="card" style={{ padding: 14, borderRadius: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: "var(--ink)" }}>{it.name}</div>
                <div style={{ fontWeight: 900, fontSize: 18, color: "var(--blue2)" }}>
                  {it.price != null ? "$" + Number(it.price).toFixed(2) : ""}
                </div>
              </div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                PLU {it.plu}{it.department ? ` • ${it.department}` : ""}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button className={"btn " + (it.active ? "btnPrimary" : "")} onClick={() => toggle(it)} style={{ flex: 1 }}>
                  {it.active ? "Active" : "Inactive"}
                </button>
                <button className="btn" onClick={() => openEdit(it)} style={{ flex: 1 }}>Edit</button>
                <button className="btn" onClick={() => remove(it)} style={{ flex: 1 }}>Delete</button>
              </div>
            </div>
          ))}
          {!filtered.length && <div className="muted">No PLUs yet. Add one above.</div>}
        </div>
      )}

      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="title">Edit PLU</div>
              <button className="xBtn" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="divider" />
            <div className="grid" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
              <div style={{ gridColumn: "span 12" }}>
                <div className="muted" style={{ fontSize: 13 }}>Name</div>
                <input className="input" value={eName} onChange={(e) => setEName(e.target.value)} />
              </div>
              <div style={{ gridColumn: "span 6" }}>
                <div className="muted" style={{ fontSize: 13 }}>PLU code</div>
                <input className="input" value={ePlu} onChange={(e) => setEPlu(e.target.value)} inputMode="numeric" />
              </div>
              <div style={{ gridColumn: "span 6" }}>
                <div className="muted" style={{ fontSize: 13 }}>Price (optional)</div>
                <input className="input" value={ePrice} onChange={(e) => setEPrice(e.target.value)} inputMode="decimal" />
              </div>
              <div style={{ gridColumn: "span 6" }}>
                <div className="muted" style={{ fontSize: 13 }}>Department</div>
                <input className="input" value={eDept} onChange={(e) => setEDept(e.target.value)} />
              </div>
              <div style={{ gridColumn: "span 6" }}>
                <div className="muted" style={{ fontSize: 13 }}>Sort order</div>
                <input className="input" value={eSort} onChange={(e) => setESort(e.target.value)} inputMode="numeric" />
              </div>
              <div style={{ gridColumn: "span 12" }}>
                <label className="checkRow" style={{ marginTop: 0 }}>
                  <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} />
                  <span style={{ fontWeight: 800, color: "var(--ink)" }}>Active</span>
                </label>
              </div>
              <div style={{ gridColumn: "span 12", display: "flex", gap: 10 }}>
                <button className="btn btnPrimary" onClick={saveEdit} style={{ flex: 1 }}>Save Changes</button>
                <button className="btn btnSoft" onClick={() => setEditing(null)} style={{ flex: 1 }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
