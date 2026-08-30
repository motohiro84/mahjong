import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "牌しるべ - 麻雀手牌ナビ",
    short_name: "牌しるべ",
    description: "役・狙い目・有効牌・点数を確認できる初心者向け麻雀アプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#10131a",
    theme_color: "#10131a",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
      { src: "/icons/icon-maskable.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
