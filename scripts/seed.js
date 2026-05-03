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

// ─── Simulate a realistic GPS trail ──────────────────────────────────────────
/**
 * Generates ~1 week of location pings for a vehicle.
 * Simulates parked periods (night), short trips, and movement.
 */
const generateLocationHistory = (tukTukId, baseLat, baseLng, daysBack = 8) => {
  const pings = [];
  const now = new Date();
  const startTime = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

  let currentTime = new Date(startTime);
  let currentLat = baseLat + rand(-0.05, 0.05);
  let currentLng = baseLng + rand(-0.05, 0.05);

  while (currentTime <= now) {
    const hour = currentTime.getHours();

    // Night time (22:00–05:00): vehicle is parked, sparse pings
    if (hour >= 22 || hour < 5) {
      // One ping every 30 minutes while parked
      pings.push({
        tukTuk: tukTukId,
        latitude: +(currentLat + rand(-0.001, 0.001)).toFixed(6),
        longitude: +(currentLng + rand(-0.001, 0.001)).toFixed(6),
        speed: 0,
        heading: randInt(0, 360),
        accuracy: rand(5, 15),
        timestamp: new Date(currentTime),
      });
      currentTime = new Date(currentTime.getTime() + 30 * 60 * 1000);
    } else {
      // Daytime: active movement, ping every 2–5 minutes
      const speed = rand(0, 45); // 0–45 km/h
      const heading = randInt(0, 360);
      const headingRad = (heading * Math.PI) / 180;

      // Move vehicle based on speed and heading
      const distanceDeg = (speed / 3600) * (5 / 111000); // approximate degrees per ping interval
      currentLat += distanceDeg * Math.cos(headingRad) + rand(-0.0002, 0.0002);
      currentLng += distanceDeg * Math.sin(headingRad) + rand(-0.0002, 0.0002);

      // Clamp to Sri Lanka bounds
      currentLat = Math.max(sriLankaBounds.latMin, Math.min(sriLankaBounds.latMax, currentLat));
      currentLng = Math.max(sriLankaBounds.lngMin, Math.min(sriLankaBounds.lngMax, currentLng));

      pings.push({
        tukTuk: tukTukId,
        latitude: +currentLat.toFixed(6),
        longitude: +currentLng.toFixed(6),
        speed: +speed.toFixed(1),
        heading,
        accuracy: rand(3, 20),
        timestamp: new Date(currentTime),
      });

      currentTime = new Date(currentTime.getTime() + randInt(2, 5) * 60 * 1000);
    }
  }

  return pings;
};

// ─── Main seed function ───────────────────────────────────────────────────────
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
  await PoliceStation.insertMany(stationDocs);

  // ─── 4. Users ─────────────────────────────────────────────────────────────
  console.log("👤 Seeding users...");
  const hashedPassword = await bcrypt.hash("Password@123", 12);

  const userDocs = [
    {
      name: "HQ Administrator",
      email: "admin@police.lk",
      password: hashedPassword,
      role: "hq_admin",
      isActive: true,
    },
    {
      name: "Western Province Admin",
      email: "wp.admin@police.lk",
      password: hashedPassword,
      role: "provincial_admin",
      province: provinceMap["WP"]._id,
      isActive: true,
    },
    {
      name: "Central Province Admin",
      email: "cp.admin@police.lk",
      password: hashedPassword,
      role: "provincial_admin",
      province: provinceMap["CP"]._id,
      isActive: true,
    },
    {
      name: "Colombo Station Officer",
      email: "colombo.officer@police.lk",
      password: hashedPassword,
      role: "station_officer",
      province: provinceMap["WP"]._id,
      district: districtMap["Colombo"]._id,
      isActive: true,
    },
    {
      name: "Kandy Station Officer",
      email: "kandy.officer@police.lk",
      password: hashedPassword,
      role: "station_officer",
      province: provinceMap["CP"]._id,
      district: districtMap["Kandy"]._id,
      isActive: true,
    },
  ];

  await User.insertMany(userDocs);

  // ─── 5. Tuk-Tuks (200 vehicles) ───────────────────────────────────────────
  console.log("🛺 Seeding 200 tuk-tuks...");

  // Distribute vehicles proportionally across provinces
  const districtList = districts;
  const tukTukDocs = [];

  for (let i = 0; i < 200; i++) {
    const district = pick(districtList);
    const province = provinces.find((p) => p._id.equals(district.province));
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const statusOptions = ["active", "active", "active", "inactive", "suspended"];

    tukTukDocs.push({
      registrationNumber: randomPlate(province.code),
      driverName: `${firstName} ${lastName}`,
      driverNIC: nextNIC(),
      driverPhone: `07${randInt(0, 9)}${randInt(1000000, 9999999)}`,
      district: district._id,
      province: province._id,
      deviceId: `DEV-${String(i + 1).padStart(4, "0")}`,
      status: pick(statusOptions),
      isActive: true,
      registeredAt: new Date(Date.now() - randInt(30, 730) * 24 * 60 * 60 * 1000),
    });
  }

  const tukTuks = await TukTuk.insertMany(tukTukDocs);
  console.log(`   ✓ ${tukTuks.length} tuk-tuks created`);

  // ─── 6. Location History (1 week per vehicle) ─────────────────────────────
  console.log("📍 Generating 1-week location history (this may take a minute)...");

  let totalPings = 0;
  const BATCH_SIZE = 20; // Insert 20 vehicles' pings at a time

  for (let i = 0; i < tukTuks.length; i += BATCH_SIZE) {
    const batch = tukTuks.slice(i, i + BATCH_SIZE);
    const allPings = [];

    for (const tukTuk of batch) {
      const province = provinces.find((p) => p._id.equals(tukTuk.province));
      const centre = provinceCentres[province.name] || { lat: 7.0, lng: 80.5 };

      // Skip suspended/inactive vehicles (sparse history)
      const daysBack = tukTuk.status === "active" ? 8 : randInt(1, 3);
      const pings = generateLocationHistory(tukTuk._id, centre.lat, centre.lng, daysBack);
      allPings.push(...pings);
    }

    await LocationPing.insertMany(allPings, { ordered: false });
    totalPings += allPings.length;
    process.stdout.write(`\r   ✓ Inserted ${i + Math.min(BATCH_SIZE, tukTuks.length - i)}/${tukTuks.length} vehicles' history...`);
  }

  console.log(`\n   ✓ ${totalPings.toLocaleString()} total location pings inserted`);

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n🎉 Seed complete!");
  console.log("─────────────────────────────────────────");
  console.log(`  Provinces:       ${await Province.countDocuments()}`);
  console.log(`  Districts:       ${await District.countDocuments()}`);
  console.log(`  Police Stations: ${await PoliceStation.countDocuments()}`);
  console.log(`  Users:           ${await User.countDocuments()}`);
  console.log(`  Tuk-Tuks:        ${await TukTuk.countDocuments()}`);
  console.log(`  Location Pings:  ${(await LocationPing.countDocuments()).toLocaleString()}`);
  console.log("─────────────────────────────────────────");
  console.log("\n🔑 Default login credentials:");
  console.log("  HQ Admin:  admin@police.lk / Password@123");
  console.log("  WP Admin:  wp.admin@police.lk / Password@123");
  console.log("  Officer:   colombo.officer@police.lk / Password@123");

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
