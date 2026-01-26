"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import bwipjs from "bwip-js";

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

function money(n: number | null | undefined) {
  if (n == null) return "";
  return "$" + Number(n).toFixed(2);
}

export default function CashierSalePage() {
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const canvasMapRef = useRef<Record<string, HTMLCanvasElement | null>>({});

  async function load() {
    setLoading(true);
    setStatus("");

    const { data, error } = await supabase
      .from("sale_items")
      .select("id,name,upc,price,active,sort_order,created_at")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) setStatus("Load error: " + error.message);
    setItems((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [items]
  );

  // Render barcodes after load
  useEffect(() => {
    if (!sorted.length) return;

    for (const it of sorted) {
      const upc = digitsOnly(it.upc);
      if (upc.length !== 12) continue;

      const canvas = canvasMapRef.current[it.id];
      if (!canvas) continue;

      try {
        bwipjs.toCanvas(canvas, {
          bcid: "upca",
          text: upc,
          scale: 3,
          height: 14,
          includetext: false // hide digits
        });
      } catch {
        setStatus("Barcode render warning: check a UPC.");
      }
    }
  }, [sorted]);

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">
          <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--blue)" }} />
          Cashier <span className="badge">Sale Items</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn bigBtn" href="/cashier" style={{ width: "auto" }}>
            ← Scan Member
          </Link>
          <button className="btn bigBtn" onClick={load} style={{ width: "auto" }}>
            Refresh
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, borderRadius: 18 }}>
        <div style={{ fontWeight: 950, fontSize: 22 }}>Today’s Sale Barcodes</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Barcodes show on every item (digits hidden). POS can scan the bars.
        </div>

        <div className="hr" />

        {status && <p>{status}</p>}

        {loading ? (
          <div className="muted">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="muted">No active sale items yet.</div>
        ) : (
          <div className="grid" style={{ gap: 12 }}>
            {sorted.map((it) => (
              <div key={it.id} className="card" style={{ padding: 16, borderRadius: 18, border: "1px solid rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 950, fontSize: 18 }}>{it.name}</div>
                  <div style={{ fontWeight: 950, fontSize: 20 }}>{money(it.price)}</div>
                </div>

                <div style={{ marginTop: 10, background: "#fff", borderRadius: 14, padding: 10 }}>
                  <canvas ref={(el) => { canvasMapRef.current[it.id] = el; }} style={{ width: "100%", height: "auto" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}