// Service Worker: la consola sigue abriéndose aunque el proceso no esté vivo.
//
// Cachea únicamente los archivos estáticos y DESCARTA de forma explícita todo lo
// que empiece por /api/. Sin esa condición, una respuesta con el inventario
// completo quedaría guardada en el navegador y podría servirse obsoleta —o
// sobrevivir al cierre de la aplicación—.
//
// La estrategia es red primero con respaldo en caché: mientras el proceso
// responde, siempre se sirve la versión actual.
const CACHE = "rootcause-chain-v3";
const ASSETS = ["/", "/styles.css", "/app.js", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
