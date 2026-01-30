"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

export default function ContactClient() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");

  async function submit() {
    setStatus("");

    const hasEmail = email.trim().length > 0;
    const hasPhone = digitsOnly(phone).length >= 10;

    if (!name.trim()) return setStatus("Please enter your name.");
    if (!hasEmail && !hasPhone) return setStatus("Please enter either an email or a phone number.");
    if (!message.trim()) return setStatus("Please enter a message.");

    try {
      // If you later want to save contact submissions, we can add a table + insert here.
      // For now, this validates the form per RingCentral + shows what you need.

      setStatus("Submitted ✅ We’ll get back to you at support@tatessupermarket.com");

      setName("");
      setEmail("");
      setPhone("");
      setSmsOptIn(false);
      setMessage("");
    } catch (e: any) {
      setStatus("Error: " + (e?.message ?? String(e)));
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
      <style jsx global>{`
              @media (max-width: 480px) {
          .wrap {
            padding: 8px 6px 22px;
          }
        }

        * { -webkit-tap-highlight-color: transparent; }
        .wrap {
          max-width: 1100px;     /* keep desktop nice */
          margin: 0 auto;

          /* 🔽 smaller side padding */
          padding: 10px 10px 24px;
        }

        .card {
          background: #fff; border-radius: 22px; padding: 18px;
          border: 1px solid rgba(29,78,216,0.14);
          box-shadow: 0 8px 24px rgba(10,42,122,0.06);
        }
        .title { font-size: 22px; font-weight: 950; color: #0a2a7a; }
        .muted { color: rgba(10,42,122,0.65); font-weight: 800; }
        .input {
          width: 100%; padding: 14px; border-radius: 14px;
          border: 1px solid #c7d2fe; margin-top: 8px; font-weight: 850;
          outline: none;
        }
        .btnRow { display: flex; gap: 10px; margin-top: 12px; }
        .btn {
          padding: 14px; border-radius: 16px; border: 0;
          font-weight: 950; cursor: pointer;
        }
        .btnPrimary { background: #1d4ed8; color: #fff; }
        .legalRow {
          display: flex; gap: 10px; margin-top: 14px; justify-content: space-between;
          font-weight: 850;
        }
        a { color: #1d4ed8; text-decoration: none; font-weight: 950; }
      `}</style>

      <div className="wrap">
        <div className="card">
          <div className="title">Contact Us</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Enter your name and either email or phone. We’ll respond from <b>support@tatessupermarket.com</b>.
          </div>

          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            className="input"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <input
            className="input"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
          />

          {/* RingCentral requirement: OPTIONAL checkbox ONLY for SMS consent */}
          <label style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(e) => setSmsOptIn(e.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span className="muted" style={{ fontSize: 13 }}>
              Optional: I agree to receive SMS messages (promotional + informational). Message &amp; data rates may apply.
              SMS consent is not shared with third parties.
            </span>
          </label>

          <textarea
            className="input"
            placeholder="Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ minHeight: 110, resize: "vertical" }}
          />

          <div className="btnRow">
            <button className="btn btnPrimary" onClick={submit} style={{ flex: 1 }}>
              Submit
            </button>
          </div>

          {status ? <div style={{ marginTop: 12, fontWeight: 850, color: "#0a2a7a" }}>{status}</div> : null}

          <div className="legalRow">
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/member">Back to Points</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
