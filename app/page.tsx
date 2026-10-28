import Link from "next/link";
import { ListingExplorer } from "@/components/ListingExplorer";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { prisma } from "@/lib/prisma";
import { getMediaUrl } from "@/lib/storage";

// The shell is static apart from the admin-edited hero photo, so it is cached for
// 30 seconds and re-rendered in the background instead of on every visit.
export const revalidate = 30;

export default async function HomePage() {
  const heroSetting = await prisma.siteSetting.findUnique({ where: { key: "heroImage" } });
  const heroImage = heroSetting ? getMediaUrl(heroSetting.value) : null;
  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <Link className="brand" href="/" aria-label="DarRoom home">
            <span className="brand-mark" aria-hidden="true">D</span>
            <span>DarRoom</span>
          </Link>
          <nav className="nav-links main-nav-links" aria-label="Main navigation">
            <a href="#listings">Find a room</a>
            <Link href="/dalali">For Agents</Link>
            <Link href="/account" className="nav-account">Account</Link>
            <DarkModeToggle />
          </nav>
        </div>
      </header>
      <main>
        <ListingExplorer heroImage={heroImage} />
      </main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <p>© 2026 DarRoom · Dar es Salaam, Tanzania</p>
          <div className="footer-links">
            <span>Tenants pay no search fee.</span>
            <Link href="/dalali">Post a listing</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/faq">FAQ</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
