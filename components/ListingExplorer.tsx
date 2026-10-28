"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  type Listing
} from "@/lib/listings";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { ListingPhotos } from "@/components/ListingPhotos";
import { ChatWidget } from "@/components/ChatWidget";

const reportCategories = [
  "Listing is not real",
  "Price is incorrect",
  "Room has already been rented",
  "Room viewing fee"
];

export function ListingExplorer({ heroImage }: { heroImage?: string | null }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [districts, setDistricts] = useState<{ name: string; neighborhoods: string[] }[]>([]);
  const [district, setDistrict] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [query, setQuery] = useState("");
  const [reporting, setReporting] = useState<Listing | null>(null);
  const [category, setCategory] = useState(reportCategories[0]);
  const [details, setDetails] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [contactBusyId, setContactBusyId] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [sort, setSort] = useState("featured");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let savedFavorites: string[] = [];
    try {
      const savedFavs = localStorage.getItem("darroom_favorites");
      if (savedFavs) {
        const parsed: unknown = JSON.parse(savedFavs);
        if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) {
          savedFavorites = parsed;
          setFavorites(new Set(parsed));
        }
      }
    } catch {
      setFeedback("Saved favorites could not be read on this device.");
    }
    setFavoritesLoaded(true);

    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const session = await response.json();
        if (!session.user) return;
        setLoggedIn(true);
        const favoritesResponse = await fetch("/api/favorites", { cache: "no-store" });
        if (!favoritesResponse.ok) return;
        const favoritesBody = await favoritesResponse.json();
        const serverIds = new Set<string>(
          Array.isArray(favoritesBody.favorites)
            ? favoritesBody.favorites.map((favorite: { listing: { id: string } }) => favorite.listing.id)
            : []
        );
        // Move favorites saved on this device into the signed-in account.
        for (const listingId of savedFavorites) {
          if (serverIds.has(listingId)) continue;
          const migrate = await fetch("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listingId })
          });
          if (migrate.ok) serverIds.add(listingId);
        }
        setFavorites(serverIds);
      })
      .catch(() => {
        // Guests and offline sessions keep working with device favorites.
      });

    // Area filters are decorative: a failure here must not hide live listings.
    fetch("/api/geography")
      .then(async (response) => {
        const body = await response.json();
        if (
          !response.ok ||
          !body.region ||
          !Array.isArray(body.region.districts) ||
          body.region.districts.some(
            (item: { name?: unknown; neighborhoods?: unknown }) =>
              typeof item?.name !== "string" ||
              !Array.isArray(item.neighborhoods) ||
              item.neighborhoods.some((place: { name?: unknown }) => typeof place?.name !== "string")
          )
        ) {
          throw new Error(body.error || "Service unavailable.");
        }
        setDistricts(body.region.districts.map((item: { name: string; neighborhoods: { name: string }[] }) => ({
          name: item.name,
          neighborhoods: item.neighborhoods.map((place) => place.name)
        })));
      })
      .catch(() => setFeedback("Area filters could not be loaded. You can still browse all listings."));
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) return;
    try {
      localStorage.setItem("darroom_favorites", JSON.stringify(Array.from(favorites)));
    } catch {
      setFeedback("This browser cannot save favorites. You can keep searching without an account.");
    }
  }, [favorites, favoritesLoaded]);

  // Each keystroke waits before asking the API, so typing does not burn the rate limit.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const buildListingQuery = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (district) params.set("district", district);
      if (neighborhood) params.set("neighborhood", neighborhood);
      if (maxPrice) params.set("maxPrice", maxPrice);
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (sort) params.set("sort", sort);
      params.set("limit", "24");
      if (cursor) params.set("cursor", cursor);
      return params.toString();
    },
    [debouncedQuery, district, maxPrice, neighborhood, sort]
  );

  // Listings are filtered, sorted and paged by the API so large inventories stay fast.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`/api/listings?${buildListingQuery()}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.listings)) {
          throw new Error(body.error || "Service unavailable.");
        }
        if (cancelled) return;
        setListings(body.listings);
        setNextCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
        setTotalCount(Number.isFinite(body.total) ? body.total : null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Service unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildListingQuery]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setFeedback("");
    try {
      const response = await fetch(`/api/listings?${buildListingQuery(nextCursor)}`);
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.listings)) {
        throw new Error(body.error || "Could not load more listings.");
      }
      setListings((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...body.listings.filter((item: Listing) => !seen.has(item.id))];
      });
      setNextCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "Could not load more listings.");
    } finally {
      setLoadingMore(false);
    }
  }

  const neighborhoods = districts.find((item) => item.name === district)?.neighborhoods || [];
  const activeFilterCount = [
    district,
    neighborhood,
    maxPrice,
    query.trim()
  ].filter(Boolean).length;

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reporting || reportSubmitting) return;
    setFeedback("");
    setReportSubmitting(true);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: reporting.id,
          category,
          details: details.trim()
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Report was not sent.");
      if (result.flagged) {
        setListings((current) => current.filter((listing) => listing.id !== reporting.id));
      }
      setReporting(null);
      setDetails("");
      setFeedback(result.message || "Thank you. We received your report; our team will review it.");
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "Could not send the report. Please try again.");
    } finally {
      setReportSubmitting(false);
    }
  }

  async function toggleFavorite(listing: Listing) {
    const wasFavorite = favorites.has(listing.id);
    setFavorites((prev) => {
      const newSet = new Set(prev);
      if (wasFavorite) {
        newSet.delete(listing.id);
      } else {
        newSet.add(listing.id);
      }
      return newSet;
    });

    if (!loggedIn) return;

    try {
      const response = await fetch(wasFavorite ? `/api/favorites/${encodeURIComponent(listing.id)}` : "/api/favorites", {
        method: wasFavorite ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: wasFavorite ? undefined : JSON.stringify({ listingId: listing.id })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save favorite.");
      setFeedback(wasFavorite ? "Listing removed from your account favorites." : "Listing saved to your account. Find it on your account page.");
    } catch (caught) {
      setFavorites((prev) => {
        const reverted = new Set(prev);
        if (wasFavorite) {
          reverted.add(listing.id);
        } else {
          reverted.delete(listing.id);
        }
        return reverted;
      });
      setFeedback(caught instanceof Error ? caught.message : "Could not save favorite.");
    }
  }

  async function openContact(listing: Listing) {
    if (!loggedIn) {
      window.location.assign("/account");
      return;
    }
    setContactBusyId(listing.id);
    setFeedback("");
    try {
      const response = await fetch(`/api/listings/${encodeURIComponent(listing.id)}/contact`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Agent's number is unavailable.");
      window.open(
        buildWhatsAppLink(body.phone, listing.title, listing.neighborhood, listing.priceTzs),
        "_blank",
        "noopener,noreferrer"
      );
      setFeedback(`Agent number: ${body.formattedPhone}. WhatsApp has been opened.`);
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "Agent's number is unavailable.");
    } finally {
      setContactBusyId("");
    }
  }

  return (
    <>
      <section className="shell hero">
        <div>
          <span className="eyebrow"><span className="eyebrow-rule" />Dar es Salaam · Tanzania</span>
          <h1 className="display">
            Find a room
            <br />
            <em>near you.</em>
          </h1>
          <p className="hero-copy">
            Rent and terms, clearly stated. Pick the neighborhood you want, then contact
            an agent directly. Searching is free — tenants pay no fee.
          </p>
          <div className="hero-promise">
            <span aria-hidden="true">✓</span>
            <span>Free to search <i /> Contact directly</span>
          </div>
        </div>
        <div className={`hero-visual${heroImage ? " has-photo" : ""}`} aria-label={heroImage ? "Photo chosen by DarRoom" : "Illustration of Dar es Salaam homes"} role="img">
          {heroImage && <Image className="hero-photo" src={heroImage} alt="" width={1200} height={800} unoptimized priority />}
          <span className="sun" />
          <span className="hero-horizon" />
          <div className="hero-stamp">
            DARROOM <span>·</span> NEIGHBORHOOD GUIDE
            <strong>Welcome home.</strong>
          </div>
        </div>
      </section>

      <section className="shell finder" aria-label="Search for a room">
        <div className="finder-head">
          <div>
            <span className="section-kicker">START HERE</span>
            <h2>Find a room</h2>
          </div>
          <span className="finder-note">Filter by area, budget and your needs</span>
        </div>
        <form
          className="filter-grid"
          onSubmit={(event) => {
            event.preventDefault();
            document.getElementById("listings")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <div className="field">
            <label htmlFor="district">District</label>
            <select
              id="district"
              value={district}
              onChange={(event) => {
                setDistrict(event.target.value);
                setNeighborhood("");
              }}
            >
              <option value="">All districts</option>
              {districts.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="neighborhood">Neighborhood</label>
            <select
              id="neighborhood"
              value={neighborhood}
              onChange={(event) => setNeighborhood(event.target.value)}
              disabled={!district}
            >
              <option value="">All neighborhoods</option>
              {neighborhoods.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="budget">Budget / month</label>
            <select
              id="budget"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
            >
              <option value="">Any budget</option>
              <option value="100000">TSh 50,000 – 100,000</option>
              <option value="150000">Up to TSh 150,000</option>
              <option value="200000">Up to TSh 200,000</option>
            </select>
          </div>
          <div className="field keyword-field">
            <label htmlFor="keywords">Search keywords</label>
            <input
              id="keywords"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. near campus..."
            />
          </div>
          <button className="search-button" type="submit">
            <span>Search listings</span><span aria-hidden="true">→</span>
          </button>
        </form>
        <div className="finder-footer">
          <span aria-live="polite">
            {activeFilterCount
              ? activeFilterCount === 1
                ? "1 filter selected"
                : `${activeFilterCount} filters selected`
              : "All live listings"}
          </span>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="clear-filters"
              onClick={() => {
                setDistrict("");
                setNeighborhood("");
                setMaxPrice("");
                setQuery("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      <section className="shell" id="listings">
        <div className="results-head">
          <div>
            <span className="section-kicker">LISTINGS FOR RENT</span>
            <h2>See what&apos;s available</h2>
            <p>
              {loading
                ? "Checking live listings..."
                : error
                  ? "Service status is shown below."
                  : `${totalCount ?? listings.length} live ${(totalCount ?? listings.length) === 1 ? "listing" : "listings"} · Rent and terms clearly stated`}
            </p>
          </div>
          <div className="results-tools">
            {!loading && !error && (
              <label className="sort-control" htmlFor="sort-order">
                <span className="sort-label">Sort</span>
                <select id="sort-order" value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="featured">Featured first</option>
                  <option value="newest">Newest</option>
                  <option value="price_asc">Price: lowest first</option>
                  <option value="price_desc">Price: highest first</option>
                </select>
              </label>
            )}
            {!loading && !error && <span className="verified-label"><span aria-hidden="true">✓</span> Live</span>}
          </div>
        </div>
        {feedback && <div className="notice" role="status">{feedback}</div>}
        <div className="listing-grid">
          {loading ? (
            <div className="empty" role="status">
              <span className="loading-mark" aria-hidden="true" />
              <h3>Loading listings</h3>
              <p>Please wait while we fetch live listings.</p>
            </div>
          ) : error ? (
            <div className="empty error-empty" role="alert">
              <span className="service-state-mark" aria-hidden="true">!</span>
              <h3>Listings cannot be loaded right now</h3>
              <p>{error} Try again later. We do not show sample listings.</p>
            </div>
          ) : listings.length ? (
            listings.map((listing) => (
              <article className="listing" key={listing.id}>
                <ListingPhotos photos={listing.photos} neighborhood={listing.neighborhood} tone={listing.imageTone} featured={listing.featured} />
                <div className="listing-body">
                  <div className="location">
                    <span className="pin" />
                    {listing.neighborhood}, {listing.district}
                  </div>
                  <h3 className="listing-title">
                    <Link href={`/listing/${listing.id}`}>{listing.title}</Link>
                  </h3>
                  <div className="price-line">
                    <span className="price">
                      TSh {listing.priceTzs.toLocaleString("en-TZ")}
                    </span>
                    <span className="per">/ month</span>
                  </div>
                  <div className="terms">
                    <span className="term">From {listing.minMonths} {listing.minMonths === 1 ? "month" : "months"}</span>
                    <span className="term">{listing.luku ? "Electricity included" : "Electricity excluded"}</span>
                    <span className="term">{listing.water}</span>
                    {listing.bedrooms && <span className="term">{listing.bedrooms} {listing.bedrooms === 1 ? "bedroom" : "bedrooms"}</span>}
                    {listing.furnished && <span className="term">Furnished</span>}
                    {listing.isAvailable === false && <span className="term" style={{ color: "var(--red)" }}>Rented</span>}
                  </div>
                  <div className="listing-actions">
                    <div className="listing-utility-actions">
                      <button
                        type="button"
                        className={`favorite-button ${favorites.has(listing.id) ? "favorited" : ""}`}
                        onClick={() => toggleFavorite(listing)}
                        aria-label={favorites.has(listing.id) ? "Remove from favorites" : "Save to favorites"}
                        aria-pressed={favorites.has(listing.id)}
                      >
                        <span className="favorite-star" aria-hidden="true">{favorites.has(listing.id) ? "★" : "☆"}</span>
                        <span>{favorites.has(listing.id) ? "Saved" : "Save"}</span>
                      </button>
                      <Link className="listing-detail-link" href={`/listing/${listing.id}`}>
                        Details <span aria-hidden="true">↗</span>
                      </Link>
                      <button
                        type="button"
                        className="report-button"
                        onClick={() => setReporting(listing)}
                      >
                        Report
                      </button>
                    </div>
                    {listing.isAvailable === false ? (
                      <button
                        className="whatsapp"
                        type="button"
                        disabled
                        aria-label={`${listing.title} is already rented`}
                      >
                        Room is rented
                      </button>
                    ) : loggedIn ? (
                      <button
                        className="whatsapp"
                        type="button"
                        disabled={contactBusyId === listing.id}
                        onClick={() => openContact(listing)}
                        aria-label={`Contact about ${listing.title} on WhatsApp`}
                      >
                        <span className="whatsapp-mark" aria-hidden="true">↗</span>
                        {contactBusyId === listing.id ? "Looking up number..." : "Contact on WhatsApp"}
                      </button>
                    ) : (
                      <Link
                        className="whatsapp"
                        href="/account"
                        aria-label="Log in to see the agent's number"
                      >
                        <span className="whatsapp-mark" aria-hidden="true">↗</span> Log in to see number
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="empty">
              <h3>{listings.length ? "No matching rooms." : "No listings yet."}</h3>
              <p>{listings.length ? "Try increasing your budget or choosing another district." : "We do not show sample listings. Check back later to see real listings as they become available."}</p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  className="empty-reset"
                  onClick={() => {
                    setDistrict("");
                    setNeighborhood("");
                    setMaxPrice("");
                    setQuery("");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
        {!loading && !error && nextCursor && (
          <div className="load-more-wrap">
            <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore
                ? "Loading more listings..."
                : `Load more listings (${listings.length}${totalCount ? ` of ${totalCount}` : ""} shown)`}
            </button>
          </div>
        )}
      </section>

      {reporting && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            onSubmit={submitReport}
          >
            <span className="eyebrow" style={{ color: "var(--red)" }}>
              Help us keep listings safe
            </span>
            <h2 id="report-title">Report this room</h2>
            <p>
              Your report will hide this listing while our team reviews it. You do
              not need to log in or share your details.
            </p>
            <label htmlFor="report-category">Reason for report</label>
            <select
              id="report-category"
              value={category}
              disabled={reportSubmitting}
              onChange={(event) => setCategory(event.target.value)}
            >
              {reportCategories.map((reason) => (
                <option key={reason}>{reason}</option>
              ))}
            </select>
            <label htmlFor="report-details">Additional details (optional)</label>
            <textarea
              id="report-details"
              maxLength={500}
              value={details}
              disabled={reportSubmitting}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Briefly describe what happened..."
            />
            <div className="modal-actions">
              <button
                className="btn-secondary"
                type="button"
                disabled={reportSubmitting}
                onClick={() => {
                  setReporting(null);
                  setDetails("");
                }}
              >
                Cancel
              </button>
              <button className="btn-danger" type="submit" disabled={reportSubmitting}>
                {reportSubmitting ? "Sending..." : "Send report"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Chat widget - show for featured listing */}
      {listings.length > 0 && listings[0].isFeatured && (
        <ChatWidget
          dalaliName="Agent"
          listingId={listings[0].id}
          listingTitle={listings[0].title}
          neighborhood={listings[0].neighborhood}
          priceTzs={listings[0].priceTzs}
        />
      )}
    </>
  );
}
