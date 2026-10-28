import Link from "next/link";
import { redirect } from "next/navigation";
import { DalaliDashboard } from "@/components/DalaliDashboard";
import { getSessionUser } from "@/lib/auth";
import { DarkModeToggle } from "@/components/DarkModeToggle";

export const dynamic = "force-dynamic";

export default async function DalaliPage() {
  const user = await getSessionUser();
  if (!user) redirect("/account?next=/dalali");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "TENANT") redirect("/account");

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
          <p>Tenants contact you directly. Rent can optionally be paid through DarRoom&apos;s mobile-money page when you ask the tenant to use it.</p>
        </section>
        <DalaliDashboard user={{ id: user.id, name: user.name, email: user.email, phone: user.phone }} />
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
