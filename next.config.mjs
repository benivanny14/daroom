import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/**
 * Browsers upload media straight to object storage with a signed or presigned
 * URL, so that storage origin has to be named in `connect-src`. The values come
 * from the same variables `lib/storage.ts` uses, at build time.
 */
function uploadOrigins() {
  const origins = new Set();
  for (const value of [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.S3_ENDPOINT]) {
    if (!value) continue;
    try {
      const { origin } = new URL(value);
      if (origin.startsWith("https://")) origins.add(origin);
    } catch {
      // A malformed value must not produce an invalid policy header.
    }
  }
  return [...origins];
}

/**
 * Origins that may be loaded directly as an image. The Next.js optimizer serves
 * from `'self'`, but `PhotoImage` falls back to the raw storage URL when the
 * optimizer is unavailable, so the storage hosts are listed explicitly instead
 * of allowing every HTTPS origin.
 */
function mediaOrigins() {
  const origins = new Set();
  for (const value of [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.MEDIA_PUBLIC_BASE_URL,
    process.env.S3_ENDPOINT
  ]) {
    if (!value) continue;
    try {
      const { origin } = new URL(value);
      if (origin.startsWith("https://")) origins.add(origin);
    } catch {
      // A malformed value must not produce an invalid policy header.
    }
  }
  return [...origins];
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `img-src ${["'self'", "data:", "blob:", ...mediaOrigins()].join(" ")}`,
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  `connect-src ${["'self'", ...uploadOrigins()].join(" ")}`,
  "media-src 'self'"
].join("; ");

/**
 * Origins that listing photos are served from. The Next.js image optimizer
 * refuses every other remote host, so the Supabase project (and the optional
 * custom media domain or S3 endpoint) has to be allowed explicitly.
 */
function imageRemotePatterns() {
  const patterns = [
    { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/**" }
  ];
  for (const value of [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.MEDIA_PUBLIC_BASE_URL,
    process.env.S3_ENDPOINT
  ]) {
    if (!value) continue;
    try {
      const { protocol, hostname } = new URL(value);
      if (protocol !== "https:") continue;
      if (patterns.some((pattern) => pattern.hostname === hostname)) continue;
      patterns.push({ protocol: "https", hostname, pathname: "/**" });
    } catch {
      // A malformed value must not break the build.
    }
  }
  return patterns;
}

/** @type {import('next').NextConfig} */
const nextConfig = (phase) => ({
  reactStrictMode: true,
  // Do not advertise the framework version to the public.
  poweredByHeader: false,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  images: {
    // Photos are already compressed in the browser; the optimizer only has to
    // resize them per screen width and re-encode them. WebP only: Vercel counts
    // a separate transformation per format, and the Hobby plan includes 5,000
    // per month, so AVIF would halve the number of photos that can be served.
    formats: ["image/webp"],
    remotePatterns: imageRemotePatterns(),
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1600],
    imageSizes: [64, 96, 128, 160, 220, 320, 384],
    // Optimized variants never change, so they can be cached for a month.
    minimumCacheTTL: 2678400
  },
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
