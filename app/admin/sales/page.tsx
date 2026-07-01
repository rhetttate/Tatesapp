"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import Barcode from "react-barcode";

type SaleItem = {
  id: string;
  name: string;
  upc: string;
  price: number | null;
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

function normalizeUpc(raw: string) {
  let u = digitsOnly(raw);
  if (u.length === 11) u = u + String(upcCheckDigit(u));
  if (u.length !== 12) throw new Error("UPC must be 11 or 12 digits (11 auto-adds check digit).");
  return u;
}

function moneyToNumberOrNull(raw: string) {
  const t = (raw || "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error("Price must be a valid number.");
  return n;
}

export default function AdminSalesPage() {
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  // add form
  const [name, setName] = useState("");
  const [upc, setUpc] = useState("");
  const [price, setPrice] = useState("");
  const [sortOrder, setSortOrder] = useState("0");

  // search
  const [query, setQuery] = useState("");

  // edit modal/state
  const [editing, setEditing] = useState<SaleItem | null>(null);
  const [eName, setEName] = useState("");
  const [eUpc, setEUpc] = useState("");
  const [ePrice, setEPrice] = useState("");
  const [eSortOrder, setESortOrder] = useState("0");
  const [eActive, setEActive] = useState(true);

  async function load() {
    setLoading(true);
    setStatus("");
    const { data, error } = await supabase
      .from("sale_items")
      .select("id,name,upc,price,active,sort_order,created_at")
      .order("active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) setStatus("Load error: " + error.message);
    setItems((data as any) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // auto-fill next sort order based on count of active (so if 4 active -> next defaults to 5)
  useEffect(() => {
    const activeCount = items.filter((x) => x.active).length;
    const next = Math.max(activeCount + 1, 1);
    setSortOrder(String(next));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;

    if (q) {
      list = list.filter((it) => {
        const hay = `${it.name} ${it.upc} ${it.sort_order} ${it.price ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // active on top, active ordered by sort_order, then inactive
    return [...list].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const ao = Number(a.sort_order ?? 0);
      const bo = Number(b.sort_order ?? 0);
      if (ao !== bo) return ao - bo;
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
  }, [items, query]);

  async function add() {
    setStatus("");
    try {
      if (!name.trim()) throw new Error("Enter name.");

      const u = normalizeUpc(upc);
      const p = moneyToNumberOrNull(price);

      const soNum = Number(digitsOnly(sortOrder) || "0");
      if (!Number.isFinite(soNum) || soNum < 0) throw new Error("Sort order must be a valid number.");

      const { error } = await supabase.from("sale_items").insert({
        name: name.trim(),
        upc: u,
        price: p,
        active: true,
        sort_order: soNum,
      });

      if (error) throw error;

      setName("");
      setUpc("");
      setPrice("");
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
    const ok = window.confirm(`Delete "${it.name}"?`);
    if (!ok) return;
    const { error } = await supabase.from("sale_items").delete().eq("id", it.id);
    if (error) setStatus("Delete error: " + error.message);
    await load();
  }

  function openEdit(it: SaleItem) {
    setStatus("");
    setEditing(it);
    setEName(it.name || "");
    setEUpc(it.upc || "");
    setEPrice(it.price != null ? String(Number(it.price)) : "");
    setESortOrder(String(it.sort_order ?? 0));
    setEActive(!!it.active);
  }

  async function saveEdit() {
    if (!editing) return;
    setStatus("");
    try {
      if (!eName.trim()) throw new Error("Enter name.");

      const u = normalizeUpc(eUpc);
      const p = moneyToNumberOrNull(ePrice);

      const soNum = Number(digitsOnly(eSortOrder) || "0");
      if (!Number.isFinite(soNum) || soNum < 0) throw new Error("Sort order must be a valid number.");

      const { error } = await supabase
        .from("sale_items")
        .update({
          name: eName.trim(),
          upc: u,
          price: p,
          active: eActive,
          sort_order: soNum,
        })
        .eq("id", editing.id);

      if (error) throw error;

      setEditing(null);
      setStatus("Saved.");
      await load();
    } catch (e: any) {
      setStatus("Save error: " + (e?.message ?? String(e)));
    }
  }

  // for rendering barcode in modal without crashing while typing
  const safeUpcForBarcode = useMemo(() => {
    try {
      return normalizeUpc(eUpc);
    } catch {
      return ""; // show helper text instead
    }
  }, [eUpc]);

  return (
    <div className="card" style={{ padding: 16, borderRadius: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 22 }}>Sales Items</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Active items show first (ordered by Sort Order). Search filters instantly.
          </div>
        </div>
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="hr" />

      {/* search */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontWeight: 900 }}>
          Search
          <input
            className="input"
            placeholder="Search by name, UPC, price, order…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginTop: 6 }}
          />
        </label>
      </div>

      {/* add form */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
        <div style={{ gridColumn: "span 12" }}>
          <label>
            Item Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>

        <div style={{ gridColumn: "span 6" }}>
          <label>
            UPC (11 or 12 digits)
            <input className="input" value={upc} onChange={(e) => setUpc(e.target.value)} />
          </label>
        </div>

        <div style={{ gridColumn: "span 6" }}>
          <label style={{ fontSize: 16, fontWeight: 900 }}>
            Price (optional)
            <input
              className="input"
              style={{ fontSize: 18, fontWeight: 900 }}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 2.99"
            />
          </label>
        </div>

        <div style={{ gridColumn: "span 6" }}>
          <label>
            Sort Order (1–8 recommended)
            <input
              className="input"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Auto-fills to next slot based on active count.
          </div>
        </div>

        <div style={{ gridColumn: "span 12" }}>
          <button className="btn btnPrimary" onClick={add} style={{ width: "100%", padding: "14px 16px", fontSize: 16 }}>
            Add Sale Item
          </button>
        </div>
      </div>

      {status && <p style={{ marginTop: 10 }}>{status}</p>}

      <div className="hr" />
      <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 10 }}>Items</div>

      {loading ? (
        <div className="muted">Loading...</div>
      ) : (
        <div className="grid">
          {filtered.map((it) => (
            <div key={it.id} className="card" style={{ padding: 14, borderRadius: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 950, fontSize: 18 }}>{it.name}</div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                    UPC: {it.upc} • Order: {it.sort_order}
                  </div>
                </div>
                <div style={{ fontWeight: 950, fontSize: 20 }}>
                  {it.price != null ? "$" + Number(it.price).toFixed(2) : ""}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button className={"btn " + (it.active ? "btnPrimary" : "")} onClick={() => toggle(it)} style={{ flex: 1 }}>
                  {it.active ? "Active" : "Inactive"}
                </button>

                <button className="btn" onClick={() => openEdit(it)} style={{ flex: 1 }}>
                  Edit
                </button>

                <button className="btn" onClick={() => remove(it)} style={{ flex: 1 }}>
                  Delete
                </button>
              </div>
            </div>
          ))}

          {!filtered.length && <div className="muted">No matching items.</div>}
        </div>
      )}

      {/* edit modal */}
      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            zIndex: 1000,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            className="card"
            style={{ width: "min(760px, 100%)", padding: 16, borderRadius: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div style={{ fontWeight: 950, fontSize: 20 }}>Edit Sale Item</div>
              <button className="btn" onClick={() => setEditing(null)}>
                Close
              </button>
            </div>

            <div className="hr" />

            <div className="grid" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
              <div style={{ gridColumn: "span 12" }}>
                <label>
                  Name
                  <input className="input" value={eName} onChange={(e) => setEName(e.target.value)} />
                </label>
              </div>

              <div style={{ gridColumn: "span 6" }}>
                <label>
                  UPC (11 or 12 digits)
                  <input className="input" value={eUpc} onChange={(e) => setEUpc(e.target.value)} />
                </label>
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                  11 digits will auto-add the check digit when you save.
                </div>
              </div>

              <div style={{ gridColumn: "span 6" }}>
                <label style={{ fontSize: 16, fontWeight: 900 }}>
                  Price (optional)
                  <input
                    className="input"
                    style={{ fontSize: 18, fontWeight: 900 }}
                    value={ePrice}
                    onChange={(e) => setEPrice(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
              </div>

              <div style={{ gridColumn: "span 6" }}>
                <label>
                  Sort Order
                  <input className="input" value={eSortOrder} onChange={(e) => setESortOrder(e.target.value)} inputMode="numeric" />
                </label>
              </div>

              <div style={{ gridColumn: "span 6" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28 }}>
                  <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} />
                  Active
                </label>
              </div>

              <div style={{ gridColumn: "span 12" }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>UPC-A Barcode</div>

                {safeUpcForBarcode ? (
                  <div style={{ background: "#fff", borderRadius: 12, padding: 12, display: "inline-block" }}>
                    <Barcode
                      value={safeUpcForBarcode}
                      format="UPC"
                      width={2}
                      height={80}
                      displayValue={true}
                      margin={8}
                    />
                  </div>
                ) : (
                  <div className="muted">Enter a valid 11/12 digit UPC to preview the UPC-A barcode.</div>
                )}
              </div>

              <div style={{ gridColumn: "span 12", display: "flex", gap: 10 }}>
                <button className="btn btnPrimary" onClick={saveEdit} style={{ flex: 1, padding: "14px 16px", fontSize: 16 }}>
                  Save Changes
                </button>
                <button className="btn" onClick={() => setEditing(null)} style={{ flex: 1, padding: "14px 16px", fontSize: 16 }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
