"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useWedgeScanner, CameraScanOverlay } from "../../components/scanner";

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

/**
 * Produce stickers are often EAN-13 ("02" + PLU + price + check) or plain
 * short codes. Pull the PLU out of whatever the scanner gives us.
 */
function extractPlu(raw: string) {
  const d = digitsOnly(raw);
  if (d.length >= 3 && d.length <= 6) return d;
  // GS1 DataBar / EAN-13 produce codes: PLU is in positions 3–7
  if (d.length === 13 && (d.startsWith("02") || d.startsWith("2"))) {
    return String(Number(d.slice(2, 7)));
  }
  return d;
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
  const nameRef = useRef<HTMLInputElement | null>(null);

  // camera scanner
  const [camOpen, setCamOpen] = useState(false);

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

  /* ---------- scanning (USB wedge + camera) ---------- */
  function handleScan(raw: string) {
    const code = extractPlu(raw);
    if (!code) return;
    setCamOpen(false);

    const match = items.find((it) => it.plu === code);
    if (match) {
      openEdit(match);
      setStatus(`Scanned: found "${match.name}" (PLU ${match.plu}).`);
      return;
    }

    setPlu(code);
    setStatus(`Scanned ${code} — new PLU, enter a name.`);
    nameRef.current?.focus();
  }

  useWedgeScanner(handleScan, { enabled: !editing && !camOpen, minLength: 3 });

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
    <div className="card">
      <div className="pageHead">
        <div>
          <div className="title">PLU Codes</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Produce / lookup codes. Cashiers search these on the tablet and tap to ring up.
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
        <div className="span6">
          <label className="fieldLabel">Item name</label>
          <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bananas" />
        </div>
        <div className="span6">
          <label className="fieldLabel">PLU code (3–6 digits)</label>
          <input className="input" value={plu} onChange={(e) => setPlu(e.target.value)} inputMode="numeric" placeholder="4011" />
          <div className="fieldHelp">Scan a produce sticker with a USB scanner to fill this in.</div>
        </div>
        <div className="span6">
          <label className="fieldLabel">Price (optional)</label>
          <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0.59" />
        </div>
        <div className="span6">
          <label className="fieldLabel">Department (optional)</label>
          <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Produce" />
        </div>
        <div className="span12">
          <button className="btn btnPrimary" onClick={add} style={{ width: "100%", padding: "14px 16px", fontSize: 16 }}>
            Add PLU
          </button>
        </div>
      </div>

      {status && <div className="statusMsg">{status}</div>}

      <div className="divider" />

      <input
        className="input"
        placeholder="🔍 Search PLUs by name or code…"
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
                <span className="mono">PLU {it.plu}</span>
                {it.department ? ` • ${it.department}` : ""}
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
          {!filtered.length && <div className="muted">No PLUs yet. Add one above.</div>}
        </div>
      )}

      {/* camera scan overlay */}
      {camOpen && (
        <CameraScanOverlay
          title="Scan produce sticker"
          hint="Point the camera at the PLU sticker or barcode."
          onScan={handleScan}
          onClose={() => setCamOpen(false)}
        />
      )}

      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="overlayCardScrollable" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="title">Edit PLU</div>
              <button className="xBtn" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="divider" />
            <div className="formGrid">
              <div className="span12">
                <label className="fieldLabel">Name</label>
                <input className="input" value={eName} onChange={(e) => setEName(e.target.value)} />
              </div>
              <div className="span6">
                <label className="fieldLabel">PLU code</label>
                <input className="input" value={ePlu} onChange={(e) => setEPlu(e.target.value)} inputMode="numeric" />
              </div>
              <div className="span6">
                <label className="fieldLabel">Price (optional)</label>
                <input className="input" value={ePrice} onChange={(e) => setEPrice(e.target.value)} inputMode="decimal" />
              </div>
              <div className="span6">
                <label className="fieldLabel">Department</label>
                <input className="input" value={eDept} onChange={(e) => setEDept(e.target.value)} />
              </div>
              <div className="span6">
                <label className="fieldLabel">Sort order</label>
                <input className="input" value={eSort} onChange={(e) => setESort(e.target.value)} inputMode="numeric" />
              </div>
              <div className="span12">
                <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                  <span className="switch">
                    <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} />
                    <span className="switchTrack" />
                    <span className="switchThumb" />
                  </span>
                  <span style={{ fontWeight: 800, color: "var(--ink)" }}>Active</span>
                </label>
              </div>
              <div className="span12" style={{ display: "flex", gap: 10 }}>
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
