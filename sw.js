/* Service worker «Навстречу»: благодаря ему приложение можно установить
   и открывать без интернета. Меняешь файлы приложения — подними VERSION,
   чтобы у пользователей удалился старый кэш. */
const VERSION = "3";
const CACHE = `navstrechu-${VERSION}`;
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "content.js",
  "app.js",
  "manifest.webmanifest",
  "icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("navstrechu-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // Файлы приложения: сначала сеть, чтобы обновления приходили сразу, без сети — из кэша.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const hit = await caches.match(request, { ignoreSearch: true });
          if (hit) return hit;
          if (request.mode === "navigate") return caches.match("./");
          return Response.error();
        })
    );
    return;
  }

  if (FONT_HOSTS.includes(url.hostname)) {
    // Шрифты меняются редко: отдаём из кэша и тихо обновляем.
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        const fresh = fetch(request)
          .then((response) => {
            if (response.ok || response.type === "opaque") cache.put(request, response.clone());
            return response;
          })
          .catch(() => hit || Response.error());
        return hit || fresh;
      })
    );
  }
});
