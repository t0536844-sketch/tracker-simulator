# 📡 Phone Tracker Simulator v2

Aplikasi simulasi pelacakan perangkat secara real-time dengan peta interaktif. **100% simulasi** — tidak melacak device sungguhan.

## 🚀 Instalasi

```bash
cd ~/tracker-simulator
npm install
node server.js
```

Server berjalan di **http://localhost:3000**

---

## 📖 Tutorial Lengkap

### 1. 🗺️ Tab MAP — Live Tracking

Saat pertama kali dibuka, kamu langsung lihat:
- **4 device marker** yang bergerak otomatis di peta
- **Garis jejak (trail)** berwarna mengikuti jalur pergerakan
- **Sidebar** di kanan menampilkan info: nama, koordinat, kecepatan, waktu update

Marker bercahaya dengan **pulse animation** — semakin cepat device bergerak, semakin sering pulsanya.

### 2. 📱 Tab DEVICES — Kelola Perangkat

**Tambah device baru:**
1. Buka tab **Devices**
2. Isi form:
   - **ID** — unik, contoh: `dev-5`
   - **Name** — nama tampilan, contoh: `HP Budi`
   - **Color** — pilih warna marker
   - **Speed** — kecepatan simulasi (0.0001 = lambat, 0.01 = cepat)
3. Klik **+ Add Device**

**Hapus device:**
- Klik tombol **Remove** di card device yang mau dihapus

> Device yang ditambahkan otomatis muncul di peta dan mulai bergerak.

### 3. 📊 Tab STATS — Dashboard Statistik

Menampilkan per-device:
- **Points** — jumlah titik GPS yang tercatat
- **Distance** — estimasi jarak tempuh (meter)
- **Avg Speed** — kecepatan rata-rata (m/s)
- **Last seen** — waktu update terakhir

Data otomatis terupdate setiap beberapa detik dari database.

### 4. 🚧 Tab GEOFENCE — Buat Zona Peringatan

**Cara buat geofence zone:**
1. Buka tab **Geofence**
2. Isi **Zone Name** (contoh: "Kantor")
3. Atur **Radius** dalam meter (contoh: 500)
4. Pilih **Color** untuk zona
5. Klik **📐 Draw Zone on Map**
6. **Klik di peta** pada titik yang jadi pusat zona

**Apa yang terjadi:**
- Lingkaran zona muncul di peta
- Setiap device masuk/keluar zona → muncul **toast notification**:
  - 🟢 **Entered** — device masuk zona
  - 🔴 **Left** — device keluar zona

**Hapus zona:**
- Klik **Delete** di card zona panel geofence

### 5. ⏪ Tab PLAYBACK — Putar Ulang Sejarah

**Cara pakai:**
1. Buka tab **Playback**
2. Atur **speed slider** (1x - 50x)
3. Klik **▶ Play** untuk mulai
4. Klik **⏸ Pause** untuk jeda
5. Klik **⏹ Stop** untuk reset

Playback menampilkan seluruh history pergerakan dari database, titik per titik. Marker akan bergerak mengikuti jalur yang pernah dilalui.

### 6. 🎮 Tab DRAG — Mode Interaktif

**Cara pakai:**
1. Buka tab **Drag**
2. Klik **🔧 Enable Drag**
3. **Drag marker** di peta ke posisi yang kamu mau
4. Klik **🔧 Disable Drag** untuk keluar mode

Saat kamu drag marker, posisi baru otomatis tersimpan ke database dan trail history diperbarui.

---

## 🔌 API Reference

Semua endpoint bisa diakses via `http://localhost:3000`

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/devices` | List semua device |
| `POST` | `/api/devices` | Tambah device `{id, name, color, speed}` |
| `DELETE` | `/api/devices/:id` | Hapus device |
| `GET` | `/api/geofences` | List semua zona |
| `POST` | `/api/geofences` | Buat zona `{name, lat, lng, radius, color}` |
| `DELETE` | `/api/geofences/:id` | Hapus zona |
| `GET` | `/api/stats` | Statistik semua device |
| `GET` | `/api/playback` | History posisi untuk playback |
| `POST` | `/api/report` | Device kirim posisi `{device_id, lat, lng}` |

### Contoh: Report Posisi dari Device Lain

```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{"device_id":"dev-1","lat":-6.2000,"lng":106.8166}'
```

Ini berguna kalau kamu punya device/app lain yang mau kirim koordinat ke simulator ini.

---

## 🗄️ Database

Data tersimpan di `tracker.db` (SQLite via sql.js):

| Table | Isi |
|---|---|
| `devices` | Daftar perangkat |
| `positions` | History posisi GPS |
| `geofences` | Zona geofencing |
| `sessions` | Sesi tracking |

File database otomatis persist — data tidak hilang saat server restart.

---

## ⚙️ Struktur Project

```
tracker-simulator/
├── server.js          # Backend: Express + WebSocket + SQLite
├── public/
│   └── index.html     # Frontend: Leaflet map + UI
├── tracker.db         # Database SQLite (auto-created)
├── package.json
└── README.md          # Tutorial ini
```

---

## 🛑 Stop Server

```bash
kill $(pgrep -f "node server.js")
```

---

## ☁️ Deploy ke Cloud (Gratis)

### Deploy ke Render (Recommended)

1. **Push kode ke GitHub:**
   ```bash
   cd ~/tracker-simulator
   git init
   git add .
   git commit -m "Initial commit: Tracker Simulator v2"
   git branch -M main
   git remote add origin https://github.com/USERNAME-PAKE/tracker-simulator.git
   git push -u origin main
   ```

2. **Buka [render.com](https://render.com) → Login dengan GitHub**

3. **New Web Service → Connect repo GitHub**

4. **Isi:**
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment Variable:** `DB_PATH=/data/tracker.db`

5. **Add Disk:** Klik "Add Disk" → Mount Path: `/data` → Size: `1GB`

6. **Deploy!** → Server live di `https://tracker-simulator-xxxx.onrender.com`

> ⚠️ Render free tier: server sleep setelah 15 menit tidak ada traffic (auto-wake saat diakses)

### Deploy ke Railway

1. Buka [railway.app](https://railway.app) → Login GitHub
2. **New Project → Deploy from GitHub repo**
3. Otomatis detect Node.js → deploy langsung jalan
4. Set env var: `DB_PATH=/app/data/tracker.db`

### Deploy ke Glitch

1. Buka [glitch.com](https://glitch.com) → **New Project → Import from GitHub**
2. Masukkan URL repo GitHub
3. Otomatis running!

---

## 📱 Akses dari Mana Saja

Setelah deploy ke cloud:
- **Tracker:** `https://your-app.onrender.com`
- **Reporter:** `https://your-app.onrender.com/report.html`
- **Share:** `https://your-app.onrender.com/share.html`

Bisa diakses dari HP mana saja di seluruh dunia! 🌍
