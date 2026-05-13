const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Database ---
let db;
// Use persistent volume on cloud platforms, fallback to local
const DB_PATH = process.env.DB_PATH ||
  (process.env.RENDER ? '/data/tracker.db' : path.join(__dirname, 'tracker.db'));

async function initDB() {
  const SQL = await initSqlJs();
  const exists = fs.existsSync(DB_PATH);
  if (exists) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3498db',
    speed REAL DEFAULT 0.0005,
    active INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT REFERENCES devices(id),
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    speed REAL DEFAULT 0,
    heading REAL DEFAULT 0,
    timestamp TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS geofences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    radius REAL NOT NULL,
    color TEXT DEFAULT '#e74c3c'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    active INTEGER DEFAULT 1
  )`);

  // Seed default devices if empty
  const count = db.exec('SELECT COUNT(*) as c FROM devices')[0];
  if (!count || count.values[0][0] === 0) {
    const defaults = [
      ['dev-1', 'iPhone - Pace', '#e74c3c', 0.0003],
      ['dev-2', 'Samsung - Lisa', '#3498db', 0.0005],
      ['dev-3', 'Pixel - Car', '#2ecc71', 0.0008],
      ['dev-4', 'iPad - Bike', '#f39c12', 0.0004],
    ];
    for (const [id, name, color, speed] of defaults) {
      db.run('INSERT INTO devices (id, name, color, speed) VALUES (?, ?, ?, ?)', [id, name, color, speed]);
    }
  }

  // Create active session if none
  const sessCount = db.exec('SELECT COUNT(*) as c FROM sessions WHERE active = 1')[0];
  if (!sessCount || sessCount.values[0][0] === 0) {
    const now = new Date().toISOString();
    db.run('INSERT INTO sessions (name, started_at, active) VALUES (?, ?, 1)', ['Session ' + now.slice(0, 19), now]);
  }

  saveDB();
  console.log('[DB] Initialized');
}

function saveDB() {
  if (db) {
    const buf = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(buf));
  }
}

// --- In-memory state ---
let devices = {}; // id -> { id, name, lat, lng, speed, angle, color }
let geofences = [];
let trailHistory = {}; // deviceId -> [{lat, lng, timestamp}]

function loadDevices() {
  const rows = db.exec('SELECT id, name, color, speed, active FROM devices WHERE active = 1')[0];
  if (!rows) return;
  devices = {};
  for (const [id, name, color, speed] of rows.values) {
    // Load last known position or set default
    const lastPos = db.exec(`SELECT lat, lng FROM positions WHERE device_id = '${id}' ORDER BY id DESC LIMIT 1`);
    let lat, lng;
    if (lastPos && lastPos.values.length > 0) {
      [lat, lng] = lastPos.values[0];
    } else {
      // Random start around Jakarta
      lat = -6.15 - Math.random() * 0.1;
      lng = 106.78 + Math.random() * 0.1;
    }
    devices[id] = { id, name, lat, lng, speed, angle: Math.random() * 360, color };
    trailHistory[id] = [];
  }
  console.log(`[Devices] Loaded ${Object.keys(devices).length} devices`);
}

function loadGeofences() {
  const rows = db.exec('SELECT id, name, lat, lng, radius, color FROM geofences')[0];
  geofences = [];
  if (rows) {
    for (const [id, name, lat, lng, radius, color] of rows.values) {
      geofences.push({ id, name, lat, lng, radius, color });
    }
  }
  console.log(`[Geofences] Loaded ${geofences.length} zones`);
}

// --- GPS Simulator ---
function updatePositions() {
  const session = db.exec('SELECT id FROM sessions WHERE active = 1 LIMIT 1')[0];
  if (!session || session.values.length === 0) return;

  const now = new Date().toISOString();
  const alerts = [];

  for (const id in devices) {
    const d = devices[id];
    d.angle += (Math.random() - 0.5) * 30;
    const rad = (d.angle * Math.PI) / 180;
    d.lat += Math.cos(rad) * d.speed;
    d.lng += Math.sin(rad) * d.speed;
    d.lat = Math.max(-6.30, Math.min(-6.10, d.lat));
    d.lng = Math.max(106.75, Math.min(106.95, d.lng));

    // Save position
    db.run('INSERT INTO positions (device_id, lat, lng, speed, heading, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [id, d.lat, d.lng, d.speed * 1000, d.angle, now]);

    // Trail history (keep last 200 points per device)
    if (!trailHistory[id]) trailHistory[id] = [];
    trailHistory[id].push({ lat: d.lat, lng: d.lng, timestamp: now });
    if (trailHistory[id].length > 200) trailHistory[id].shift();

    // Geofence check
    for (const gf of geofences) {
      const dist = haversine(d.lat, d.lng, gf.lat, gf.lng);
      const wasInside = d._lastGeofence?.[gf.id] || false;
      const isInside = dist <= gf.radius;
      if (wasInside && !isInside) {
        alerts.push({ type: 'exit', device: d.name, geofence: gf.name, lat: d.lat, lng: d.lng });
      } else if (!wasInside && isInside) {
        alerts.push({ type: 'enter', device: d.name, geofence: gf.name, lat: d.lat, lng: d.lng });
      }
      d._lastGeofence = d._lastGeofence || {};
      d._lastGeofence[gf.id] = isInside;
    }
  }

  saveDB();
  broadcast(alerts);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// --- WebSocket broadcast ---
function broadcast(alerts = []) {
  const payload = JSON.stringify({
    type: 'positions',
    devices: Object.values(devices).map(d => ({
      id: d.id, name: d.name, lat: +d.lat.toFixed(6), lng: +d.lng.toFixed(6),
      color: d.color, speed: +(d.speed * 1000).toFixed(1), heading: +d.angle.toFixed(1),
      timestamp: new Date().toISOString(),
    })),
    trails: trailHistory,
    geofences,
    alerts,
  });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

setInterval(() => { updatePositions(); }, 1500);

// --- HTTP API ---

// GET /api/devices
app.get('/api/devices', (req, res) => {
  const rows = db.exec('SELECT id, name, color, speed, active FROM devices')[0];
  const devs = rows ? rows.values.map(r => ({ id: r[0], name: r[1], color: r[2], speed: r[3], active: r[4] })) : [];
  res.json(devs);
});

// POST /api/devices
app.post('/api/devices', (req, res) => {
  const { id, name, color, speed } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  try {
    db.run('INSERT OR REPLACE INTO devices (id, name, color, speed, active) VALUES (?, ?, ?, ?, 1)',
      [id, name, color || '#3498db', speed || 0.0005]);
    saveDB();
    loadDevices();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/devices/:id
app.delete('/api/devices/:id', (req, res) => {
  db.run('UPDATE devices SET active = 0 WHERE id = ?', [req.params.id]);
  saveDB();
  loadDevices();
  res.json({ ok: true });
});

// POST /api/report — device reports its location
app.post('/api/report', (req, res) => {
  const { device_id, lat, lng, speed, heading } = req.body;
  if (!device_id || lat == null || lng == null) return res.status(400).json({ error: 'device_id, lat, lng required' });

  const now = new Date().toISOString();
  db.run('INSERT INTO positions (device_id, lat, lng, speed, heading, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    [device_id, lat, lng, speed || 0, heading || 0, now]);

  // Update in-memory
  if (devices[device_id]) {
    devices[device_id].lat = lat;
    devices[device_id].lng = lng;
    if (!trailHistory[device_id]) trailHistory[device_id] = [];
    trailHistory[device_id].push({ lat, lng, timestamp: now });
    if (trailHistory[device_id].length > 200) trailHistory[device_id].shift();
  }

  saveDB();
  broadcast();
  res.json({ ok: true });
});

// GET /api/geofences
app.get('/api/geofences', (req, res) => {
  const rows = db.exec('SELECT id, name, lat, lng, radius, color FROM geofences')[0];
  res.json(rows ? rows.values.map(r => ({ id: r[0], name: r[1], lat: r[2], lng: r[3], radius: r[4], color: r[5] })) : []);
});

// POST /api/geofences
app.post('/api/geofences', (req, res) => {
  const { name, lat, lng, radius, color } = req.body;
  if (!name || lat == null || lng == null || radius == null) return res.status(400).json({ error: 'name, lat, lng, radius required' });
  db.run('INSERT INTO geofences (name, lat, lng, radius, color) VALUES (?, ?, ?, ?, ?)',
    [name, lat, lng, radius, color || '#e74c3c']);
  saveDB();
  loadGeofences();
  res.json({ ok: true });
});

// DELETE /api/geofences/:id
app.delete('/api/geofences/:id', (req, res) => {
  db.run('DELETE FROM geofences WHERE id = ?', [req.params.id]);
  saveDB();
  loadGeofences();
  res.json({ ok: true });
});

// GET /api/stats — statistics dashboard
app.get('/api/stats', (req, res) => {
  const stats = {};
  const devices = db.exec('SELECT id, name FROM devices WHERE active = 1')[0];
  if (devices) {
    for (const [id, name] of devices.values) {
      const pos = db.exec(`SELECT COUNT(*), MIN(timestamp), MAX(timestamp), AVG(speed), MIN(lat), MAX(lat), MIN(lng), MAX(lng) FROM positions WHERE device_id = '${id}'`)[0];
      if (pos && pos.values[0]) {
        const v = pos.values[0];
        const dLat = (v[5] - v[4]) * 111000;
        const dLng = (v[7] - v[6]) * 111000 * Math.cos(v[4] * Math.PI / 180);
        const dist = Math.sqrt(dLat**2 + dLng**2);
        stats[id] = {
          name,
          totalPoints: v[0],
          firstSeen: v[1],
          lastSeen: v[2],
          avgSpeed: +(v[3]).toFixed(2),
          distanceM: +dist.toFixed(0),
          latRange: [v[4], v[5]],
          lngRange: [v[6], v[7]],
        };
      }
    }
  }
  res.json(stats);
});

// GET /api/playback?session_id=1
app.get('/api/playback', (req, res) => {
  const points = db.exec(`SELECT p.device_id, d.name, p.lat, p.lng, p.timestamp FROM positions p JOIN devices d ON p.device_id = d.id ORDER BY p.timestamp ASC LIMIT 500`);
  const result = points && points[0] ? points[0].values.map(r => ({
    device_id: r[0], name: r[1], lat: r[2], lng: r[3], timestamp: r[4]
  })) : [];
  res.json(result);
});

// GET /api/sessions
app.get('/api/sessions', (req, res) => {
  const rows = db.exec('SELECT id, name, started_at, ended_at, active FROM sessions ORDER BY id DESC LIMIT 20')[0];
  res.json(rows ? rows.values.map(r => ({ id: r[0], name: r[1], started_at: r[2], ended_at: r[3], active: r[4] })) : []);
});

// --- WebSocket connections ---
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  broadcast();
  ws.on('close', () => console.log('[WS] Client disconnected'));
});

// --- Start ---
const PORT = process.env.PORT || 3000;

initDB().then(() => {
  loadDevices();
  loadGeofences();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
    console.log(`Network access: http://10.46.156.105:${PORT}`);
  });
});
