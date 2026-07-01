"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import {
  sendToPos,
  connectBluetooth,
  disconnectBluetooth,
  getBridgeStatus,
  getBridgeDeviceName,
  isBluetoothSupported,
  onBridgeChange,
} from "../../../lib/posBridge";

type Plu = {
  id: string;
  plu: string;
  name: string;
  price: number | null;
  department: string | null;
  active: boolean;
  sort_order: number;
};

function beep(freq = 880, ms = 110) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000 + 0.02);
    setTimeout(() => { try { ctx.close(); } catch {} }, ms + 120);
  } catch {}
}
function vibrate(ms = 30) {
  try {
    // @ts-ignore
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}

/** Code128 barcode of the PLU — used as the interim fallback (scan off screen). */
function PluBarcode({ code }: { code: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod: any = await import("bwip-js");
        const bwipjs = mod?.default ?? mod;
        const canvas = ref.current;
        if (!canvas || cancelled) return;
        bwipjs.toCanvas(canvas, {
          bcid: "code128",
          text: code,
          scale: 4,
          height: 22,
          includetext: true,
          textxalign: "center",
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [code]);
  return <canvas ref={ref} style={{ width: "100%", maxWidth: 420, height: 130 }} />;
}

export default function CashierPluPage() {
  const [items, setItems] = useState<Plu[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  const [sentItem, setSentItem] = useState<Plu | null>(null);
  const [sentMsg, setSentMsg] = useState("");
  const [delivered, setDelivered] = useState(false);

  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<"connected" | "disconnected">("disconnected");
  const [bridgeMsg, setBridgeMsg] = useState("");
  const [connecting, setConnecting] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    setStatus("");
    const { data, error } = await supabase
      .from("plus")
      .select("id,plu,name,price,department,active,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) setStatus("Load error: " + error.message);
    setItems((data as any) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    setBridgeStatus(getBridgeStatus());
    const off = onBridgeChange(setBridgeStatus);
    const t = setTimeout(() => searchRef.current?.focus(), 250);
    return () => {
      clearTimeout(t);
      off();
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // Rank: code starts-with first, then name starts-with, then contains.
    const scored = items
      .map((it) => {
        const name = it.name.toLowerCase();
        const code = it.plu.toLowerCase();
        let score = -1;
        if (code.startsWith(q)) score = 0;
        else if (name.startsWith(q)) score = 1;
        else if (code.includes(q)) score = 2;
        else if (name.includes(q)) score = 3;
        else if (`${it.department ?? ""}`.toLowerCase().includes(q)) score = 4;
        return { it, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score || a.it.name.localeCompare(b.it.name));
    return scored.map((x) => x.it);
  }, [items, query]);

  async function ring(it: Plu) {
    beep(980, 90);
    vibrate(25);
    const res = await sendToPos(it.plu);
    setSentItem(it);
    setSentMsg(res.message);
    setDelivered(res.delivered);
    if (res.delivered) {
      // Auto-clear the confirmation and refocus search for the next item.
      setTimeout(() => {
        setSentItem(null);
        setQuery("");
        searchRef.current?.focus();
      }, 1100);
    }
  }

  async function doConnect() {
    setConnecting(true);
    setBridgeMsg("");
    const res = await connectBluetooth();
    setBridgeMsg(res.message);
    setConnecting(false);
  }

  function doDisconnect() {
    disconnectBluetooth();
    setBridgeMsg("Disconnected.");
  }

  return (
    <div className="pluRoot">
      <style jsx global>{`
        html, body { height: 100%; background: var(--bg); }
        .pluRoot { min-height: 100svh; min-height: 100vh; padding: 14px; box-sizing: border-box; }
        .pluBar {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 12px 14px; border-radius: 18px; background: #fff;
          border: 1px solid var(--border); box-shadow: var(--shadow-sm);
        }
        .pluSearchWrap { position: relative; margin-top: 14px; }
        .pluSearchIcon {
          position: absolute; left: 18px; top: 50%; transform: translateY(-50%);
          font-size: 22px; opacity: .5; pointer-events: none;
        }
        .pluSearch {
          width: 100%; padding: 20px 20px 20px 54px; font-size: 22px; font-weight: 800;
          border-radius: 18px; border: 1px solid var(--border); outline: none;
          background: #fff; color: var(--ink); box-shadow: var(--shadow-sm);
        }
        .pluSearch:focus { border-color: rgba(37,99,235,.55); box-shadow: var(--ring); }
        .pluGrid {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 12px;
        }
        .pluTile {
          text-align: left; cursor: pointer;
          background: linear-gradient(180deg, #ffffff, #f6faff);
          border: 1px solid var(--border); border-radius: 18px; padding: 16px;
          box-shadow: var(--shadow-sm);
          transition: transform .1s ease, box-shadow .18s ease;
          display: flex; flex-direction: column; gap: 6px; min-height: 104px;
        }
        .pluTile:active { transform: scale(.97); }
        .pluTile:hover { box-shadow: var(--shadow); }
        .pluTileName { font-weight: 900; font-size: 19px; color: var(--ink); letter-spacing: -.01em; line-height: 1.1; }
        .pluTileMeta { font-weight: 800; color: var(--blue2); font-size: 14px; }
        .pluTilePrice { margin-top: auto; font-weight: 900; font-size: 20px; color: var(--ink); }
        .pluHint { color: var(--muted); font-weight: 700; }
      `}</style>

      <div className="pluBar">
        <Link href="/cashier" className="btn btnSoft" style={{ textDecoration: "none" }}>← Register</Link>
        <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 18 }}>PLU Lookup</div>
        <div style={{ flex: 1 }} />
        <span className={"badge " + (bridgeStatus === "connected" ? "badgeOn" : "badgeOff")}>
          {bridgeStatus === "connected" ? "Register linked" : "Not linked"}
        </span>
        <button className="btn" onClick={() => setBridgeOpen(true)} style={{ padding: "10px 14px" }}>Setup</button>
        <button className="btn" onClick={load} style={{ padding: "10px 14px" }}>Refresh</button>
      </div>

      <div className="pluSearchWrap">
        <span className="pluSearchIcon">🔍</span>
        <input
          ref={searchRef}
          className="pluSearch"
          placeholder="Search item or PLU…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputMode="search"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>

      {status ? <div className="statusMsg statusErr" style={{ paddingLeft: 4 }}>{status}</div> : null}

      {loading ? (
        <div className="pluGrid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 104, borderRadius: 18 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          <div className="muted">{query ? `No match for “${query}”.` : "No PLUs yet — add some in Admin → PLUs."}</div>
        </div>
      ) : (
        <div className="pluGrid">
          {filtered.map((it) => (
            <button key={it.id} className="pluTile" onClick={() => ring(it)}>
              <div className="pluTileName">{it.name}</div>
              <div className="pluTileMeta">PLU {it.plu}{it.department ? ` • ${it.department}` : ""}</div>
              <div className="pluTilePrice">{it.price != null ? "$" + Number(it.price).toFixed(2) : ""}</div>
            </button>
          ))}
        </div>
      )}

      {/* Sent / fallback confirmation */}
      {sentItem ? (
        <div className="overlay" onClick={() => setSentItem(null)}>
          <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="title">{sentItem.name}</div>
              <button className="xBtn" onClick={() => setSentItem(null)}>×</button>
            </div>
            <div className="muted" style={{ marginTop: 4 }}>PLU {sentItem.plu}</div>

            {delivered ? (
              <div style={{ marginTop: 18, textAlign: "center" }}>
                <div style={{ fontSize: 46 }}>✅</div>
                <div className="title" style={{ marginTop: 8 }}>Sent to register</div>
              </div>
            ) : (
              <>
                <div style={{ marginTop: 14, background: "#fff", borderRadius: 16, padding: 14, display: "flex", justifyContent: "center", border: "1px solid var(--border)" }}>
                  <PluBarcode code={sentItem.plu} />
                </div>
                <div className="muted" style={{ marginTop: 10, textAlign: "center" }}>
                  {sentMsg} Scan the barcode or key <b>{sentItem.plu}</b> on the register.
                </div>
              </>
            )}

            <div className="btnRow">
              <button className="btn btnPrimary" style={{ flex: 1 }} onClick={() => { setSentItem(null); searchRef.current?.focus(); }}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* POS bridge setup */}
      {bridgeOpen ? (
        <div className="overlay" onClick={() => setBridgeOpen(false)}>
          <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="title">POS Bridge</div>
              <button className="xBtn" onClick={() => setBridgeOpen(false)}>×</button>
            </div>

            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span className={"badge " + (bridgeStatus === "connected" ? "badgeOn" : "badgeOff")}>
                <span className="pillDot" style={{ width: 8, height: 8, borderRadius: 999, background: "currentColor", display: "inline-block" }} />
                {bridgeStatus === "connected" ? `Linked${getBridgeDeviceName() ? ` · ${getBridgeDeviceName()}` : ""}` : "Not linked"}
              </span>
            </div>

            <div className="muted" style={{ marginTop: 12 }}>
              {isBluetoothSupported()
                ? "Connect to the “TatesPOSBridge” device plugged into the register. Once linked, tapping an item types it straight into the POS. If it isn't linked, every tap still shows a barcode you can scan."
                : "This browser can't use Bluetooth — use Chrome on an Android tablet. Until then, tapping an item shows a barcode you can scan."}
            </div>

            {bridgeMsg ? <div className="statusMsg">{bridgeMsg}</div> : null}

            <div className="btnRow">
              {bridgeStatus === "connected" ? (
                <button className="btn btnSoft" style={{ flex: 1 }} onClick={doDisconnect}>Disconnect</button>
              ) : (
                <button
                  className="btn btnPrimary"
                  style={{ flex: 1 }}
                  onClick={doConnect}
                  disabled={connecting || !isBluetoothSupported()}
                >
                  {connecting ? "Connecting…" : "Connect to register"}
                </button>
              )}
              <button className="btn" style={{ flex: 1 }} onClick={() => setBridgeOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
