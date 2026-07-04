"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import Barcode from "react-barcode";
import { useWedgeScanner, CameraScanOverlay } from "../../components/scanner";

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
  const nameRef = useRef<HTMLInputElement | null>(null);

  // search
  const [query, setQuery] = useState("");

  // camera scanner
  const [camOpen, setCamOpen] = useState(false);

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

  /* ---------- scanning (USB wedge + camera) ---------- */
  function handleScan(raw: string) {
    const code = digitsOnly(raw);
    if (code.length < 4) return;
    setCamOpen(false);

    // scanned an existing item -> open it for editing
    const match = items.find(
      (it) => digitsOnly(it.upc) === code || digitsOnly(it.upc).slice(0, 11) === code.slice(0, 11)
    );
    if (match) {
      openEdit(match);
      setStatus(`Scanned: found "${match.name}".`);
      return;
    }

    // new UPC -> pre-fill the add form
    setUpc(code);
    setStatus(`Scanned ${code} — new item, enter a name.`);
    nameRef.current?.focus();
  }

  useWedgeScanner(handleScan, { enabled: !editing && !camOpen, minLength: 6 });

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
    <div className="card">
      <div className="pageHead">
        <div>
          <div className="title">Sale Items</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Active items show first, ordered by sort order. Scan a barcode any time to look up or add.
          </div>
        </div>
        <div className="pageHeadActions">
          <button className="btn btnSoft" onClick={() => setCamOpen(true)}>📷 Scan</button>
          <button className="btn" onClick={load}>Refresh</button>
        </div>
      </div>

      <div className="divider" />

      {/* add form */}
      <div className="formGrid">
        <div className="span12">
          <label className="fieldLabel">Item name</label>
          <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="2% Milk 1gal" />
        </div>

        <div className="span6">
          <label className="fieldLabel">UPC (11 or 12 digits)</label>
          <input className="input" value={upc} onChange={(e) => setUpc(e.target.value)} inputMode="numeric" placeholder="Scan or type" />
          <div className="fieldHelp">USB scanner works here — it types the code for you.</div>
        </div>

        <div className="span3">
          <label className="fieldLabel">Price (optional)</label>
          <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="2.99" />
        </div>

        <div className="span3">
          <label className="fieldLabel">Sort order (1–12)</label>
          <input className="input" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
          <div className="fieldHelp">Auto-fills to the next open slot.</div>
        </div>

        <div className="span12">
          <button className="btn btnPrimary" onClick={add} style={{ width: "100%", padding: "14px 16px", fontSize: 16 }}>
            Add Sale Item
          </button>
        </div>
      </div>

      {status && <div className="statusMsg">{status}</div>}

      <div className="divider" />

      {/* search */}
      <input
        className="input"
        placeholder="🔍 Search by name, UPC, price, order…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginTop: 0, marginBottom: 14 }}
      />

      {loading ? (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 108 }} />
          ))}
        </div>
      ) : (
        <div className="grid">
          {filtered.map((it) => (
            <div key={it.id} className="listRow">
              <div className="listRowTop">
                <div className="listRowName">{it.name}</div>
                <div className="listRowPrice">{it.price != null ? "$" + Number(it.price).toFixed(2) : ""}</div>
              </div>
              <div className="listRowMeta">
                <span className={"chip " + (it.active ? "chipOk" : "chipOff")}>
                  {it.active ? "Active" : "Inactive"}
                </span>{" "}
                <span className="mono">UPC {it.upc}</span> • Order {it.sort_order}
              </div>

              <div className="listRowActions">
                <button className={"btn " + (it.active ? "btnPrimary" : "")} onClick={() => toggle(it)}>
                  {it.active ? "Active" : "Inactive"}
                </button>
                <button className="btn" onClick={() => openEdit(it)}>Edit</button>
                <button className="btn btnDanger" onClick={() => remove(it)}>Delete</button>
              </div>
            </div>
          ))}

          {!filtered.length && <div className="muted">No matching items.</div>}
        </div>
      )}

      {/* camera scan overlay */}
      {camOpen && (
        <CameraScanOverlay
          title="Scan item barcode"
          hint="Point the camera at the UPC on the product."
          onScan={handleScan}
          onClose={() => setCamOpen(false)}
        />
      )}

      {/* edit modal */}
      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="overlayCardScrollable" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div className="title" style={{ fontSize: 20 }}>Edit Sale Item</div>
              <button className="xBtn" onClick={() => setEditing(null)}>×</button>
            </div>

            <div className="divider" />

            <div className="formGrid">
              <div className="span12">
                <label className="fieldLabel">Name</label>
                <input className="input" value={eName} onChange={(e) => setEName(e.target.value)} />
              </div>

              <div className="span6">
                <label className="fieldLabel">UPC (11 or 12 digits)</label>
                <input className="input" value={eUpc} onChange={(e) => setEUpc(e.target.value)} inputMode="numeric" />
                <div className="fieldHelp">11 digits auto-adds the check digit on save.</div>
              </div>

              <div className="span6">
                <label className="fieldLabel">Price (optional)</label>
                <input className="input" value={ePrice} onChange={(e) => setEPrice(e.target.value)} inputMode="decimal" />
              </div>

              <div className="span6">
                <label className="fieldLabel">Sort order</label>
                <input className="input" value={eSortOrder} onChange={(e) => setESortOrder(e.target.value)} inputMode="numeric" />
              </div>

              <div className="span6" style={{ display: "flex", alignItems: "flex-end" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 10 }}>
                  <span className="switch">
                    <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} />
                    <span className="switchTrack" />
                    <span className="switchThumb" />
                  </span>
                  <span style={{ fontWeight: 800, color: "var(--ink)" }}>Active</span>
                </label>
              </div>

              <div className="span12">
                <label className="fieldLabel" style={{ marginBottom: 8 }}>UPC-A barcode preview</label>

                {safeUpcForBarcode ? (
                  <div style={{ background: "#fff", borderRadius: 12, padding: 12, display: "inline-block", border: "1px solid var(--border)" }}>
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
                  <div className="muted">Enter a valid 11/12 digit UPC to preview the barcode.</div>
                )}
              </div>

              <div className="span12" style={{ display: "flex", gap: 10 }}>
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
