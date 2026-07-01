"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

type SaleItem = {
  id: string;
  name: string;
  upc: string;
  price: number | null;
  description: string | null;
  active: boolean;
  sort_order: number;
};

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

export default function CashierUpcsPage() {
  const [items, setItems] = useState<SaleItem[]>([]);
  const [status, setStatus] = useState("");
  const canvasMapRef = useRef<Record<string, HTMLCanvasElement | null>>({});

  async function load() {
    setStatus("");
    const { data, error } = await supabase
      .from("sale_items")
      .select("id,name,upc,price,description,active,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      setStatus("Load error: " + error.message);
      return;
    }

    const list = ((data as any) || []) as SaleItem[];
    setItems(list.slice(0, 8)); // fits the screen perfectly
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 4000); // phone updates show up fast
    return () => clearInterval(t);
  }, []);

  // Draw the UPC-A barcodes to <canvas> (Node's Buffer isn't available in the browser).
  useEffect(() => {
    if (!items.length) return;
    let cancelled = false;
    (async () => {
      const mod: any = await import("bwip-js");
      const bwipjs = mod?.default ?? mod;
      if (cancelled) return;
      for (const it of items) {
        const upc = digitsOnly(it.upc).slice(0, 12);
        const canvas = canvasMapRef.current[it.id];
        if (!canvas || upc.length !== 12) continue;
        try {
          bwipjs.toCanvas(canvas, {
            bcid: "upca",
            text: upc,
            scale: 2,
            height: 9,
            includetext: false,
          });
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [items]);

  return (
    <div className="saleRoot">
      <style jsx global>{`
        html, body { height: 100%; background: #f3f7ff; }
        .saleRoot { height: 100vh; width: 100vw; overflow: hidden; padding: 12px; box-sizing: border-box; }
        .saleGrid {
          height: 100%;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-template-rows: repeat(2, 1fr);
          gap: 12px;
        }
        .saleCard {
          background: #fff;
          border-radius: 22px;
          border: 1px solid rgba(29,78,216,0.14);
          box-shadow: 0 8px 24px rgba(10,42,122,0.06);
          padding: 14px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .saleName { font-weight: 950; color: #0a2a7a; font-size: 18px; line-height: 1.15; }
        .saleDesc { margin-top: 8px; font-weight: 900; color: rgba(10,42,122,0.78); font-size: 18px; line-height: 1.15; }
        .salePrice { margin-top: 8px; font-weight: 950; color: #1d4ed8; font-size: 22px; }
        .barcodeBox {
          margin-top: auto;
          background: #f7faff;
          border-radius: 18px;
          border: 1px solid rgba(29,78,216,0.12);
          padding: 10px;
          display: flex;
          justify-content: center;
        }
        .barcodeImg { width: 86%; max-width: 380px; height: auto; }
        .saleStatus { font-weight: 900; color: #0a2a7a; padding: 10px; }
      `}</style>

      {status ? <div className="saleStatus">{status}</div> : null}

      <div className="saleGrid">
        {items.map((it) => (
          <div key={it.id} className="saleCard">
            <div className="saleName">{it.name}</div>
            {it.description ? <div className="saleDesc">{it.description}</div> : null}
            <div className="salePrice">{it.price != null ? "$" + Number(it.price).toFixed(2) : ""}</div>

            <div className="barcodeBox">
              <canvas
                className="barcodeImg"
                ref={(el) => { canvasMapRef.current[it.id] = el; }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
