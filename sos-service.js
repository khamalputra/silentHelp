// sos-service.js
// Handles the stealth SOS logic
import { io } from "socket.io-client";

// Connect to our production Backend Server on Railway
const socket = io("https://silenthelp-production.up.railway.app");

// Track if we are sending location
let locationInterval = null;
let isSOSActive = false; // Status apakah kita sedang mengirim sinyal darurat atau tidak

// Kombinasi sekarang: ketik 9111 lalu TAHAN tombol = selama 3 detik
const SECRET_COMBINATION = "9111LONG_EQUALS";
const SETUP_COMBINATION = "0000LONG_EQUALS";
const DEACTIVATE_COMBINATION = "1111LONG_EQUALS";
let inputBuffer = "";

// Ambil atau buat Client ID unik untuk perangkat ini
let clientId = localStorage.getItem('silent_help_client_id');
if (!clientId) {
  clientId = 'client_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('silent_help_client_id', clientId);
}

// GANTI DENGAN TOKEN DAN CHAT ID MILIK ANDA
// 1. Buat bot di Telegram melalui @BotFather, copy tokennya.
// 2. Chat bot Anda, lalu buka https://api.telegram.org/bot<TOKEN>/getUpdates untuk mencari 'chat' id Anda.
const TELEGRAM_BOT_TOKEN = '8305416471:AAGrzBCNb24civgYHSSj20NbZjNEB4PP0Rc';
const TELEGRAM_CHAT_ID = '1777475427';

export function initializeSOSService() {
  console.log("Stealth Service initialized");
  
  // Listen for incoming SOS from other users
  socket.on('sos_alert', (alertData) => {
    // ======= FITUR KEAMANAN: JANGAN TAMPILKAN JIKA KITA SENDIRI SEDANG SOS =======
    if (isSOSActive) {
      console.log("Blocking incoming SOS alert because we are in active SOS mode.");
      return;
    }
    // ============================================================================
    
    console.warn("🚨 INCOMING SOS RECEIVED! 🚨", alertData);
    
    const mapUrl = `https://maps.google.com/?q=${alertData.location.lat},${alertData.location.lng}`;
    
    // Tampilkan pesan AI jika ada, jika tidak pakai info asli
    const displayInfo = alertData.aiMessage || alertData.extraInfo;
    const extraHtml = displayInfo ? `<div style="background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; margin: 10px 0; font-size: 1rem; text-align: center;">📝 <b>Detail:</b> ${displayInfo}</div>` : '';
    
    const messageHtml = `
      🚨 PENGGUNA TERDEKAT DALAM BAHAYA! 🚨<br/>
      Jarak: ${alertData.distance} meter<br/>
      ${extraHtml}
      <br/>
      <a href="${mapUrl}" target="_blank" style="color: yellow; text-decoration: underline; font-size: 1.8rem;">📍 KLIK UNTUK BUKA PETA</a>
    `;
    
    // Play sound or show extreme notification
    playEmergencySiren();
    showCriticalToast(alertData); // Kirim seluruh objek alertData
  });

  // Listen for SOS resolution (when victim deactivates it)
  socket.on('sos_resolved', (data) => {
    console.log("SOS Resolved by victim:", data);
    showToast("Situasi telah aman (Sinyal dinonaktifkan oleh korban).");
    removeSpecificAlert(data.clientId);
  });

  // Setup UI for hidden modal
  const saveBtn = document.getElementById('save-context-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const text = document.getElementById('context-input').value;
      localStorage.setItem('silent_help_context', text);
      document.getElementById('setup-modal').classList.add('hidden');
      inputBuffer = "";
    });
  }

  // Start background location sharing for the 10km radius feature
  startLocationSharing();
}

function startLocationSharing() {
  if (navigator.geolocation) {
    const sendLoc = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          socket.emit('update_location', {
            clientId: clientId,
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (err) => console.log("Background location denied or error", err),
        { enableHighAccuracy: false } // Low accuracy for background to save battery
      );
    };

    // Share location immediately when app opens
    sendLoc();
    
    // Then continue sharing every 15 seconds
    locationInterval = setInterval(sendLoc, 15000);
  }
}



export function registerInput(char) {
  inputBuffer += char;
  
  // Keep buffer size manageable to prevent memory leak, but long enough for the code
  if (inputBuffer.length > 20) {
    inputBuffer = inputBuffer.substring(inputBuffer.length - 20);
  }

  if (inputBuffer.endsWith(SECRET_COMBINATION)) {
    isSOSActive = true; // Aktifkan mode stealth (blokir alarm masuk)
    clearAllVolunteerAlerts(); // Bersihkan semua alarm orang lain dari layar kita
    triggerSOS();
    // Clear buffer after trigger to prevent double firing immediately
    inputBuffer = "";
  } else if (inputBuffer.endsWith(SETUP_COMBINATION)) {
    openSetupModal();
    inputBuffer = "";
  } else if (inputBuffer.endsWith(DEACTIVATE_COMBINATION)) {
    deactivateSOS();
    inputBuffer = "";
  }
}

function openSetupModal() {
  const modal = document.getElementById('setup-modal');
  const input = document.getElementById('context-input');
  if (modal && input) {
    modal.classList.remove('hidden');
    input.value = localStorage.getItem('silent_help_context') || '';
    input.focus();
  }
}

function deactivateSOS() {
  console.log("Deactivating SOS signal for Client ID:", clientId);
  isSOSActive = false; // Matikan mode stealth (izinkan alarm masuk lagi)
  if (!clientId) {
    console.error("No Client ID found, cannot deactivate.");
    return;
  }
  socket.emit('deactivate_sos', { clientId: clientId });
  showToast("Sinyal darurat telah dinonaktifkan.");
  removeSpecificAlert(clientId);
}

function removeSpecificAlert(targetClientId) {
  const alertElement = document.getElementById(`sos-alert-${targetClientId}`);
  if (alertElement) {
    // Ubah jadi hijau untuk menandakan aman sebelum dihapus
    alertElement.style.background = "#2ecc71";
    alertElement.style.animation = "none";
    alertElement.innerHTML = `✅ SITUASI TELAH AMAN <br/> <span style="font-size: 0.8rem;">Sinyal dinonaktifkan oleh korban</span>`;
    
    setTimeout(() => {
      alertElement.remove();
      checkRemainingAlerts();
    }, 3000);
  }
}

function clearAllVolunteerAlerts() {
  const container = document.getElementById('critical-alerts-container');
  if (container) container.remove();
  
  if (window.activeAudioCtx) {
    window.activeAudioCtx.close();
    window.activeAudioCtx = null;
  }
}

function checkRemainingAlerts() {
  const remainingAlerts = document.querySelectorAll('.critical-alert-item');
  if (remainingAlerts.length === 0) {
    if (window.activeAudioCtx) {
      window.activeAudioCtx.close();
      window.activeAudioCtx = null;
    }
  }
}

function showCriticalToast(alertData) {
  const mapUrl = `https://maps.google.com/?q=${alertData.location.lat},${alertData.location.lng}`;
  const displayInfo = alertData.aiMessage || alertData.extraInfo;
  const extraHtml = displayInfo ? `<div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; margin: 8px 0; font-size: 0.9rem;">📝 <b>Detail:</b> ${displayInfo}</div>` : '';
  
  // Gunakan kombinasi ID agar benar-benar unik per tab
  const uniqueId = alertData.clientId || alertData.senderId || Math.random().toString(36).substr(2, 5);
  const alertId = `sos-alert-${uniqueId}`;
  
  console.log("Rendering Alert for ID:", alertId);
  showToast("🚨 Ada sinyal darurat masuk!"); // Notifikasi kecil tambahan
  
  let container = document.getElementById('critical-alerts-container');
  
  if (!container) {
    container = document.createElement('div');
    container.id = 'critical-alerts-container';
    container.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; 
      z-index: 10000; display: flex; flex-direction: column; gap: 1px;
      max-height: 40vh; /* Maksimal 40% tinggi layar */
      overflow-y: auto; /* Bisa di-scroll jika banyak */
      pointer-events: none;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
    `;
    document.body.appendChild(container);
  }

  let alertItem = document.getElementById(alertId);
  if (!alertItem) {
    alertItem = document.createElement('div');
    alertItem.id = alertId;
    alertItem.className = 'critical-alert-item';
    alertItem.style.cssText = `
      background: linear-gradient(135deg, #ff416c, #ff4b2b);
      color: white; padding: 18px; margin: 5px;
      text-align: center; border-radius: 16px;
      box-shadow: 0 10px 20px rgba(0,0,0,0.3);
      animation: pulseRed 1.8s infinite; font-weight: 500;
      pointer-events: auto; font-size: 0.95rem;
      border: 1px solid rgba(255,255,255,0.2);
    `;
    container.prepend(alertItem); 
    
    if (!document.getElementById('pulse-red-style')) {
      const style = document.createElement('style');
      style.id = 'pulse-red-style';
      style.innerHTML = `
        @keyframes pulseRed { 
          0% { transform: scale(1); box-shadow: 0 5px 15px rgba(255, 65, 108, 0.4); } 
          50% { transform: scale(1.02); box-shadow: 0 10px 25px rgba(255, 65, 108, 0.6); } 
          100% { transform: scale(1); box-shadow: 0 5px 15px rgba(255, 65, 108, 0.4); } 
        }
      `;
      document.head.appendChild(style);
    }
  }

  alertItem.innerHTML = `
    <div style="font-size: 1.1rem; margin-bottom: 5px;">🚨 <b>DARURAT: ${alertData.distance}m</b> 🚨</div>
    ${extraHtml}
    <div style="display: flex; justify-content: center; gap: 10px; margin-top: 10px;">
      <a href="${mapUrl}" target="_blank" style="background: white; color: #ff416c; padding: 8px 15px; border-radius: 20px; text-decoration: none; font-size: 0.85rem; font-weight: bold; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">📍 Buka Peta</a>
      <button onclick="navigator.clipboard.writeText('${alertData.location.lat},${alertData.location.lng}'); alert('Koordinat disalin!');" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid white; padding: 8px 15px; border-radius: 20px; cursor: pointer; font-size: 0.85rem;">📋 Salin Lokasi</button>
    </div>
  `;
}

function showToast(message) {
  // Only for development/testing visibility without exposing too much
  // In a real strict production app, this might be disabled entirely.
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function triggerSOS() {
  console.log("🚨 SOS TRIGGERED 🚨");
  showToast("Syncing data..."); // Camouflaged message

  const extraInfo = localStorage.getItem('silent_help_context') || "";

  if (!navigator.geolocation) {
    console.error("Geolocation is not supported by your browser");
    sendEmergencyMessage(null, extraInfo);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      console.log("Location obtained silently:", location);
      sendEmergencyMessage(location, extraInfo);
    },
    (error) => {
      console.error("Error getting location:", error);
      sendEmergencyMessage(null, extraInfo);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function sendEmergencyMessage(location, extraInfo) {
  const mapLink = location ? `https://maps.google.com/?q=${location.lat},${location.lng}` : "Lokasi tidak tersedia";
  let messageText = `🚨 *URGENT: SILENTHELP TRIGGERED* 🚨\n\nPengguna telah mengaktifkan sinyal darurat.\n\n📍 *Lokasi:* ${mapLink}\n🕒 *Waktu:* ${new Date().toLocaleString('id-ID')}`;
  
  if (extraInfo) {
    messageText += `\n📝 *Detail Tambahan:*\n_${extraInfo}_`;
  }

  console.log("Mengirim sinyal SOS ke Telegram...");

  // Jika token belum diisi, kita fallback ke console.log
  if (TELEGRAM_BOT_TOKEN === 'ISI_TOKEN_BOT_ANDA_DI_SINI') {
    console.warn("⚠️ Token Telegram belum diatur. Pesan darurat tidak akan terkirim.");
    console.log(messageText);
    return;
  }

  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  fetch(telegramUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: messageText,
      parse_mode: 'Markdown'
    })
  })
  .then(response => {
    if (response.ok) {
      console.log("✅ Pesan darurat sukses terkirim ke Telegram.");
    } else {
      console.error("Gagal mengirim ke Telegram:", response.status);
    }
  })
  .catch(error => {
    console.error("Error jaringan saat mengirim ke Telegram:", error);
  });

  // ======= NEW: BROADCAST TO SERVER FOR 10KM RADIUS =======
  console.log("Broadcasting SOS to nearby users (10KM radius)...");
  socket.emit('trigger_sos', {
    clientId: clientId,
    location: location,
    extraInfo: extraInfo,
    timestamp: new Date().toISOString()
  });
}

function playEmergencySiren() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    // Jika sirine sudah bunyi, jangan buat yang baru agar tidak berisik/error
    if (window.activeAudioCtx && window.activeAudioCtx.state !== 'closed') {
      window.activeAudioCtx.resume();
      return;
    }
    
    const audioCtx = new AudioContext();
    window.activeAudioCtx = audioCtx;
    
    // Pastikan audio di-resume (kebijakan browser)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    
    // Suara sirine polisi (naik turun frekuensi 440Hz ke 880Hz)
    oscillator.frequency.setValueAtTime(440, now);
    for (let i = 0; i < 4; i++) {
      oscillator.frequency.linearRampToValueAtTime(880, now + (i * 1) + 0.5);
      oscillator.frequency.linearRampToValueAtTime(440, now + (i * 1) + 1.0);
    }
    
    gainNode.gain.setValueAtTime(0.3, now); // Volume 30%
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 4); // Fade out

    oscillator.start();
    oscillator.stop(now + 4);
    
    // Bersihkan konteks setelah selesai untuk menghemat memori
    setTimeout(() => audioCtx.close(), 5000);
  } catch (e) {
    console.error("Gagal memutar suara darurat:", e);
  }
}
