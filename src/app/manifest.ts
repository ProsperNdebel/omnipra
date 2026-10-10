import type { MetadataRoute } from "next";

/** Lets phones add Omnipra to the home screen with its own icon and name. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Omnipra",
    short_name: "Omnipra",
    description:
      "Send your agent to the events you can't make, through people already there.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
