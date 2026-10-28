"use client";

import { FormEvent, useState } from "react";

type Mode = "login" | "register" | "forgot" | "reset" | "resend" | "twofactor";

export function AccountForm({
  verified,
  resetToken
}: {
  verified?: string;
  resetToken?: string;
}) {
  const [mode, setMode] = useState<Mode>(resetToken ? "reset" : verified === "invalid" ? "resend" : "login");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(
    verified === "success"
      ? "Email verified. You can now log in."
      : verified === "invalid"
        ? "The verification link is invalid or has expired."
        : ""
  );
  const [error, setError] = useState("");
  const [devVerifyUrl, setDevVerifyUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setDevVerifyUrl("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const submittedEmail = String(form.get("email") || email).toLowerCase();
    setEmail(submittedEmail);
    const endpoint = mode === "twofactor"
      ? "/api/auth/totp"
      : mode === "login"
        ? "/api/auth/login"
        : mode === "register"
          ? "/api/auth/register"
          : mode === "forgot"
            ? "/api/auth/password-reset/request"
            : mode === "resend"
              ? "/api/auth/resend-verification"
            : "/api/auth/password-reset/confirm";
    const payload = mode === "twofactor"
      ? { code: form.get("code") }
      : mode === "reset"
      ? { token: resetToken, password: form.get("password") }
      : mode === "register"
        ? Object.fromEntries(form.entries())
        : Object.fromEntries(form.entries());

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The request could not be completed.");
      if (mode === "login") {
        if (result.requiresTwoFactor) {
          setMode("twofactor");
          setMessage("Password accepted. Enter the 6 digit code from your authenticator app.");
          return;
        }
        const role = result.user?.role;
        window.location.assign(role === "ADMIN" ? "/admin" : role === "TENANT" ? "/account" : "/dalali");
        return;
      }
      if (mode === "twofactor") {
        window.location.assign("/admin");
        return;
      }
      setMessage(result.message);
      setDevVerifyUrl(result.devVerifyUrl || "");
      if (mode === "reset") setMode("login");
      if (mode === "register") setMode("login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const title = {
    login: "Log in to your account",
    register: "Create your account",
    forgot: "Forgot your password?",
    reset: "Set a new password",
    resend: "Verify your email",
    twofactor: "Two-factor check"
  }[mode];

  return (
    <section className="account-card">
      <span className="eyebrow">Your account · Dar es Salaam</span>
      <h1>{title}</h1>
      <p className="account-intro">
        {mode === "register"
          ? "Save rooms, get contact details and book viewings for free. Agents also pay TSh 5,000 for 30 days to publish listings."
          : mode === "login"
            ? "Log in to see agent numbers, save rooms and book viewings."
            : mode === "resend"
              ? "Resend the link to verify your account email."
              : mode === "twofactor"
                ? "Open your authenticator app and enter the current 6 digit code to finish signing in."
                : "We will send instructions to your email."}
      </p>
      {message && <p className="notice" role="status">{message}</p>}
      {devVerifyUrl && (
        <p className="notice" role="status">
          Test environment (no email provider):{" "}
          <a href={devVerifyUrl}>click here to verify your account</a>
        </p>
      )}
      {error && <p className="admin-warning" role="alert">{error}</p>}
      <form className="account-form" onSubmit={submit}>
        {mode === "register" && (
          <>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" autoComplete="name" required minLength={2} maxLength={80} />
            <label htmlFor="phone">Phone number/WhatsApp</label>
            <input id="phone" name="phone" autoComplete="tel" placeholder="2557XXXXXXXX" required />
            <label htmlFor="role">I am</label>
            <select id="role" name="role" defaultValue="TENANT">
              <option value="TENANT">A tenant looking for a room</option>
              <option value="DALALI">An agent who posts listings</option>
            </select>
          </>
        )}
        {mode !== "reset" && mode !== "twofactor" && (
          <>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </>
        )}
        {(mode === "login" || mode === "register" || mode === "reset") && (
          <>
            <label htmlFor="password">{mode === "reset" ? "New password" : "Password"}</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "login" ? undefined : 12}
              required
            />
            {mode !== "login" && <small>Use at least 12 characters.</small>}
          </>
        )}
        {mode === "twofactor" && (
          <>
            <label htmlFor="code">Authenticator code</label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={32}
              autoFocus
              required
            />
            <small>A one-time backup code works as well; each backup code can be used once.</small>
          </>
        )}
        <button className="wide-button" disabled={busy} type="submit">
          {busy ? "Please wait..." : mode === "login" ? "Log in" : mode === "register" ? "Sign up" : mode === "twofactor" ? "Verify code" : mode === "forgot" ? "Send link" : "Change password"}
        </button>
      </form>
      <div className="account-switch">
        {mode === "login" && (
          <>
            <button onClick={() => setMode("register")}>Create a new account</button>
            <button onClick={() => setMode("forgot")}>Forgot your password?</button>
            <button onClick={() => setMode("resend")}>Resend verification email</button>
          </>
        )}
        {mode !== "login" && mode !== "reset" && (
          <button onClick={() => setMode("login")}>Back to log in</button>
        )}
      </div>
      <div className="gate">
        Tenants and students do not need an account or pay anything on DarRoom.
        Contact an Agent directly via WhatsApp.
      </div>
    </section>
  );
}
