export const metadata = { title: "Privacy Policy" };

const LAST_UPDATED = "January 31, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="pageFrame">
      <div className="pageFrameInner" style={{ maxWidth: 760 }}>
        <div className="card prose fadeIn">
          <div className="title" style={{ fontSize: 26 }}>Privacy Policy</div>
          <div className="muted" style={{ marginTop: 10 }}>Last updated: {LAST_UPDATED}</div>

          <div className="divider" />

          <p>
            Tate’s Supermarket (“we”, “us”, “our”) collects information you provide to use our rewards
            program, support requests, and store communications.
          </p>

          <h3>Information we collect</h3>
          <ul>
            <li>Account info: email address and password (for sign-in).</li>
            <li>Optional phone number (if you provide it).</li>
            <li>Rewards activity: points, redemptions, and related account actions.</li>
            <li>Contact form submissions: name + email/phone + message.</li>
            <li>Technical data: basic device/browser information used for security and site performance.</li>
          </ul>

          <h3>How we use information</h3>
          <ul>
            <li>Provide rewards features (points, coupons, account access).</li>
            <li>Customer support and responding to requests.</li>
            <li>Account security and fraud prevention.</li>
            <li>
              If you opt in, send SMS messages (promotional and informational), such as account updates
              and store promotions.
            </li>
          </ul>

          <h3>How we share information</h3>
          <p>
            We may use trusted service providers to operate our website, email, and communications.
            We do not sell personal information.
          </p>
          <p style={{ fontWeight: 800, color: "var(--ink)" }}>
            SMS consent is not shared with third parties or affiliates. Phone numbers collected for SMS
            purposes are not shared with third parties or affiliates for SMS marketing.
          </p>

          <h3>Your choices</h3>
          <ul>
            <li>You can choose not to provide a phone number.</li>
            <li>You can opt out of SMS at any time by replying STOP (where supported).</li>
            <li>For help, reply HELP or contact us at support@tatessupermarket.com.</li>
          </ul>

          <div className="divider" />

          <h2>SMS Terms of Service</h2>
          <p>
            By opting into SMS from a web form, app form, or other medium, you agree to receive SMS
            messages from Tate’s Supermarket.
          </p>
          <ul>
            <li><b>Message types:</b> promotional and informational (e.g., promotions, account notifications).</li>
            <li><b>Message frequency:</b> may vary.</li>
            <li><b>Message &amp; data rates:</b> may apply.</li>
            <li><b>Opt out:</b> reply <b>STOP</b> at any time to cancel.</li>
            <li><b>Help:</b> reply <b>HELP</b> for assistance or visit our website at <b>https://www.tatessupermarket.com</b>.</li>
            <li><b>Privacy:</b> see this policy at <b>https://www.tatessupermarket.com/privacy</b>.</li>
          </ul>

          <h3>Contact</h3>
          <p>For questions, contact: <b>support@tatessupermarket.com</b></p>
        </div>
      </div>
    </div>
  );
}
