const CACHE_NAME = 'colhedoras-v14';

// Caminhos relativos ao local do sw.js: funcionam na raiz do domínio
// e em subdiretórios (ex.: GitHub Pages em /Capacidade-Produtiva/)
const STATIC_ASSETS = [
    './',
    './index.html',
    './login.html',
    './cadastro.html',
    './admin.html',
    './planos.html',
    './verificar-email.html',
    './dashboard.html',
    './style.css',
    './auth.css',
    './dashboard.css',
    './script.js',
    './calculadoras.js',
    './auth.js',
    './dashboard.js',
    './api-config.js',
    './firebase-config.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// INSTALL
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            // cache: 'reload' ignora o cache HTTP do navegador e garante os arquivos mais novos
            cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
        )
    );
    self.skipWaiting();
});

// ACTIVATE
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// FETCH
// Estratégia: NETWORK-FIRST. Sempre tenta buscar a versão mais recente na
// internet primeiro; só usa a cópia salva (cache) se estiver offline.
// Isso garante que qualquer atualização que você publicar no GitHub chega
// pros usuários automaticamente, sem precisar lembrar de mudar nada aqui.
self.addEventListener('fetch', (event) => {
    // Deixa o navegador cuidar diretamente de chamadas ao Firebase (login/banco de dados)
    // e de qualquer requisição que não seja GET — o Cache API só suporta GET.
    if (event.request.method !== 'GET' ||
        event.request.url.includes('firestore.googleapis.com') ||
        event.request.url.includes('identitytoolkit.googleapis.com') ||
        event.request.url.includes('firebaseio.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(fetchRes => {
                if (fetchRes && fetchRes.status === 200) {
                    const clone = fetchRes.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return fetchRes;
            })
            .catch(() => {
                // Sem internet: usa a última cópia salva
                return caches.match(event.request, { ignoreSearch: true }).then(cached => {
                    if (cached) return cached;
                    if (event.request.mode === 'navigate') return caches.match('./index.html');
                });
            })
    );
});