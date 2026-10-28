import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminConsole } from "@/components/AdminConsole";
import { getSessionUser } from "@/lib/auth";
import { DarkModeToggle } from "@/components/DarkModeToggle";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/account?next=admin");
  if (user.role !== "ADMIN") redirect(user.role === "TENANT" ? "/account" : "/dalali");

  return (
    <>
      <header className="topbar">
        <div className="shell account-topbar">
          <Link className="brand" href="/"><span className="brand-mark">D</span> DarRoom</Link>
          <nav className="nav-links"><Link href="/">Public site</Link><Link href="/dalali">Agent dashboard</Link><DarkModeToggle /></nav>
        </div>
      </header>
      <main className="shell admin-layout">
        <span className="eyebrow">DarRoom moderation</span>
        <div className="results-head" style={{ paddingTop: 14 }}>
          <div><h1>Admin dashboard</h1><p>Review reports, check subscriptions and manage accounts. Listings go live immediately, with no approval step.</p></div>
          <span className="demo-pill">Secure account</span>
        </div>
        <AdminConsole />
      </main>
      <footer className="site-footer"><div className="shell footer-inner"><p>DarRoom · moderation tools</p><Link href="/">Back to home</Link></div></footer>
    </>
  );
}
