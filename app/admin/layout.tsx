"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LS_ADMIN_UNLOCKED = "gr_admin_unlocked";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (localStorage.getItem(LS_ADMIN_UNLOCKED) === "1") {
      setUnlocked(true);
    }
  }, []);

  function unlock() {
    if (pin === (process.env.NEXT_PUBLIC_ADMIN_PIN || "1234")) {
      localStorage.setItem(LS_ADMIN_UNLOCKED, "1");
      setUnlocked(true);
      setPin("");
    } else {
      setErr("Wrong PIN");
    }
  }

  function lock() {
    localStorage.removeItem(LS_ADMIN_UNLOCKED);
    setUnlocked(false);
  }

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">Admin</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn" href="/">Home</Link>
          {unlocked && <button className="btn" onClick={lock}>Lock</button>}
        </div>
      </div>

      {!unlocked ? (
        <div className="center">
          <div className="card" style={{ width: 380 }}>
            <h3>Enter Admin PIN</h3>
            <input className="input" value={pin} onChange={(e) => setPin(e.target.value)} />
            <button className="btn btnPrimary" onClick={unlock}>Unlock</button>
            {err && <p>{err}</p>}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <Link className="btn" href="/admin">Dashboard</Link>
            <Link className="btn" href="/admin/members">Members</Link>
            <Link className="btn" href="/admin/sales">Sales</Link>
            <Link className="btn" href="/admin/deals">Deals</Link>
            <Link className="btn" href="/admin/settings">Settings</Link>
          </div>
          {children}
        </>
      )}
    </div>
  );
}