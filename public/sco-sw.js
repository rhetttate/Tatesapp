// Minimal service worker for the SCO screen.
//
// It exists so Chrome on Android treats /cashier/sco as a real installable
// app (WebAPK, full-screen, own icon) instead of offering only a home-screen
// shortcut — older Chrome versions require a service worker with a fetch
// handler before they allow the full install.
//
// Deliberately NO caching: the screen needs Supabase + Bluetooth to be of any
// use, and a stale cached page would be worse than an error.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET" && event.request.url.startsWith(self.location.origin)) {
    event.respondWith(fetch(event.request));
  }
});
