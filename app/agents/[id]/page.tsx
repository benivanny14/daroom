import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { ListingPhotos } from "@/components/ListingPhotos";
import { notExpiredFilter } from "@/lib/listing-policy";
import { prisma } from "@/lib/prisma";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { getMediaUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function getAgent(id: string) {
  const agent = await prisma.user.findFirst({
    where: { id, role: "DALALI", isActive: true },
    select: {
      id: true,
      name: true,
      createdAt: true,
      idVerification: {
        where: { status: "APPROVED" },
        take: 1,
        select: { id: true }
      }
    }
  });
  if (!agent) return null;

  const listings = await prisma.listing.findMany({
    where: {
      ownerId: agent.id,
      status: "APPROVED",
      priceTzs: { gte: 50_000 },
      AND: [notExpiredFilter()]
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: {
      id: true,
      title: true,
      priceTzs: true,
      minMonths: true,
      luku: true,
      water: true,
      bedrooms: true,
      isFeatured: true,
      isAvailable: true,
      district: { select: { name: true } },
      neighborhood: { select: { name: true } },
      photos: { select: { id: true, storageKey: true, altText: true }, orderBy: { createdAt: "asc" }, take: 6 }
    }
  });

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      createdAt: agent.createdAt.toISOString(),
      isVerified: agent.idVerification.length > 0
    },
    listings: listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      priceTzs: listing.priceTzs,
      minMonths: listing.minMonths,
      luku: listing.luku,
      water: listing.water,
      bedrooms: listing.bedrooms,
      isFeatured: listing.isFeatured,
      isAvailable: listing.isAvailable,
      district: listing.district.name,
      neighborhood: listing.neighborhood.name,
      photos: listing.photos.flatMap((photo) => {
        const url = getMediaUrl(photo.storageKey);
        return url ? [{ id: photo.id, url, altText: photo.altText }] : [];
      })
    }))
  };
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getAgent(id);
  if (!data) {
    return { title: "Agent not found", robots: { index: false, follow: false } };
  }
  const title = `${data.agent.name} — Agent on ${SITE_NAME}`;
  const description = `Browse ${data.listings.length} ${data.listings.length === 1 ? "room" : "rooms"} listed by ${data.agent.name} in Dar es Salaam. Contact the Agent directly on WhatsApp.`;
  const url = `${SITE_URL}/agents/${data.agent.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, type: "profile", locale: "en_TZ" }
  };
}

export default async function AgentProfilePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getAgent(id);
  if (!data) notFound();

  const memberSince = new Date(data.agent.createdAt).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric"
  });

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
      <main className="shell">
        <section className="agent-hero">
          <span className="eyebrow">Agent profile</span>
          <h1>{data.agent.name}</h1>
          <div className="agent-meta">
            {data.agent.isVerified && <span className="status live">Account verified</span>}
            <span>Agent since {memberSince}</span>
            <span>
              {data.listings.length} live {data.listings.length === 1 ? "listing" : "listings"}
            </span>
          </div>
          <p>
            DarRoom does not collect rent. Open a room, tap{" "}
            <strong>Contact the Agent on WhatsApp</strong>, and agree the rent and terms directly
            with this Agent.
          </p>
        </section>

        <section className="listing-grid agent-listings">
          {data.listings.length ? (
            data.listings.map((listing) => (
              <article className="listing" key={listing.id}>
                <ListingPhotos
                  photos={listing.photos}
                  neighborhood={listing.neighborhood}
                  tone="one"
                  featured={listing.isFeatured}
                />
                <div className="listing-body">
                  <div className="location">
                    <span className="pin" />
                    {listing.neighborhood}, {listing.district}
                  </div>
                  <h3 className="listing-title">
                    <Link href={`/listing/${listing.id}`}>{listing.title}</Link>
                  </h3>
                  <div className="price-line">
                    <span className="price">TSh {listing.priceTzs.toLocaleString("en-TZ")}</span>
                    <span className="per">/ month</span>
                  </div>
                  <div className="terms">
                    <span className="term">
                      From {listing.minMonths} {listing.minMonths === 1 ? "month" : "months"}
                    </span>
                    {listing.bedrooms && (
                      <span className="term">
                        {listing.bedrooms} {listing.bedrooms === 1 ? "bedroom" : "bedrooms"}
                      </span>
                    )}
                    {listing.isAvailable === false && (
                      <span className="term" style={{ color: "var(--red)" }}>Rented</span>
                    )}
                  </div>
                  <Link className="listing-detail-link" href={`/listing/${listing.id}`}>
                    View room <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <div className="empty">
              <h3>No live listings right now.</h3>
              <p>This Agent has no available rooms at the moment. Check back later.</p>
              <Link className="table-action" href="/">Browse all rooms</Link>
            </div>
          )}
        </section>
      </main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <p>&copy; 2026 DarRoom &middot; Dar es Salaam, Tanzania</p>
          <span>Tenants pay no fee to search or view a room.</span>
        </div>
      </footer>
    </>
  );
}
