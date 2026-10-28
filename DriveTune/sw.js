// Service worker do DriveTunes.
// Necessário para o Chrome oferecer "Instalar app" e, principalmente, para o app abrir
// rápido em centrais fracas ou com internet ruim. Estratégia "cache primeiro, atualiza
// por trás": os arquivos do app saem na hora do cache (sem esperar a rede) e, em paralelo,
// a versão mais nova é baixada e guardada. Uma atualização publicada aparece na próxima
// vez que o app for aberto. Ao publicar, troque o número em CACHE para que tudo seja
// baixado de novo de uma vez.
const CACHE = 'drivetunes-v7';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js', 'js/auth.js', 'js/config.js', 'js/lyrics.js', 'js/md5.js', 'js/media.js',
  'js/navidrome.js', 'js/player.js', 'js/store.js', 'js/suggest.js', 'js/theme.js', 'js/youtube.js',
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
  const url = new URL(req.url);
  // Só cuida dos arquivos do próprio app; Navidrome, YouTube, Google e letras passam direto.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // "?source=app" e afins não mudam o arquivo: uma entrada só no cache para cada um.
  url.search = '';
  const key = url.href;

  let saved = Promise.resolve();
  const fresh = fetch(req).then((res) => {
    // Resposta redirecionada não pode ser reaproveitada numa navegação; não guarda.
    if (res.ok && !res.redirected) {
      const copy = res.clone();
      saved = caches.open(CACHE).then((c) => c.put(key, copy));
    }
    return res;
  });
  // Mantém o service worker vivo até terminar de guardar a versão nova.
  event.waitUntil(fresh.then(() => saved).catch(() => {}));

  event.respondWith(
    caches.match(key).then((hit) => hit
      || fresh.catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
