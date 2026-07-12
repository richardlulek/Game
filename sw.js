/* Service worker för Fastighetsimperium (PWA).
   Strategi:
   · Navigeringar: nätet först (nya versioner landar direkt),
     cache som reserv när man är offline.
   · Byggda assets (JS/CSS/bilder, hash-namngivna): cache först –
     de ändrar aldrig innehåll under samma namn.
   Sparfiler ligger i localStorage och berörs inte av cachen. */

const CACHE = "fi-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["./", "./manifest.webmanifest"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // typsnitt m.m. sköter sig själva

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
