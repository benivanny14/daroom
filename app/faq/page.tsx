import Link from "next/link";
import { DarkModeToggle } from "@/components/DarkModeToggle";

export default function FAQPage() {
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
        <article className="panel" style={{ padding: "30px" }}>
          <span className="eyebrow">Frequently Asked Questions</span>
          <h1>FAQ - Questions and Answers</h1>

          <section style={{ marginTop: "30px" }}>
            <h2>For Tenants</h2>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                Does DarRoom charge me any fee?
              </summary>
              <p>No. DarRoom does not take a share of rent, deposits, or any fee from tenants. All payments are made directly between you and the Agent.</p>
            </details>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                Do I need an account to search for a room?
              </summary>
              <p>No. You can search for rooms, view photos, and contact an Agent without an account. An account is only required for Agents who want to add listings.</p>
            </details>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                Do I need to pay to view a room?
              </summary>
              <p>No. DarRoom does not allow Agents to charge a viewing fee. If an Agent asks for a fee, please report the listing.</p>
            </details>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                Who shows the rooms?
              </summary>
              <p>All tenants deal directly with the Agent via WhatsApp. DarRoom is not involved in these conversations.</p>
            </details>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>For Agents</h2>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                How much does a subscription cost?
              </summary>
              <p>A subscription is TSh 5,000 for 30 days. There are also Premium (TSh 15,000) and Featured (TSh 30,000) plans with additional features.</p>
            </details>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                What can I do with a subscription?
              </summary>
              <p>With a subscription, you can add listings, edit them, upload photos, view analytics, and more. The number of listings depends on your plan.</p>
            </details>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                How do I pay?
              </summary>
              <p>Subscription payments are initiated through the system shown on the dashboard. Availability depends on the service configuration for your account.</p>
            </details>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                Are my photos safe?
              </summary>
              <p>Photos are uploaded through the dashboard when the photo storage service is available. You will see a message if an upload fails; do not assume a photo has been saved until you see confirmation.</p>
            </details>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                Can I close my account?
              </summary>
              <p>Yes. You can close your account at any time. You can also request that your photos be deleted.</p>
            </details>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>About Safety</h2>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                How do I avoid scams?
              </summary>
              <ul>
                <li>Contact the Agent directly.</li>
                <li>Arrange to view the room before paying.</li>
                <li>Do not pay a large amount before you have clear agreement.</li>
                <li>Report any listing that does not feel right.</li>
              </ul>
            </details>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                Does DarRoom check Agents?
              </summary>
              <p>A verification badge is shown for verified accounts. However, always confirm the details and the room yourself before making any payment.</p>
            </details>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                What should I do if I think it is a scam?
              </summary>
              <p>Report the listing directly on the page. We will investigate and suspend Agent accounts that are used for scams.</p>
            </details>
          </section>

          <section style={{ marginTop: "30px" }}>
            <h2>Other Questions</h2>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                Can I see listings on a map?
              </summary>
              <p>Right now we show locations by district and neighborhood name. We are continuing to work on adding maps.</p>
            </details>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                Is DarRoom available as an app?
              </summary>
              <p>Right now we are available on the web only. We plan to release a mobile app later.</p>
            </details>

            <details style={{ marginBottom: "20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" }}>
                Can I contact DarRoom?
              </summary>
              <p>Use the report button on the relevant listing to describe the problem. We do not display contact details that have not been verified here.</p>
            </details>
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
