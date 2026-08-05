// Service worker de Makizen Roll.
// Objetivo: (1) que Chrome pueda "instalar" la app con ícono propio y
// pantalla completa, y (2) que siga abriendo aunque no haya internet.
//
// Reglas:
// - version.json: SIEMPRE va a la red (nunca se guarda en caché), para que
//   el chequeo de actualizaciones de la app sea preciso.
// - La página principal (HTML): primero intenta la red, para que
//   "Actualizar ahora" sí traiga la versión nueva. Si no hay internet, usa
//   la última copia guardada para que la app pueda seguir abriendo.
// - Recursos externos (React, fuentes, Firebase por CDN): se dejan pasar
//   normal, sin tocarlos.
// - Otros archivos propios (manifest, íconos): caché primero, y se
//   actualizan solos en segundo plano cuando hay internet.

var CACHE_NAME = "makizen-shell-v1";

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(["./", "./manifest.json", "./icon-192.png", "./icon-512.png"]).catch(function () {
        // Si algún archivo no existe todavía (ej. primera vez), no truena la instalación.
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // recursos externos: sin tocar

  if (url.pathname.indexOf("version.json") !== -1) {
    event.respondWith(fetch(req).catch(function () { return caches.match(req); }));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          return res;
        })
        .catch(function () { return caches.match(req); })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      var fetchPromise = fetch(req)
        .then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        })
        .catch(function () { return cached; });
      return cached || fetchPromise;
    })
  );
});
