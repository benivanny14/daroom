"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";

type ReportListing = {
  id: string;
  title: string;
  status: string;
  phone: string;
  owner: { id: string; name: string; phone: string; email: string };
  neighborhood: { name: string };
  district: { name: string };
};
type Report = {
  id: string;
  category: string;
  status: string;
  details: string;
  createdAt: string;
  reporter?: { name: string; email: string } | null;
  listing: ReportListing;
};
type AuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  createdAt: string;
  actor: { name: string; email: string };
};
type Dalali = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  subscription: { status: string; endsAt: string } | null;
  verification: {
    id: string;
    documentType: string;
    status: string;
    rejectedReason?: string | null;
    url?: string | null;
    createdAt?: string;
  } | null;
  _count: { listings: number };
};
type BlacklistEntry = {
  id: string;
  normalizedEmail: string | null;
  normalizedPhone: string;
  reason: string;
  createdAt: string;
  moderator?: { name: string } | null;
};
type ResetLink = { email: string; url: string; expiresAt: string };
type Tab = "reports" | "dalalis" | "audit" | "site" | "stats" | "security";

type TotpStatus = { enabled: boolean; configured: boolean };

type Stats = {
  users: { total: number; dalali: number; tenant: number; admin: number; newLast30Days: number };
  listings: { total: number; approved: number; pending: number; flagged: number; hidden: number; rejected: number; expired: number; available: number };
  subscriptions: { active: number; byPlan: Record<string, number> };
  revenue: { totalTzs: number; verifiedCount: number; byPlan: { plan: string; count: number; totalTzs: number }[] };
  appointments: { total: number; upcoming: number };
  recentPayments: {
    id: string;
    plan: string;
    amountTzs: number;
    status: string;
    provider: string;
    receivedAt: string;
    user: { name: string; email: string };
  }[];
};

export function AdminConsole() {
  const [tab, setTab] = useState<Tab>("stats");
  const [reports, setReports] = useState<Report[]>([]);
  const [dalalis, setDalalis] = useState<Dalali[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [heroBusy, setHeroBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [reportsCursor, setReportsCursor] = useState<string | null>(null);
  const [dalalisCursor, setDalalisCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totpStatus, setTotpStatus] = useState<TotpStatus | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [verificationBusy, setVerificationBusy] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetLink, setResetLink] = useState<ResetLink | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const endpoint = tab === "reports"
      ? "/api/admin/reports"
      : tab === "dalalis"
        ? "/api/admin/dalalis"
        : tab === "audit"
          ? "/api/admin/audit"
          : tab === "stats"
            ? "/api/admin/stats"
            : tab === "security"
              ? "/api/admin/totp"
              : "/api/admin/site/hero";
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load data.");
      if (tab === "reports") {
        setReports(body.reports);
        setReportsCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
      }
      if (tab === "dalalis") {
        setDalalis(body.dalalis);
        setDalalisCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
      }
      if (tab === "audit") setAuditLogs(body.logs || []);
      if (tab === "stats") setStats(body);
      if (tab === "security") setTotpStatus(body);
      if (tab === "site") setHeroImage(body.heroImage || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load data.");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const loadBlacklist = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/blacklist", { cache: "no-store" });
      const body = await response.json();
      if (response.ok) setBlacklist(body.entries || []);
    } catch {
      // The ban list is informational; a failed load must not blank the tab.
    }
  }, []);

  useEffect(() => {
    if (tab === "dalalis") void loadBlacklist();
  }, [tab, loadBlacklist]);

  async function loadMore() {
    const cursor = tab === "reports" ? reportsCursor : tab === "dalalis" ? dalalisCursor : null;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const endpoint = tab === "reports" ? "/api/admin/reports" : "/api/admin/dalalis";
      const response = await fetch(`${endpoint}?cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load more records.");
      const next = typeof body.nextCursor === "string" ? body.nextCursor : null;
      if (tab === "reports") {
        setReports((current) => [...current, ...body.reports]);
        setReportsCursor(next);
      } else {
        setDalalis((current) => [...current, ...body.dalalis]);
        setDalalisCursor(next);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more records.");
    } finally {
      setLoadingMore(false);
    }
  }

  const moreCursor = tab === "reports" ? reportsCursor : tab === "dalalis" ? dalalisCursor : null;

  async function totpRequest(method: "POST" | "PATCH" | "DELETE") {
    setTotpBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/totp", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode.trim() })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Two-factor action failed.");
      return body;
    } finally {
      setTotpBusy(false);
    }
  }

  async function startTotpSetup() {
    setError("");
    setMessage("");
    setBackupCodes(null);
    setTotpBusy(true);
    try {
      const response = await fetch("/api/admin/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not start the setup.");
      setTotpSetup(body);
      setMessage("Add the secret to your authenticator app, then confirm with the code it shows.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the setup.");
    } finally {
      setTotpBusy(false);
    }
  }

  async function confirmTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const body = await totpRequest("PATCH");
      setBackupCodes(body.backupCodes || []);
      setTotpStatus({ enabled: true, configured: true });
      setTotpSetup(null);
      setTotpCode("");
      setMessage("Two-factor is switched on for this account.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That code is not correct.");
    }
  }

  async function disableTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("Switch off two-factor? The admin account will only need a password.")) return;
    try {
      await totpRequest("DELETE");
      setTotpStatus({ enabled: false, configured: false });
      setBackupCodes(null);
      setTotpCode("");
      setMessage("Two-factor is switched off.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That code is not correct.");
    }
  }

  async function sendAction(endpoint: string, init: RequestInit, successMessage: string) {
    setError("");
    setMessage("");
    const response = await fetch(endpoint, init);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Action failed.");
    setMessage(successMessage);
    await load();
    return body as { listingRestored?: boolean };
  }

  async function reviewReport(report: Report, action: "dismiss" | "confirm") {
    try {
      const body = await sendAction("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, action })
      }, action === "confirm" ? "Report confirmed. The listing has been hidden." : "Report dismissed.");
      if (action === "dismiss") {
        setMessage(body.listingRestored
          ? "Report dismissed; the listing is visible in search again."
          : "Report dismissed. The listing stays hidden while other reports are still open.");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Action failed."); }
  }

  async function uploadHero(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      setError("The image must not exceed 15 MB.");
      return;
    }
    setHeroBusy(true);
    setError("");
    setMessage("");
    try {
      const presign = await fetch("/api/admin/site/hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size, fileName: file.name })
      });
      const presignBody = await presign.json();
      if (!presign.ok) throw new Error(presignBody.error || "The image could not be uploaded.");

      const put = await fetch(presignBody.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });
      if (!put.ok) throw new Error("The image upload failed. Try another photo.");

      const confirm = await fetch("/api/admin/site/hero/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey: presignBody.storageKey })
      });
      const confirmBody = await confirm.json();
      if (!confirm.ok) throw new Error(confirmBody.error || "The image could not be saved.");

      setHeroImage(confirmBody.heroImage || null);
      setMessage("The home page image has been updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be uploaded.");
    } finally {
      setHeroBusy(false);
    }
  }

  async function removeHero() {
    if (!window.confirm("Remove the custom home page image? The default illustration will show again.")) return;
    setHeroBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/site/hero", { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The image could not be removed.");
      setHeroImage(null);
      setMessage("The default illustration is showing again.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be removed.");
    } finally {
      setHeroBusy(false);
    }
  }

  async function banDalali(dalali: Dalali) {
    const reason = window.prompt(`Reason for banning ${dalali.name}. The account and listings will be permanently deleted.`);
    if (!reason) return;
    if (!window.confirm(`This action cannot be undone. The number ${dalali.phone} and email ${dalali.email} will be blacklisted. Continue?`)) return;
    try {
      await sendAction(`/api/admin/dalalis/${dalali.id}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      }, "Account banned and its details added to the blacklist.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ban failed."); }
  }

  async function decideVerification(verificationId: string, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      const typed = window.prompt("Why is this document rejected? The agent will see this reason.");
      if (!typed) return;
      reason = typed;
    }
    setVerificationBusy(verificationId);
    setError("");
    setMessage("");
    try {
      await sendAction(`/api/admin/verifications/${verificationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason })
      }, action === "approve" ? "Identity document approved." : "Identity document rejected.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The decision could not be saved.");
    } finally {
      setVerificationBusy("");
    }
  }

  async function liftBan(entry: BlacklistEntry) {
    if (!window.confirm(`Lift the ban on ${entry.normalizedEmail || entry.normalizedPhone}? They will be able to register again.`)) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/blacklist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The ban could not be lifted.");
      setBlacklist((current) => current.filter((row) => row.id !== entry.id));
      setMessage("Ban lifted. The contact can register again.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The ban could not be lifted.");
    }
  }

  async function createResetLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetBusy(true);
    setError("");
    setMessage("");
    setResetLink(null);
    try {
      const response = await fetch("/api/admin/password-reset-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The link could not be created.");
      setResetLink({ email: body.user.email, url: body.url, expiresAt: body.expiresAt });
      setMessage("Reset link created. Send it to the account owner.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The link could not be created.");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <>
      <div className="admin-warning">
        Listings go live as soon as an Agent posts them; there is no approval step. Banning an account deletes the profile and listings within a transaction, while the email and phone are kept on a blacklist. Use only with a documented reason.
      </div>        <div className="admin-tabs" role="tablist" aria-label="Moderation sections">
        {([
          ["stats", "Overview"],
          ["reports", "Reports"],
          ["dalalis", "Agents & subscriptions"],
          ["audit", "Audit log"],
          ["security", "Two-factor"],
          ["site", "Site image"]
        ] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="admin-warning" role="alert">{error}</p>}
      {error && <button className="table-action" type="button" disabled={loading} onClick={() => void load()}>Try again</button>}
      {loading ? <div className="panel" role="status" aria-live="polite">Loading moderation data...</div> : (
        tab === "reports" ? (
          <div className="admin-queue">
            {reports.map((report) => (
              <article className="panel admin-item" key={report.id}>
                <div className="my-listing-heading"><div><span className="eyebrow">{report.category}</span><h2>{report.listing.title}</h2><p>{report.listing.neighborhood.name}, {report.listing.district.name}</p></div>
                  <span className={`status ${report.status === "REVIEWED" ? "pending" : "flagged"}`}>
                    {report.status === "REVIEWED" ? "Confirmed · listing hidden" : "Open report"}
                  </span>
                </div>
                <p>{report.details || "No additional details."}</p>
                <p className="fine-print">Agent: {report.listing.owner.name} · {report.listing.owner.phone} · {new Date(report.createdAt).toLocaleString("en-GB")}</p>
                <p className="fine-print">Reporter: {report.reporter?.name || "Unknown"}{report.reporter?.email ? ` · ${report.reporter.email}` : ""}</p>
                <div className="admin-actions">
                  {report.status === "OPEN" && (
                    <button className="table-action" onClick={() => reviewReport(report, "confirm")}>Confirm report</button>
                  )}
                  <button className="table-action destructive" onClick={() => reviewReport(report, "dismiss")}>
                    {report.status === "REVIEWED" ? "Restore listing" : "Dismiss report"}
                  </button>
                  <button className="table-action destructive" onClick={() => banDalali({ ...report.listing.owner, createdAt: "", subscription: null, verification: null, _count: { listings: 0 } })}>Ban account</button>
                </div>
              </article>
            ))}
            {!error && reports.length === 0 && <p className="empty">No open reports.</p>}
          </div>
        ) : tab === "stats" ? (
          <div className="panel admin-stats">
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">Verified revenue</span>
                <strong className="stat-value">TSh {(stats?.revenue.totalTzs || 0).toLocaleString("en-TZ")}</strong>
                <small>{stats?.revenue.verifiedCount || 0} verified payments</small>
              </div>
              <div className="stat-card">
                <span className="stat-label">Active subscriptions</span>
                <strong className="stat-value">{stats?.subscriptions.active || 0}</strong>
                <small>{Object.entries(stats?.subscriptions.byPlan || {}).map(([plan, count]) => `${plan}: ${count}`).join(" · ") || "No active plans"}</small>
              </div>
              <div className="stat-card">
                <span className="stat-label">Live listings</span>
                <strong className="stat-value">{stats?.listings.approved || 0}</strong>
                <small>{stats?.listings.available || 0} available now</small>
              </div>
              <div className="stat-card">
                <span className="stat-label">Flagged / hidden</span>
                <strong className="stat-value">{(stats?.listings.flagged || 0) + (stats?.listings.hidden || 0)}</strong>
                <small>{stats?.listings.expired || 0} expired · {stats?.listings.rejected || 0} rejected</small>
              </div>
              <div className="stat-card">
                <span className="stat-label">Agents registered</span>
                <strong className="stat-value">{stats?.users.dalali || 0}</strong>
                <small>{stats?.users.newLast30Days || 0} new accounts (30 days)</small>
              </div>
              <div className="stat-card">
                <span className="stat-label">Upcoming viewings</span>
                <strong className="stat-value">{stats?.appointments.upcoming || 0}</strong>
                <small>{stats?.appointments.total || 0} bookings all time</small>
              </div>
            </div>

            <div className="panel-heading">
              <div>
                <span className="eyebrow">Money</span>
                <h2>Revenue by plan</h2>
              </div>
            </div>
            <table className="admin-table">
              <thead><tr><th>Plan</th><th>Verified payments</th><th>Total</th></tr></thead>
              <tbody>
                {(stats?.revenue.byPlan || []).map((row) => (
                  <tr key={row.plan}>
                    <td>{row.plan}</td>
                    <td>{row.count}</td>
                    <td>TSh {row.totalTzs.toLocaleString("en-TZ")}</td>
                  </tr>
                ))}
                {(!stats || stats.revenue.byPlan.length === 0) && <tr><td colSpan={3}>No verified payments yet.</td></tr>}
              </tbody>
            </table>

            <div className="panel-heading">
              <div>
                <span className="eyebrow">Latest</span>
                <h2>Recent payments</h2>
              </div>
            </div>
            <table className="admin-table">
              <thead><tr><th>Agent</th><th>Plan</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {(stats?.recentPayments || []).map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.user.name}<br /><small>{payment.provider}</small></td>
                    <td>{payment.plan}</td>
                    <td>TSh {payment.amountTzs.toLocaleString("en-TZ")}</td>
                    <td><span className={`status ${payment.status === "VERIFIED" ? "live" : payment.status === "REJECTED" ? "flagged" : "pending"}`}>{payment.status.toLowerCase()}</span></td>
                    <td>{new Date(payment.receivedAt).toLocaleString("en-GB")}</td>
                  </tr>
                ))}
                {stats && stats.recentPayments.length === 0 && <tr><td colSpan={5}>No payments recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : tab === "dalalis" ? (
          <>
          <div className="panel admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Agent</th><th>Contact</th><th>Subscription</th><th>Verification</th><th>Listings</th><th>Action</th></tr></thead>
              <tbody>{dalalis.map((dalali) => (
                <tr key={dalali.id}>
                  <td>{dalali.name}<br /><small>{new Date(dalali.createdAt).toLocaleDateString("en-GB")}</small></td>
                  <td>{dalali.phone}<br /><small>{dalali.email}</small></td>
                  <td>{dalali.subscription ? `${dalali.subscription.status === "ACTIVE" && new Date(dalali.subscription.endsAt) > new Date() ? "Active" : "Expired"} · ${new Date(dalali.subscription.endsAt).toLocaleDateString("en-GB")}` : "None"}</td>
                  <td>
                    {dalali.verification ? (
                      <>
                        <span className={`status ${dalali.verification.status === "APPROVED" ? "live" : dalali.verification.status === "REJECTED" ? "flagged" : "pending"}`}>
                          {dalali.verification.status === "APPROVED"
                            ? "Verified"
                            : dalali.verification.status === "REJECTED"
                              ? "Rejected"
                              : "Pending review"}
                        </span>
                        <br /><small>{dalali.verification.documentType}</small>
                        {dalali.verification.url && (
                          <><br /><a href={dalali.verification.url} target="_blank" rel="noreferrer">View document</a></>
                        )}
                        {dalali.verification.status !== "APPROVED" && (
                          <div className="admin-actions">
                            <button
                              className="table-action"
                              type="button"
                              disabled={verificationBusy === dalali.verification.id}
                              onClick={() => void decideVerification(dalali.verification!.id, "approve")}
                            >
                              Approve ID
                            </button>
                            <button
                              className="table-action destructive"
                              type="button"
                              disabled={verificationBusy === dalali.verification.id}
                              onClick={() => void decideVerification(dalali.verification!.id, "reject")}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </>
                    ) : "None"}
                  </td>
                  <td>{dalali._count.listings}</td>
                  <td><button className="table-action destructive" onClick={() => banDalali(dalali)}>Ban account</button></td>
                </tr>
              ))}</tbody>
            </table>
            {!error && dalalis.length === 0 && <p className="empty">No Agent accounts.</p>}
          </div>

          <div className="panel admin-stats" style={{ marginTop: 20 }}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Account recovery</span>
                <h2>Password reset link</h2>
                <p className="panel-subtitle">
                  Email delivery is not configured yet, so create a one-time link here and send it to the
                  account owner yourself (WhatsApp). It works once and expires in one hour.
                </p>
              </div>
            </div>
            <form className="totp-code-form" onSubmit={createResetLink}>
              <label htmlFor="reset-email">Account email</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="off"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                required
              />
              <button className="table-action" type="submit" disabled={resetBusy || !resetEmail.trim()}>
                {resetBusy ? "Working..." : "Create link"}
              </button>
            </form>
            {resetLink && (
              <div className="notice" role="status">
                <p><strong>{resetLink.email}</strong></p>
                <p style={{ wordBreak: "break-all" }}><a href={resetLink.url} target="_blank" rel="noreferrer">{resetLink.url}</a></p>
                <p className="fine-print">
                  Expires {new Date(resetLink.expiresAt).toLocaleString("en-GB")}. Send it only to the account owner.
                </p>
              </div>
            )}

            <div className="panel-heading" style={{ marginTop: 20 }}>
              <div>
                <span className="eyebrow">Bans</span>
                <h2>Blacklisted contacts</h2>
                <p className="panel-subtitle">
                  A banned email or phone number cannot register again until its entry is removed.
                </p>
              </div>
            </div>
            <table className="admin-table">
              <thead><tr><th>Contact</th><th>Reason</th><th>Banned</th><th>Action</th></tr></thead>
              <tbody>
                {blacklist.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.normalizedEmail || "—"}<br /><small>{entry.normalizedPhone}</small></td>
                    <td>{entry.reason}</td>
                    <td>{new Date(entry.createdAt).toLocaleDateString("en-GB")}</td>
                    <td>
                      <button className="table-action" type="button" onClick={() => void liftBan(entry)}>
                        Lift ban
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {blacklist.length === 0 && <p className="empty">No banned contacts.</p>}
          </div>
          </>
        ) : tab === "security" ? (
          <div className="panel admin-stats">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Sign-in security</span>
                <h2>Two-factor authentication</h2>
                <p className="panel-subtitle">
                  {totpStatus?.enabled
                    ? "Switched on. Finishing a sign-in now needs a 6 digit code from your authenticator app."
                    : "Switched off. Turning it on protects the admin account even if the password leaks."}
                </p>
              </div>
              <span className={`status ${totpStatus?.enabled ? "live" : "pending"}`}>
                {totpStatus?.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>

            {backupCodes && backupCodes.length > 0 && (
              <div className="notice" role="status">
                <strong>Save these backup codes now — they are shown only once.</strong>
                <ul className="backup-codes">
                  {backupCodes.map((code) => <li key={code}><code>{code}</code></li>)}
                </ul>
              </div>
            )}

            {!totpStatus?.enabled ? (
              <div className="totp-setup">
                {totpSetup ? (
                  <>
                    <p className="fine-print">
                      Add this secret to Google Authenticator, Authy, 1Password or any TOTP app,
                      then enter the 6 digit code it shows.
                    </p>
                    <p className="totp-secret"><code>{totpSetup.secret}</code></p>
                    <a className="table-action" href={totpSetup.otpauthUrl}>Open in authenticator app</a>
                  </>
                ) : (
                  <button className="table-action" type="button" disabled={totpBusy} onClick={() => void startTotpSetup()}>
                    {totpBusy ? "Working..." : "Set up two-factor"}
                  </button>
                )}
                <form className="totp-code-form" onSubmit={confirmTotp}>
                  <label htmlFor="totp-code">6 digit code from the app</label>
                  <input
                    id="totp-code"
                    inputMode="numeric"
                    maxLength={32}
                    value={totpCode}
                    onChange={(event) => setTotpCode(event.target.value)}
                    required
                  />
                  <button className="table-action" type="submit" disabled={totpBusy || totpCode.trim().length < 6}>
                    {totpBusy ? "Checking..." : "Confirm and switch on"}
                  </button>
                </form>
              </div>
            ) : (
              <form className="totp-code-form" onSubmit={disableTotp}>
                <label htmlFor="totp-code">Enter a current code or an unused backup code to switch off</label>
                <input
                  id="totp-code"
                  inputMode="numeric"
                  maxLength={32}
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  required
                />
                <button className="table-action destructive" type="submit" disabled={totpBusy || totpCode.trim().length < 6}>
                  {totpBusy ? "Checking..." : "Switch off two-factor"}
                </button>
              </form>
            )}
          </div>
        ) : tab === "site" ? (
          <div className="panel admin-site-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Home page</span>
                <h2>Hero image</h2>
                <p className="panel-subtitle">
                  This photo is shown behind “Welcome home.” at the top of the home page.
                  JPEG, PNG or WebP, up to 15 MB. Remove it to show the default illustration.
                </p>
              </div>
            </div>
            {heroImage ? (
              <figure className="hero-preview"><Image src={heroImage} alt="Current home page hero" width={1200} height={600} unoptimized /></figure>
            ) : (
              <p className="empty">No custom image yet. The default illustration is shown.</p>
            )}
            <div className="admin-actions">
              <label className="table-action file-action">
                {heroBusy ? "Working..." : heroImage ? "Replace image" : "Upload image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={heroBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void uploadHero(file);
                  }}
                />
              </label>
              {heroImage && (
                <button className="table-action destructive" type="button" disabled={heroBusy} onClick={() => void removeHero()}>
                  Remove image
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="panel admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
              <tbody>{auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.createdAt).toLocaleString("en-GB")}</td>
                  <td>{log.actor.name}<br /><small>{log.actor.email}</small></td>
                  <td><code>{log.action}</code></td>
                  <td>{log.targetType}{log.targetId ? <><br /><small>{log.targetId}</small></> : null}</td>
                  <td>{log.summary}</td>
                </tr>
              ))}</tbody>
            </table>
            {!error && auditLogs.length === 0 && <p className="empty">No audit log entries yet.</p>}
          </div>
        )
      )}
      {!loading && !error && moreCursor && (
        <div className="load-more-wrap">
          <button className="load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading..." : "Load more records"}
          </button>
        </div>
      )}
    </>
  );
}
