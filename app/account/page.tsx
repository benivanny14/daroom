import Link from "next/link";
import { AccountForm } from "@/components/AccountForm";
import { AccountDashboard } from "@/components/AccountDashboard";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams
}: {
  searchParams: Promise<{ verified?: string; reset?: string; next?: string }>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  return (
    <>
      <header className="topbar">
        <div className="shell account-topbar">
          <Link className="brand" href="/">
            <span className="brand-mark">D</span> DarRoom
          </Link>
          <Link href="/">Back to searching rooms</Link>
          <DarkModeToggle />
        </div>
      </header>
      <main className={user ? "shell" : "shell account-page"}>
        {user ? (
          <AccountDashboard user={user} />
        ) : (
          <AccountForm verified={params.verified} resetToken={params.reset} next={params.next} />
        )}
      </main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <p>DarRoom · Search for free, contact directly.</p>
          <span>Tenants never pay a fee to use DarRoom.</span>
        </div>
      </footer>
    </>
  );
}
