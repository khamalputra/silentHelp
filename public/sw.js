const CACHE_NAME = 'silenthelp-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/calculator.js',
  '/sos-service.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// ======= PENERIMA NOTIFIKASI PUSH =======
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  console.log('Push received:', data);

  const options = {
    body: data.body || 'Seseorang butuh bantuan!',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200, 100, 200, 100, 400], // Getaran darurat
    data: {
      url: data.data ? data.data.url : '/'
    },
    actions: [
      { action: 'open', title: '📍 Buka Peta' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'SilentHelp SOS', options)
  );
});

// Menangani klik pada notifikasi
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
