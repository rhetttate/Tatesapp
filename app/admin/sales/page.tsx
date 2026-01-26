"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type SaleItem = {
  id: string;
  name: string;
  upc: string;
  price: number | null;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
};

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

// UPC-A check digit for 11-digit base
function upcCheckDigit(upc11: string) {
  const d = upc11.split("").map((x) => Number(x));
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8] + d[10];
  const evenSum = d[1] + d[3] + d[5] + d[7] + d[9];
  const total = oddSum * 3 + evenSum;
  const mod = total % 10;
  return mod === 0 ? 0 : 10 - mod;
}

export default function AdminSalesPage() {
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const [name, setName] = useState("");
  const [upc, setUpc] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");

  async function load() {
    setLoading(true);
    setStatus("");
    const { data, error } = await supabase
      .from("sale_items")
      .select("id,name,upc,price,description,active,sort_order,created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) setStatus("Load error: " + error.message);
    setItems((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    setStatus("");
    try {
      if (!name.trim()) throw new Error("Enter name.");

      let u = digitsOnly(upc);
      if (u.length === 11) u = u + String(upcCheckDigit(u));
      if (u.length !== 12) throw new Error("UPC must be 11 or 12 digits (11 auto-adds check digit).");

      const p = price.trim() ? Number(price) : null;
      if (p != null && (!Number.isFinite(p) || p < 0)) throw new Error("Price must be a valid number.");

      const { error } = await supabase.from("sale_items").insert({
        name: name.trim(),
        upc: u,
        price: p,
        description: description.trim() || null,
        active: true,
        sort_order: Number(sortOrder || 0),
      });

      if (error) throw error;

      setName("");
      setUpc("");
      setPrice("");
      setDescription("");
      setSortOrder("0");
      setStatus("Added.");
      await load();
    } catch (e: any) {
      setStatus("Save error: " + (e?.message ?? String(e)));
    }
  }

  async function toggle(it: SaleItem) {
    setStatus("");
    const { error } = await supabase.from("sale_items").update({ active: !it.active }).eq("id", it.id);
    if (error) setStatus("Update error: " + error.message);
    await load();
  }

  async function remove(it: SaleItem) {
    setStatus("");
    const { error } = await supabase.from("sale_items").delete().eq("id", it.id);
    if (error) setStatus("Delete error: " + error.message);
    await load();
  }

  return (
    <div className="card" style={{ padding: 16, borderRadius: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 22 }}>Sales Items</div>
          <div className="muted" style={{ marginTop: 6 }}>This controls the cashier swipe list.</div>
        </div>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      <div className="hr" />

      <div className="grid" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
        <div style={{ gridColumn: "span 12" }}>
          <label>Item Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>

        <div style={{ gridColumn: "span 6" }}>
          <label>UPC (11 or 12 digits)
            <input className="input" value={upc} onChange={(e) => setUpc(e.target.value)} />
          </label>
        </div>

        <div style={{ gridColumn: "span 6" }}>
          <label style={{ fontSize: 16, fontWeight: 900 }}>Price (optional)
            <input className="input" style={{ fontSize: 18, fontWeight: 900 }} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </label>
        </div>

        <div style={{ gridColumn: "span 12" }}>
          <label style={{ fontSize: 16, fontWeight: 900 }}>Description (bigger)
            <textarea className="input" style={{ minHeight: 90, fontSize: 16 }} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>

        <div style={{ gridColumn: "span 6" }}>
          <label>Sort Order (0 first)
            <input className="input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
          </label>
        </div>

        <div style={{ gridColumn: "span 12" }}>
          <button className="btn btnPrimary" onClick={add} style={{ width: "100%", padding: "14px 16px", fontSize: 16 }}>
            Add Sale Item
          </button>
        </div>
      </div>

      {status && <p style={{ marginTop: 10 }}>{status}</p>}

      <div className="hr" />
      <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 10 }}>Today’s Items</div>

      {loading ? <div className="muted">Loading...</div> : (
        <div className="grid">
          {items.map((it) => (
            <div key={it.id} className="card" style={{ padding: 14, borderRadius: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 950, fontSize: 18 }}>{it.name}</div>
                <div style={{ fontWeight: 950, fontSize: 20 }}>
                  {it.price != null ? "$" + Number(it.price).toFixed(2) : ""}
                </div>
              </div>

              {it.description && (
                <div style={{ marginTop: 8, fontSize: 15 }}>{it.description}</div>
              )}

              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>UPC: {it.upc}</div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button className={"btn " + (it.active ? "btnPrimary" : "")} onClick={() => toggle(it)} style={{ flex: 1 }}>
                  {it.active ? "Active" : "Inactive"}
                </button>
                <button className="btn" onClick={() => remove(it)} style={{ flex: 1 }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}