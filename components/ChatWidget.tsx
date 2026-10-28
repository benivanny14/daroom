"use client";

import { useState } from "react";
import { buildWhatsAppLink } from "@/lib/whatsapp";

interface ChatWidgetProps {
  dalaliName: string;
  listingId: string;
  listingTitle: string;
  neighborhood: string;
  priceTzs: number;
}

/**
 * Floating WhatsApp shortcut for the featured listing. The phone number is no
 * longer public, so the number is fetched from the authenticated contact
 * endpoint when the visitor clicks.
 */
export function ChatWidget({ dalaliName, listingId, listingTitle, neighborhood, priceTzs }: ChatWidgetProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function openContact() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/listings/${encodeURIComponent(listingId)}/contact`, { method: "POST" });
      if (response.status === 401 || response.status === 403) {
        window.location.assign("/account");
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Agent's number is unavailable.");
      window.open(
        buildWhatsAppLink(body.phone, listingTitle, neighborhood, priceTzs),
        "_blank",
        "noopener,noreferrer"
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Agent's number is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <p className="floating-contact-error" role="alert">{error}</p>}
      <button
        className="floating-contact"
        type="button"
        disabled={busy}
        onClick={openContact}
        aria-label={`Contact ${dalaliName} on WhatsApp`}
      >
        <span aria-hidden="true">↗</span>
        <span>{busy ? "Looking up number..." : "Contact the Agent"}</span>
      </button>
    </>
  );
}
