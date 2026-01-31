import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

type Payload = {
  name: string;
  email?: string;
  phone?: string;
  smsOptIn?: boolean;
  message: string;
  source?: string;
};

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

export async function POST(req: Request) {
  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const TO = process.env.CONTACT_TO_EMAIL;
    const FROM = process.env.CONTACT_FROM_EMAIL;

    if (!RESEND_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing RESEND_API_KEY" }, { status: 500 });
    }
    if (!TO) {
      return NextResponse.json({ ok: false, error: "Missing CONTACT_TO_EMAIL" }, { status: 500 });
    }
    if (!FROM) {
      return NextResponse.json({ ok: false, error: "Missing CONTACT_FROM_EMAIL" }, { status: 500 });
    }

    const body = (await req.json()) as Payload;

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const phone = String(body?.phone || "").trim();
    const message = String(body?.message || "").trim();
    const smsOptIn = !!body?.smsOptIn;

    const hasEmail = !!email && isEmail(email);
    const hasPhone = digitsOnly(phone).length >= 10;

    if (!name) {
      return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
    }
    if (!hasEmail && !hasPhone) {
      return NextResponse.json(
        { ok: false, error: "Please enter either a valid email or a phone number." },
        { status: 400 }
      );
    }
    if (!message) {
      return NextResponse.json({ ok: false, error: "Please enter a message." }, { status: 400 });
    }

    const resend = new Resend(RESEND_API_KEY);

    const subject = `New Contact Form: ${name}${hasEmail ? ` (${email})` : ""}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
        <h2>New Contact Submission</h2>
        <p><b>Name:</b> ${escapeHtml(name)}</p>
        <p><b>Email:</b> ${hasEmail ? escapeHtml(email) : "(none)"}</p>
        <p><b>Phone:</b> ${hasPhone ? escapeHtml(phone) : "(none)"}</p>
        <p><b>SMS Opt-In:</b> ${smsOptIn ? "YES" : "NO"}</p>
        <hr />
        <p style="white-space: pre-wrap;"><b>Message:</b><br/>${escapeHtml(message)}</p>
      </div>
    `;

    const replyTo = hasEmail ? email : undefined;

    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      subject,
      replyTo,
      html,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

function escapeHtml(input: string) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
