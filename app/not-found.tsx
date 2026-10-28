import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <Link className="brand" href="/" aria-label="DarRoom home">
            <span className="brand-mark" aria-hidden="true">D</span>
            <span>DarRoom</span>
          </Link>
          <nav className="nav-links" aria-label="Main navigation">
            <Link href="/#listings">Find a room</Link>
            <Link href="/dalali">For Agents</Link>
            <Link href="/account">Account</Link>
          </nav>
        </div>
      </header>
      <main className="shell">
        <section className="page-hero">
          <span className="eyebrow">Error 404</span>
          <h1>This page is not here.</h1>
          <p>
            The room may have been rented, hidden by its agent, or the link is wrong.
            Continue searching — tenants pay no fee to look around.
          </p>
          <p style={{ marginTop: 22 }}>
            <Link className="wide-button" href="/">Back to all rooms</Link>
          </p>
        </section>
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
