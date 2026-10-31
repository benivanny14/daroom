import Link from "next/link";
import { DarkModeToggle } from "@/components/DarkModeToggle";

export default function PrivacyPage() {
  return (
    <>
      <header className="topbar">
        <div className="shell account-topbar">
          <Link className="brand" href="/"><span className="brand-mark">D</span> DarRoom</Link>
          <Link href="/">Back to home</Link>
          <DarkModeToggle />
        </div>
      </header>
      <main className="shell" style={{ padding: "40px 0" }}>
        <article className="panel legal-page">
          <span className="eyebrow">Privacy Policy</span>
          <h1>DarRoom Privacy Policy</h1>

          <section style={{ marginTop: "30px" }}>
            <h2>1. Information We Collect</h2>
            <p>DarRoom collects the following information:</p>
            <ul>
              <li><strong>Agents:</strong> Name, email, phone number, password, room photos</li>
              <li><strong>Tenants:</strong> No personal information is collected</li>
              <li><strong>Listings:</strong> Room details, prices, photos, locations</li>
            </ul>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>2. How We Use Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Run the DarRoom platform</li>
              <li>Communicate with you about your account</li>
              <li>Review and report listings</li>
              <li>Improve our services</li>
              <li>Comply with laws and regulations</li>
            </ul>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>3. Information Security</h2>
            <p>We take steps to keep your information safe:</p>
            <ul>
              <li>Your password is stored using hashing</li>
              <li>All communications use HTTPS</li>
              <li>We use rate limiting to prevent attacks</li>
              <li>Our staff receive security training</li>
            </ul>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>4. Sharing Information</h2>
            <p>We do not share your information with anyone without your consent, except:</p>
            <ul>
              <li>Where required by law</li>
              <li>To protect our rights or the rights of others</li>
              <li>To prevent fraud or harm</li>
            </ul>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>5. Public Listings</h2>
            <p>Listings visible to tenants include:</p>
            <ul>
              <li>Room details</li>
              <li>Price and terms</li>
              <li>The Agent&apos;s WhatsApp number</li>
              <li>Room photos</li>
            </ul>
            <p>We do not give a tenant&apos;s email or phone number to Agents.</p>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>See the information we have collected about your account</li>
              <li>Correct or delete your information</li>
              <li>Close your account</li>
              <li>Request a report of your information</li>
            </ul>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>7. Cookies</h2>
            <p>We use cookies to:</p>
            <ul>
              <li>Maintain your login session</li>
              <li>Remember your preferences</li>
              <li>Track platform usage</li>
            </ul>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>8. Changes to This Policy</h2>
            <p>We may change this policy at any time. We will post notice on this page.</p>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>9. Contact</h2>
            <p>For privacy questions, contact us: privacy@darroom.site</p>
          </section>

          <footer style={{ marginTop: "40px", paddingTop: "20px", borderTop: "1px solid var(--line)" }}>
            <p style={{ fontSize: "12px", color: "var(--muted)" }}>
              Last updated: {new Date().toLocaleDateString("en-GB")}
            </p>
          </footer>
        </article>
      </main>
    </>
  );
}
