"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ListingPhotos } from "@/components/ListingPhotos";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import type { Listing } from "@/lib/listings";

type ListingDetail = Listing & {
  createdAt: string;
  dalali: { name: string; isVerified: boolean };
  reviews: {
    id: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: string;
  }[];
};

function defaultAppointmentSlot() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ListingDetailView({ listingId }: { listingId: string }) {
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("Listing is not real");
  const [reportDetails, setReportDetails] = useState("");
  const [message, setMessage] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [sessionUser, setSessionUser] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [reviewRating, setReviewRating] = useState("5");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewName, setReviewName] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [appointmentName, setAppointmentName] = useState("");
  const [appointmentPhone, setAppointmentPhone] = useState("");
  const [appointmentAt, setAppointmentAt] = useState(defaultAppointmentSlot());
  const [appointmentNotes, setAppointmentNotes] = useState("");
  const [appointmentBusy, setAppointmentBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/listings/${encodeURIComponent(listingId)}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Listing not found.");
        setListing(body.listing);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Listing unavailable right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [listingId]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const session = await response.json();
        if (!session.user) return;
        setSessionUser(session.user);
        setReviewName(session.user.name || "");
        setAppointmentName(session.user.name || "");
        setAppointmentPhone(session.user.phone || "");
        const favoritesResponse = await fetch("/api/favorites", { cache: "no-store" });
        if (!favoritesResponse.ok) return;
        const favoritesBody = await favoritesResponse.json();
        setIsFavorite(
          Array.isArray(favoritesBody.favorites) &&
            favoritesBody.favorites.some(
              (favorite: { listing: { id: string } }) => favorite.listing.id === listingId
            )
        );
      })
      .catch(() => {
        // Guests can still book viewings and leave reviews.
      });
  }, [listingId]);

  async function toggleFavorite() {
    if (!listing || favoriteBusy) return;
    setFavoriteBusy(true);
    setError("");
    const next = !isFavorite;
    try {
      if (sessionUser) {
        const response = await fetch(next ? "/api/favorites" : `/api/favorites/${encodeURIComponent(listing.id)}`, {
          method: next ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: next ? JSON.stringify({ listingId: listing.id }) : undefined
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Favorite was not saved.");
        setIsFavorite(next);
        setMessage(next ? "Listing saved to your account." : "Listing removed from your favorites.");
      } else {
        const saved = localStorage.getItem("darroom_favorites");
        const parsed: unknown = saved ? JSON.parse(saved) : [];
        const ids = new Set<string>(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
        if (next) {
          ids.add(listing.id);
        } else {
          ids.delete(listing.id);
        }
        localStorage.setItem("darroom_favorites", JSON.stringify(Array.from(ids)));
        setIsFavorite(next);
        setMessage(next ? "Listing saved on this device. Log in to save it to your account." : "Listing removed from this device's favorites.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Favorite was not saved.");
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function openContact() {
    if (!listing || contactBusy) return;
    if (!sessionUser) {
      window.location.assign("/account");
      return;
    }
    setContactBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/listings/${encodeURIComponent(listing.id)}/contact`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Agent's number is unavailable.");
      window.open(
        buildWhatsAppLink(body.phone, listing.title, listing.neighborhood, listing.priceTzs),
        "_blank",
        "noopener,noreferrer"
      );
      setMessage(`Agent number: ${body.formattedPhone}. WhatsApp has been opened.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Agent's number is unavailable.");
    } finally {
      setContactBusy(false);
    }
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listing || reviewBusy) return;
    setReviewBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          rating: Number(reviewRating),
          comment: reviewComment.trim(),
          authorName: reviewName.trim() || undefined
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Review was not sent.");
      setListing((current) =>
        current
          ? {
              ...current,
              reviews: [
                {
                  id: body.review.id,
                  userName: body.review.userName,
                  rating: body.review.rating,
                  comment: body.review.comment,
                  createdAt: body.review.createdAt
                },
                ...current.reviews
              ]
            }
          : current
      );
      setReviewComment("");
      setMessage("Thank you for your review.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review was not sent.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function submitAppointment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listing || appointmentBusy) return;
    setAppointmentBusy(true);
    setError("");
    setMessage("");
    try {
      const scheduledAt = new Date(appointmentAt);
      if (Number.isNaN(scheduledAt.getTime())) throw new Error("Choose a valid date and time.");
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          tenantName: appointmentName.trim(),
          tenantPhone: appointmentPhone.trim(),
          tenantEmail: sessionUser?.email || "",
          scheduledAt: scheduledAt.toISOString(),
          notes: appointmentNotes.trim()
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Viewing request was not sent.");
      setAppointmentOpen(false);
      setAppointmentNotes("");
      setMessage("Your viewing is booked for the time you chose. The agent has been notified.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Viewing request was not sent.");
    } finally {
      setAppointmentBusy(false);
    }
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listing) return;
    setReportBusy(true);
    setError("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          category: reportCategory,
          details: reportDetails.trim()
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Report was not sent.");
      setReportOpen(false);
      setReportDetails("");
      if (body.flagged) setListing(null);
      setMessage(body.message || "Thank you. We received your report; our team will review it.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Report was not sent.");
    } finally {
      setReportBusy(false);
    }
  }

  if (loading) {
    return <div className="shell detail-state" role="status">Loading listing...</div>;
  }
  if (error && !listing) {
    return (
      <div className="shell detail-state">
        <div className="admin-warning" role="alert">{error}</div>
        <Link className="table-action" href="/">Back to listings</Link>
      </div>
    );
  }
  if (!listing) {
    return (
      <div className="shell detail-state">
        <p className="notice" role="status">{message || "This listing is no longer available."}</p>
        <Link className="table-action" href="/">Find other rooms</Link>
      </div>
    );
  }

  return (
    <section className="shell listing-detail">
      <div className="detail-back"><Link href="/">← Back to listings</Link></div>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="admin-warning" role="alert">{error}</p>}
      <div className="detail-grid">
        <div>
          <ListingPhotos
            photos={listing.photos}
            neighborhood={listing.neighborhood}
            tone={listing.imageTone}
            featured={listing.isFeatured}
            variant="full"
          />
          {listing.photos?.length === 0 && (
            <p className="fine-print">Photos of this room are not available right now.</p>
          )}
        </div>
        <article className="detail-panel">
          <span className="eyebrow">{listing.neighborhood}, {listing.district}</span>
          <h1>{listing.title}</h1>
          {listing.isAvailable === false && <span className="status flagged">Rented</span>}
          <div className="plan-price">TSh {listing.priceTzs.toLocaleString("en-TZ")} <small>/ month</small></div>
          <div className="terms detail-terms">
            <span className="term">From {listing.minMonths} {listing.minMonths === 1 ? "month" : "months"}</span>
            {listing.bedrooms && <span className="term">{listing.bedrooms} {listing.bedrooms === 1 ? "bedroom" : "bedrooms"}</span>}
            {listing.bathrooms && <span className="term">{listing.bathrooms} {listing.bathrooms === 1 ? "bathroom" : "bathrooms"}</span>}
            <span className="term">{listing.luku ? "Electricity included" : "Electricity excluded"}</span>
            <span className="term">{listing.water}</span>
            <span className="term">{listing.furnished ? "Furnished" : "Unfurnished"}</span>
            <span className="term">{listing.allowsStudents ? "Students welcome" : "Not for students"}</span>
            <span className="term">{listing.allowsPets ? "Pets allowed" : "No pets"}</span>
          </div>
          <p className="detail-description">{listing.description}</p>
          <div className="dalali-card">
            <strong>{listing.dalali.name}</strong>
            {listing.dalali.isVerified && <span className="status live">Account verified</span>}
          </div>
          {listing.isAvailable === false ? (
            <button className="whatsapp detail-whatsapp" type="button" disabled>
              Room is rented
            </button>
          ) : sessionUser ? (
            <button className="whatsapp detail-whatsapp" type="button" disabled={contactBusy} onClick={openContact}>
              {contactBusy ? "Looking up number..." : "Contact the Agent on WhatsApp"}
            </button>
          ) : (
            <Link className="whatsapp detail-whatsapp" href="/account">
              Log in to see the Agent&apos;s number
            </Link>
          )}
          {listing.phoneMasked && (
            <p className="fine-print">Agent number: {listing.phoneMasked} · the full number is visible when you log in.</p>
          )}
          <div className="detail-actions">
            <button
              className={`favorite-button ${isFavorite ? "favorited" : ""}`}
              type="button"
              disabled={favoriteBusy}
              onClick={toggleFavorite}
              aria-pressed={isFavorite}
            >
              <span className="favorite-star" aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
              <span>{isFavorite ? "Saved" : "Save room"}</span>
            </button>
            <button
              className="table-action"
              type="button"
              disabled={listing.isAvailable === false}
              onClick={() => setAppointmentOpen(true)}
            >
              {listing.isAvailable === false ? "Rented" : "Schedule a viewing"}
            </button>
          </div>
          <button className="report-button detail-report" onClick={() => setReportOpen(true)}>
            Report this room
          </button>
          <p className="fine-print">DarRoom does not charge tenants a platform fee. Rent payments are optional and only collected when your agent asks you to use the Pay rent page.</p>
        </article>
      </div>

      <section className="detail-reviews">
        <h2>Tenant reviews</h2>
        <form className="review-form" onSubmit={submitReview}>
          <div className="form-two">
            <div>
              <label htmlFor="review-name">Your name</label>
              <input
                id="review-name"
                value={reviewName}
                maxLength={60}
                required
                placeholder="Your name will be shown publicly"
                onChange={(event) => setReviewName(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="review-rating">Rating</label>
              <select id="review-rating" value={reviewRating} onChange={(event) => setReviewRating(event.target.value)}>
                <option value="5">★★★★★ — Excellent</option>
                <option value="4">★★★★☆ — Good</option>
                <option value="3">★★★☆☆ — Average</option>
                <option value="2">★★☆☆☆ — Poor</option>
                <option value="1">★☆☆☆☆ — Bad</option>
              </select>
            </div>
          </div>
          <label htmlFor="review-comment">Your review</label>
          <textarea
            id="review-comment"
            value={reviewComment}
            maxLength={1000}
            placeholder="Describe your experience with this room, the area and the agent."
            onChange={(event) => setReviewComment(event.target.value)}
          />
          <button className="wide-button" type="submit" disabled={reviewBusy}>
            {reviewBusy ? "Sending..." : "Submit review"}
          </button>
          {sessionUser && <small>You are logged in as {sessionUser.name}. One review per listing.</small>}
        </form>
        {listing.reviews.length ? (
          listing.reviews.map((review) => (
            <article className="review-item" key={review.id}>
              <div><strong>{review.userName}</strong><span aria-label={`${review.rating} out of 5`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></div>
              <p>{review.comment}</p>
              <small>{new Date(review.createdAt).toLocaleDateString("en-GB")}</small>
            </article>
          ))
        ) : <p className="fine-print">No reviews have been submitted for this listing yet.</p>}
      </section>

      {reportOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="detail-report-title" onSubmit={submitReport}>
            <span className="eyebrow" style={{ color: "var(--red)" }}>Tenant safety</span>
            <h2 id="detail-report-title">Report this room</h2>
            <label htmlFor="detail-report-category">Reason for report</label>
            <select id="detail-report-category" value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}>
              <option>Listing is not real</option>
              <option>Price is incorrect</option>
              <option>Room has already been rented</option>
              <option>Room viewing fee</option>
            </select>
            <label htmlFor="detail-report-details">Details (optional)</label>
            <textarea id="detail-report-details" maxLength={500} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} />
            <div className="modal-actions">
              <button type="button" className="btn-secondary" disabled={reportBusy} onClick={() => setReportOpen(false)}>Cancel</button>
              <button type="submit" className="btn-danger" disabled={reportBusy}>{reportBusy ? "Sending..." : "Send report"}</button>
            </div>
          </form>
        </div>
      )}
      {appointmentOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="appointment-title" onSubmit={submitAppointment}>
            <span className="eyebrow">Room viewing</span>
            <h2 id="appointment-title">Schedule a viewing</h2>
            <p>Choose a time that suits you. It is booked as soon as you send it. DarRoom does not charge a viewing fee.</p>
            <label htmlFor="appointment-name">Your name</label>
            <input id="appointment-name" value={appointmentName} minLength={2} maxLength={80} required onChange={(event) => setAppointmentName(event.target.value)} />
            <label htmlFor="appointment-phone">Phone number</label>
            <input id="appointment-phone" value={appointmentPhone} minLength={9} maxLength={24} required placeholder="0712 345 678" onChange={(event) => setAppointmentPhone(event.target.value)} />
            <label htmlFor="appointment-time">Date and time</label>
            <input id="appointment-time" type="datetime-local" value={appointmentAt} required onChange={(event) => setAppointmentAt(event.target.value)} />
            <label htmlFor="appointment-notes">Notes (optional)</label>
            <textarea id="appointment-notes" value={appointmentNotes} maxLength={500} onChange={(event) => setAppointmentNotes(event.target.value)} />
            <div className="modal-actions">
              <button type="button" className="btn-secondary" disabled={appointmentBusy} onClick={() => setAppointmentOpen(false)}>Cancel</button>
              <button type="submit" className="wide-button modal-submit" disabled={appointmentBusy}>
                {appointmentBusy ? "Sending..." : "Send viewing request"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
