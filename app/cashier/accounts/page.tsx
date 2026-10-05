"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OnScreenKeyboard } from "../../components/OnScreenKeyboard";
import {
  AcctKind,
  AcctRow,
  getTabletSetup,
  listPurchasers,
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

function expiryNote(r: AcctRow): { text: string; red: boolean } | null {
  if (r.expiry === "expired") return { text: "EXPIRED — ask for a new form", red: true };
  if (r.expiry === "soon" && r.end_date) {
    const [, m, d] = r.end_date.slice(0, 10).split("-");
    if (m && d) return { text: `Expires ${Number(m)}/${Number(d)}`, red: false };
  }
  return null;
}

export default function AccountsPage() {
  const [kind, setKind] = useState<AcctKind>("exempt");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AcctRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<AcctRow | null>(null);
  const [purchaser, setPurchaser] = useState("");
  const [purchasers, setPurchasers] = useState<string[]>([]);
  const [purchasersLoading, setPurchasersLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [locked, setLocked] = useState<{ linked: string; name: string; purchaser: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; number?: string } | null>(null);
  const [bridge, setBridge] = useState<"connected" | "disconnected">("disconnected");
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupLane, setSetupLane] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [lane, setLane] = useState("");
  const searchSeq = useRef(0);
  const purchSeq = useRef(0);
  const sendingRef = useRef(false);
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
        if (seq === searchSeq.current) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          if (/bad tablet key/i.test(msg)) setSetupOpen(true);
        }
      } finally {
        if (seq === searchSeq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [kind, query, setupOpen]);

  // 8 names on file => further names are one-time only (not saved)
  const full = purchasers.length >= 8;
  const typingPurchaser =
    !!picked && !locked && (adding || full || (!purchasersLoading && purchasers.length === 0));
  const oneTime = full && !purchasers.some((n) => n.toLowerCase() === purchaser.trim().toLowerCase());

  function type(k: string) {
    if (locked) return;
    if (picked && !typingPurchaser) return;
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
    setAdding(false);
    setPurchasers([]);
    setPurchasersLoading(true);
    const seq = ++purchSeq.current;
    listPurchasers(kind, r.id)
      .then((names) => {
        if (seq === purchSeq.current) setPurchasers(names.slice(0, 8));
      })
      .catch((e) => {
        if (seq !== purchSeq.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        if (/bad tablet key/i.test(msg)) setSetupOpen(true);
      })
      .finally(() => {
        if (seq === purchSeq.current) setPurchasersLoading(false);
      });
  }

  function reset() {
    clearResetTimer();
    purchSeq.current++;
    setPicked(null);
    setLocked(null);
    setPurchasers([]);
    setPurchasersLoading(false);
    setAdding(false);
    setPurchaser("");
    setQuery("");
    setResult(null);
  }

  async function send() {
    if (sendingRef.current) return;
    if (!picked || locked || !purchaser.trim() || sending || result?.ok) return;
    clearResetTimer();
    sendingRef.current = true;
    setSending(true);
    setResult(null);
    try {
      let tap;
      try {
        tap = await saveTap(kind, picked.id, purchaser.trim(), !oneTime);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/exemption expired/i.test(msg)) {
          setResult({ ok: false, text: "This exemption expired more than 7 days ago — ask for a new form" });
          return;
        }
        setResult({
          ok: false,
          text: `Couldn't log it (${msg}). Type this number on the register and tell a manager:`,
          number: picked.number,
        });
        return;
      }
      let laneNote = "";
      const setup = getTabletSetup();
      if (setup.lane && setup.lane !== String(tap.lane)) {
        laneNote = ` (logged on lane ${tap.lane} — check Setup)`;
      } else if (!setup.lane) {
        saveTabletSetup(String(tap.lane), setup.key);
        setLane(String(tap.lane));
      }
      let delivered = false;
      try {
        delivered = (await sendDigitsToPos(tap.number)).delivered;
      } catch {
        delivered = false;
      }
      if (delivered) {
        if (kind === "exempt" && picked.linked) {
          // hold on the Ready-to-charge screen until the charge is sent or the cashier pays another way
          setLocked({ linked: picked.linked, name: picked.name, purchaser: purchaser.trim() });
          setResult(null);
        } else {
          setResult({ ok: true, text: `Sent to the register ✅ — ${picked.name}${laneNote}` });
          resetTimer.current = setTimeout(reset, 2500);
        }
      } else {
        setResult({ ok: false, text: `The register link is off. Type this number on the register:${laneNote}`, number: tap.number });
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function sendCharge() {
    if (sendingRef.current) return;
    if (!locked || sending || result?.ok) return;
    clearResetTimer();
    sendingRef.current = true;
    setSending(true);
    setResult(null);
    try {
      let tap;
      try {
        tap = await saveTap("charge", locked.linked, locked.purchaser, false);
      } catch (e) {
        setResult({
          ok: false,
          text: `Couldn't log it (${e instanceof Error ? e.message : String(e)}). Type this charge account number on the register and tell a manager:`,
          number: locked.linked,
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
        setResult({ ok: true, text: `Charge account sent to the register ✅ — ${locked.name}` });
        resetTimer.current = setTimeout(reset, 2500);
      } else {
        setResult({ ok: false, text: "The register link is off. Type this charge account number on the register:", number: tap.number });
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function saveSetup() {
    if (!setupLane.replace(/\D/g, "") || setupKey.trim().length < 6) return;
    saveTabletSetup(setupLane, setupKey);
    setLane(setupLane.replace(/\D/g, ""));
    setSetupOpen(false);
  }

  const resultBox = result && (
    <div className="acMsg" style={{ background: result.ok ? "#dcfce7" : "#fef3c7", color: result.ok ? "#166534" : "#92400e" }}>
      {result.text}
      {result.number && <div className="acBig">{result.number}</div>}
    </div>
  );

  return (
    <div className="acRoot">
      <style>{`
        .acRoot { min-height: 100vh; padding: 14px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; background: #f6f8fc; }
        .acTop { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .acBtn { border: 1px solid rgba(10,60,160,0.18); background: #fff; color: #0a2a7a; font-weight: 900; font-size: 18px;
          border-radius: 14px; padding: 12px 18px; cursor: pointer; text-decoration: none; }
        .acBtn:disabled { opacity: 0.45; cursor: default; }
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
        .acTag { font-size: 15px; font-weight: 900; margin-top: 2px; color: #92400e; }
        .acTagRed { color: #b91c1c; }
        .acWarn { font-size: 18px; font-weight: 900; padding: 12px 14px; border-radius: 14px; background: #fee2e2; color: #991b1b; }
        .acPurch { display: flex; flex-wrap: wrap; gap: 8px; }
        .acPurch .acBtn { font-size: 22px; padding: 16px 22px; }
        .acSend { font-size: 26px; font-weight: 900; padding: 20px; border-radius: 16px; border: 0; background: #16a34a; color: #fff; cursor: pointer; }
        .acSend:disabled { background: #94a3b8; }
        .acBig { font-size: 44px; font-weight: 900; letter-spacing: 2px; color: #0a2a7a; }
        .acMsg { font-size: 18px; font-weight: 800; padding: 12px 14px; border-radius: 14px; }
        @media (max-width: 900px) { .acSplit { flex-direction: column; } .acRight { flex: 0 0 auto; } }
      `}</style>

      <div className="acTop">
        <Link
          className="acBtn"
          href="/cashier"
          onClick={(e) => {
            if (locked && !window.confirm("Charge not sent — leave anyway?")) e.preventDefault();
          }}
        >
          ‹ Register
        </Link>
        {(["exempt", "charge"] as AcctKind[]).map((k) => (
          <button
            key={k}
            disabled={!!locked}
            className={"acBtn " + (kind === k ? "acBtnOn" : "")}
            onClick={() => { setKind(k); reset(); }}
          >
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

      {error && <div className="acMsg" style={{ background: "#fee2e2", color: "#991b1b" }}>{error}</div>}

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
                <div className="acList">
                  {rows.map((r) => {
                    const note = kind === "exempt" ? expiryNote(r) : null;
                    return (
                      <button key={r.id} className="acRow" onClick={() => choose(r)}>
                        <div className="acRowName">{r.name}</div>
                        <div className="acRowSub">{kind === "charge" ? `Account #${r.number}` : prettyNumber(r.number)}</div>
                        {note && <div className={"acTag " + (note.red ? "acTagRed" : "")}>{note.text}</div>}
                        {r.linked && <div className="acRowSub">+ Charge #{r.linked}</div>}
                      </button>
                    );
                  })}
                  {!loading && !rows.length && !error && <div className="acRowSub">No match.</div>}
                </div>
              </>
            ) : locked ? (
              <>
                <div className="acRow" style={{ cursor: "default" }}>
                  <div className="acRowName">Ready to charge</div>
                  <div className="acRowSub">{locked.name}</div>
                  <div className="acRowSub">Purchaser: {locked.purchaser}</div>
                </div>
                <div className="acRowSub">On the register: Enter → House Charge, then tap below.</div>
                <button className="acSend" disabled={sending || !!result?.ok} onClick={sendCharge}>
                  {sending ? "Sending…" : `Send charge account #${locked.linked}`}
                </button>
                {resultBox}
                <button className="acBtn" disabled={sending} onClick={reset}>Paying another way</button>
              </>
            ) : (
              <>
                <div className="acRow" style={{ cursor: "default" }}>
                  <div className="acRowName">{picked.name}</div>
                  <div className="acRowSub">{kind === "charge" ? `Account #${picked.number}` : prettyNumber(picked.number)}</div>
                  {picked.linked && <div className="acRowSub">+ Charge #{picked.linked}</div>}
                </div>
                {kind === "exempt" && picked.expiry === "expired" && (
                  <div className="acWarn">EXPIRED — ask for a new form</div>
                )}
                <div className="acRowSub">Who&apos;s purchasing?</div>
                {purchasersLoading && <div className="acRowSub">Loading names…</div>}
                {purchasers.length > 0 && (
                  <div className="acPurch">
                    {purchasers.map((n) => (
                      <button
                        key={n}
                        className={"acBtn " + (purchaser === n ? "acBtnOn" : "")}
                        onClick={() => { setPurchaser(n); setAdding(false); }}
                      >
                        {n}
                      </button>
                    ))}
                    {!full && (
                      <button className={"acBtn " + (adding ? "acBtnOn" : "")} onClick={() => { setAdding(true); setPurchaser(""); }}>
                        + Add purchaser
                      </button>
                    )}
                  </div>
                )}
                {full && <div className="acRowSub">8 on file — type a one-time name</div>}
                {typingPurchaser && (
                  <div className="acField">{purchaser || <span style={{ color: "#94a3b8" }}>Purchaser&apos;s name</span>}</div>
                )}
                {oneTime && purchaser.trim() && (
                  <div className="acRowSub">Not saved — a manager can remove a name in Tates Prices</div>
                )}
                <button className="acSend" disabled={!purchaser.trim() || sending || !!result?.ok} onClick={send}>
                  {sending ? "Sending…" : "Send to register"}
                </button>
                {resultBox}
                <button className="acBtn" disabled={sending} onClick={reset}>Back to list</button>
              </>
            )}
          </div>
          <div className="acRight">
            {!locked && <OnScreenKeyboard onKey={type} />}
          </div>
        </div>
      )}
    </div>
  );
}
