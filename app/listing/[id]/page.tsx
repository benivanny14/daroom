import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { ListingDetailView } from "@/components/ListingDetailView";
import { getListingDetail, recordListingView } from "@/lib/listing-detail";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

function truncate(value: string, length: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingDetail(id);

  if (!listing) {
    return {
      title: "Room not found",
      robots: { index: false, follow: false }
    };
  }

  const url = `${SITE_URL}/listing/${listing.id}`;
  const price = listing.priceTzs.toLocaleString("en-TZ");
  const title = `${listing.title} — TSh ${price}/month in ${listing.neighborhood}`;
  const description = truncate(
    `${listing.description} ${listing.bedrooms ?? 1} bedroom in ${listing.neighborhood}, ${listing.district}. TSh ${price} per month. Contact the Agent on WhatsApp.`,
    160
  );
  const images = listing.photos.length
    ? [{ url: listing.photos[0].url, alt: listing.photos[0].altText }]
    : [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: `${SITE_NAME} — rooms for rent in Dar es Salaam` }];

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_TZ",
      images
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map((image) => image.url)
    }
  };
}

export default async function ListingPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getListingDetail(id);

  if (!listing) notFound();

  // Counted once per server render; the API keeps counting other clients.
  recordListingView(listing.id);

  const url = `${SITE_URL}/listing/${listing.id}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listing.title,
    description: listing.description,
    url,
    datePosted: listing.createdAt,
    image: listing.photos.map((photo) => photo.url),
    numberOfRooms: listing.bedrooms ?? undefined,
    numberOfBathroomsTotal: listing.bathrooms ?? undefined,
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
      url,
      availability: listing.isAvailable
        ? "https://schema.org/InStock"
        : "https://schema.org/SoldOut"
    },
    ...(listing.ratingAverage !== null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: listing.ratingAverage,
            reviewCount: listing.reviewCount,
            bestRating: 5,
            worstRating: 1
          }
        }
      : {})
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
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
      <main>
        <ListingDetailView initialListing={listing} />
      </main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <p>&copy; 2026 DarRoom &middot; Dar es Salaam, Tanzania</p>
          <Link href="/rooms">Browse rooms by area</Link>
        </div>
      </footer>
    </>
  );
}
