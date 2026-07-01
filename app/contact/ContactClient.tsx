"use client";

import Link from "next/link";
import { useState } from "react";

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
  const [busy, setBusy] = useState(false);

  async function submit() {
    setStatus("");

    const hasEmail = email.trim().length > 0;
    const hasPhone = digitsOnly(phone).length >= 10;

    if (!name.trim()) return setStatus("Please enter your name.");
    if (!hasEmail && !hasPhone) return setStatus("Please enter either an email or a phone number.");
    if (smsOptIn && !hasPhone) return setStatus("To opt into SMS, please enter a valid phone number.");
    if (!message.trim()) return setStatus("Please enter a message.");

    setBusy(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          smsOptIn,
          message: message.trim(),
          source: "contact-page",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setStatus(data?.error ? `Error: ${data.error}` : "Error: Failed to send.");
        return;
      }

      setStatus("Submitted ✅ We’ll get back to you at support@tatessupermarket.com");

      setName("");
      setEmail("");
      setPhone("");
      setSmsOptIn(false);
      setMessage("");
    } catch (e: any) {
      setStatus("Error: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pageFrame">
      <div className="pageFrameInner">
        <div className="wrap">
          <div className="card fadeIn">
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

          {/* ✅ RingCentral compliant SMS opt-in checkbox + language + links */}
          <label style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(e) => setSmsOptIn(e.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span className="muted" style={{ fontSize: 13, lineHeight: 1.35 }}>
              Optional: I agree to receive SMS messages from Tate’s Supermarket (promotional and informational).
              Message frequency may vary. Message &amp; data rates may apply. Reply <b>STOP</b> to opt out at any time.
              Reply <b>HELP</b> for assistance or visit{" "}
              <a href="https://www.tatessupermarket.com" target="_blank" rel="noreferrer">
                https://www.tatessupermarket.com
              </a>
              . See{" "}
              <Link href="/privacy">Privacy Policy</Link>{" "}
              for privacy policy and SMS terms. SMS consent is not shared with third parties or affiliates.
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
            <button className="btn btnPrimary" onClick={submit} disabled={busy} style={{ flex: 1 }}>
              {busy ? "Sending..." : "Submit"}
            </button>
          </div>

          {status ? <div className="statusMsg">{status}</div> : null}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            <Link href="/privacy" style={{ color: "var(--blue2)", fontWeight: 800 }}>Privacy Policy</Link>
            <Link href="/member" style={{ color: "var(--blue2)", fontWeight: 800 }}>Back to Points</Link>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

