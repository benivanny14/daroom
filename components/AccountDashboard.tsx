"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "DALALI" | "ADMIN" | "TENANT";
};

type Favorite = {
  id: string;
  createdAt: string;
  listing: {
    id: string;
    title: string;
    district: string;
    neighborhood: string;
    priceTzs: number;
    minMonths: number;
    luku: boolean;
    water: string;
    phone: string;
    status: string;
    isAvailable?: boolean;
    photos: { id: string; url: string; altText: string }[];
  };
};

type Appointment = {
  id: string;
  scheduledAt: string;
  status: string;
  notes?: string | null;
  tenantName: string;
  tenantPhone: string;
  listing: {
    id: string;
    title: string;
    priceTzs: number;
    isAvailable: boolean;
    district: string;
    neighborhood: string;
    photo: string | null;
  };
};

const appointmentStatusNames: Record<string, string> = {
  PENDING: "Pending confirmation",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled by you"
};

export function AccountDashboard({ user: initialUser }: { user: SessionUser }) {
  const [user, setUser] = useState(initialUser);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [cancellingId, setCancellingId] = useState("");

  const load = useCallback(async () => {
    setError("");
    const [favoritesResponse, appointmentsResponse] = await Promise.all([
      fetch("/api/favorites", { cache: "no-store" }),
      fetch("/api/appointments", { cache: "no-store" })
    ]);
    const favoritesBody = await favoritesResponse.json();
    const appointmentsBody = await appointmentsResponse.json();
    if (!favoritesResponse.ok) throw new Error(favoritesBody.error || "Favorites could not be loaded.");
    if (!appointmentsResponse.ok) throw new Error(appointmentsBody.error || "Viewings could not be loaded.");
    setFavorites(Array.isArray(favoritesBody.favorites) ? favoritesBody.favorites : []);
    setAppointments(Array.isArray(appointmentsBody.appointments) ? appointmentsBody.appointments : []);
  }, []);

  useEffect(() => {
    load()
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Dashboard is unavailable."))
      .finally(() => setLoading(false));
  }, [load]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") || "").trim(),
          phone: String(form.get("phone") || "").trim()
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Profile was not saved.");
      setUser(body.user);
      setMessage("Your profile has been saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profile was not saved.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") || "");
    if (newPassword !== String(form.get("confirmPassword") || "")) {
      setError("The new password and confirmation do not match.");
      setPasswordBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: String(form.get("currentPassword") || ""),
          newPassword
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Password was not changed.");
      (event.target as HTMLFormElement).reset();
      setMessage(body.message || "Password changed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Password was not changed.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function cancelAppointment(appointmentId: string) {
    if (!window.confirm("Cancel this viewing? The agent will see it as cancelled.")) return;
    setCancellingId(appointmentId);
    setError("");
    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(appointmentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The viewing could not be cancelled.");
      setAppointments((current) =>
        current.map((item) => (item.id === appointmentId ? { ...item, status: "CANCELLED" } : item))
      );
      setMessage("Your viewing has been cancelled.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The viewing could not be cancelled.");
    } finally {
      setCancellingId("");
    }
  }

  async function logoutEverywhere() {
    if (!window.confirm("Log out of all devices? You will need to log in again on each device.")) return;
    setLoggingOut(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout-all", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not log out.");
      window.location.assign("/account");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not log out.");
      setLoggingOut(false);
    }
  }

  async function removeFavorite(listingId: string) {
    setRemovingId(listingId);
    setError("");
    try {
      const response = await fetch(`/api/favorites/${encodeURIComponent(listingId)}`, {
        method: "DELETE"
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The listing was not removed.");
      setFavorites((current) => current.filter((favorite) => favorite.listing.id !== listingId));
      setMessage("The listing has been removed from your favorites.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The listing was not removed.");
    } finally {
      setRemovingId("");
    }
  }

  return (
    <section className="account-dashboard">
      <div className="account-hero">
        <div>
          <span className="eyebrow">Your account</span>
          <h1>Hello, {user.name.split(" ")[0]}.</h1>
          <p>
            Here you can see your favorites, room viewings, and security settings.
            {user.role === "DALALI" && " To add and manage listings, go to the Agent dashboard."}
          </p>
        </div>
        <div className="account-hero-actions">
          {user.role === "DALALI" && <Link className="table-action" href="/dalali">Agent Dashboard</Link>}
          {user.role === "TENANT" && <Link className="table-action" href="/rent">Pay rent</Link>}
          <button className="table-action destructive" type="button" disabled={loggingOut} onClick={logoutEverywhere}>
            {loggingOut ? "Logging out..." : "Log out of all devices"}
          </button>
        </div>
      </div>

      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="admin-warning" role="alert">{error}</p>}

      <div className="account-grid">
        <article className="panel">
          <span className="eyebrow">Profile</span>
          <h2>Your details</h2>
          <form className="account-form" onSubmit={saveProfile}>
            <label htmlFor="profile-name">Full name</label>
            <input id="profile-name" name="name" defaultValue={user.name} minLength={2} maxLength={80} required />
            <label htmlFor="profile-phone">Phone number</label>
            <input id="profile-phone" name="phone" defaultValue={user.phone} minLength={9} maxLength={24} required />
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" value={user.email} readOnly disabled />
            <small>Changing your email requires a new verification. Contact support if necessary.</small>
            <button className="wide-button" type="submit" disabled={profileBusy}>
              {profileBusy ? "Saving..." : "Save profile"}
            </button>
          </form>
        </article>

        <article className="panel">
          <span className="eyebrow">Security</span>
          <h2>Change password</h2>
          <button
            type="button"
            className="text-action"
            aria-pressed={showPasswords}
            onClick={() => setShowPasswords((current) => !current)}
          >
            {showPasswords ? "Hide passwords" : "Show passwords"}
          </button>
          <form className="account-form" onSubmit={changePassword}>
            <label htmlFor="current-password">Current password</label>
            <input id="current-password" name="currentPassword" type={showPasswords ? "text" : "password"} autoComplete="current-password" required />
            <label htmlFor="new-password">New password</label>
            <input id="new-password" name="newPassword" type={showPasswords ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required />
            <label htmlFor="confirm-password">Repeat new password</label>
            <input id="confirm-password" name="confirmPassword" type={showPasswords ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required />
            <small>Passwords must be at least 12 characters. If you change it, other devices will be signed out automatically.</small>
            <button className="wide-button" type="submit" disabled={passwordBusy}>
              {passwordBusy ? "Changing..." : "Change password"}
            </button>
          </form>
        </article>

        <article className="panel wide">
          <div className="panel-heading">
            <div><span className="eyebrow">Favorites</span><h2>Saved rooms</h2></div>
            <span className="fine-print">{favorites.length} {favorites.length === 1 ? "listing" : "listings"}</span>
          </div>
          {loading ? (
            <div className="empty" role="status"><span className="loading-mark" aria-hidden="true" /><p>Loading favorites...</p></div>
          ) : favorites.length ? (
            <div className="favorite-list">
              {favorites.map((favorite) => (
                <article className="favorite-item" key={favorite.id}>
                  <div className="favorite-item-body">
                    <h3><Link href={`/listing/${favorite.listing.id}`}>{favorite.listing.title}</Link></h3>
                    <p>{favorite.listing.neighborhood}, {favorite.listing.district} · TSh {favorite.listing.priceTzs.toLocaleString("en-TZ")} / month</p>
                    <div className="listing-details">
                      <span>From {favorite.listing.minMonths} {favorite.listing.minMonths === 1 ? "month" : "months"}</span>
                      <span>{favorite.listing.luku ? "Prepaid electricity included" : "Prepaid electricity not included"}</span>
                      <span>{favorite.listing.water}</span>
                      {favorite.listing.isAvailable === false && <span className="unavailable-tag">Rented</span>}
                    </div>
                  </div>
                  <div className="favorite-item-actions">
                    <Link className="table-action" href={`/listing/${favorite.listing.id}`}>Open</Link>
                    <button
                      className="table-action destructive"
                      type="button"
                      disabled={removingId === favorite.listing.id}
                      onClick={() => removeFavorite(favorite.listing.id)}
                    >
                      {removingId === favorite.listing.id ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty">You haven&apos;t saved any rooms yet. Click the star on any listing to save it here.</p>
          )}
        </article>

        <article className="panel wide">
          <div className="panel-heading">
            <div><span className="eyebrow">Viewings</span><h2>Your room viewings</h2></div>
            <span className="fine-print">{appointments.length} {appointments.length === 1 ? "viewing" : "viewings"}</span>
          </div>
          {loading ? (
            <div className="empty" role="status"><span className="loading-mark" aria-hidden="true" /><p>Loading viewings...</p></div>
          ) : appointments.length ? (
            <div className="appointment-list">
              {appointments.map((appointment) => (
                <article className="appointment-item" key={appointment.id}>
                  <div>
                    <h3><Link href={`/listing/${appointment.listing.id}`}>{appointment.listing.title}</Link></h3>
                    <p>{appointment.listing.neighborhood}, {appointment.listing.district}</p>
                    <p className="fine-print">
                      {new Date(appointment.scheduledAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                      {appointment.notes ? ` · ${appointment.notes}` : ""}
                    </p>
                  </div>
                  <div className="appointment-actions">
                    <span className={`status ${appointment.status === "CONFIRMED" || appointment.status === "COMPLETED" ? "live" : appointment.status === "DECLINED" || appointment.status === "CANCELLED" ? "flagged" : "pending"}`}>
                      {appointmentStatusNames[appointment.status] || appointment.status}
                    </span>
                    {(appointment.status === "CONFIRMED" || appointment.status === "PENDING") && (
                      <button
                        className="table-action destructive"
                        type="button"
                        disabled={cancellingId === appointment.id}
                        onClick={() => void cancelAppointment(appointment.id)}
                      >
                        {cancellingId === appointment.id ? "Cancelling..." : "Cancel viewing"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty">You have no viewings yet. Open a listing and click &ldquo;Schedule a viewing&rdquo;.</p>
          )}
        </article>

        {user.role === "TENANT" && (
          <article className="panel wide">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Rent</span>
                <h2>Pay rent with mobile money</h2>
              </div>
              <Link className="table-action" href="/rent">Pay rent</Link>
            </div>
            <p>
              Pay your agent through M-Pesa, Tigo Pesa, Airtel Money or Halopesa. SonicPesa sends the
              prompt to your phone and you approve it with your own PIN. DarRoom never asks for your PIN.
            </p>
          </article>
        )}
      </div>
    </section>
  );
}
