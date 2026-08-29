/* Service worker: deixa o app abrir sem rede. Os dados ja sao locais, entao a
   unica coisa que faltava para funcionar offline eram os proprios arquivos. */
const CACHE = 'controle-pessoal-v1';
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './icone.svg',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE)
      // addAll falha inteiro se um recurso falhar; o do CDN e o mais provavel,
      // e o app funciona sem ele (os graficos e que nao aparecem).
      .then(c => Promise.allSettled(ARQUIVOS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    // rede primeiro, para nao servir versao velha depois de um deploy;
    // cache como rede de seguranca quando esta offline
    fetch(evento.request)
      .then(resposta => {
        const copia = resposta.clone();
        caches.open(CACHE).then(c => c.put(evento.request, copia)).catch(() => {});
        return resposta;
      })
      .catch(() => caches.match(evento.request).then(r => r || caches.match('./index.html')))
  );
});
