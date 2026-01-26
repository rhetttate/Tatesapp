export const metadata = { title: "Privacy Policy" };

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f3f7ff", padding: 18 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{
          background: "#fff",
          borderRadius: 22,
          padding: 18,
          border: "1px solid rgba(29,78,216,0.14)",
          boxShadow: "0 8px 24px rgba(10,42,122,0.06)"
        }}>
          <div style={{ fontSize: 26, fontWeight: 950, color: "#0a2a7a" }}>
            Privacy Policy
          </div>

          <div style={{ marginTop: 10, fontWeight: 800, color: "rgba(10,42,122,0.70)" }}>
            Last updated: {new Date().toLocaleDateString()}
          </div>

          <div style={{ height: 1, background: "rgba(29,78,216,0.12)", margin: "14px 0" }} />

          <p style={{ fontWeight: 850, color: "#0a2a7a", lineHeight: 1.55 }}>
            Tate’s Supermarket (“we”, “us”) collects information you provide to use our rewards program,
            support requests, and store communications.
          </p>

          <h3 style={{ marginTop: 14, color: "#0a2a7a" }}>Information we collect</h3>
          <ul style={{ fontWeight: 800, color: "rgba(10,42,122,0.78)", lineHeight: 1.6 }}>
            <li>Email address and password (for account sign-in).</li>
            <li>Optional phone number (if you provide it).</li>
            <li>Rewards account activity (points, purchases, redemptions).</li>
            <li>Contact form submissions (name + email/phone + message).</li>
          </ul>

          <h3 style={{ marginTop: 14, color: "#0a2a7a" }}>How we use information</h3>
          <ul style={{ fontWeight: 800, color: "rgba(10,42,122,0.78)", lineHeight: 1.6 }}>
            <li>Provide rewards features (points, coupons, account access).</li>
            <li>Customer support and account security.</li>
            <li>If you opt in, send SMS messages (promotional and informational).</li>
          </ul>

          <h3 style={{ marginTop: 14, color: "#0a2a7a" }}>How we share information</h3>
          <p style={{ fontWeight: 800, color: "rgba(10,42,122,0.78)", lineHeight: 1.6 }}>
            We may use service providers to operate our website and communications. We do not sell personal information.
          </p>

          <p style={{ fontWeight: 950, color: "#0a2a7a", lineHeight: 1.6 }}>
            SMS consent is not shared with third parties, and phone numbers collected for SMS purposes are not shared
            with third parties for SMS marketing.
          </p>

          <h3 style={{ marginTop: 14, color: "#0a2a7a" }}>Your choices</h3>
          <ul style={{ fontWeight: 800, color: "rgba(10,42,122,0.78)", lineHeight: 1.6 }}>
            <li>You can choose not to provide a phone number.</li>
            <li>SMS opt-in is optional. You can opt out any time by replying STOP (where supported).</li>
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
