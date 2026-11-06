"use client";

/**
 * Last-resort boundary: this replaces the root layout when an error escapes
 * every nested boundary, so it must render its own <html> and <body>.
 */
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
        }}
      >
        <main style={{ maxWidth: "440px", width: "100%" }}>
          <p style={{ margin: "0 0 8px", color: "#22c55e", fontWeight: 600, letterSpacing: "0.08em" }}>
            DARROOM
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: "24px" }}>DarRoom could not load</h1>
          <p style={{ margin: "0 0 24px", lineHeight: 1.6, color: "#94a3b8" }}>
            A temporary problem stopped the page from opening. Please try again in a moment.
            {error.digest ? ` Reference: ${error.digest}.` : ""}
          </p>
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
        </main>
      </body>
    </html>
  );
}
