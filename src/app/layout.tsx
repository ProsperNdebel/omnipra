import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { authEnabled } from "@/server/auth-config";
import { signedIn } from "@/server/viewer";
import { HashSession } from "@/ui/hash-session";
import { Nav } from "@/ui/nav";
import "@/ui/styles.css";

const description =
  "Send your agent to the events you can't make, through people already there.";

export const metadata: Metadata = {
  // Absolute links for the preview image when a page is shared.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://omnipra.io",
  ),
  title: "Omnipra",
  description,
  applicationName: "Omnipra",
  appleWebApp: { title: "Omnipra", capable: true, statusBarStyle: "default" },
  openGraph: {
    title: "Omnipra",
    description,
    siteName: "Omnipra",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Omnipra", description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const signed = await signedIn();
  const account = authEnabled() ? signed : null;
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&display=swap"
        />
      </head>
      {/* Extensions like Grammarly add attributes to <body> before React hydrates. */}
      <body suppressHydrationWarning>
        <Nav account={account} />
        {account !== null && <HashSession />}
        {children}
      </body>
    </html>
  );
}
