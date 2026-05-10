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
      .then(reg => console.log('Service Worker registered! ✅'))
      .catch(err => console.log('Service Worker registration failed ❌', err));
  });
}
