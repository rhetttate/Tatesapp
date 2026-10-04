"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OnScreenKeyboard } from "../../components/OnScreenKeyboard";
import {
  AcctKind,
  AcctRow,
  getTabletSetup,
  saveTabletSetup,
  saveTap,
  searchAccounts,
} from "../../../lib/accountsClient";
import {
  connectBluetooth,
  getBridgeStatus,
  onBridgeChange,
  restoreBridge,
  sendDigitsToPos,
} from "../../../lib/posBridge";

const KIND_LABEL: Record<AcctKind, string> = { exempt: "Tax exempt", charge: "Charge" };
const REGISTER_HINT: Record<AcctKind, string> = {
  exempt: "On the register: Manager Menu → Tax Exempt, then send.",
  charge: "On the register: Enter → House Charge, then send.",
};

function prettyNumber(n: string) {
  const d = n.replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
}

export default function AccountsPage() {
  const [kind, setKind] = useState<AcctKind>("exempt");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AcctRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<AcctRow | null>(null);
  const [purchaser, setPurchaser] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; number?: string } | null>(null);
  const [bridge, setBridge] = useState<"connected" | "disconnected">("disconnected");
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupLane, setSetupLane] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [lane, setLane] = useState("");
  const searchSeq = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearResetTimer() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = null;
  }

  useEffect(() => clearResetTimer, []);

  useEffect(() => {
    const s = getTabletSetup();
    setLane(s.lane);
    if (!s.key) setSetupOpen(true);
    setBridge(getBridgeStatus());
    const off = onBridgeChange(setBridge);
    restoreBridge();
    return () => {
      off();
    };
  }, []);

  // search as the cashier types (debounced; stale answers are dropped)
  useEffect(() => {
    if (setupOpen) return;
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchAccounts(kind, query);
        if (seq === searchSeq.current) {
          setRows(r);
          setError("");
        }
      } catch (e) {
        if (seq === searchSeq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (seq === searchSeq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [kind, query, setupOpen]);

  function type(k: string) {
    const set = picked ? setPurchaser : setQuery;
    if (k === "back") set((v) => v.slice(0, -1));
    else if (k === "clear") set("");
    else if (k === "space") set((v) => (v ? (v + " ").slice(0, 40) : v));
    else set((v) => (v + k).slice(0, 40));
  }

  function choose(r: AcctRow) {
    clearResetTimer();
    setPicked(r);
    setPurchaser("");
    setResult(null);
  }

  function reset() {
    clearResetTimer();
    setPicked(null);
    setPurchaser("");
    setQuery("");
    setResult(null);
  }

  async function send() {
    if (!picked || !purchaser.trim() || sending || result?.ok) return;
    clearResetTimer();
    setSending(true);
    setResult(null);
    try {
      let tap;
      try {
        tap = await saveTap(kind, picked.id, purchaser.trim());
      } catch (e) {
        setResult({
          ok: false,
          text: `Couldn't log it (${e instanceof Error ? e.message : String(e)}). Type this number on the register and tell a manager:`,
          number: picked.number,
        });
        return;
      }
      let delivered = false;
      try {
        delivered = (await sendDigitsToPos(tap.number)).delivered;
      } catch {
        delivered = false;
      }
      if (delivered) {
        setResult({ ok: true, text: `Sent to the register ✅ — ${picked.name}` });
        resetTimer.current = setTimeout(reset, 2500);
      } else {
        setResult({ ok: false, text: "The register link is off. Type this number on the register:", number: tap.number });
      }
    } finally {
      setSending(false);
    }
  }

  function saveSetup() {
    if (!setupLane.replace(/\D/g, "") || setupKey.trim().length < 6) return;
    saveTabletSetup(setupLane, setupKey);
    setLane(setupLane.replace(/\D/g, ""));
    setSetupOpen(false);
  }

  return (
    <div className="acRoot">
      <style>{`
        .acRoot { min-height: 100vh; padding: 14px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; background: #f6f8fc; }
        .acTop { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .acBtn { border: 1px solid rgba(10,60,160,0.18); background: #fff; color: #0a2a7a; font-weight: 900; font-size: 18px;
          border-radius: 14px; padding: 12px 18px; cursor: pointer; text-decoration: none; }
        .acBtnOn { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
        .acPill { margin-left: auto; font-weight: 800; font-size: 14px; padding: 8px 12px; border-radius: 999px; }
        .acSplit { display: flex; gap: 12px; flex: 1; min-height: 0; }
        .acLeft { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .acRight { flex: 0 0 clamp(320px, 38vw, 470px); }
        .acField { font-size: 24px; font-weight: 800; padding: 14px 16px; border-radius: 14px; border: 2px solid rgba(10,60,160,0.18); background: #fff; color: #0a2a7a; min-height: 30px; }
        .acList { display: flex; flex-direction: column; gap: 8px; overflow: auto; }
        .acRow { text-align: left; border: 1px solid rgba(10,60,160,0.14); background: #fff; border-radius: 14px; padding: 14px 16px; cursor: pointer; }
        .acRowName { font-size: 22px; font-weight: 900; color: #0a2a7a; }
        .acRowSub { font-size: 15px; color: #475569; margin-top: 2px; }
        .acSend { font-size: 26px; font-weight: 900; padding: 20px; border-radius: 16px; border: 0; background: #16a34a; color: #fff; cursor: pointer; }
        .acSend:disabled { background: #94a3b8; }
        .acBig { font-size: 44px; font-weight: 900; letter-spacing: 2px; color: #0a2a7a; }
        .acMsg { font-size: 18px; font-weight: 800; padding: 12px 14px; border-radius: 14px; }
        @media (max-width: 900px) { .acSplit { flex-direction: column; } .acRight { flex: 0 0 auto; } }
      `}</style>

      <div className="acTop">
        <Link className="acBtn" href="/cashier">‹ Register</Link>
        {(["exempt", "charge"] as AcctKind[]).map((k) => (
          <button key={k} className={"acBtn " + (kind === k ? "acBtnOn" : "")} onClick={() => { setKind(k); reset(); }}>
            {KIND_LABEL[k]}
          </button>
        ))}
        <button className="acBtn" onClick={() => setSetupOpen((v) => !v)}>Setup</button>
        <span className="acPill" style={{ background: bridge === "connected" ? "#dcfce7" : "#fee2e2", color: bridge === "connected" ? "#166534" : "#991b1b" }}>
          {lane ? `Lane ${lane} · ` : ""}{bridge === "connected" ? "Register linked" : "Register not linked"}
        </span>
        {bridge !== "connected" && (
          <button className="acBtn" onClick={async () => { const r = await connectBluetooth(); if (!r.ok) setError(r.message); }}>
            Connect
          </button>
        )}
      </div>

      {setupOpen ? (
        <div className="acLeft" style={{ maxWidth: 520 }}>
          <div className="acRowName">Tablet setup</div>
          <div className="acRowSub">Get the key in Tates Prices: Settings › Reports › Tax exempt › Lane tablets.</div>
          <input className="acField" inputMode="numeric" placeholder="Lane number" value={setupLane} onChange={(e) => setSetupLane(e.target.value)} />
          <input className="acField" placeholder="Tablet key" autoCapitalize="characters" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} />
          <button className="acSend" onClick={saveSetup}>Save</button>
        </div>
      ) : (
        <div className="acSplit">
          <div className="acLeft">
            {!picked ? (
              <>
                <div className="acField">{query || <span style={{ color: "#94a3b8" }}>Search {KIND_LABEL[kind].toLowerCase()} name…</span>}</div>
                <div className="acRowSub">{REGISTER_HINT[kind]}</div>
                {error && <div className="acMsg" style={{ background: "#fee2e2", color: "#991b1b" }}>{error}</div>}
                <div className="acList">
                  {rows.map((r) => (
                    <button key={r.id} className="acRow" onClick={() => choose(r)}>
                      <div className="acRowName">{r.name}</div>
                      <div className="acRowSub">{kind === "charge" ? `Account #${r.number}` : prettyNumber(r.number)}</div>
                    </button>
                  ))}
                  {!loading && !rows.length && !error && <div className="acRowSub">No match.</div>}
                </div>
              </>
            ) : (
              <>
                <div className="acRow" style={{ cursor: "default" }}>
                  <div className="acRowName">{picked.name}</div>
                  <div className="acRowSub">{kind === "charge" ? `Account #${picked.number}` : prettyNumber(picked.number)}</div>
                </div>
                <div className="acRowSub">Who&apos;s purchasing?</div>
                <div className="acField">{purchaser || <span style={{ color: "#94a3b8" }}>Purchaser&apos;s name</span>}</div>
                <button className="acSend" disabled={!purchaser.trim() || sending || !!result?.ok} onClick={send}>
                  {sending ? "Sending…" : "Send to register"}
                </button>
                {result && (
                  <div className="acMsg" style={{ background: result.ok ? "#dcfce7" : "#fef3c7", color: result.ok ? "#166534" : "#92400e" }}>
                    {result.text}
                    {result.number && <div className="acBig">{result.number}</div>}
                  </div>
                )}
                <button className="acBtn" onClick={reset}>Back to list</button>
              </>
            )}
          </div>
          <div className="acRight">
            <OnScreenKeyboard onKey={type} />
          </div>
        </div>
      )}
    </div>
  );
}
