// ===========================
// Service worker do Firebase Cloud Messaging (notificações push)
// ===========================
// Esse arquivo é separado do sw.js (que cuida do cache/offline do app).
// Ele existe só pra receber notificações push MESMO com o site fechado ou
// em segundo plano, e mostrar elas como notificação do sistema operacional.
//
// As chaves abaixo não são secretas (são de uso público, iguais às do
// firebase-config.js) — por isso podem ficar hardcoded aqui. O service
// worker não consegue importar firebase-config.js porque ele roda antes
// da página existir e não tem acesso ao "window".

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBUVO32fUsugyMBPF-wXD_7E1l6Co3YDHE",
    authDomain: "controle-colhedoras.firebaseapp.com",
    projectId: "controle-colhedoras",
    storageBucket: "controle-colhedoras.firebasestorage.app",
    messagingSenderId: "686733003266",
    appId: "1:686733003266:web:c8f78b97163d9f8cc1b51b"
});

const messaging = firebase.messaging();

// Chega uma notificação com o site em segundo plano ou fechado
messaging.onBackgroundMessage(function (payload) {
    const titulo = (payload.notification && payload.notification.title) || 'Pedido de ajuda';
    const opcoes = {
        body: (payload.notification && payload.notification.body) || '',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        data: payload.data || {}
    };
    self.registration.showNotification(titulo, opcoes);
});

// Clicar na notificação abre (ou foca) o painel admin
self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
            for (const client of windowClients) {
                if (client.url.indexOf('admin.html') !== -1 && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./admin.html');
            }
        })
    );
});
