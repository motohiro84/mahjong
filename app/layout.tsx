import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/components/app-provider";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export const metadata: Metadata = {
  title: { default: "牌しるべ", template: "%s | 牌しるべ" },
  description: "初心者向けのリーチ麻雀・手牌確認アプリ。役、狙い目、有効牌、点数を手牌から確認できます。",
  applicationName: "牌しるべ",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "牌しるべ" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#10131a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <AppProvider>{children}</AppProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
