import Link from "next/link";
import { notFound } from "next/navigation";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { ListingDetailView } from "@/components/ListingDetailView";
import { notExpiredFilter } from "@/lib/listing-policy";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ListingPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const listing = await prisma.listing.findFirst({
    where: {
      id,
      status: "APPROVED",
      priceTzs: { gte: 50_000 },
      AND: [notExpiredFilter()]
    },
    select: { id: true }
  });

  if (!listing) notFound();

  return (
    <>
      <header className="topbar">
        <div className="shell account-topbar">
          <Link className="brand" href="/">
            <span className="brand-mark">D</span> DarRoom
          </Link>
          <nav className="nav-links">
            <Link href="/">All rooms</Link>
            <Link href="/dalali">For Agents</Link>
            <DarkModeToggle />
          </nav>
        </div>
      </header>
      <main>
        <ListingDetailView listingId={id} />
      </main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <p>© 2026 DarRoom · Dar es Salaam, Tanzania</p>
          <span>Tenants pay no fee to search or view a room.</span>
        </div>
      </footer>
    </>
  );
}
