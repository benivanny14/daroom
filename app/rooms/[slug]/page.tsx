import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { ListingPhotos } from "@/components/ListingPhotos";
import { getArea, getAreas } from "@/lib/areas";
import { notExpiredFilter } from "@/lib/listing-policy";
import { prisma } from "@/lib/prisma";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { getMediaUrl } from "@/lib/storage";

export const revalidate = 600;

type AreaListing = Awaited<ReturnType<typeof getAreaListings>>["listings"][number];

async function getAreaListings(area: { type: "district" | "neighborhood"; name: string; district: string }) {
  const listings = await prisma.listing.findMany({
    where: {
      status: "APPROVED",
      priceTzs: { gte: 50_000 },
      AND: [notExpiredFilter()],
      district: { name: area.district },
      ...(area.type === "neighborhood" ? { neighborhood: { name: area.name } } : {})
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: {
      id: true,
      title: true,
      priceTzs: true,
      minMonths: true,
      bedrooms: true,
      furnished: true,
      allowsPets: true,
      electricityMode: true,
      hasWifi: true,
      toiletMode: true,
      isFeatured: true,
      isAvailable: true,
      district: { select: { name: true } },
      neighborhood: { select: { name: true } },
      photos: { select: { id: true, storageKey: true, altText: true }, orderBy: { createdAt: "asc" }, take: 4 }
    }
  });

  return {
    listings: listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      priceTzs: listing.priceTzs,
      minMonths: listing.minMonths,
      bedrooms: listing.bedrooms,
      furnished: listing.furnished,
      allowsPets: listing.allowsPets,
      electricityMode: listing.electricityMode,
      hasWifi: listing.hasWifi,
      toiletMode: listing.toiletMode,
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

function priceRange(listings: AreaListing[]): { min: number; max: number } | null {
  if (!listings.length) return null;
  let min = listings[0].priceTzs;
  let max = listings[0].priceTzs;
  for (const listing of listings) {
    if (listing.priceTzs < min) min = listing.priceTzs;
    if (listing.priceTzs > max) max = listing.priceTzs;
  }
  return { min, max };
}

function money(value: number): string {
  return `TSh ${value.toLocaleString("en-TZ")}`;
}

function areaHeadline(area: { type: "district" | "neighborhood"; name: string; district: string }): string {
  return area.type === "district"
    ? `Rooms for rent in ${area.name}, Dar es Salaam`
    : `Rooms for rent in ${area.name}, ${area.district}`;
}

function areaIntro(area: { name: string; district: string }, listings: AreaListing[]): string {
  const range = priceRange(listings);
  if (!listings.length || !range) {
    return `There are no live rooms advertised in ${area.name} right now. New rooms appear here as soon as an Agent lists one, so check back or browse nearby areas below.`;
  }
  const count = `${listings.length} live ${listings.length === 1 ? "room" : "rooms"}`;
  const prices =
    range.min === range.max
      ? `at ${money(range.min)} per month`
      : `from ${money(range.min)} to ${money(range.max)} per month`;
  return `${count} advertised in ${area.name}, ${area.district}, ${prices}. Each listing states the minimum stay, whether electricity is on your own meter or shared, the water supply and whether the toilet is private or shared, so you know what the rent covers before you call.`;
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const area = await getArea(slug);
  if (!area) {
    return { title: "Area not found", robots: { index: false, follow: false } };
  }

  const { listings } = await getAreaListings(area);
  const range = priceRange(listings);
  const url = `${SITE_URL}/rooms/${area.slug}`;
  const title = `${areaHeadline(area)} — ${range ? `${money(range.min)}/month` : "DarRoom"}`;
  const description = (
    listings.length
      ? `${listings.length} ${listings.length === 1 ? "room" : "rooms"} for rent in ${area.name}, ${area.district}. ${
          range ? `Rent from ${money(range.min)} to ${money(range.max)} per month. ` : ""
        }Clear prices and terms, then contact the Agent on WhatsApp.`
      : `No rooms are advertised in ${area.name} right now. Browse nearby Dar es Salaam areas and get notified when a new room is listed.`
  ).slice(0, 158);

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: listings.length ? undefined : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_TZ",
      ...(listings[0]?.photos[0] ? { images: [{ url: listings[0].photos[0].url, alt: listings[0].photos[0].altText }] } : {})
    }
  };
}

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const area = await getArea(slug);
  if (!area) notFound();

  const [{ listings }, areas] = await Promise.all([getAreaListings(area), getAreas()]);
  const range = priceRange(listings);
  const url = `${SITE_URL}/rooms/${area.slug}`;

  const nearby = areas
    .filter(
      (candidate) =>
        candidate.slug !== area.slug &&
        candidate.district === area.district &&
        candidate.type === "neighborhood" &&
        candidate.listings > 0
    )
    .slice(0, 8);
  const otherDistricts = areas
    .filter((candidate) => candidate.type === "district" && candidate.district !== area.district)
    .slice(0, 6);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: areaHeadline(area),
    description: areaIntro(area, listings),
    url,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    ...(listings.length
      ? {
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: listings.length,
            itemListElement: listings.map((listing, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: listing.title,
              url: `${SITE_URL}/listing/${listing.id}`,
              item: {
                "@type": "RealEstateListing",
                name: listing.title,
                url: `${SITE_URL}/listing/${listing.id}`,
                address: {
                  "@type": "PostalAddress",
                  addressLocality: listing.neighborhood,
                  addressRegion: listing.district,
                  addressCountry: "TZ"
                },
                offers: {
                  "@type": "Offer",
                  price: listing.priceTzs,
                  priceCurrency: "TZS",
                  availability: listing.isAvailable
                    ? "https://schema.org/InStock"
                    : "https://schema.org/SoldOut"
                }
              }
            }))
          }
        }
      : {})
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Areas", item: `${SITE_URL}/rooms` },
      { "@type": "ListItem", position: 3, name: area.name, item: url }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }}
      />

      <header className="topbar">
        <div className="shell account-topbar">
          <Link className="brand" href="/">
            <span className="brand-mark">D</span> DarRoom
          </Link>
          <nav className="nav-links">
            <Link href="/">All rooms</Link>
            <Link href="/rooms">Areas</Link>
            <Link href="/dalali">For Agents</Link>
            <DarkModeToggle />
          </nav>
        </div>
      </header>

      <main className="shell">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/rooms">Areas</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{area.name}</span>
        </nav>

        <section className="agent-hero">
          <span className="eyebrow">
            <span className="eyebrow-rule" />
            {area.type === "district" ? "District" : `${area.district} district`}
          </span>
          <h1>{areaHeadline(area)}</h1>
          <div className="agent-meta">
            <span>
              {listings.length} live {listings.length === 1 ? "listing" : "listings"}
            </span>
            {range && (
              <span>
                {money(range.min)} – {money(range.max)} / month
              </span>
            )}
            <span>No Agent commission charged to tenants</span>
          </div>
          <p>{areaIntro(area, listings)}</p>
        </section>

        {listings.length ? (
          <section className="listing-grid area-listings" aria-label={`Rooms in ${area.name}`}>
            {listings.map((listing) => (
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
                    <span className="price">{money(listing.priceTzs)}</span>
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
                    <span className="term">
                      {listing.electricityMode === "INDEPENDENT" ? "Own meter" : "Shared electricity"}
                    </span>
                    {listing.hasWifi && <span className="term">Wi-Fi</span>}
                    <span className="term">
                      {listing.toiletMode === "PRIVATE" ? "Private toilet" : "Shared toilet"}
                    </span>
                    {listing.furnished && <span className="term">Furnished</span>}
                    {listing.allowsPets && <span className="term">Pets allowed</span>}
                    {listing.isAvailable === false && (
                      <span className="term" style={{ color: "var(--red)" }}>
                        Rented
                      </span>
                    )}
                  </div>
                  <Link className="listing-detail-link" href={`/listing/${listing.id}`}>
                    View room <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="empty area-empty">
            <h3>No live rooms in {area.name} right now.</h3>
            <p>Rooms appear here as soon as an Agent publishes them. Meanwhile, browse:</p>
            <Link className="table-action" href="/">
              All rooms in Dar es Salaam
            </Link>
          </section>
        )}

        <section className="area-guide">
          <h2>What renting in {area.name} looks like</h2>
          <p>
            Rooms in {area.name} are usually let for a minimum of three to six months, and the
            monthly rent is agreed directly with the Agent. DarRoom does not collect rent and does
            not charge a commission: you open a room, tap <strong>Contact the Agent on WhatsApp</strong>,
            and agree the price, deposit and move-in date with the Agent themselves.
          </p>
          <ul className="area-guide-list">
            <li>No viewing or inspection fee may be charged — Agents who ask for one are removed.</li>
            <li>Electricity is either on your own meter or shared; the listing says which.</li>
            <li>Water supply, Wi-Fi, furnished rooms and private toilets are listed per room.</li>
            <li>Always view the room before paying a deposit, and ask for a written receipt.</li>
          </ul>
        </section>

        {nearby.length > 0 && (
          <section className="area-related">
            <h2>Other areas in {area.district}</h2>
            <ul className="area-list">
              {nearby.map((candidate) => (
                <li key={candidate.slug}>
                  <Link href={`/rooms/${candidate.slug}`} className="area-chip">
                    <span>{candidate.name}</span>
                    <span className="area-chip-count">{candidate.listings}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="area-related">
          <h2>Browse other districts</h2>
          <ul className="area-list">
            <li>
              <Link href="/rooms" className="area-chip">
                <span>All areas</span>
                <span className="area-chip-count">{area.district}</span>
              </Link>
            </li>
            {otherDistricts.map((candidate) => (
              <li key={candidate.slug}>
                <Link href={`/rooms/${candidate.slug}`} className="area-chip">
                  <span>{candidate.name}</span>
                  <span className="area-chip-count">{candidate.listings}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <p>&copy; 2026 DarRoom &middot; Dar es Salaam, Tanzania</p>
          <div className="footer-links">
            <Link href="/">All rooms</Link>
            <Link href="/rooms">Areas</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
