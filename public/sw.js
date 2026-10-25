// Offline-Speicher der Marktküche: Die App startet auch ohne Netz (z. B. im Supermarkt).
// Seiten: erst Netz, sonst die gespeicherte Startseite. Dateien unter assets/ (mit Hash im Namen): aus dem Speicher.
// Alle Pfade relativ zum Ordner der App (auf GitHub Pages z. B. /marktkueche/).
const CACHE = 'marktkueche-v2';
const ROOT = new URL('./', self.location.href).pathname;
const SHELL = [ROOT, `${ROOT}manifest.webmanifest`, `${ROOT}icon.svg`];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Die Angebote des Wochenabrufs immer frisch laden (die App speichert sie selbst)
  if (url.pathname.startsWith(`${ROOT}daten/`)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(ROOT, copy));
          return res;
        })
        .catch(() => caches.match(ROOT)),
    );
    return;
  }

  if (url.pathname.startsWith(`${ROOT}assets/`) || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
      ),
    );
  }
});
