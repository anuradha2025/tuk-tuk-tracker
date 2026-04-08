/**
 * Simulation Script – Continuously sends live GPS pings for active tuk-tuks
 * Demonstrates real-time tracking without requiring physical devices.
 *
 * Usage:
 *   node scripts/simulate.js
 *
 * Requires:
 *   - API running at process.env.API_URL (default: http://localhost:3000)
 *   - At least one user seeded (uses admin@police.lk)
 */

import dotenv from "dotenv";
dotenv.config();

const API_URL = process.env.API_URL || "http://localhost:3000";
const PING_INTERVAL_MS = 5000; // 5 seconds between rounds
const MAX_VEHICLES_PER_ROUND = 10; // ping 10 vehicles per interval

const sriLankaBounds = { latMin: 5.92, latMax: 9.84, lngMin: 79.65, lngMax: 81.88 };
const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

// In-memory state: vehicle positions
const vehicleState = {};

// ─── Step 1: Login to get JWT ────────────────────────────────────────────────
const login = async () => {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@police.lk", password: "Password@123" }),
  });
  const data = await res.json();
  if (!data.success) throw new Error("Login failed: " + data.message);
  console.log("✅ Logged in as HQ Admin");
  return data.data.token;
};

// ─── Step 2: Fetch active tuk-tuks ───────────────────────────────────────────
const fetchActiveTukTuks = async (token) => {
  const res = await fetch(`${API_URL}/api/tuktuks?status=active&limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success) throw new Error("Failed to fetch tuk-tuks: " + data.message);
  console.log(`🛺 Found ${data.data.length} active tuk-tuks to simulate`);
  return data.data;
};

// ─── Step 3: Initialise vehicle state ────────────────────────────────────────
const initVehicleState = (tukTuks) => {
  for (const t of tukTuks) {
    vehicleState[t._id] = {
      lat: rand(sriLankaBounds.latMin, sriLankaBounds.latMax),
      lng: rand(sriLankaBounds.lngMin, sriLankaBounds.lngMax),
      heading: rand(0, 360),
      speed: rand(10, 40),
    };
  }
};

// ─── Step 4: Send a ping for one vehicle ─────────────────────────────────────
const sendPing = async (token, tukTukId) => {
  const state = vehicleState[tukTukId];

  // Simulate movement
  const headingRad = (state.heading * Math.PI) / 180;
  state.speed = clamp(state.speed + rand(-5, 5), 0, 50);
  state.heading = (state.heading + rand(-15, 15) + 360) % 360;

  const moveDistance = (state.speed / 3600) * (5 / 111000);
  state.lat = clamp(state.lat + moveDistance * Math.cos(headingRad), sriLankaBounds.latMin, sriLankaBounds.latMax);
  state.lng = clamp(state.lng + moveDistance * Math.sin(headingRad), sriLankaBounds.lngMin, sriLankaBounds.lngMax);

  await fetch(`${API_URL}/api/locations/ping`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tukTukId,
      latitude: +state.lat.toFixed(6),
      longitude: +state.lng.toFixed(6),
      speed: +state.speed.toFixed(1),
      heading: +state.heading.toFixed(0),
      accuracy: +rand(3, 15).toFixed(1),
    }),
  });
};

// ─── Main simulation loop ─────────────────────────────────────────────────────
const simulate = async () => {
  console.log("🚀 Starting Tuk-Tuk Tracker Simulation");
  console.log(`📡 API: ${API_URL}`);
  console.log(`⏱  Ping interval: ${PING_INTERVAL_MS / 1000}s | Vehicles/round: ${MAX_VEHICLES_PER_ROUND}`);
  console.log("Press Ctrl+C to stop\n");

  const token = await login();
  const tukTuks = await fetchActiveTukTuks(token);
  initVehicleState(tukTuks);

  const ids = tukTuks.map((t) => t._id);
  let round = 0;
  let offset = 0;

  const loop = setInterval(async () => {
    round++;
    const batch = ids.slice(offset, offset + MAX_VEHICLES_PER_ROUND);
    offset = (offset + MAX_VEHICLES_PER_ROUND) % ids.length;

    await Promise.allSettled(batch.map((id) => sendPing(token, id)));
    process.stdout.write(`\r📍 Round ${round} | Pinged ${batch.length} vehicles | Total rounds: ${round}`);
  }, PING_INTERVAL_MS);

  process.on("SIGINT", () => {
    clearInterval(loop);
    console.log("\n\n🛑 Simulation stopped.");
    process.exit(0);
  });
};

simulate().catch((err) => {
  console.error("❌ Simulation error:", err.message);
  process.exit(1);
});
