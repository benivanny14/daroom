"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { SUBSCRIPTION_PLANS } from "@/lib/subscriptions-plans";

type District = { id: string; name: string; neighborhoods: { id: string; name: string }[] };
type Photo = { id: string; url?: string | null; altText: string };
type Listing = {
  id: string;
  title: string;
  description: string;
  status: string;
  priceTzs: number;
  minMonths: number;
  luku: boolean;
  water: string;
  phone: string;
  inspectionFeePolicyAcceptedAt?: string | null;
  district: { name: string };
  neighborhood: { name: string };
  photos: Photo[];
  bedrooms?: number;
  bathrooms?: number;
  furnished: boolean;
  allowsPets: boolean;
  allowsStudents: boolean;
  isAvailable: boolean;
  expiresAt?: string | null;
  isFeatured?: boolean;
  featuredUntil?: string | null;
};
type Appointment = {
  id: string;
  tenantName: string;
  tenantPhone: string;
  scheduledAt: string;
  status: string;
  notes?: string | null;
  listing: { id: string; title: string };
};

type User = { id: string; name: string; email: string; phone: string };
type Subscription = { active: boolean; endsAt: string; plan: string } | null;
type ListingFilter = "all" | "available" | "rented" | "hidden" | "expired";
type Analytics = {
  totalListings: number;
  totalViews: number;
  totalWhatsAppClicks: number;
  totalFavorites: number;
  totalReviews: number;
  totalInquiries: number;
};
type FormValues = {
  title: string;
  description: string;
  district: string;
  neighborhood: string;
  priceTzs: string;
  minMonths: string;
  luku: boolean;
  water: string;
  phone: string;
  acceptNoInspectionFee: boolean;
  bedrooms: string;
  bathrooms: string;
  furnished: boolean;
  allowsPets: boolean;
  allowsStudents: boolean;
};

const MAX_PHOTOS_PER_LISTING = 10;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

function describePhoto(file: File, position: number) {
  const base = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (base.length >= 3) {
    return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 160);
  }
  return `Room photo ${position}`;
}

const emptyForm: FormValues = {
  title: "",
  description: "",
  district: "",
  neighborhood: "",
  priceTzs: "",
  minMonths: "3",
  luku: true,
  water: "Piped water",
  phone: "",
  acceptNoInspectionFee: false,
  bedrooms: "1",
  bathrooms: "1",
  furnished: false,
  allowsPets: false,
  allowsStudents: true
};

const filterLabels: Record<ListingFilter, string> = {
  all: "All",
  available: "Available",
  rented: "Rented",
  hidden: "Hidden",
  expired: "Expired"
};

function listingState(listing: Listing): Exclude<ListingFilter, "all"> {
  if (listing.status === "APPROVED") return listing.isAvailable ? "available" : "rented";
  if (listing.status === "EXPIRED") return "expired";
  return "hidden";
}

function listingBadge(listing: Listing): { label: string; className: string } {
  const state = listingState(listing);
  if (state === "available") return { label: "Available", className: "live" };
  if (state === "rented") return { label: "Rented", className: "flagged" };
  if (state === "expired") return { label: "Expired", className: "flagged" };
  return { label: "Hidden", className: "pending" };
}

const appointmentStatusNames: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled by tenant"
};

function isExpiringSoon(expiresAt?: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000;
}

export function DalaliDashboard({
  user,
  mockPayments = false,
  payment
}: {
  user: User;
  mockPayments?: boolean;
  payment?: string;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [form, setForm] = useState<FormValues>({ ...emptyForm, phone: user.phone });
  const [editingId, setEditingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("BASIC");

  // Preselect the plan the agent is already on when it loads.
  useEffect(() => {
    if (subscription?.plan) setSelectedPlan(subscription.plan);
  }, [subscription?.plan]);
  const [photoBusyId, setPhotoBusyId] = useState("");
  const [filter, setFilter] = useState<ListingFilter>("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [formPhotos, setFormPhotos] = useState<{ file: File; url: string }[]>([]);

  const load = useCallback(async () => {
    setError("");
    const [listingResponse, geographyResponse, analyticsResponse] = await Promise.all([
      fetch("/api/dalali/listings", { cache: "no-store" }),
      fetch("/api/geography", { cache: "no-store" }),
      fetch("/api/dalali/analytics", { cache: "no-store" })
    ]);
    const listingBody = await listingResponse.json();
    const geographyBody = await geographyResponse.json();
    const analyticsBody = await analyticsResponse.json();
    if (!listingResponse.ok) throw new Error(listingBody.error || "Listings could not be loaded.");
    if (!geographyResponse.ok || !geographyBody.region) {
      throw new Error(geographyBody.error || "The list of areas is unavailable.");
    }
    setListings(listingBody.listings);
    setSubscription(listingBody.subscription);
    setAppointments(Array.isArray(listingBody.appointments) ? listingBody.appointments : []);
    setDistricts(geographyBody.region.districts);
    if (analyticsResponse.ok) {
      setAnalytics(analyticsBody.summary);
    }
  }, []);

  useEffect(() => {
    load()
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load the dashboard."))
      .finally(() => setLoading(false));
  }, [load]);

  const active = Boolean(subscription?.active);
  const selectedDistrict = districts.find((district) => district.name === form.district);
  const counts = {
    all: listings.length,
    available: listings.filter((listing) => listingState(listing) === "available").length,
    rented: listings.filter((listing) => listingState(listing) === "rented").length,
    hidden: listings.filter((listing) => listingState(listing) === "hidden").length,
    expired: listings.filter((listing) => listingState(listing) === "expired").length
  };
  const visibleListings = filter === "all"
    ? listings
    : listings.filter((listing) => listingState(listing) === filter);
  const editingListing = editingId ? listings.find((listing) => listing.id === editingId) ?? null : null;

  const formRef = useRef<HTMLFormElement | null>(null);
  const autoOpenedForm = useRef(false);

  const openCreateForm = useCallback(() => {
    setEditingId("");
    setForm({ ...emptyForm, phone: user.phone });
    setFormPhotos((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
    setCreating(true);
  }, [user.phone]);

  function addFormPhotos(files: File[], existingCount: number) {
    setError("");
    setMessage("");
    const accepted: { file: File; url: string }[] = [];
    const problems: string[] = [];
    for (const file of files) {
      if (!MAX_PHOTO_TYPES.includes(file.type)) {
        problems.push(`${file.name}: use a JPEG, PNG or WebP photo.`);
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        problems.push(`${file.name}: must not exceed 5 MB.`);
        continue;
      }
      if (existingCount + formPhotos.length + accepted.length >= MAX_PHOTOS_PER_LISTING) {
        problems.push(`${file.name}: skipped, a listing can have at most ${MAX_PHOTOS_PER_LISTING} photos.`);
        continue;
      }
      accepted.push({ file, url: URL.createObjectURL(file) });
    }
    if (accepted.length) setFormPhotos((current) => [...current, ...accepted]);
    if (problems.length) setError(problems.join(" "));
  }

  function removeFormPhoto(index: number) {
    setFormPhotos((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((_, position) => position !== index);
    });
  }

  function clearFormPhotos() {
    setFormPhotos((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
  }

  useEffect(() => {
    if (autoOpenedForm.current || loading || payment !== "success" || !active) return;
    autoOpenedForm.current = true;
    openCreateForm();
  }, [loading, payment, active, openCreateForm]);

  useEffect(() => {
    if (!creating) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [creating]);

  const planPrices: Record<string, { price: string; duration: string }> = {
    BASIC: { price: "TSh 5,000", duration: "30 days" },
    PREMIUM: { price: "TSh 15,000", duration: "30 days" },
    FEATURED: { price: "TSh 30,000", duration: "30 days" }
  };

  const currentPlan = subscription?.plan || "BASIC";
  const { price, duration } = planPrices[currentPlan] || planPrices.BASIC;
  const selectedPlanConfig = SUBSCRIPTION_PLANS[selectedPlan] || SUBSCRIPTION_PLANS.BASIC;
  const selectedPlanPrice = selectedPlanConfig.priceTzs.toLocaleString("en-TZ");
  const featuredSlots = (SUBSCRIPTION_PLANS[currentPlan] || SUBSCRIPTION_PLANS.BASIC).featuredSlots;

  async function saveListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const wasEditing = Boolean(editingId);
    const existingCount = editingListing?.photos.length ?? 0;
    const payload = {
      ...form,
      priceTzs: Number(form.priceTzs),
      minMonths: Number(form.minMonths),
      bedrooms: Number(form.bedrooms),
      bathrooms: Number(form.bathrooms)
    };
    try {
      const response = await fetch(editingId ? `/api/dalali/listings/${editingId}` : "/api/dalali/listings", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Listing was not saved.");

      const listingId: string | undefined = editingId || result.listing?.id;
      const failures: string[] = [];
      let uploaded = 0;
      if (listingId && formPhotos.length > 0) {
        for (let position = 0; position < formPhotos.length; position += 1) {
          const file = formPhotos[position].file;
          setMessage(`Uploading photo ${position + 1} of ${formPhotos.length}...`);
          try {
            await uploadPhoto(listingId, file, describePhoto(file, existingCount + position + 1));
            uploaded += 1;
          } catch (caught) {
            failures.push(`${file.name}: ${caught instanceof Error ? caught.message : "upload failed."}`);
          }
        }
      }

      clearFormPhotos();
      setForm({ ...emptyForm, phone: user.phone });
      setEditingId("");
      setCreating(false);
      await load();

      const saved = wasEditing ? "Changes saved. The listing is live." : "Listing posted. It is now visible to tenants.";
      if (uploaded > 0) {
        setMessage(`${saved} ${uploaded} photo${uploaded === 1 ? "" : "s"} added.`);
      } else {
        setMessage(saved);
      }
      if (failures.length > 0) setError(`Some photos were not uploaded: ${failures.join(" ")}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Listing was not saved.");
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/payments/selcom/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: user.phone, plan: selectedPlan })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Payment could not be started.");
      window.location.assign(result.checkoutUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment could not be started.");
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(listing: Listing) {
    setEditingId(listing.id);
    clearFormPhotos();
    setCreating(true);
    setForm({
      title: listing.title,
      description: listing.description,
      district: listing.district.name,
      neighborhood: listing.neighborhood.name,
      priceTzs: String(listing.priceTzs),
      minMonths: String(listing.minMonths),
      luku: listing.luku,
      water: listing.water,
      phone: listing.phone,
      acceptNoInspectionFee: true,
      bedrooms: String(listing.bedrooms || 1),
      bathrooms: String(listing.bathrooms || 1),
      furnished: listing.furnished,
      allowsPets: listing.allowsPets,
      allowsStudents: listing.allowsStudents
    });
  }

  async function hideListing(listingId: string) {
    if (!window.confirm("Hide this listing from tenants?")) return;
    setError("");
    try {
      const response = await fetch(`/api/dalali/listings/${listingId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Listing was not hidden.");
      await load();
      setMessage("Listing hidden from search.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Listing was not hidden.");
    }
  }

  async function restoreListing(listingId: string) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/dalali/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The listing could not be restored.");
      await load();
      setMessage("Listing is visible in search again.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The listing could not be restored.");
    }
  }

  async function toggleAvailability(listing: Listing) {
    setError("");
    setMessage("");
    const next = !listing.isAvailable;
    try {
      const response = await fetch(`/api/dalali/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable: next })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Room status could not be changed.");
      setListings((current) =>
        current.map((item) => (item.id === listing.id ? { ...item, isAvailable: next } : item))
      );
      setMessage(
        next
          ? "Listing marked as available."
          : "Listing marked as rented. It will appear in search with a “Rented” badge and tenants will not be able to book viewings."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Room status could not be changed.");
    }
  }

  async function renewListing(listing: Listing) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/dalali/listings/${listing.id}/renew`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Listing expiry was not extended.");
      await load();
      setMessage("Listing extended by 60 days.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Listing expiry was not extended.");
    }
  }

  async function updateAppointment(appointmentId: string, status: "CONFIRMED" | "DECLINED" | "COMPLETED") {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/dalali/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Viewing could not be updated.");
      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === appointmentId ? { ...appointment, status } : appointment
        )
      );
      setMessage(`Viewing set to: ${appointmentStatusNames[status]}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Viewing could not be updated.");
    }
  }

  async function uploadPhoto(listingId: string, file: File, altText: string) {
    if (!MAX_PHOTO_TYPES.includes(file.type)) {
      throw new Error("Use a JPEG, PNG, or WebP photo.");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error("Photo must not exceed 5 MB.");
    }
    const presignResponse = await fetch(`/api/dalali/listings/${listingId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: file.type, size: file.size, fileName: file.name })
    });
    const presign = await presignResponse.json();
    if (!presignResponse.ok) throw new Error(presign.error || "Photo upload was rejected.");
    const uploadResponse = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file
    });
    if (!uploadResponse.ok) throw new Error("Photo storage failed to receive the image. Try again.");
    const confirmResponse = await fetch(`/api/dalali/listings/${listingId}/photos/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageKey: presign.storageKey, altText })
    });
    const confirmation = await confirmResponse.json();
    if (!confirmResponse.ok) throw new Error(confirmation.error || "Photo could not be confirmed.");
  }

  async function uploadPhotos(listingId: string, files: File[], existingCount: number) {
    if (!files.length) return;
    const remaining = Math.max(0, MAX_PHOTOS_PER_LISTING - existingCount);
    if (remaining === 0) {
      setMessage("");
      setError(`This listing already has the maximum of ${MAX_PHOTOS_PER_LISTING} photos.`);
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    const accepted = files.slice(0, remaining);
    const skipped = files.length - accepted.length;
    const failures: string[] = [];
    let uploaded = 0;

    try {
      for (let position = 0; position < accepted.length; position += 1) {
        const file = accepted[position];
        setMessage(
          accepted.length > 1
            ? `Uploading photo ${position + 1} of ${accepted.length}...`
            : "Uploading photo..."
        );
        try {
          await uploadPhoto(listingId, file, describePhoto(file, existingCount + position + 1));
          uploaded += 1;
        } catch (caught) {
          failures.push(`${file.name}: ${caught instanceof Error ? caught.message : "upload failed."}`);
        }
      }

      try {
        await load();
      } catch (caught) {
        failures.push(
          `The dashboard could not be refreshed: ${caught instanceof Error ? caught.message : "unknown error."}`
        );
      }

      if (uploaded > 0) {
        setMessage(
          `${uploaded} photo${uploaded === 1 ? "" : "s"} added. The listing is live.`
        );
      } else {
        setMessage("");
      }

      const problems: string[] = [];
      if (skipped > 0) {
        problems.push(
          `${skipped} photo${skipped === 1 ? " was" : "s were"} skipped because a listing can have at most ${MAX_PHOTOS_PER_LISTING} photos.`
        );
      }
      if (failures.length > 0) {
        problems.push(`Not uploaded: ${failures.join(" ")}`);
      }
      if (problems.length > 0) setError(problems.join(" "));
    } finally {
      setBusy(false);
    }
  }

  async function featureListing(listing: Listing) {
    const input = window.prompt("Feature this listing for how many days (1-30)?", "7");
    if (input === null) return;
    const days = Number(input.trim());
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      setError("Enter a whole number of days between 1 and 30.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/dalali/listings/${listing.id}/feature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The listing was not featured.");
      await load();
      setMessage(`Listing featured for ${days} day${days === 1 ? "" : "s"}. It now appears at the top of search results.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The listing was not featured.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhotoEdit(listingId: string, photo: Photo) {
    const altText = window.prompt("Photo description (helps tenants find it in search):", photo.altText);
    if (altText === null) return;
    const trimmed = altText.trim();
    if (trimmed.length < 3) {
      setError("Photo description must be at least 3 characters.");
      return;
    }
    setPhotoBusyId(photo.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/dalali/listings/${listingId}/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ altText: trimmed })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Photo could not be edited.");
      await load();
      setMessage("Photo description saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Photo could not be edited.");
    } finally {
      setPhotoBusyId("");
    }
  }

  async function handlePhotoDelete(listingId: string, photo: Photo) {
    if (!window.confirm("Delete this photo permanently? This cannot be undone.")) return;
    setPhotoBusyId(photo.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/dalali/listings/${listingId}/photos/${photo.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Photo could not be deleted.");
      await load();
      setMessage("Photo deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Photo could not be deleted.");
    } finally {
      setPhotoBusyId("");
    }
  }

  return (
    <section className="dashboard">
      <article className="panel wide dashboard-actions">
        <div>
          <span className="eyebrow">Post a room</span>
          <h2>Add a new listing</h2>
          <p>
            Describe the room, set the rent, add up to 10 photos, then post. Your listing is
            visible to tenants immediately.
          </p>
        </div>
        <button
          className="wide-button"
          type="button"
          disabled={busy}
          onClick={() => {
            if (!active) {
              void startCheckout();
              return;
            }
            if (creating) {
              setCreating(false);
              clearFormPhotos();
              return;
            }
            openCreateForm();
          }}
        >
          {!active ? `Pay TSh ${selectedPlanPrice} to post` : creating ? "Close form" : "+ Post a room"}
        </button>
      </article>

      <article className="panel subscription-panel">
        <span className="eyebrow">Listing subscription</span>
        <div className="plan-price">{price} <small>/ {duration}</small></div>
        <p>Plan: <strong>{currentPlan}</strong></p>
        {subscription ? (
          <p>
            Status: <strong>{active ? "Active" : "Expired"}</strong>
            {" · "}Ends: {new Date(subscription.endsAt).toLocaleDateString("en-GB")}
          </p>
        ) : <p>You have no current subscription.</p>}
        <fieldset className="plan-picker">
          <legend>Choose your plan</legend>
          {(Object.keys(SUBSCRIPTION_PLANS)).map((planId) => {
            const plan = SUBSCRIPTION_PLANS[planId];
            const selected = selectedPlan === plan.id;
            return (
              <label key={plan.id} className={`plan-option${selected ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="subscription-plan"
                  value={plan.id}
                  checked={selected}
                  onChange={() => setSelectedPlan(plan.id)}
                />
                <span className="plan-option-name">{plan.name}</span>
                <span className="plan-option-price">TSh {plan.priceTzs.toLocaleString("en-TZ")}</span>
                <small>
                  {plan.maxListings} listings · {plan.maxPhotosPerListing} photos/ listing
                  {plan.featuredSlots > 0 ? ` · ${plan.featuredSlots} featured slot${plan.featuredSlots === 1 ? "" : "s"}` : " · no featured slots"}
                </small>
              </label>
            );
          })}
        </fieldset>
        <p>Payments are for Agents only. Tenants do not pay rent, deposits, or fees inside DarRoom.</p>
        <button className="wide-button" onClick={startCheckout} disabled={busy}>
          {busy ? "Starting..." : `Pay TSh ${selectedPlanPrice} for ${selectedPlanConfig.name}`}
        </button>
        {mockPayments && (
          <p className="fine-print">
            Test payments are enabled (PAYMENTS_MOCK). No real payments will be taken.
          </p>
        )}
        {!active && <div className="gate">Once your subscription expires, you cannot add listings, edit them, or upload photos. Published listings stay visible.</div>}
      </article>

      {analytics && (
        <article className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Performance analytics</span><h2>Analytics</h2></div>
            <button className="table-action" onClick={() => setShowAnalytics(!showAnalytics)}>
              {showAnalytics ? "Hide" : "Show"}
            </button>
          </div>
          {showAnalytics && (
            <div className="analytics-grid">
              <div className="analytics-card">
                <h3>{analytics.totalListings}</h3>
                <p>Listings</p>
              </div>
              <div className="analytics-card">
                <h3>{analytics.totalViews}</h3>
                <p>Views</p>
              </div>
              <div className="analytics-card">
                <h3>{analytics.totalWhatsAppClicks}</h3>
                <p>WhatsApp</p>
              </div>
              <div className="analytics-card">
                <h3>{analytics.totalFavorites}</h3>
                <p>Favorites</p>
              </div>
              <div className="analytics-card">
                <h3>{analytics.totalReviews}</h3>
                <p>Reviews</p>
              </div>
              <div className="analytics-card">
                <h3>{analytics.totalInquiries}</h3>
                <p>Inquiries</p>
              </div>
            </div>
          )}
        </article>
      )}
      <article className="panel wide">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">My listings</span>
            <h2>Manage rooms</h2>
            <p className="panel-subtitle">Track rooms that are available, rented, or hidden.</p>
          </div>
          <button className="table-action" disabled={!active} onClick={() => {
            if (creating) {
              setCreating(false);
              clearFormPhotos();
              return;
            }
            openCreateForm();
          }}>
            {creating ? "Close form" : "+ Add listing"}
          </button>
        </div>
        {!active && (
          <div className="subscription-lock">
            <div>
              <strong>Pay TSh {selectedPlanPrice} per month to upload photos and add listings.</strong>
              <p>Published listings stay visible, but uploading new photos and editing are only allowed with an active subscription.</p>
            </div>
            <button className="table-action" type="button" onClick={startCheckout} disabled={busy}>
              {busy ? "Starting..." : "Pay now"}
            </button>
          </div>
        )}
        <div className="listing-stats" aria-label="Room summary">
          <div className="listing-stat"><span>All</span><strong>{counts.all}</strong></div>
          <div className="listing-stat"><span>Available</span><strong>{counts.available}</strong></div>
          <div className="listing-stat"><span>Rented</span><strong>{counts.rented}</strong></div>
          <div className="listing-stat"><span>Hidden</span><strong>{counts.hidden}</strong></div>
          <div className="listing-stat"><span>Expired</span><strong>{counts.expired}</strong></div>
        </div>
        <div className="filter-chips" role="tablist" aria-label="Filter rooms">
          {(Object.keys(filterLabels) as ListingFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {filterLabels[key]} <span>{counts[key]}</span>
            </button>
          ))}
        </div>
        {message && <p className="notice" role="status">{message}</p>}
        {error && <p className="admin-warning" role="alert">{error}</p>}
        {error && <button className="table-action" type="button" disabled={loading} onClick={() => {
          setLoading(true);
          load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load the dashboard.")).finally(() => setLoading(false));
        }}>Try again</button>}

        {creating && (
          <form className="listing-form" ref={formRef} onSubmit={saveListing}>
            <label htmlFor="listing-title">Listing title</label>
            <input id="listing-title" value={form.title} minLength={5} maxLength={100} required onChange={(event) => setForm({ ...form, title: event.target.value })} />
            <label htmlFor="listing-description">Room description</label>
            <textarea id="listing-description" value={form.description} minLength={20} maxLength={3000} required onChange={(event) => setForm({ ...form, description: event.target.value })} />
            <div className="form-two">
              <div><label htmlFor="listing-district">District</label>
                <select id="listing-district" value={form.district} required onChange={(event) => setForm({ ...form, district: event.target.value, neighborhood: "" })}>
                  <option value="">Select district</option>{districts.map((district) => <option key={district.id}>{district.name}</option>)}
                </select>
              </div>
              <div><label htmlFor="listing-neighborhood">Neighborhood</label>
                <input
                  id="listing-neighborhood"
                  list="listing-neighborhood-options"
                  value={form.neighborhood}
                  minLength={2}
                  maxLength={100}
                  required
                  disabled={!selectedDistrict}
                  onChange={(event) => setForm({ ...form, neighborhood: event.target.value })}
                  placeholder={selectedDistrict ? "Select or type a neighborhood" : "Select a district first"}
                />
                <datalist id="listing-neighborhood-options">
                  {selectedDistrict?.neighborhoods.map((place) => <option key={place.id} value={place.name} />)}
                </datalist>
                <small>If the neighborhood is not in the list, type its name; it will be added to this district.</small>
              </div>
            </div>
            <div className="form-two">
              <div><label htmlFor="listing-price">Rent per month (TSh)</label><input id="listing-price" type="number" min={50000} max={100000000} value={form.priceTzs} required onChange={(event) => setForm({ ...form, priceTzs: event.target.value })} /></div>
              <div><label htmlFor="listing-months">Minimum months</label><input id="listing-months" type="number" min={1} max={36} value={form.minMonths} required onChange={(event) => setForm({ ...form, minMonths: event.target.value })} /></div>
            </div>
            <div className="form-two">
              <div><label htmlFor="listing-water">Water supply</label><input id="listing-water" value={form.water} maxLength={80} required onChange={(event) => setForm({ ...form, water: event.target.value })} /></div>
              <div><label htmlFor="listing-phone">WhatsApp phone</label><input id="listing-phone" value={form.phone} required onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
            </div>
            <div className="form-two">
              <div><label htmlFor="listing-bedrooms">Bedrooms</label><input id="listing-bedrooms" type="number" min={1} max={10} value={form.bedrooms} required onChange={(event) => setForm({ ...form, bedrooms: event.target.value })} /></div>
              <div><label htmlFor="listing-bathrooms">Bathrooms</label><input id="listing-bathrooms" type="number" min={1} max={5} value={form.bathrooms} required onChange={(event) => setForm({ ...form, bathrooms: event.target.value })} /></div>
            </div>
            <label className="checkbox-row"><input type="checkbox" checked={form.luku} onChange={(event) => setForm({ ...form, luku: event.target.checked })} /> Prepaid electricity included in the room</label>
            <label className="checkbox-row"><input type="checkbox" checked={form.furnished} onChange={(event) => setForm({ ...form, furnished: event.target.checked })} /> Room is furnished</label>
            <label className="checkbox-row"><input type="checkbox" checked={form.allowsPets} onChange={(event) => setForm({ ...form, allowsPets: event.target.checked })} /> Allows pets</label>
            <label className="checkbox-row"><input type="checkbox" checked={form.allowsStudents} onChange={(event) => setForm({ ...form, allowsStudents: event.target.checked })} /> Allows students</label>
            <label className="checkbox-row"><input type="checkbox" checked={form.acceptNoInspectionFee} required onChange={(event) => setForm({ ...form, acceptNoInspectionFee: event.target.checked })} /> I agree not to charge a viewing/inspection fee; violations may result in a ban.</label>

            <fieldset className="form-photos">
              <legend>Photos</legend>
              <p className="fine-print">
                Add up to {MAX_PHOTOS_PER_LISTING} photos, 5 MB each (JPEG, PNG or WebP). The first
                photo is the cover and tenants can browse the rest as a slideshow.
              </p>

              {editingListing && editingListing.photos.length > 0 && (
                <div className="form-photo-grid">
                  {editingListing.photos.map((photo, photoIndex) => (
                    <figure className="form-photo" key={photo.id}>
                      {photo.url
                        ? <Image src={photo.url} alt={photo.altText} width={160} height={110} unoptimized />
                        : <span>{photo.altText}</span>}
                      <figcaption>{photoIndex === 0 ? "Cover" : `Photo ${photoIndex + 1}`}</figcaption>
                      <button
                        type="button"
                        className="form-photo-remove"
                        aria-label={`Remove ${photo.altText}`}
                        disabled={photoBusyId === photo.id || busy}
                        onClick={() => void handlePhotoDelete(editingListing.id, photo)}
                      >
                        ×
                      </button>
                    </figure>
                  ))}
                </div>
              )}

              {formPhotos.length > 0 && (
                <div className="form-photo-grid">
                  {formPhotos.map((item, photoIndex) => (
                    <figure className="form-photo" key={item.url}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt={item.file.name} />
                      <figcaption>
                        {(editingListing?.photos.length ?? 0) + photoIndex === 0
                          ? "Cover"
                          : `Photo ${(editingListing?.photos.length ?? 0) + photoIndex + 1}`}
                      </figcaption>
                      <button
                        type="button"
                        className="form-photo-remove"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() => removeFormPhoto(photoIndex)}
                      >
                        ×
                      </button>
                    </figure>
                  ))}
                </div>
              )}

              <label className={`photo-upload ${!active || busy ? "disabled" : ""}`}>
                {formPhotos.length || editingListing?.photos.length ? "Add more photos" : "Choose photos"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={!active || busy || (editingListing?.photos.length ?? 0) + formPhotos.length >= MAX_PHOTOS_PER_LISTING}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    if (files.length) addFormPhotos(files, editingListing?.photos.length ?? 0);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <small>
                {((editingListing?.photos.length ?? 0) + formPhotos.length)}/{MAX_PHOTOS_PER_LISTING} photos selected.
              </small>
            </fieldset>

            <button className="wide-button" type="submit" disabled={!active || busy}>{busy ? "Saving..." : editingId ? "Save changes" : "Post listing"}</button>
          </form>
        )}

        <div className="my-listings">
          {loading ? (
            <div className="empty" role="status"><span className="loading-mark" aria-hidden="true" /><p>Loading your listings...</p></div>
          ) : visibleListings.map((listing) => {
            const badge = listingBadge(listing);
            return (
            <article className="my-listing" key={listing.id}>
              <div className="my-listing-heading">
                <div><h3>{listing.title}</h3><p>{listing.neighborhood.name}, {listing.district.name} · TSh {listing.priceTzs.toLocaleString("en-TZ")} / month</p></div>
                <div className="my-listing-badges">
                  <span className={`status ${badge.className}`}>{badge.label}</span>
                  {listing.isFeatured && (
                    <span className="status featured">
                      Featured{listing.featuredUntil ? ` until ${new Date(listing.featuredUntil).toLocaleDateString("en-GB")}` : ""}
                    </span>
                  )}
                </div>
              </div>
              <p className="fine-print">
                {listing.expiresAt
                  ? `Listing expires: ${new Date(listing.expiresAt).toLocaleDateString("en-GB")}`
                  : "Listing expiry not set."}
                {listing.status === "EXPIRED" ? " · Expired; extend it to make it visible again." : ""}
                {` · Photos ${listing.photos.length}/${MAX_PHOTOS_PER_LISTING}`}
              </p>
              <div className="photo-manager">
                {listing.photos.length === 0 ? (
                  <p className="photo-empty">No photos yet. Add photos so tenants can see the room.</p>
                ) : listing.photos.map((photo) => (
                  <figure className="photo-tile" key={photo.id}>
                    {photo.url
                      ? <Image src={photo.url} alt={photo.altText} width={180} height={120} unoptimized />
                      : <span>{photo.altText}</span>}
                    <figcaption title={photo.altText}>{photo.altText}</figcaption>
                    <div className="photo-tile-actions">
                      <button
                        className="table-action"
                        type="button"
                        disabled={photoBusyId === photo.id || busy}
                        onClick={() => void handlePhotoEdit(listing.id, photo)}
                      >
                        Edit
                      </button>
                      <button
                        className="table-action destructive"
                        type="button"
                        disabled={photoBusyId === photo.id || busy}
                        onClick={() => void handlePhotoDelete(listing.id, photo)}
                      >
                        Delete
                      </button>
                    </div>
                  </figure>
                ))}
              </div>
              <p className="fine-print">
                Select several photos at once. Up to {MAX_PHOTOS_PER_LISTING} photos per listing, 5 MB each
                (JPEG, PNG, or WebP). The first photo is used as the cover, and tenants can browse the rest as a slideshow.
              </p>
              <div className="listing-details">
                <span>Bedrooms: {listing.bedrooms || "N/A"}</span>
                <span>Bathrooms: {listing.bathrooms || "N/A"}</span>
                <span>{listing.furnished ? "Furnished" : "Unfurnished"}</span>
                <span>{listing.allowsPets ? "Pets allowed" : "No pets"}</span>
                <span className={listing.isAvailable ? "available-tag" : "unavailable-tag"}>{listing.isAvailable ? "Available" : "Rented"}</span>
              </div>
              <div className="my-listing-actions">
                <button className="table-action" disabled={!active} onClick={() => beginEdit(listing)}>Edit listing</button>
                {featuredSlots > 0 && active && listing.status === "APPROVED" && !listing.isFeatured && (
                  <button className="table-action" disabled={busy} onClick={() => featureListing(listing)}>
                    Feature listing
                  </button>
                )}
                <button className="table-action" onClick={() => toggleAvailability(listing)}>
                  {listing.isAvailable ? "Mark as rented" : "Mark as available"}
                </button>
                {(listing.status === "EXPIRED" || isExpiringSoon(listing.expiresAt)) && (
                  <button className="table-action" disabled={!active} onClick={() => renewListing(listing)}>
                    Extend 60 days
                  </button>
                )}
                <button className="table-action destructive" onClick={() => hideListing(listing.id)}>Hide</button>
                {listing.status === "HIDDEN" && (
                  <button className="table-action" onClick={() => restoreListing(listing.id)}>Restore</button>
                )}
                <label className={`photo-upload ${!active || busy ? "disabled" : ""}`}>
                  {active ? "Add photos" : "Pay to upload photos"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={!active || busy || listing.photos.length >= MAX_PHOTOS_PER_LISTING}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      if (files.length) void uploadPhotos(listing.id, files, listing.photos.length);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
              {!active && <p className="fine-print">Uploading new photos and editing a listing require an active TSh 5,000/month subscription.</p>}
            </article>
            );
          })}
          {!loading && error && listings.length === 0 && <p className="empty error-empty">Listings could not be loaded. Check the error message above and try again later.</p>}
          {!loading && !error && listings.length === 0 && (
            <div className="empty">
              <h3>No rooms posted yet</h3>
              <p>Post your first room so tenants can find it. It appears on the public site right away.</p>
              <button
                className="empty-reset"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!active) {
                    void startCheckout();
                    return;
                  }
                  openCreateForm();
                }}
              >
                {active ? "+ Post your first room" : `Pay TSh ${selectedPlanPrice} to start posting`}
              </button>
            </div>
          )}
          {!loading && !error && listings.length > 0 && visibleListings.length === 0 && <p className="empty">No rooms in this group.</p>}
        </div>
      </article>
      <article className="panel wide">
        <div className="panel-heading">
          <div><span className="eyebrow">Viewings</span><h2>Tenants who want to view rooms</h2></div>
          <span className="fine-print">Bookings are added instantly; nothing waits for your approval.</span>
        </div>
        {appointments.length ? (
          <div className="appointment-list">
            {appointments.map((appointment) => (
              <article className="appointment-item" key={appointment.id}>
                <div>
                  <h3>{appointment.listing.title}</h3>
                  <p>
                    <strong>{appointment.tenantName}</strong> ·{" "}
                    <a href={`tel:${appointment.tenantPhone}`}>{appointment.tenantPhone}</a>
                  </p>
                  <p className="fine-print">
                    {new Date(appointment.scheduledAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    {appointment.notes ? ` · ${appointment.notes}` : ""}
                  </p>
                </div>
                <div className="appointment-actions">
                  <span className={`status ${appointment.status === "CONFIRMED" || appointment.status === "COMPLETED" ? "live" : appointment.status === "DECLINED" || appointment.status === "CANCELLED" ? "flagged" : "pending"}`}>
                    {appointmentStatusNames[appointment.status] || appointment.status}
                  </span>
                  {appointment.status === "CONFIRMED" && (
                    <>
                      <button className="table-action" type="button" onClick={() => updateAppointment(appointment.id, "COMPLETED")}>Completed</button>
                      <button className="table-action destructive" type="button" onClick={() => updateAppointment(appointment.id, "DECLINED")}>Decline</button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">No tenant has scheduled a viewing yet. New viewings will appear here.</p>
        )}
      </article>
    </section>
  );
}
