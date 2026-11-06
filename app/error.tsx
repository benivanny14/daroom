"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Branded fallback for a runtime error inside a route segment. Without this file
 * Next.js shows its own unstyled error screen, which looks like the site is
 * broken rather than a temporary problem.
 */
export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("DarRoom page error", error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
      }}
    >
      <section style={{ maxWidth: "440px", width: "100%" }}>
        <p style={{ margin: "0 0 8px", color: "#22c55e", fontWeight: 600, letterSpacing: "0.08em" }}>
          DARROOM
        </p>
        <h1 style={{ margin: "0 0 12px", fontSize: "24px" }}>Something went wrong</h1>
        <p style={{ margin: "0 0 24px", lineHeight: 1.6, color: "#94a3b8" }}>
          The page could not finish loading. Your data is safe. Try again, or go back to the
          listings.
        </p>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "12px 18px",
              border: 0,
              borderRadius: "10px",
              background: "#22c55e",
              color: "#052e16",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Try again
          </button>
          <Link
            href="/"
            style={{
              padding: "12px 18px",
              borderRadius: "10px",
              border: "1px solid #334155",
              color: "#e2e8f0",
              textDecoration: "none",
              fontSize: "15px"
            }}
          >
            Back to listings
          </Link>
        </div>
      </section>
    </main>
  );
}
