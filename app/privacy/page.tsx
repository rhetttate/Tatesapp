export const metadata = { title: "Privacy Policy" };

const LAST_UPDATED = "January 31, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 22,
            padding: 18,
            border: "1px solid rgba(29,78,216,0.14)",
            boxShadow: "0 8px 24px rgba(10,42,122,0.06)",
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 950, color: "#0a2a7a" }}>
            Privacy Policy
          </div>

          <div style={{ marginTop: 10, fontWeight: 800, color: "rgba(10,42,122,0.70)" }}>
            Last updated: {LAST_UPDATED}
          </div>

          <div style={{ height: 1, background: "rgba(29,78,216,0.12)", margin: "14px 0" }} />

          <p style={{ fontWeight: 850, color: "#0a2a7a", lineHeight: 1.55 }}>
            Tate’s Supermarket (“we”, “us”, “our”) collects information you provide to use our rewards
            program, support requests, and store communications.
          </p>

          <h3 style={{ marginTop: 14, color: "#0a2a7a" }}>Information we collect</h3>
          <ul style={{ fontWeight: 800, color: "rgba(10,42,122,0.78)", lineHeight: 1.6 }}>
            <li>Account info: email address and password (for sign-in).</li>
            <li>Optional phone number (if you provide it).</li>
            <li>Rewards activity: points, redemptions, and related account actions.</li>
            <li>Contact form submissions: name + email/phone + message.</li>
            <li>Technical data: basic device/browser information used for security and site performance.</li>
          </ul>

          <h3 style={{ marginTop: 14, color: "#0a2a7a" }}>How we use information</h3>
          <ul style={{ fontWeight: 800, color: "rgba(10,42,122,0.78)", lineHeight: 1.6 }}>
            <li>Provide rewards features (points, coupons, account access).</li>
            <li>Customer support and responding to requests.</li>
            <li>Account security and fraud prevention.</li>
            <li>
              If you opt in, send SMS messages (promotional and informational), such as account updates
              and store promotions.
            </li>
          </ul>

          <h3 style={{ marginTop: 14, color: "#0a2a7a" }}>How we share information</h3>
          <p style={{ fontWeight: 800, color: "rgba(10,42,122,0.78)", lineHeight: 1.6 }}>
            We may use trusted service providers to operate our website, email, and communications.
            We do not sell personal information.
          </p>

          <p style={{ fontWeight: 950, color: "#0a2a7a", lineHeight: 1.6 }}>
            SMS consent is not shared with third parties or affiliates. Phone numbers collected for SMS
            purposes are not shared with third parties or affiliates for SMS marketing.
          </p>

          <h3 style={{ marginTop: 14, color: "#0a2a7a" }}>Your choices</h3>
          <ul style={{ fontWeight: 800, color: "rgba(10,42,122,0.78)", lineHeight: 1.6 }}>
            <li>You can choose not to provide a phone number.</li>
            <li>You can opt out of SMS at any time by replying STOP (where supported).</li>
            <li>For help, reply HELP or contact us at support@tatessupermarket.com.</li>
          </ul>

          <div style={{ height: 1, background: "rgba(29,78,216,0.12)", margin: "14px 0" }} />

          <h2 style={{ marginTop: 0, color: "#0a2a7a" }}>SMS Terms of Service</h2>

          <p style={{ fontWeight: 850, color: "#0a2a7a", lineHeight: 1.55 }}>
            By opting into SMS from a web form, app form, or other medium, you agree to receive SMS
            messages from Tate’s Supermarket.
          </p>

          <ul style={{ fontWeight: 800, color: "rgba(10,42,122,0.78)", lineHeight: 1.6 }}>
            <li>
              <b>Message types:</b> promotional and informational (e.g., promotions, account notifications).
            </li>
            <li>
              <b>Message frequency:</b> may vary.
            </li>
            <li>
              <b>Message &amp; data rates:</b> may apply.
            </li>
            <li>
              <b>Opt out:</b> reply <b>STOP</b> at any time to cancel.
            </li>
            <li>
              <b>Help:</b> reply <b>HELP</b> for assistance or visit our website at{" "}
              <b>https://www.tatessupermarket.com</b>.
            </li>
            <li>
              <b>Privacy:</b> see this policy at <b>https://www.tatessupermarket.com/privacy</b>.
            </li>
          </ul>

          <h3 style={{ marginTop: 14, color: "#0a2a7a" }}>Contact</h3>
          <p style={{ fontWeight: 850, color: "rgba(10,42,122,0.78)", lineHeight: 1.6 }}>
            For questions, contact: <b>support@tatessupermarket.com</b>
          </p>
        </div>
      </div>
    </div>
  );
}
