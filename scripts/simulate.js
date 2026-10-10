/**
 * Live device simulator – every tuk-tuk acts as an independent GPS device.
 *
 *  - Authenticates like real hardware: X-Device-Id + X-Device-Key (from simulation-data/device-keys.json,
 *    created by `npm run seed`). It does NOT use an admin login.
 *  - Starts each vehicle at its last known position and drives it toward random destinations.
 *  - Randomly drops signal for a vehicle, then uploads the buffered fixes via /ping/batch.
 *
 * Usage:  node scripts/simulate.js            (env: API_URL, PING_EVERY_SEC=10, SIM_PASSWORD)
 */
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const API_URL = process.env.API_URL || "http://localhost:3000";
const EVERY_SEC = Number(process.env.PING_EVERY_SEC || 10);
const ADMIN_EMAIL = process.env.SIM_EMAIL || "admin@police.lk";
const ADMIN_PASSWORD = process.env.SIM_PASSWORD || process.env.SEED_PASSWORD || "1234";
const keys = JSON.parse(fs.readFileSync("simulation-data/device-keys.json", "utf8"));

const rand = (a, b) => Math.random() * (b - a) + a;
const M = 111320;
const bearing = (a, b) => (Math.atan2((b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI;
const dist = (a, b) => Math.hypot((b.lat - a.lat) * M, (b.lng - a.lng) * M * Math.cos((a.lat * Math.PI) / 180));

const post = (path, headers, body) =>
  fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

// Admin login is used ONLY to discover which vehicles exist and where they last were.
const discover = async () => {
  const login = await post("/api/auth/login", {}, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const j = await login.json();
  if (!j.success) throw new Error(`Login failed: ${j.message}`);
  const res = await fetch(`${API_URL}/api/locations/live?limit=500`, { headers: { Authorization: `Bearer ${j.data.token}` } });
  return (await res.json()).data;
};

const main = async () => {
  const live = await discover();
  const sims = live
    .map((v) => {
      return { name: v.registrationNumber, pos: { lat: v.latitude, lng: v.longitude }, speed: 0, dest: null, buffer: [], offlineUntil: 0 };
    })


  // vehicle -> deviceId mapping via the registry
  const login = await (await post("/api/auth/login", {}, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })).json();
  const reg = await (await fetch(`${API_URL}/api/tuktuks?status=active&limit=200`, { headers: { Authorization: `Bearer ${login.data.token}` } })).json();
  const byReg = Object.fromEntries(reg.data.map((t) => [t.registrationNumber, t.deviceId]));
  sims.forEach((s) => (s.deviceId = byReg[s.name]));
  const fleet = sims.filter((s) => s.deviceId && keys[s.deviceId]);
  console.log(`🛺 Simulating ${fleet.length} devices → ${API_URL}, one fix every ${EVERY_SEC}s each (Ctrl+C to stop)`);

  let rounds = 0;
  setInterval(async () => {
    rounds++;
    await Promise.allSettled(
      fleet.map(async (s) => {
        if (!s.dest || dist(s.pos, s.dest) < 40) {
          const d = rand(1000, 6000), a = rand(0, 2 * Math.PI);
          s.dest = { lat: s.pos.lat + (Math.sin(a) * d) / M, lng: s.pos.lng + (Math.cos(a) * d) / (M * Math.cos((s.pos.lat * Math.PI) / 180)) };
        }
        s.speed = Math.max(0, Math.min(50, s.speed + rand(-6, 8)));
        const step = ((s.speed * 1000) / 3600) * EVERY_SEC;
        const b = (bearing(s.pos, s.dest) * Math.PI) / 180;
        s.pos = { lat: s.pos.lat + (Math.cos(b) * step) / M, lng: s.pos.lng + (Math.sin(b) * step) / (M * Math.cos((s.pos.lat * Math.PI) / 180)) };
        const fix = {
          latitude: +s.pos.lat.toFixed(6), longitude: +s.pos.lng.toFixed(6),
          speed: +s.speed.toFixed(1), heading: Math.round((bearing(s.pos, s.dest) + 360) % 360),
          accuracy: +rand(3, 12).toFixed(1), timestamp: new Date().toISOString(),
        };
        const headers = { "X-Device-Id": s.deviceId, "X-Device-Key": keys[s.deviceId] };

        // ~1% chance per tick to lose signal for 1–3 minutes; buffer, then batch-upload
        if (Date.now() < s.offlineUntil) { s.buffer.push(fix); return; }
        if (!s.buffer.length && Math.random() < 0.01) { s.offlineUntil = Date.now() + rand(60, 180) * 1000; s.buffer.push(fix); return; }
        if (s.buffer.length) {
          const r = await post("/api/locations/ping/batch", headers, { pings: [...s.buffer, fix].slice(-100) });
          if (r.ok) s.buffer = [];
          return;
        }
        await post("/api/locations/ping", headers, fix);
      })
    );
    process.stdout.write(`\r📍 round ${rounds} – ${fleet.length} devices reported`);
  }, EVERY_SEC * 1000);
};

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
