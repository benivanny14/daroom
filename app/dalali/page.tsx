import Link from "next/link";
import { redirect } from "next/navigation";
import { DalaliDashboard } from "@/components/DalaliDashboard";
import { getSessionUser } from "@/lib/auth";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { mockPaymentsEnabled } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function DalaliPage({
  searchParams
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/account?next=/dalali");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "TENANT") redirect("/account");
  const { payment } = await searchParams;
  const paymentNotice = payment === "success"
    ? { tone: "notice", text: "Payment complete. Your subscription is now active." }
    : payment === "failed" || payment === "invalid"
      ? { tone: "admin-warning", text: "Payment was not completed. Try again or contact support." }
      : payment === "pending"
        ? { tone: "notice", text: "Payment is awaiting confirmation from the provider." }
        : null;

  return (
    <>
      <header className="topbar">
        <div className="shell account-topbar">
          <Link className="brand" href="/"><span className="brand-mark">D</span> DarRoom</Link>
          <nav className="nav-links">
            <Link href="/">Browse listings</Link>
            <Link href="/account">Account</Link>
            <DarkModeToggle />
          </nav>
        </div>
      </header>
      <main className="shell">
        <section className="page-hero">
          <span className="eyebrow">Agent dashboard</span>
          <h1>Hello, {user.name}.</h1>
          <p>Tenants contact you directly. DarRoom does not collect rent or deposits from tenants.</p>
        </section>
        {paymentNotice && <p className={paymentNotice.tone} role="status">{paymentNotice.text}</p>}
        <DalaliDashboard user={{ id: user.id, name: user.name, email: user.email, phone: user.phone }} mockPayments={mockPaymentsEnabled()} payment={payment} />
      </main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <p>DarRoom · TSh 5,000 / 30 days for Agents only</p>
          <Link href="/">Back to searching rooms</Link>
        </div>
      </footer>
    </>
  );
}
