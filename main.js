import './style.css';
import { initCalculator } from './calculator.js';
import { initializeSOSService } from './sos-service.js';

document.addEventListener('DOMContentLoaded', () => {
  initializeSOSService();
  initCalculator();
});

// ======= PWA REGISTRATION =======
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('Service Worker registered! ✅');
        requestNotificationPermission(reg); // Minta izin notifikasi setelah SW siap
      })
      .catch(err => console.log('Service Worker registration failed ❌', err));
  });
}

const PUBLIC_VAPID_KEY = 'BCYMK1UibwxWRU82AGBzcVSaq4E_Q_62yTo7kwdvZRE1mPOwkyQXCLaLeEja18yXNh6EBnbB4GQGyI_-fQVk7Rk';

function requestNotificationPermission(reg) {
  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      console.log('Notification permission granted! 🔔');
      subscribeUserToPush(reg);
    }
  });
}

function subscribeUserToPush(reg) {
  reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
  }).then(subscription => {
    console.log('User is subscribed to Push Notifications.');
    
    // Kirim subscription ke backend Railway
    fetch('https://silenthelp-production.up.railway.app/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }).catch(err => console.error('Failed to subscribe user:', err));
}

// Utility function untuk konversi key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
