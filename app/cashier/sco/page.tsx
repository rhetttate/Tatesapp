"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import {
  Lane,
  LaneEvent,
  LaneStatus,
  connectLane,
  disconnectLane,
  getLaneDeviceName,
  getLaneStatus,
  isBluetoothSupported,
  onLaneEvent,
  onLaneStatus,
  sendToLane,
} from "../../../lib/scoBridge";

/* ---------- types ---------- */
type Plu = {
  id: string;
  plu: string;
  name: string;
  price: number | null;
  department: string | null;
  active: boolean;
  sort_order: number;
};

type SaleItem = {
  id: string;
  name: string;
  upc: string;
  price: number | null;
  active: boolean;
  sort_order: number;
};

type FeedLine = {
  id: number;
  lane: Lane;
  text: string;
  kind: "sent" | "ok" | "fail" | "host" | "info";
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

let feedSeq = 1;

export default function CashierScoPage() {
  const [plus, setPlus] = useState<Plu[]>([]);
  const [sale, setSale] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const [lane, setLane] = useState<Lane>(1);
  const [laneStatus, setLaneStatus] = useState<Record<Lane, LaneStatus>>({
    1: "disconnected",
    2: "disconnected",
  });
  const [connecting, setConnecting] = useState<Lane | 0>(0);
  // Set after mount — reading navigator.bluetooth during render makes the
  // server and client disagree (hydration mismatch).
  const [btReady, setBtReady] = useState(false);

  const [tab, setTab] = useState<"plu" | "sale">("plu");
  const [entry, setEntry] = useState("");
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [banner, setBanner] = useState("");
  const bannerTimer = useRef<any>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  function pushFeed(l: Lane, text: string, kind: FeedLine["kind"]) {
    setFeed((f) => [...f.slice(-59), { id: feedSeq++, lane: l, text, kind }]);
  }

  function flashBanner(msg: string) {
    setBanner(msg);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(""), 1800);
  }

  async function load() {
    setLoading(true);
    setStatus("");
    const [pluRes, saleRes] = await Promise.all([
      supabase
        .from("plus")
        .select("id,plu,name,price,department,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("sale_items")
        .select("id,name,upc,price,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);
    if (pluRes.error) setStatus("Load error: " + pluRes.error.message);
    else if (saleRes.error) setStatus("Load error: " + saleRes.error.message);
    setPlus((pluRes.data as any) || []);
    setSale((saleRes.data as any) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    setBtReady(isBluetoothSupported());
    setLaneStatus({ 1: getLaneStatus(1), 2: getLaneStatus(2) });
    const offStatus = onLaneStatus((l, s) => setLaneStatus((prev) => ({ ...prev, [l]: s })));
    const offEvent = onLaneEvent((l, e: LaneEvent) => {
      if (e.kind === "scan-ok") pushFeed(l, `✓ Rang ${e.code}`, "ok");
      else if (e.kind === "scan-fail") pushFeed(l, `✗ NCR didn't take ${e.code}`, "fail");
      else if (e.kind === "host") pushFeed(l, `NCR → scanner: ${e.hex}`, "host");
      else if (e.kind === "pong") pushFeed(l, `Bridge alive (${e.name})`, "info");
    });
    return () => {
      offStatus();
      offEvent();
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  // Keep the feed pinned to the latest line.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed]);

  const filteredPlus = useMemo(() => {
    const q = entry.trim();
    if (!q) return plus;
    return plus.filter((it) => it.plu.startsWith(q) || it.plu.includes(q));
  }, [plus, entry]);

  const filteredSale = useMemo(() => {
    const q = entry.trim();
    if (!q) return sale;
    return sale.filter((it) => it.upc.replace(/\D/g, "").includes(q));
  }, [sale, entry]);

  async function ring(code: string, label: string) {
    beep(980, 90);
    vibrate(25);
    pushFeed(lane, `→ ${label}`, "sent");
    const res = await sendToLane(lane, code);
    if (!res.delivered) {
      beep(240, 220);
      pushFeed(lane, res.message, "fail");
    }
    flashBanner(res.delivered ? `Sent to self-checkout ${lane} ✅` : res.message);
  }

  async function doConnect(l: Lane) {
    setConnecting(l);
    const res = await connectLane(l);
    pushFeed(l, res.message, res.ok ? "info" : "fail");
    flashBanner(res.message);
    setConnecting(0);
  }

  function key(k: string) {
    vibrate(12);
    if (k === "⌫") setEntry((e) => e.slice(0, -1));
    else if (k === "C") setEntry("");
    else setEntry((e) => (e + k).slice(0, 14));
  }

  const laneCard = (l: Lane) => {
    const linked = laneStatus[l] === "connected";
    const selected = lane === l;
    return (
      <div
        className={"scoLane" + (selected ? " scoLaneSel" : "") + (linked ? " scoLaneOn" : "")}
        onClick={() => setLane(l)}
      >
        <div className="scoLaneTitle">Self-Checkout {l}</div>
        <div className={"badge " + (linked ? "badgeOn" : "badgeOff")}>
          {linked ? `Linked · ${getLaneDeviceName(l) || `TatesSCO-${l}`}` : "Not linked"}
        </div>
        <div className="scoLaneBtns">
          {linked ? (
            <button
              className="btn btnSoft"
              onClick={(e) => { e.stopPropagation(); disconnectLane(l); }}
            >
              Unlink
            </button>
          ) : (
            <button
              className="btn btnPrimary"
              disabled={connecting !== 0 || !btReady}
              onClick={(e) => { e.stopPropagation(); doConnect(l); }}
            >
              {connecting === l ? "Linking…" : "Link"}
            </button>
          )}
        </div>
        {selected ? <div className="scoLaneArrow">sending here ▾</div> : null}
      </div>
    );
  };

  return (
    <div className="scoRoot">
      <style jsx global>{`
        html, body { height: 100%; background: var(--bg); }
        .scoRoot { min-height: 100svh; min-height: 100vh; padding: 12px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; }
        .scoBar {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 10px 14px; border-radius: 18px; background: #fff;
          border: 1px solid var(--border); box-shadow: var(--shadow-sm);
        }
        .scoLanes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .scoLane {
          position: relative; cursor: pointer; border-radius: 18px; padding: 14px 16px;
          background: #fff; border: 2px solid var(--border); box-shadow: var(--shadow-sm);
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .scoLaneSel { border-color: var(--blue2); box-shadow: var(--ring); }
        .scoLaneTitle { font-weight: 900; font-size: 20px; color: var(--ink); letter-spacing: -.01em; }
        .scoLaneBtns { margin-left: auto; }
        .scoLaneArrow {
          position: absolute; right: 14px; bottom: -10px; background: var(--blue2); color: #fff;
          font-size: 12px; font-weight: 800; padding: 2px 10px; border-radius: 999px;
        }
        .scoSplit { flex: 1; display: flex; gap: 12px; min-height: 0; }
        .scoLeft { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .scoTabs { display: flex; gap: 8px; }
        .scoTab {
          flex: 1; padding: 12px; border-radius: 14px; font-weight: 900; font-size: 17px;
          border: 1px solid var(--border); background: #fff; color: var(--muted); cursor: pointer;
        }
        .scoTabOn { background: var(--blue2); border-color: var(--blue2); color: #fff; }
        .scoGrid {
          flex: 1; overflow-y: auto; display: grid; align-content: start;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; padding-bottom: 6px;
        }
        .scoTile {
          text-align: left; cursor: pointer;
          background: linear-gradient(180deg, #ffffff, #f6faff);
          border: 1px solid var(--border); border-radius: 16px; padding: 13px;
          box-shadow: var(--shadow-sm); transition: transform .1s ease;
          display: flex; flex-direction: column; gap: 5px; min-height: 92px;
        }
        .scoTile:active { transform: scale(.96); }
        .scoTileName { font-weight: 900; font-size: 18px; color: var(--ink); line-height: 1.1; }
        .scoTileMeta { font-weight: 800; color: var(--blue2); font-size: 13px; }
        .scoTilePrice { margin-top: auto; font-weight: 900; font-size: 18px; color: var(--ink); }
        .scoRight { width: clamp(300px, 30vw, 380px); display: flex; flex-direction: column; gap: 10px; }
        .scoEntry {
          background: #fff; border: 1px solid var(--border); border-radius: 16px;
          padding: 12px 16px; font-size: 30px; font-weight: 900; letter-spacing: .06em;
          color: var(--ink); min-height: 58px; display: flex; align-items: center; box-sizing: border-box;
        }
        .scoEntry span.scoPh { color: var(--muted); font-size: 16px; letter-spacing: 0; font-weight: 700; }
        .scoPad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .scoKey {
          padding: 16px 0; border-radius: 14px; border: 1px solid var(--border); background: #fff;
          font-size: 24px; font-weight: 900; color: var(--ink); cursor: pointer; box-shadow: var(--shadow-sm);
        }
        .scoKey:active { transform: scale(.95); }
        .scoSend {
          padding: 16px; border-radius: 14px; border: none; background: var(--blue2); color: #fff;
          font-size: 20px; font-weight: 900; cursor: pointer;
        }
        .scoSend:disabled { opacity: .45; }
        .scoFeed {
          flex: 1; min-height: 90px; overflow-y: auto; background: #0f172a; border-radius: 16px;
          padding: 10px 12px; font-family: var(--mono, monospace); font-size: 13px; line-height: 1.5;
        }
        .scoFeedLine { color: #cbd5e1; }
        .scoFeedLine b { color: #7dd3fc; font-weight: 700; }
        .scoFeedOk { color: #86efac; }
        .scoFeedFail { color: #fca5a5; }
        .scoFeedHost { color: #fcd34d; }
        .scoBanner {
          position: fixed; left: 50%; top: 14px; transform: translateX(-50%); z-index: 50;
          background: var(--ink); color: #fff; font-weight: 800; padding: 10px 18px;
          border-radius: 999px; box-shadow: var(--shadow);
        }
        @media (max-width: 900px) {
          .scoSplit { flex-direction: column; }
          .scoRight { width: 100%; }
        }
      `}</style>

      <div className="scoBar">
        <Link href="/cashier" className="btn btnSoft" style={{ textDecoration: "none" }}>← Register</Link>
        <div style={{ fontWeight: 900, color: "var(--ink)", fontSize: 18 }}>Self-Checkout Control</div>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={load} style={{ padding: "10px 14px" }}>Refresh</button>
      </div>

      <div className="scoLanes">
        {laneCard(1)}
        {laneCard(2)}
      </div>

      {status ? <div className="statusMsg statusErr" style={{ paddingLeft: 4 }}>{status}</div> : null}

      <div className="scoSplit">
        <div className="scoLeft">
          <div className="scoTabs">
            <button className={"scoTab" + (tab === "plu" ? " scoTabOn" : "")} onClick={() => setTab("plu")}>
              Produce / PLU
            </button>
            <button className={"scoTab" + (tab === "sale" ? " scoTabOn" : "")} onClick={() => setTab("sale")}>
              Sale items
            </button>
          </div>

          {loading ? (
            <div className="scoGrid">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton" style={{ height: 92, borderRadius: 16 }} />
              ))}
            </div>
          ) : tab === "plu" ? (
            <div className="scoGrid">
              {filteredPlus.length === 0 ? (
                <div className="muted" style={{ padding: 12 }}>
                  {entry ? `No PLU matches ${entry}.` : "No PLUs yet — add some in Admin → PLUs."}
                </div>
              ) : (
                filteredPlus.map((it) => (
                  <button key={it.id} className="scoTile" onClick={() => ring(it.plu, `${it.name} (PLU ${it.plu})`)}>
                    <div className="scoTileName">{it.name}</div>
                    <div className="scoTileMeta">PLU {it.plu}{it.department ? ` • ${it.department}` : ""}</div>
                    <div className="scoTilePrice">{it.price != null ? "$" + Number(it.price).toFixed(2) : ""}</div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="scoGrid">
              {filteredSale.length === 0 ? (
                <div className="muted" style={{ padding: 12 }}>
                  {entry ? `No sale item matches ${entry}.` : "No sale items."}
                </div>
              ) : (
                filteredSale.map((it) => (
                  <button key={it.id} className="scoTile" onClick={() => ring(it.upc, `${it.name}`)}>
                    <div className="scoTileName">{it.name}</div>
                    <div className="scoTileMeta">UPC {it.upc}</div>
                    <div className="scoTilePrice">{it.price != null ? "$" + Number(it.price).toFixed(2) : ""}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="scoRight">
          <div className="scoEntry">
            {entry || <span className="scoPh">Type a PLU / UPC — filters tiles, Send rings it</span>}
          </div>
          <div className="scoPad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) => (
              <button key={k} className="scoKey" onClick={() => key(k)}>{k}</button>
            ))}
          </div>
          <button
            className="scoSend"
            disabled={!entry}
            onClick={() => { ring(entry, `keyed ${entry}`); setEntry(""); }}
          >
            Send {entry ? `“${entry}”` : "code"} → Self-Checkout {lane}
          </button>
          <div className="scoFeed" ref={feedRef}>
            {feed.length === 0 ? (
              <div className="scoFeedLine" style={{ opacity: 0.6 }}>
                Activity will show here — sends, confirmations, and anything the NCR says to the scanner.
              </div>
            ) : (
              feed.map((l) => (
                <div
                  key={l.id}
                  className={
                    "scoFeedLine" +
                    (l.kind === "ok" ? " scoFeedOk" : l.kind === "fail" ? " scoFeedFail" : l.kind === "host" ? " scoFeedHost" : "")
                  }
                >
                  <b>L{l.lane}</b> {l.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {banner ? <div className="scoBanner">{banner}</div> : null}
    </div>
  );
}
