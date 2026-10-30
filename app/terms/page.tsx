import Link from "next/link";
import { DarkModeToggle } from "@/components/DarkModeToggle";

export default function TermsPage() {
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
          <span className="eyebrow">Terms of Use</span>
          <h1>DarRoom Terms of Use</h1>

          <section style={{ marginTop: "30px" }}>
            <h2>1. How DarRoom Works</h2>
            <p>DarRoom is a platform that connects tenants with Agents for rental rooms in Dar es Salaam. Searching and viewing are free. Rent can optionally be paid through DarRoom using SonicPesa, and DarRoom never asks for a tenant&apos;s mobile-money PIN. All other payments are made directly between the tenant and the Agent.</p>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>2. Agent Responsibilities</h2>
            <p>Agents are required to:</p>
            <ul>
              <li>Provide accurate information about rooms</li>
              <li>Provide clear prices and terms</li>
              <li>Provide genuine photos of rooms</li>
              <li>Agree not to charge a fee to view a room</li>
              <li>Treat tenants with respect</li>
            </ul>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>3. Tenant Responsibilities</h2>
            <p>Tenants are required to:</p>
            <ul>
              <li>Arrive on time for a scheduled viewing</li>
              <li>Make their own decision after viewing the room</li>
              <li>Pay rent directly to the Agent</li>
              <li>Take care of the Agent&apos;s property</li>
            </ul>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>4. Agent Subscription</h2>
            <p>Agents can add listings after paying for a subscription. A subscription expires after 30 days. Tenants do not pay a subscription or add listings.</p>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>5. Reports and Review</h2>
            <p>Users can report listings that are false. All reports are reviewed by our team. Agents who are reported repeatedly may be suspended.</p>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>6. Account Suspension</h2>
            <p>DarRoom has the right to suspend Agent accounts that:</p>
            <ul>
              <li>Provide false information</li>
              <li>Charge a fee to view a room</li>
              <li>Use disrespectful language</li>
              <li>Commit fraud</li>
            </ul>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>7. Changes to These Terms</h2>
            <p>DarRoom may change these terms at any time. Use of the platform after changes means acceptance of the new terms.</p>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>8. Contact</h2>
            <p>For any questions, contact us by email: accounts@darroom.co.tz</p>
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
