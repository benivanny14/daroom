import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DarRoom - Find a Room to Rent in Dar es Salaam",
  description: "Find rooms to rent in Dar es Salaam. Clear prices and terms. Contact an Agent directly. Searching is free.",
  keywords: "rooms for rent, dar es salaam, Tanzania, rental, room, apartment",
  authors: [{ name: "DarRoom" }],
  openGraph: {
    title: "DarRoom - Find a Room to Rent in Dar es Salaam",
    description: "Find rooms to rent in Dar es Salaam. Clear prices and terms.",
    type: "website",
    locale: "en_TZ",
    url: process.env.APP_URL || "https://darroom.co.tz",
    siteName: "DarRoom"
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
    <html lang="en">
      <head>
        <link rel="canonical" href={process.env.APP_URL || "https://darroom.co.tz"} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
