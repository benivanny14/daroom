import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "media-src 'self'"
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = (phase) => ({
  reactStrictMode: true,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Kept out of development so hot reload and dev tooling are not blocked.
          ...(process.env.NODE_ENV === "production"
            ? [
                { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
                { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }
              ]
            : [])
        ]
      }
    ];
  }
});

export default nextConfig;
