/* ---------------------------------------------------------------------------
 * sw.js — il guscio offline.
 *
 * Regola: in palestra la rete non c'è mai. Quindi cache-first su tutto,
 * e l'aggiornamento avviene in sottofondo alla prima apertura con rete.
 *
 * All'installazione NON si accontenta del guscio: legge plan.json e mette in
 * cache anche le 40 figure degli esercizi, così la prima volta che apri l'app
 * senza rete le vedi lo stesso.
 *
 * Il catalogo di «My workouts» (esercizi/, 873 esercizi, ~21 MB di foto) NON
 * entra all'installazione: si mette in cache da solo la prima volta che lo apri
 * (cache-first qui sotto). Nell'APK sta già dentro, e il service worker non c'è.
 * ------------------------------------------------------------------------- */

// Il numero si ALZA A OGNI CAMBIO di app.js / style.css / index.html.
// È l'unico interruttore che fa arrivare il codice nuovo su un telefono che
// ha già l'app installata: senza, resta servita la copia in cache per sempre.
const VERSION = 'health-v19';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './giorni.js',
  './sonno.js',
  './sport.js',
  './mine.js',
  './sostanze-catalogo.js',
  './sostanze.js',
  './peso.js',
  './impostazioni.js',
  './sport-tipi.js',
  './orologio.js',
  './esporta.js',
  './app.js',
  './parse-mht.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './fonts/barlow-condensed-latin-600-normal.woff2',
  './fonts/barlow-condensed-latin-700-normal.woff2',
  './fonts/barlow-latin-400-normal.woff2',
  './fonts/barlow-latin-600-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // `cache: 'reload'` su ogni file del guscio: senza, addAll può prendere la
    // copia dalla cache HTTP del browser e la versione nuova nascerebbe già
    // vecchia dentro. Va chiesto alla rete, sempre.
    await Promise.all(SHELL.map((u) =>
      fetch(u, { cache: 'reload' }).then((r) => {
        if (!r.ok) throw new Error(u);
        return cache.put(u, r);
      })));

    // le figure degli esercizi, prese dal piano stesso
    try {
      const plan = await (await fetch('./plan.json', { cache: 'reload' })).json();
      const names = new Set();
      (plan.days || []).forEach((d) => (d.exercises || []).forEach((x) => {
        if (x.imgA) names.add(x.imgA);
        if (x.imgB) names.add(x.imgB);
      }));
      await Promise.all([...names].map((n) =>
        cache.add('./img/' + encodeURIComponent(n)).catch(() => {})));
    } catch (err) { /* niente piano: si arrangia a runtime */ }

    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: false });
    if (cached) {
      // c'è: servila subito e aggiorna in sottofondo, senza far aspettare nessuno
      e.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) (await caches.open(VERSION)).put(req, fresh.clone());
        } catch (err) { /* offline: pazienza */ }
      })());
      return cached;
    }
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) (await caches.open(VERSION)).put(req, fresh.clone());
      return fresh;
    } catch (err) {
      // navigazione senza rete e senza copia → il guscio
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
