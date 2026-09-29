// Service worker do DriveTunes.
// Necessário para o Chrome oferecer "Instalar app". Estratégia "rede primeiro":
// sempre busca a versão mais nova e só usa o cache se estiver sem internet,
// para que as atualizações publicadas cheguem na hora.
const CACHE = 'drivetunes-v3';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js', 'js/auth.js', 'js/config.js', 'js/lyrics.js', 'js/media.js',
  'js/player.js', 'js/store.js', 'js/suggest.js', 'js/youtube.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

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
  // Só cuida dos arquivos do próprio app; YouTube, Google e letras passam direto.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
