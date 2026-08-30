"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").then(async (registration) => {
        await navigator.serviceWorker.ready;
        const urls = performance.getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(location.origin));
        (registration.active || registration.waiting)?.postMessage({ type: "CACHE_URLS", urls });
      }).catch(() => undefined);
    }
  }, []);
  return null;
}
