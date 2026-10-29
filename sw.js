// Service worker do Chef Pereira: deixa o app abrir mesmo sem internet.
// Os dados (pedidos, clientes...) ficam guardados pelo próprio Firebase; aqui guardamos só "o app".
const VERSAO = 'chef-pereira-v2';
const ARQUIVOS_DO_APP = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './icon-maskable-512.png', './favicon.png'];
const BIBLIOTECAS = [
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-app-compat.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-auth-compat.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/firebase/10.7.1/firebase-firestore-compat.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(VERSAO);
        await cache.addAll(ARQUIVOS_DO_APP).catch(() => { });
        await Promise.all(BIBLIOTECAS.map(url =>
            fetch(url, { mode: 'no-cors' }).then(r => cache.put(url, r)).catch(() => { })));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const nomes = await caches.keys();
        await Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

// Página do app: tenta a internet primeiro (pega sempre a versão nova do GitHub) e usa a cópia se estiver offline
async function redePrimeiro(request) {
    const cache = await caches.open(VERSAO);
    try {
        const controle = new AbortController();
        const timer = setTimeout(() => controle.abort(), 5000);
        const resposta = await fetch(request, { signal: controle.signal });
        clearTimeout(timer);
        if (resposta && resposta.ok) cache.put(request.mode === 'navigate' ? './index.html' : request, resposta.clone());
        return resposta;
    } catch (e) {
        return (await cache.match(request.mode === 'navigate' ? './index.html' : request, { ignoreSearch: true }))
            || (await cache.match('./index.html'))
            || Response.error();
    }
}

// Bibliotecas: usa a cópia na hora e atualiza em segundo plano
async function copiaPrimeiro(request) {
    const cache = await caches.open(VERSAO);
    const copia = await cache.match(request, { ignoreVary: true });
    const atualizar = fetch(request).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(request, r.clone()); return r; }).catch(() => null);
    return copia || (await atualizar) || Response.error();
}

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Firebase (login e banco de dados) cuida de si mesmo — não mexe
    if (/googleapis\.com|firebaseapp\.com|gstatic\.com|google\.com/.test(url.hostname)) return;

    if (req.mode === 'navigate' || (url.origin === self.location.origin && /\.(html|json)$|\/$/.test(url.pathname))) {
        event.respondWith(redePrimeiro(req));
        return;
    }
    if (url.origin === self.location.origin || url.hostname === 'cdn.tailwindcss.com' || url.hostname === 'cdnjs.cloudflare.com') {
        event.respondWith(copiaPrimeiro(req));
    }
});
