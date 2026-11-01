import type { Metadata } from "next";
import Link from "next/link";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { getAreas, groupAreasByDistrict } from "@/lib/areas";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 600;

const TITLE = "Rooms for rent by area — Dar es Salaam";
const DESCRIPTION =
  "Browse rooms for rent in every Dar es Salaam area: Kinondoni, Ilala, Temeke, Ubungo, Kigamboni, Sinza, Kariakoo, Mikocheni, Mbagala and more. Prices, terms and Agent contact on WhatsApp.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/rooms` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/rooms`,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_TZ"
  }
};

export default async function AreasPage() {
  const areas = await getAreas();
  const groups = groupAreasByDistrict(areas);
  // District counts already include their neighbourhoods, so summing the
  // district rows gives the live total without counting a room twice.
  const totalListings = areas
    .filter((area) => area.type === "district")
    .reduce((sum, area) => sum + area.listings, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/rooms`,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: groups.length,
      itemListElement: groups.map((group, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `Rooms for rent in ${group.district}`,
        url: `${SITE_URL}/rooms/${group.areas.find((area) => area.type === "district")?.slug ?? group.areas[0]?.slug ?? ""}`
      }))
    }
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
            <Link href="/dalali">For Agents</Link>
            <DarkModeToggle />
          </nav>
        </div>
      </header>

      <main className="shell">
        <section className="agent-hero">
          <span className="eyebrow">
            <span className="eyebrow-rule" />
            Browse by area
          </span>
          <h1>Rooms for rent by area in Dar es Salaam</h1>
          <div className="agent-meta">
            <span>{totalListings} live listings</span>
            <span>{groups.length} districts</span>
            <span>Tenants pay no search fee</span>
          </div>
          <p>
            Every room on DarRoom shows its monthly rent, minimum stay, water, electricity and
            toilet arrangements before you call. Pick a district, or go straight to the
            neighbourhood you already know.
          </p>
        </section>

        <div className="area-groups">
          {groups.map((group) => {
            const districtSlug = group.areas.find((area) => area.type === "district")?.slug;
            return (
              <section className="area-group" key={group.district}>
                <div className="area-group-head">
                  <h2>
                    {districtSlug ? (
                      <Link href={`/rooms/${districtSlug}`}>{group.district}</Link>
                    ) : (
                      group.district
                    )}
                  </h2>
                  <span className="area-count">
                    {group.areas.reduce((sum, area) => sum + area.listings, 0)} rooms
                  </span>
                </div>
                <ul className="area-list">
                  {group.areas.map((area) => (
                    <li key={area.slug}>
                      <Link href={`/rooms/${area.slug}`} className="area-chip">
                        <span>{area.type === "district" ? `All of ${area.name}` : area.name}</span>
                        <span className="area-chip-count">
                          {area.listings > 0 ? area.listings : "No rooms yet"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </main>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <p>&copy; 2026 DarRoom &middot; Dar es Salaam, Tanzania</p>
          <div className="footer-links">
            <Link href="/">All rooms</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
