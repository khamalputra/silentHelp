const CACHE_NAME = 'silenthelp-v2'; // Naikkan versi agar browser melakukan update paksa
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
    icon: self.location.origin + '/icon-192.png', // Gunakan alamat lengkap
    badge: self.location.origin + '/icon-192.png',
    vibrate: [500, 110, 500, 110, 450, 110, 200, 110, 170, 40, 450, 110, 200, 110, 170, 40],
    tag: 'sos-alert',
    renotify: true,
    data: {
      url: data.data ? data.data.url : self.location.origin
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
