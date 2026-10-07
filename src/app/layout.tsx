import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/ui/styles.css";

export const metadata: Metadata = {
  title: "Presence",
  description: "Send your agent to the events you can't make, through people already there.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&display=swap"
        />
      </head>
      {/* Extensions like Grammarly add attributes to <body> before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
