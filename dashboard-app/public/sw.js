// Service worker for the installed app. It keeps the app's own files so the workspace opens
// at once and without a connection. It never handles requests to other origins, so nothing
// from the database is stored here and no data can be served stale.
const CACHE = "workspace-shell-v1";
const SCOPE = new URL(self.registration.scope).pathname; // "/dashboard/"

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));

const isAsset = (url) => url.pathname.startsWith(SCOPE + "assets/");

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;

  // The page: from the network so a new release is picked up at once; the kept copy when offline.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(request);
        if (fresh.ok) await cache.put(SCOPE, fresh.clone());
        return fresh;
      } catch {
        return (await cache.match(SCOPE)) ?? Response.error();
      }
    })());
    return;
  }

  // Build files carry a content hash in their name, so a kept copy is always the right one.
  if (isAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const kept = await cache.match(request);
      if (kept) return kept;
      const fresh = await fetch(request);
      if (fresh.ok) await cache.put(request, fresh.clone());
      return fresh;
    })());
    return;
  }

  // Icons, manifest and the like: network first, kept copy when offline.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(request);
      if (fresh.ok) await cache.put(request, fresh.clone());
      return fresh;
    } catch {
      return (await cache.match(request)) ?? Response.error();
    }
  })());
});

// The page asks for this once it has loaded: keep every file of the current build, so sections
// not opened yet also work offline, and drop files left over from older builds.
self.addEventListener("message", (event) => {
  if (event.data !== "precache") return;
  event.waitUntil((async () => {
    const response = await fetch(SCOPE + "precache.json", { cache: "no-store" });
    if (!response.ok) return;
    const files = (await response.json()).map((f) => new URL(SCOPE + f, self.location.origin).href);
    const wanted = new Set(files);
    const cache = await caches.open(CACHE);
    // The first visit loaded the page before this worker was in charge of it, so keep it now.
    try {
      const page = await fetch(SCOPE, { cache: "no-store" });
      if (page.ok) await cache.put(SCOPE, page);
    } catch { return; }
    for (const request of await cache.keys()) {
      if (isAsset(new URL(request.url)) && !wanted.has(request.url)) await cache.delete(request);
    }
    for (const file of files) {
      if (await cache.match(file)) continue;
      try {
        const fresh = await fetch(file);
        if (fresh.ok) await cache.put(file, fresh);
      } catch { return; } // offline or interrupted: the next load carries on
    }
  })());
});
