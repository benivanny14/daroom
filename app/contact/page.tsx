import type { Metadata } from "next";
import Link from "next/link";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact DarRoom",
  description:
    "Contact the DarRoom team about a listing, your Agent subscription, a safety report, or a privacy request.",
  alternates: { canonical: `${SITE_URL}/contact` }
};

const channels = [
  {
    title: "General support",
    email: "support@darroom.site",
    body: "Questions about searching, your account, or how DarRoom works."
  },
  {
    title: "Agent subscriptions",
    email: "accounts@darroom.site",
    body: "Payment receipts, subscription renewal, or a payment that did not activate."
  },
  {
    title: "Safety and reports",
    email: "safety@darroom.site",
    body: "Report a fake listing, a viewing fee, or an Agent who asked for money off-platform."
  },
  {
    title: "Privacy",
    email: "privacy@darroom.site",
    body: "Data access, correction, or deletion requests under our Privacy Policy."
  }
];

export default function ContactPage() {
  return (
    <>
      <header className="topbar">
        <div className="shell account-topbar">
          <Link className="brand" href="/">
            <span className="brand-mark">D</span> DarRoom
          </Link>
          <nav className="nav-links">
            <Link href="/">All rooms</Link>
            <Link href="/faq">FAQ</Link>
            <DarkModeToggle />
          </nav>
        </div>
      </header>
      <main className="shell" style={{ padding: "48px 0" }}>
        <article className="panel legal-page">
          <span className="eyebrow">Contact</span>
          <h1>Talk to the DarRoom team</h1>
          <p>
            DarRoom is a listing platform for rooms in Dar es Salaam. Tenants contact Agents
            directly on WhatsApp and pay rent to the Agent, never to DarRoom. If something goes
            wrong, email the right team below and include the listing link when you can.
          </p>

          <div className="contact-grid">
            {channels.map((channel) => (
              <section className="contact-card" key={channel.email}>
                <h2>{channel.title}</h2>
                <p>{channel.body}</p>
                <a href={`mailto:${channel.email}`}>{channel.email}</a>
              </section>
            ))}
          </div>

          <section>
            <h2>Before you email about a payment</h2>
            <ul>
              <li>Agents pay TSh 2,000 for 30 days of listing access through SonicPesa.</li>
              <li>Approved payments activate the subscription automatically within a few minutes.</li>
              <li>Tenants never pay DarRoom; rent is agreed and paid to the Agent directly.</li>
              <li>Include the mobile-money number and the time of payment so we can trace it.</li>
            </ul>
          </section>

          <p className="fine-print">
            We reply during business hours in Dar es Salaam. For urgent safety concerns, also use
            the <strong>Report this room</strong> button on the listing.
          </p>
        </article>
      </main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <p>&copy; 2026 DarRoom &middot; Dar es Salaam, Tanzania</p>
          <div className="footer-links">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/faq">FAQ</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
