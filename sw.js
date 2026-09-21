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
// - Librerías externas fijas (React, Babel, Firebase por CDN): la app no
//   puede arrancar sin ellas, así que se guardan también en este caché
//   (cache-first, y se refrescan solas en segundo plano) en vez de dejarlas
//   solo en el caché normal del navegador, que se puede borrar solo.
// - Otras cosas externas (fuentes, etc.): se dejan pasar normal, sin tocarlas.
// - Otros archivos propios (manifest, íconos): caché primero, y se
//   actualizan solos en segundo plano cuando hay internet.

var CACHE_NAME = "makizen-shell-v4";

// Archivos propios que la app necesita para poder abrir sin internet.
var OWN_PRECACHE = [
  "./",
  "./makizen-roll_5.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Librerías externas fijas (versión exacta en la URL, nunca cambian de
// contenido) sin las cuales la app no puede ni dibujar la pantalla.
var CDN_PRECACHE = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check-compat.js"
];

self.addEventListener("install", function (event) {
      event.waitUntil(
              caches.open(CACHE_NAME).then(function (cache) {
                        // Se guarda cada archivo por separado (no con addAll) para que si
                        // uno falla (ej. "./" no existe, o no hay internet en ese momento)
                        // no tumbe la descarga de los demás.
                        return Promise.all(
                                    OWN_PRECACHE.concat(CDN_PRECACHE).map(function (url) {
                                              return cache.add(url).catch(function () {
                                                          // Si algún archivo no carga todavía, no truena la instalación;
                                                          // se reintentará solo la próxima vez que haya internet.
                                              });
                                    })
                                  );
              })
            );
      // Activa este SW inmediatamente sin esperar a que el usuario cierre pestañas
                        self.skipWaiting();
});

self.addEventListener("activate", function (event) {
      event.waitUntil(
              caches.keys().then(function (keys) {
                        return Promise.all(
                                    keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })
                                  );
              }).then(function () {
                        // Toma control de todas las pestañas abiertas inmediatamente
                            return self.clients.claim();
              })
            );
});

self.addEventListener("fetch", function (event) {
      var req = event.request;
      if (req.method !== "GET") return;

                        var url = new URL(req.url);

                        // Librerías externas fijas (React, Babel, Firebase): la app no puede
                        // arrancar sin ellas. Caché primero, y se refrescan solas en
                        // segundo plano cuando hay internet.
                        if (CDN_PRECACHE.indexOf(req.url) !== -1) {
                                event.respondWith(
                                          caches.match(req).then(function (cached) {
                                                    var fetchPromise = fetch(req).then(function (res) {
                                                                  if (res && (res.status === 200 || res.type === "opaque")) {
                                                                                  var copy = res.clone();
                                                                                  caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
                                                                  }
                                                                  return res;
                                                    }).catch(function () { return cached; });
                                                    return cached || fetchPromise;
                                          })
                                        );
                                return;
                        }

                        if (url.origin !== self.location.origin) return; // otros recursos externos: sin tocar

                        // version.json: siempre red, nunca caché
                        if (url.pathname.indexOf("version.json") !== -1) {
                                event.respondWith(fetch(req).catch(function () { return caches.match(req); }));
                                return;
                        }

                        // HTML principal: red primero, caché como fallback offline
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

                        // Resto: caché primero, actualiza en segundo plano (stale-while-revalidate)
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

// Escucha el mensaje SKIP_WAITING enviado desde la app para forzar actualización
self.addEventListener("message", function (event) {
      if (event.data && event.data.type === "SKIP_WAITING") {
              self.skipWaiting();
      }
});
