/**
 * Seed Script – Tuk-Tuk Tracker
 * Populates the database with:
 *   - 9 Sri Lanka provinces
 *   - 25 Sri Lanka districts
 *   - 25 police stations (one per district minimum)
 *   - 1 HQ admin user + provincial/station officers
 *   - 200 registered tuk-tuks
 *   - 1 week of realistic location history per tuk-tuk
 *
 * Run: node scripts/seed.js
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const mongoServerSelectionTimeoutMS = Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 30000);

// ─── Model imports ────────────────────────────────────────────────────────────
import Province from "../src/models/Province.js";
import District from "../src/models/District.js";
import PoliceStation from "../src/models/PoliceStation.js";
import User from "../src/models/User.js";
import TukTuk from "../src/models/TukTuk.js";
import LocationPing from "../src/models/LocationPing.js";
import Alert from "../src/models/Alert.js";
import Geofence from "../src/models/Geofence.js";
import AuditLog from "../src/models/AuditLog.js";
import fs from "fs";
import { hashDeviceKey, generateDeviceKey } from "../src/middleware/auth.js";

// ─── Helper utilities ─────────────────────────────────────────────────────────
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];

// Sri Lanka bounding box: lat 5.92–9.84, lng 79.65–81.88
const sriLankaBounds = { latMin: 5.92, latMax: 9.84, lngMin: 79.65, lngMax: 81.88 };

// Province-level approximate centres (lat, lng) for realistic vehicle positions
const provinceCentres = {
  "Western Province":       { lat: 7.0, lng: 80.0 },
  "Central Province":       { lat: 7.27, lng: 80.64 },
  "Southern Province":      { lat: 6.05, lng: 80.6 },
  "Northern Province":      { lat: 9.3, lng: 80.4 },
  "Eastern Province":       { lat: 7.8, lng: 81.6 },
  "North Western Province": { lat: 7.9, lng: 80.0 },
  "North Central Province": { lat: 8.3, lng: 80.4 },
  "Uva Province":           { lat: 6.8, lng: 81.0 },
  "Sabaragamuwa Province":  { lat: 6.7, lng: 80.35 },
};

// ─── Master data ──────────────────────────────────────────────────────────────
const PROVINCES = [
  { name: "Western Province",       code: "WP", capital: "Colombo" },
  { name: "Central Province",       code: "CP", capital: "Kandy" },
  { name: "Southern Province",      code: "SP", capital: "Galle" },
  { name: "Northern Province",      code: "NP", capital: "Jaffna" },
  { name: "Eastern Province",       code: "EP", capital: "Trincomalee" },
  { name: "North Western Province", code: "NWP", capital: "Kurunegala" },
  { name: "North Central Province", code: "NCP", capital: "Anuradhapura" },
  { name: "Uva Province",           code: "UP", capital: "Badulla" },
  { name: "Sabaragamuwa Province",  code: "SGP", capital: "Ratnapura" },
];

// district name → province code
const DISTRICTS = [
  // Western
  { name: "Colombo",      code: "CMB",  provinceCode: "WP"  },
  { name: "Gampaha",      code: "GAM",  provinceCode: "WP"  },
  { name: "Kalutara",     code: "KLT",  provinceCode: "WP"  },
  // Central
  { name: "Kandy",        code: "KDY",  provinceCode: "CP"  },
  { name: "Matale",       code: "MTL",  provinceCode: "CP"  },
  { name: "Nuwara Eliya", code: "NWE",  provinceCode: "CP"  },
  // Southern
  { name: "Galle",        code: "GAL",  provinceCode: "SP"  },
  { name: "Matara",       code: "MAT",  provinceCode: "SP"  },
  { name: "Hambantota",   code: "HBT",  provinceCode: "SP"  },
  // Northern
  { name: "Jaffna",       code: "JFN",  provinceCode: "NP"  },
  { name: "Kilinochchi",  code: "KLN",  provinceCode: "NP"  },
  { name: "Mannar",       code: "MNR",  provinceCode: "NP"  },
  { name: "Vavuniya",     code: "VVN",  provinceCode: "NP"  },
  { name: "Mullaitivu",   code: "MLT",  provinceCode: "NP"  },
  // Eastern
  { name: "Trincomalee",  code: "TRC",  provinceCode: "EP"  },
  { name: "Batticaloa",   code: "BTC",  provinceCode: "EP"  },
  { name: "Ampara",       code: "AMP",  provinceCode: "EP"  },
  // North Western
  { name: "Kurunegala",   code: "KRN",  provinceCode: "NWP" },
  { name: "Puttalam",     code: "PUT",  provinceCode: "NWP" },
  // North Central
  { name: "Anuradhapura", code: "AND",  provinceCode: "NCP" },
  { name: "Polonnaruwa",  code: "PLN",  provinceCode: "NCP" },
  // Uva
  { name: "Badulla",      code: "BDL",  provinceCode: "UP"  },
  { name: "Monaragala",   code: "MRG",  provinceCode: "UP"  },
  // Sabaragamuwa
  { name: "Ratnapura",    code: "RTP",  provinceCode: "SGP" },
  { name: "Kegalle",      code: "KEG",  provinceCode: "SGP" },
];

// 25+ police stations – at least one per district
const STATION_TEMPLATES = [
  { name: "Colombo Fort Police Station",     code: "PS-CMB-001", district: "Colombo",      phone: "011-2421111", lat: 6.9344, lng: 79.8428 },
  { name: "Wellawatte Police Station",       code: "PS-CMB-002", district: "Colombo",      phone: "011-2588888", lat: 6.8742, lng: 79.8617 },
  { name: "Gampaha Police Station",          code: "PS-GAM-001", district: "Gampaha",      phone: "033-2222222", lat: 7.0873, lng: 80.0110 },
  { name: "Negombo Police Station",          code: "PS-GAM-002", district: "Gampaha",      phone: "031-2222222", lat: 7.2094, lng: 79.8380 },
  { name: "Kalutara Police Station",         code: "PS-KLT-001", district: "Kalutara",     phone: "034-2222222", lat: 6.5851, lng: 79.9607 },
  { name: "Kandy Central Police Station",   code: "PS-KDY-001", district: "Kandy",        phone: "081-2222222", lat: 7.2960, lng: 80.6365 },
  { name: "Matale Police Station",           code: "PS-MTL-001", district: "Matale",       phone: "066-2222222", lat: 7.4667, lng: 80.6244 },
  { name: "Nuwara Eliya Police Station",     code: "PS-NWE-001", district: "Nuwara Eliya", phone: "052-2222222", lat: 6.9497, lng: 80.7891 },
  { name: "Galle Fort Police Station",       code: "PS-GAL-001", district: "Galle",        phone: "091-2222222", lat: 6.0324, lng: 80.2170 },
  { name: "Matara Police Station",           code: "PS-MAT-001", district: "Matara",       phone: "041-2222222", lat: 5.9496, lng: 80.5350 },
  { name: "Hambantota Police Station",       code: "PS-HBT-001", district: "Hambantota",   phone: "047-2222222", lat: 6.1241, lng: 81.1185 },
  { name: "Jaffna Police Station",           code: "PS-JFN-001", district: "Jaffna",       phone: "021-2222222", lat: 9.6615, lng: 80.0255 },
  { name: "Kilinochchi Police Station",      code: "PS-KLN-001", district: "Kilinochchi",  phone: "021-2285222", lat: 9.3803, lng: 80.3947 },
  { name: "Mannar Police Station",           code: "PS-MNR-001", district: "Mannar",       phone: "023-2222222", lat: 8.9810, lng: 79.9050 },
  { name: "Vavuniya Police Station",         code: "PS-VVN-001", district: "Vavuniya",     phone: "024-2222222", lat: 8.7514, lng: 80.4997 },
  { name: "Mullaitivu Police Station",       code: "PS-MLT-001", district: "Mullaitivu",   phone: "021-2290222", lat: 9.2672, lng: 80.8136 },
  { name: "Trincomalee Police Station",      code: "PS-TRC-001", district: "Trincomalee",  phone: "026-2222222", lat: 8.5874, lng: 81.2152 },
  { name: "Batticaloa Police Station",       code: "PS-BTC-001", district: "Batticaloa",   phone: "065-2222222", lat: 7.7170, lng: 81.6924 },
  { name: "Ampara Police Station",           code: "PS-AMP-001", district: "Ampara",       phone: "063-2222222", lat: 7.2996, lng: 81.6747 },
  { name: "Kurunegala Police Station",       code: "PS-KRN-001", district: "Kurunegala",   phone: "037-2222222", lat: 7.4867, lng: 80.3647 },
  { name: "Puttalam Police Station",         code: "PS-PUT-001", district: "Puttalam",     phone: "032-2222222", lat: 8.0362, lng: 79.8283 },
  { name: "Anuradhapura Police Station",     code: "PS-AND-001", district: "Anuradhapura", phone: "025-2222222", lat: 8.3114, lng: 80.4037 },
  { name: "Polonnaruwa Police Station",      code: "PS-PLN-001", district: "Polonnaruwa",  phone: "027-2222222", lat: 7.9401, lng: 81.0001 },
  { name: "Badulla Police Station",          code: "PS-BDL-001", district: "Badulla",      phone: "055-2222222", lat: 6.9934, lng: 81.0550 },
  { name: "Monaragala Police Station",       code: "PS-MRG-001", district: "Monaragala",   phone: "055-2276222", lat: 6.8726, lng: 81.3509 },
  { name: "Ratnapura Police Station",        code: "PS-RTP-001", district: "Ratnapura",    phone: "045-2222222", lat: 6.6827, lng: 80.3992 },
  { name: "Kegalle Police Station",          code: "PS-KEG-001", district: "Kegalle",      phone: "035-2222222", lat: 7.2513, lng: 80.3464 },
];

// First names and last names for realistic Sri Lankan driver names
const FIRST_NAMES = [
  "Kumara", "Nimal", "Sunil", "Ajith", "Pradeep", "Roshan", "Chaminda", "Tharaka",
  "Saman", "Kasun", "Dinesh", "Manoj", "Ruwan", "Isuru", "Chathura", "Nuwan",
  "Lasantha", "Thilina", "Dhanushka", "Asanka", "Mohamed", "Hassan", "Rajan",
  "Selvam", "Murugan", "Arjun", "Krishnan", "Sivam", "Balaji", "Vimal",
];
const LAST_NAMES = [
  "Perera", "Silva", "Fernando", "Jayawardena", "Wickramasinghe", "Gunawardena",
  "Rajapaksa", "Dissanayake", "Bandara", "Pathirana", "Kumara", "Mendis",
  "Karunaratne", "Amarasinghe", "Herath", "Senanayake", "Rathnayake",
  "Mohamed", "Ibrahim", "Hassan", "Pillai", "Shankar", "Rajan",
];

// Province plate prefix mapping
const PLATE_PREFIXES = {
  "WP": ["WP", "WP"],
  "CP": ["CP", "KY"],
  "SP": ["SP", "GL"],
  "NP": ["NP", "JF"],
  "EP": ["EP", "TC"],
  "NWP": ["NW", "KU"],
  "NCP": ["NC", "AN"],
  "UP": ["UV", "BD"],
  "SGP": ["SG", "RP"],
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const randomLetters = (n) => Array.from({ length: n }, () => pick(LETTERS.split(""))).join("");
const randomPlate = (provinceCode) => {
  const prefix = pick(PLATE_PREFIXES[provinceCode] || ["XX"]);
  return `${prefix} ${randomLetters(3)}-${randInt(1000, 9999)}`;
};

// ─── Generate NIC (simplified Sri Lankan format) ──────────────────────────────
let nicCounter = 100000000;
const nextNIC = () => `${nicCounter++}V`;

// ─── Realistic GPS history generator ─────────────────────────────────────────
// Each vehicle has a HOME (parked overnight) and a STAND (town-centre rank) inside
// its own district. Days follow a pattern:
//   home → stand → [wait → fare → (fare | back to stand)]* → lunch at stand → … → home
// with morning (07-09) and evening (16-19) peaks (shorter waits, more fares),
// ~half of Sundays off, occasional speeding, a few vehicles that go offline, and a
// few that run at night (an "unusual pattern" for investigators to find).
const LOCAL_OFFSET_MS = 5.5 * 3600 * 1000; // Asia/Colombo
const M_PER_DEG = 111320;
const STEP_SEC = Number(process.env.SEED_PING_INTERVAL_SEC || 120);
const SPEED_LIMIT = Number(process.env.SPEED_LIMIT_KMH || 60);

const localParts = (d) => {
  const l = new Date(d.getTime() + LOCAL_OFFSET_MS);
  return { hour: l.getUTCHours() + l.getUTCMinutes() / 60, dow: l.getUTCDay(), key: l.toISOString().slice(0, 10) };
};
const offsetPoint = (p, dxM, dyM) => ({
  lat: p.lat + dyM / M_PER_DEG,
  lng: p.lng + dxM / (M_PER_DEG * Math.cos((p.lat * Math.PI) / 180)),
});
const distM = (a, b) => Math.hypot((b.lat - a.lat) * M_PER_DEG, (b.lng - a.lng) * M_PER_DEG * Math.cos((a.lat * Math.PI) / 180));
const bearingDeg = (a, b) =>
  (Math.atan2((b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180 / Math.PI + 360) % 360;

/**
 * @param {object} v  { id, registrationNumber, province, district, base:{lat,lng}, stand?:{lat,lng},
 *                      days, stopAt?:Date, nightOps?:boolean, speeder?:boolean }
 * @returns {{pings:Array, alerts:Array}}
 */
const generateLocationHistory = (v) => {
  const now = new Date();
  const end = v.stopAt || now;
  const pings = [];
  const alerts = [];

  const home = offsetPoint(v.base, rand(-4000, 4000), rand(-4000, 4000));
  const stand = v.stand || offsetPoint(v.base, rand(-600, 600), rand(-600, 600));
  const shiftStart = rand(6.0, 8.0);
  const shiftEnd = rand(17.5, 20.5);
  const worksDay = {};
  const nightDays = new Set();

  let pos = { ...home };
  let mode = "parked"; // parked | toStand | waiting | fare | toHome
  let target = null;
  let waitUntil = 0;
  let speed = 0;
  let sinceLastPing = 1e9;
  let lastSpeedAlert = 0;

  let t = new Date(Math.floor((now.getTime() - v.days * 86400000) / (STEP_SEC * 1000)) * STEP_SEC * 1000);
  while (t <= end) {
    const lp = localParts(t);
    if (worksDay[lp.key] === undefined) {
      worksDay[lp.key] = lp.dow === 0 ? Math.random() < 0.5 : Math.random() < 0.95;
      if (v.nightOps && Math.random() < 0.35) nightDays.add(lp.key);
    }
    const peak = (lp.hour >= 7 && lp.hour < 9) || (lp.hour >= 16 && lp.hour < 19);
    const lunch = lp.hour >= 12.5 && lp.hour < 13.5;
    const nightShift = v.nightOps && nightDays.has(lp.key) && (lp.hour >= 23 || lp.hour < 3);
    const working = nightShift || (worksDay[lp.key] && lp.hour >= shiftStart && lp.hour < shiftEnd);

    // ── decide mode ──
    if (!working && (mode === "waiting" || mode === "fare" || mode === "toStand")) {
      mode = "toHome";
      target = home;
    } else if (working && (mode === "parked" || mode === "toHome")) {
      mode = "toStand";
      target = nightShift ? offsetPoint(pos, rand(-9000, 9000), rand(-9000, 9000)) : stand;
    }
    if (mode === "waiting" && t.getTime() >= waitUntil && !lunch) {
      mode = "fare";
      const dist = rand(1500, 8000);
      const ang = rand(0, 2 * Math.PI);
      target = offsetPoint(stand, Math.cos(ang) * dist, Math.sin(ang) * dist); // fares stay local to the stand
    }

    // ── move ──
    let moving = false;
    if (target && (mode === "toStand" || mode === "fare" || mode === "toHome")) {
      const want = mode === "fare" ? rand(18, 42) : rand(25, 38);
      speed = Math.max(0, speed + (want - speed) * 0.5 + rand(-3, 3));
      if (v.speeder && mode === "fare" && Math.random() < 0.04) speed = rand(72, 92);
      const stepM = (speed * 1000 / 3600) * STEP_SEC;
      const d = distM(pos, target);
      if (d <= stepM) {
        pos = { ...target };
        speed = 0;
        if (mode === "toHome") mode = "parked";
        else if (mode === "toStand") { mode = "waiting"; waitUntil = t.getTime() + (peak ? rand(1, 4) : rand(4, 15)) * 60000; }
        else {
          // fare finished: another fare from here (peak) or back to the stand
          if (Math.random() < (peak ? 0.55 : 0.25)) { mode = "waiting"; waitUntil = t.getTime() + rand(1, 3) * 60000; }
          else { mode = "toStand"; target = stand; }
        }
      } else {
        const b = bearingDeg(pos, target);
        const jitter = offsetPoint(pos, rand(-6, 6), rand(-6, 6)); // road wobble
        pos = offsetPoint(jitter, (Math.sin((b * Math.PI) / 180) * stepM), (Math.cos((b * Math.PI) / 180) * stepM));
        moving = true;
      }
    } else {
      speed = 0;
    }

    // ── emit ping (dense while moving, sparse while stationary) ──
    sinceLastPing += STEP_SEC;
    const interval = moving ? STEP_SEC : mode === "parked" ? 3600 : 600;
    if (sinceLastPing >= interval) {
      sinceLastPing = 0;
      const stationary = !moving;
      const p = stationary ? offsetPoint(pos, rand(-12, 12), rand(-12, 12)) : pos;
      const sp = stationary ? 0 : +speed.toFixed(1);
      pings.push({
        tukTuk: v.id,
        latitude: +p.lat.toFixed(6),
        longitude: +p.lng.toFixed(6),
        location: { type: "Point", coordinates: [+p.lng.toFixed(6), +p.lat.toFixed(6)] },
        speed: sp,
        heading: target && moving ? Math.round(bearingDeg(pos, target)) : randInt(0, 359),
        accuracy: +rand(3, 15).toFixed(1),
        timestamp: new Date(t),
        receivedAt: new Date(t),
      });
      if (sp > SPEED_LIMIT && t.getTime() - lastSpeedAlert > 5 * 60000) {
        lastSpeedAlert = t.getTime();
        alerts.push({
          tukTuk: v.id, type: "speeding", severity: sp > SPEED_LIMIT * 1.4 ? "critical" : "warning",
          message: `${v.registrationNumber} travelling at ${sp} km/h (limit ${SPEED_LIMIT} km/h).`,
          speed: sp, location: { type: "Point", coordinates: [+p.lng.toFixed(6), +p.lat.toFixed(6)] },
          timestamp: new Date(t), province: v.province, district: v.district,
        });
      }
    }
    t = new Date(t.getTime() + STEP_SEC * 1000);
  }
  return { pings, alerts };
};

// ─── Main seed function ───────────────────────────────────────────────────────
// Stand for the 4 Colombo Fort vehicles: within ~120 m of the station so a 300 m search finds them
const offsetPointExport = (p) => offsetPoint(p, rand(-120, 120), rand(-120, 120));

const seed = async () => {
  // Prefer a direct (non-`mongodb+srv`) URI when provided, since some environments
  // can fail during SRV DNS resolution.
  const mongoUri = process.env.MONGODB_URI_DIRECT || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Missing MongoDB URI. Set MONGODB_URI (and optionally MONGODB_URI_DIRECT) in .env");
  }
  try {
    await mongoose.connect(mongoUri, {
      autoIndex: true,
      serverSelectionTimeoutMS: mongoServerSelectionTimeoutMS,
      family: 4,
    });
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ Could not reach MongoDB.");
    console.error("   Check that your Atlas cluster is running, your current IP is whitelisted, and the URI in .env is correct.");
    console.error("   If you want to seed locally, point MONGODB_URI at mongodb://127.0.0.1:27017/tuktuk_tracker and start a local MongoDB server.");
    throw error;
  }

  // Clear existing data
  console.log("🗑  Clearing existing data...");
  // Drop collections to remove any stale indexes from older schema versions.
  // (Using `deleteMany` keeps indexes, which can cause duplicate-key errors.)
  await Promise.all([
    Province.collection.drop().catch(() => {}),
    District.collection.drop().catch(() => {}),
    PoliceStation.collection.drop().catch(() => {}),
    User.collection.drop().catch(() => {}),
    TukTuk.collection.drop().catch(() => {}),
    LocationPing.collection.drop().catch(() => {}),
    Alert.collection.drop().catch(() => {}),
    Geofence.collection.drop().catch(() => {}),
    AuditLog.collection.drop().catch(() => {}),
  ]);

  // ─── 1. Provinces ─────────────────────────────────────────────────────────
  console.log("🌍 Seeding provinces...");
  const provinces = await Province.insertMany(PROVINCES);
  const provinceMap = Object.fromEntries(provinces.map((p) => [p.code, p]));

  // ─── 2. Districts ─────────────────────────────────────────────────────────
  console.log("🗺  Seeding districts...");
  const districtDocs = DISTRICTS.map((d) => ({
    name: d.name,
    code: d.code,
    province: provinceMap[d.provinceCode]._id,
  }));
  const districts = await District.insertMany(districtDocs);
  const districtMap = Object.fromEntries(districts.map((d) => [d.name, d]));

  // ─── 3. Police Stations ───────────────────────────────────────────────────
  console.log("🚓 Seeding police stations...");
  const stationDocs = STATION_TEMPLATES.map((s) => ({
    name: s.name,
    stationCode: s.code,
    // Backward-compatibility: some existing Atlas databases may still have
    // an older unique index on `{ code: 1 }` from a previous schema version.
    // Setting `code` prevents duplicate `{ code: null }` insert failures.
    code: s.code,
    district: districtMap[s.district]._id,
    phone: s.phone,
    latitude: s.lat,
    longitude: s.lng,
    address: `${s.name}, ${s.district}, Sri Lanka`,
  }));
  const stations = await PoliceStation.insertMany(stationDocs);

  // ─── 4. Users ─────────────────────────────────────────────────────────────
  console.log("👤 Seeding users...");
  const DEMO_PASSWORD = process.env.SEED_PASSWORD || "1234";
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 12);

  // One account for every level of the hierarchy, so any province, district or station
  // can be demonstrated (all share the same demo password):
  //   1 HQ admin  +  1 admin per province  +  1 officer per district  +  1 officer per station
  const slug = (str) =>
    str.toLowerCase().replace(/ police station$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const domain = "police.lk";

  const userDocs = [
    { name: "HQ Administrator", email: `admin@${domain}`, password: hashedPassword, role: "hq_admin", isActive: true },
  ];

  // Provincial admins (wp.admin@, cp.admin@, sp.admin@, ... nwp.admin@, ncp.admin@, up.admin@, sgp.admin@)
  for (const prov of provinces) {
    userDocs.push({
      name: `${prov.name} Admin`,
      email: `${prov.code.toLowerCase()}.admin@${domain}`,
      password: hashedPassword,
      role: "provincial_admin",
      province: prov._id,
      isActive: true,
    });
  }

  // District officers (colombo.officer@, kandy.officer@, jaffna.officer@, ...) – scoped to the whole district
  for (const d of districts) {
    userDocs.push({
      name: `${d.name} District Officer`,
      email: `${slug(d.name)}.officer@${domain}`,
      password: hashedPassword,
      role: "station_officer",
      province: d.province,
      district: d._id,
      isActive: true,
    });
  }

  // Station officers (colombo-fort.station@, wellawatte.station@, ...) – tied to one police station;
  // data access is still scoped to the station's district.
  for (const st of stations) {
    const d = districts.find((x) => x._id.equals(st.district));
    userDocs.push({
      name: `${st.name.replace(/ Police Station$/, "")} Station Officer`,
      email: `${slug(st.name)}.station@${domain}`,
      password: hashedPassword,
      role: "station_officer",
      province: d.province,
      district: d._id,
      station: st._id,
      isActive: true,
    });
  }

  await User.insertMany(userDocs);
  console.log(`    \u2713 ${userDocs.length} users (1 HQ, ${provinces.length} provincial, ${districts.length} district officers, ${stations.length} station officers)`);

  // Account directory for the demo / report appendix (no passwords in it)
  const nameOf = (list, id) => (list.find((x) => id && x._id.equals(id)) || {}).name || "";
  fs.mkdirSync("simulation-data", { recursive: true });
  fs.writeFileSync(
    "simulation-data/demo-users.csv",
    ["email,name,role,province,district,station"]
      .concat(
        userDocs.map((u) =>
          [u.email, u.name, u.role, nameOf(provinces, u.province), nameOf(districts, u.district), nameOf(stations, u.station)]
            .map((v) => `"${v}"`)
            .join(",")
        )
      )
      .join("\n")
  );

  // ─── 5. Tuk-Tuks (200 vehicles) ───────────────────────────────────────────
  console.log("🛺 Seeding 200 tuk-tuks...");

  // Distribute vehicles proportionally across provinces
  const districtList = districts;
  const tukTukDocs = [];

  const COLOMBO_FORT = { lat: 6.9344, lng: 79.8428 }; // incident scenario location
  const colomboId = districtMap["Colombo"]._id;
  const deviceKeys = {};
  for (let i = 0; i < 200; i++) {
    // first 25 vehicles guarantee every district has at least one; 4 extra Colombo vehicles
    // share a stand at Colombo Fort (used by the "search-area" investigation demo)
    const district = i < 25 ? districtList[i] : i < 29 ? districtMap["Colombo"] : pick(districtList);
    const province = provinces.find((p) => p._id.equals(district.province));
    const station = stations.find((st) => st.district.equals(district._id));
    const statusOptions = ["active", "active", "active", "active", "inactive", "suspended"];
    const deviceId = `DEV-${String(i + 1).padStart(4, "0")}`;
    const key = generateDeviceKey();
    deviceKeys[deviceId] = key;

    tukTukDocs.push({
      registrationNumber: randomPlate(province.code),
      driverName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      driverNIC: nextNIC(),
      driverPhone: `07${randInt(0, 9)}${randInt(1000000, 9999999)}`,
      district: district._id,
      province: province._id,
      station: station?._id,
      deviceId,
      deviceKeyHash: hashDeviceKey(key),
      deviceKeyIssuedAt: new Date(),
      status: i >= 25 && i < 29 ? "active" : i < 25 ? "active" : pick(statusOptions),
      isActive: true,
      registeredAt: new Date(Date.now() - randInt(30, 730) * 24 * 60 * 60 * 1000),
    });
  }

  const tukTuks = await TukTuk.insertMany(tukTukDocs);
  console.log(`   ✓ ${tukTuks.length} tuk-tuks created`);

  // ─── 6. Location history (>= 8 days, relative to NOW – re-seed shortly before a demo) ──
  console.log("📍 Generating location history with daily patterns (this may take a minute)...");
  const districtCentre = (name) => {
    const st = STATION_TEMPLATES.filter((x) => x.district === name);
    return { lat: st.reduce((a, x) => a + x.lat, 0) / st.length, lng: st.reduce((a, x) => a + x.lng, 0) / st.length };
  };
  const districtById = Object.fromEntries(districts.map((d) => [String(d._id), d]));
  const activeIdx = tukTuks.map((t, i) => (t.status === "active" && i >= 29 ? i : -1)).filter((i) => i >= 0);
  const offlineSet = new Set(activeIdx.slice(0, 4));            // went silent 3h ago
  const nightSet = new Set(activeIdx.slice(4, 7));              // run at night (unusual pattern)
  const speederSet = new Set(activeIdx.slice(7, 12));           // occasionally speeding

  let totalPings = 0;
  let allAlerts = [];
  const BATCH_SIZE = 10;
  for (let i = 0; i < tukTuks.length; i += BATCH_SIZE) {
    const batch = tukTuks.slice(i, i + BATCH_SIZE);
    let buffer = [];
    for (let j = 0; j < batch.length; j++) {
      const idx = i + j;
      const tukTuk = batch[j];
      const dName = districtById[String(tukTuk.district)].name;
      const isFortVehicle = idx >= 25 && idx < 29;
      const { pings, alerts } = generateLocationHistory({
        id: tukTuk._id,
        registrationNumber: tukTuk.registrationNumber,
        province: tukTuk.province,
        district: tukTuk.district,
        base: isFortVehicle ? COLOMBO_FORT : districtCentre(dName),
        stand: isFortVehicle ? offsetPointExport(COLOMBO_FORT) : undefined,
        days: 8,
        stopAt: tukTuk.status !== "active" ? new Date(Date.now() - randInt(2, 5) * 86400000)
          : offlineSet.has(idx) ? new Date(Date.now() - 3 * 3600000) : undefined,
        nightOps: nightSet.has(idx),
        speeder: speederSet.has(idx),
      });
      buffer.push(...pings);
      allAlerts.push(...alerts);
      if (pings.length) {
        const last = pings[pings.length - 1];
        await TukTuk.updateOne(
          { _id: tukTuk._id },
          { $set: { lastLocation: { point: last.location, speed: last.speed, heading: last.heading, accuracy: last.accuracy, timestamp: last.timestamp }, lastSeenAt: last.timestamp } }
        );
      }
    }
    await LocationPing.insertMany(buffer, { ordered: false });
    totalPings += buffer.length;
    process.stdout.write(`\r    Inserted history for ${Math.min(i + BATCH_SIZE, tukTuks.length)}/${tukTuks.length} vehicles...`);
  }
  console.log(`\n    ✓ ${totalPings.toLocaleString()} location pings inserted`);

  // ─── 7. Alerts + geofences ────────────────────────────────────────────────
  if (allAlerts.length) await Alert.insertMany(allAlerts);
  await Geofence.insertMany([
    { name: "Colombo Fort restricted zone", type: "restricted", center: { type: "Point", coordinates: [79.8428, 6.9344] }, radiusMetres: 400, province: null, district: null },
    { name: "Kandy Sacred City zone", type: "restricted", center: { type: "Point", coordinates: [80.6411, 7.2936] }, radiusMetres: 350 },
  ]);
  console.log(`    ✓ ${allAlerts.length} speeding alerts, 2 geofences`);

  // ─── 8. Device credentials for the simulator (git-ignored) ───────────────
  fs.mkdirSync("simulation-data", { recursive: true });
  fs.writeFileSync("simulation-data/device-keys.json", JSON.stringify(deviceKeys, null, 2));
  console.log("    ✓ device keys written to simulation-data/device-keys.json (do NOT commit)");

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n✅ Seed complete!\n");
  console.log(`  Provinces:       ${await Province.countDocuments()}`);
  console.log(`  Districts:       ${await District.countDocuments()}`);
  console.log(`  Police Stations: ${await PoliceStation.countDocuments()}`);
  console.log(`  Users:           ${await User.countDocuments()}`);
  console.log(`  Tuk-Tuks:        ${await TukTuk.countDocuments()}`);
  console.log(`  Location Pings:  ${(await LocationPing.countDocuments()).toLocaleString()}`);
  console.log(`  Alerts:          ${await Alert.countDocuments()}`);
  console.log("\n🔑 Demo logins (override the password with SEED_PASSWORD):");
  console.log(`  HQ Admin:  admin@police.lk / ${DEMO_PASSWORD}`);
  console.log(`  WP Admin:  wp.admin@police.lk / ${DEMO_PASSWORD}`);
  console.log(`  District:  colombo.officer@police.lk / ${DEMO_PASSWORD}   (every district: <district>.officer@police.lk)`);
  console.log(`  Station:   colombo-fort.station@police.lk / ${DEMO_PASSWORD}   (every station: <station>.station@police.lk)`);
  console.log(`  Province:  sp.admin@police.lk, np.admin@police.lk ...                (every province: <code>.admin@police.lk)`);
  console.log("  Full list: simulation-data/demo-users.csv");
  console.log("\n🔎 Investigation demo: GET /api/locations/search-area?lat=6.9344&lng=79.8428&radius=300&from=<ISO>&to=<ISO>");

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
