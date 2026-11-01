import type { Metadata } from "next";
import { Fraunces, Work_Sans } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

/**
 * Both families are downloaded once at build time and served from this origin,
 * so the content policy (`font-src 'self'`) keeps working and no visitor ever
 * waits on a third-party font host.
 */
const displayFont = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["SOFT", "WONK"]
});

const bodyFont = Work_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "DarRoom - Find a Room to Rent in Dar es Salaam",
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: "rooms for rent, dar es salaam, Tanzania, rental, room, apartment",
  authors: [{ name: "DarRoom" }],
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "DarRoom - Find a Room to Rent in Dar es Salaam",
    description: "Find rooms to rent in Dar es Salaam. Clear prices and terms.",
    type: "website",
    locale: "en_TZ",
    url: SITE_URL,
    siteName: SITE_NAME
  },
  twitter: {
    card: "summary_large_image",
    title: "DarRoom - Find a Room to Rent in Dar es Salaam",
    description: "Find rooms to rent in Dar es Salaam. Clear prices and terms."
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  },
  verification: {
    google: process.env.GOOGLE_VERIFICATION_CODE
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#b4532a" />
      </head>
      <body>{children}</body>
    </html>
  );
}
