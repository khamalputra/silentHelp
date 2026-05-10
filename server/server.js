import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('✅ SilentHelp Backend Server is running and listening for WebSockets!');
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ======= KONFIGURASI GEMINI AI =======
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function getAiSmartMessage(extraInfo) {
  if (!extraInfo || !GEMINI_API_KEY) return null;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Anda adalah asisten darurat. Rapikan pesan singkat dari korban berikut agar mudah dipahami relawan. Fokus pada detail lokasi dan ciri fisik. Buat sangat singkat (maks 20 kata). Pesan: "${extraInfo}"`
          }]
        }]
      })
    });

    console.log("Gemini API Status Code:", response.status);
    const data = await response.json();

    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
      let cleaned = data.candidates[0].content.parts[0].text;
      // Hapus karakter markdown seperti ** atau *
      cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '').trim();
      return cleaned;
    } else {
      console.error("Gemini API returned unexpected structure:", JSON.stringify(data));
      return null;
    }
  } catch (error) {
    console.error("Error saat menghubungi Gemini AI:", error);
    return null;
  }
}
// =====================================

// In-memory store for active users' locations
// Format: { socketId: { lat, lng, timestamp } }
const activeUsers = {};

// In-memory store for IP Rate Limiting (Anti-Spam)
// Format: { ipAddress: lastTimestamp }
const cooldowns = {};
const COOLDOWN_PERIOD_MS = 60 * 1000; // MVP: 1 Menit (Bisa diubah ke 24 jam nanti)

// In-memory store for ongoing SOS events (Persistence)
// Format: { senderId: { location, extraInfo, aiMessage, timestamp } }
const activeSOS = {};
const SOS_EXPIRATION_MS = 30 * 60 * 1000; // Sinyal aktif selama 30 menit

// Haversine formula to calculate distance in meters between two lat/lng points
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // When a user updates their live location
  socket.on('update_location', (data) => {
    if (data && data.lat && data.lng) {
      activeUsers[socket.id] = {
        clientId: data.clientId,
        lat: data.lat,
        lng: data.lng,
        timestamp: Date.now()
      };
      
      // ======= NEW: CEK SOS AKTIF DI SEKITAR =======
      // Saat pengguna update lokasi (termasuk saat baru buka web),
      // cek apakah ada SOS yang sedang berlangsung di radius 10KM.
      for (const [senderId, sosData] of Object.entries(activeSOS)) {
        // Hapus SOS jika sudah kadaluarsa
        if (Date.now() - new Date(sosData.timestamp).getTime() > SOS_EXPIRATION_MS) {
          delete activeSOS[senderId];
          continue;
        }

        // Jangan kirim ke pengirimnya sendiri (cek Client ID agar tahan refresh)
        if (sosData.clientId === data.clientId) continue;

        const distance = calculateDistanceMeters(data.lat, data.lng, sosData.location.lat, sosData.location.lng);
        if (distance <= 10000) {
          socket.emit('sos_alert', {
            clientId: sosData.clientId, // Tambahkan ini agar relawan tahu ID korbannya
            senderId: senderId,
            location: sosData.location,
            extraInfo: sosData.extraInfo,
            aiMessage: sosData.aiMessage,
            distance: Math.round(distance),
            message: "🚨 PERINGATAN: DARURAT MASIH BERLANGSUNG DI SEKITAR ANDA! 🚨",
            timestamp: sosData.timestamp
          });
        }
      }
      // ============================================
    }
  });

  // When a user triggers an SOS
  socket.on('trigger_sos', async (sosData) => {
    const clientIp = socket.handshake.address;

    // ======= ANTI-SPAM: IP RATE LIMITING =======
    if (cooldowns[clientIp]) {
      const timeElapsed = Date.now() - cooldowns[clientIp];
      if (timeElapsed < COOLDOWN_PERIOD_MS) {
        console.warn(`🚨 BLOCKED SPAM FROM IP ${clientIp}. Cooldown active.`);
        return; // Hentikan eksekusi, abaikan sinyal ini
      }
    }
    // Update cooldown timestamp
    cooldowns[clientIp] = Date.now();
    // ===========================================

    console.log(`🚨 SOS RECEIVED FROM ${socket.id} (IP: ${clientIp})`, sosData);

    // ======= PROSES PESAN PINTAR DENGAN AI =======
    const aiMessage = await getAiSmartMessage(sosData.extraInfo);
    if (aiMessage) console.log("🤖 Smart Message Generated:", aiMessage);
    // =============================================

    if (!sosData.location) {
      console.log("No location provided in SOS, cannot broadcast by radius.");
      return;
    }

    // ======= SIMPAN KE REGISTRY SOS AKTIF =======
    activeSOS[socket.id] = {
      clientId: sosData.clientId,
      location: sosData.location,
      extraInfo: sosData.extraInfo,
      aiMessage: aiMessage,
      timestamp: new Date().toISOString()
    };
    // ============================================

    const { lat, lng } = sosData.location;
    let notifiedCount = 0;

    // Loop through all active users to find who is within 10km
    for (const [userId, userLoc] of Object.entries(activeUsers)) {
      // Don't send SOS to the sender themselves
      if (userId === socket.id) continue;

      const distance = calculateDistanceMeters(lat, lng, userLoc.lat, userLoc.lng);

      // 10 KM = 10000 meters
      if (distance <= 10000) {
        console.log(`Broadcasting to ${userId} (Distance: ${Math.round(distance)}m)`);

        // Emit the SOS alert to this specific user
        io.to(userId).emit('sos_alert', {
          clientId: sosData.clientId,
          senderId: socket.id,
          location: sosData.location,
          extraInfo: sosData.extraInfo,
          aiMessage: aiMessage, // Kirim hasil AI ke relawan
          distance: Math.round(distance),
          message: "🚨 PENGGUNA DI DEKAT ANDA MEMBUTUHKAN BANTUAN! 🚨",
          timestamp: new Date().toISOString()
        });
        notifiedCount++;
      }
    }

    console.log(`Broadcasted SOS to ${notifiedCount} users within 10KM.`);
  });

  // When a victim wants to stop the SOS signal manually
  socket.on('deactivate_sos', (data) => {
    console.log(`SOS Deactivation requested by ${socket.id} (Client: ${data.clientId})`);
    
    const sosData = activeSOS[socket.id];
    
    // Pastikan hanya mematikan SOS miliknya sendiri berdasarkan koneksi socket ini
    if (sosData && sosData.clientId === data.clientId) {
      delete activeSOS[socket.id];
      // Broadcast ke semua relawan bahwa darurat dari koneksi ini telah selesai
      io.emit('sos_resolved', { clientId: data.clientId, socketId: socket.id });
      console.log(`SOS Signal from Socket ${socket.id} (Client ${data.clientId}) has been DEACTIVATED.`);
    } else {
      // Jika socket.id tidak cocok, cari manual (fallback untuk case refresh)
      for (const [sid, sdata] of Object.entries(activeSOS)) {
        if (sdata.clientId === data.clientId) {
           delete activeSOS[sid];
           io.emit('sos_resolved', { clientId: data.clientId, socketId: sid });
           console.log(`SOS Signal from Client ${data.clientId} (Fallback) has been DEACTIVATED.`);
           break; 
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete activeUsers[socket.id]; // Remove from active tracking
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`SilentHelp Backend Server running on port ${PORT}`);
});
