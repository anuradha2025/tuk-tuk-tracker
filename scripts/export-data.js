/**
 * Export Simulation Data
 *
 * Assessment deliverable: "Simulation Data: Generated data for the demonstration. In JSON or CSV."
 *
 * This script connects to MongoDB, exports the seeded data, and writes:
 *   - simulation-data/provinces.json
 *   - simulation-data/districts.json
 *   - simulation-data/police_stations.json
 *   - simulation-data/tuktuks.json
 *   - simulation-data/tuktuks.csv
 *   - simulation-data/location_pings_sample.json  (latest 500 pings)
 *   - simulation-data/location_pings_sample.csv
 *
 * Run: npm run export-data
 */

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

import Province from "../src/models/Province.js";
import District from "../src/models/District.js";
import PoliceStation from "../src/models/PoliceStation.js";
import TukTuk from "../src/models/TukTuk.js";
import LocationPing from "../src/models/LocationPing.js";

const OUTPUT_DIR = "./simulation-data";

// ─── CSV helper ───────────────────────────────────────────────────────────────
const toCSV = (rows, columns) => {
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const str = String(v).replace(/"/g, '""');
    return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
  };
  const header = columns.join(",");
  const body = rows.map((row) => columns.map((col) => escape(row[col])).join(",")).join("\n");
  return `${header}\n${body}`;
};

const writeJSON = (filename, data) => {
  const fp = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
  console.log(`  ✓ ${filename} (${Array.isArray(data) ? data.length + " records" : "object"})`);
};

const writeCSV = (filename, rows, columns) => {
  const fp = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(fp, toCSV(rows, columns), "utf8");
  console.log(`  ✓ ${filename} (${rows.length} records)`);
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const exportData = async () => {
  // Prefer a direct (non-`mongodb+srv`) URI when provided, since some
  // environments can fail during SRV DNS resolution.
  const mongoUri = process.env.MONGODB_URI_DIRECT || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Missing MongoDB URI. Set MONGODB_URI (and optionally MONGODB_URI_DIRECT) in .env");
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log("✅ Connected to MongoDB\n📦 Exporting simulation data...\n");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // ── Provinces ──────────────────────────────────────────────────────────────
  const provinces = await Province.find().lean();
  writeJSON("provinces.json", provinces);

  // ── Districts ─────────────────────────────────────────────────────────────
  const districts = await District.find().populate("province", "name code").lean();
  writeJSON("districts.json", districts);

  // ── Police Stations ───────────────────────────────────────────────────────
  const stations = await PoliceStation.find()
    .populate({ path: "district", select: "name code", populate: { path: "province", select: "name code" } })
    .lean();
  writeJSON("police_stations.json", stations);

  // ── Tuk-Tuks (JSON + CSV) ─────────────────────────────────────────────────
  const tukTuks = await TukTuk.find()
    .populate("province", "name code")
    .populate("district", "name code")
    .lean();
  writeJSON("tuktuks.json", tukTuks);

  const tukTukRows = tukTuks.map((t) => ({
    _id: t._id.toString(),
    registrationNumber: t.registrationNumber,
    driverName: t.driverName,
    driverNIC: t.driverNIC,
    driverPhone: t.driverPhone,
    province: t.province?.name,
    district: t.district?.name,
    deviceId: t.deviceId,
    status: t.status,
    registeredAt: t.registeredAt,
  }));
  writeCSV("tuktuks.csv", tukTukRows, [
    "_id", "registrationNumber", "driverName", "driverNIC",
    "driverPhone", "province", "district", "deviceId", "status", "registeredAt",
  ]);

  // ── Location Pings – latest 500 (sample for submission) ──────────────────
  const pings = await LocationPing.find()
    .sort({ timestamp: -1 })
    .limit(500)
    .populate("tukTuk", "registrationNumber")
    .lean();
  writeJSON("location_pings_sample.json", pings);

  const pingRows = pings.map((p) => ({
    _id: p._id.toString(),
    tukTukId: p.tukTuk?._id?.toString(),
    registrationNumber: p.tukTuk?.registrationNumber,
    latitude: p.latitude,
    longitude: p.longitude,
    speed: p.speed,
    heading: p.heading,
    accuracy: p.accuracy,
    timestamp: p.timestamp,
  }));
  writeCSV("location_pings_sample.csv", pingRows, [
    "_id", "tukTukId", "registrationNumber",
    "latitude", "longitude", "speed", "heading", "accuracy", "timestamp",
  ]);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n✅ Export complete → ./${OUTPUT_DIR}/`);
  console.log(`   Provinces: ${provinces.length}`);
  console.log(`   Districts: ${districts.length}`);
  console.log(`   Police Stations: ${stations.length}`);
  console.log(`   Tuk-Tuks: ${tukTuks.length}`);
  console.log(`   Location Pings (sample): ${pings.length}`);

  await mongoose.disconnect();
  process.exit(0);
};

exportData().catch((err) => {
  console.error("❌ Export failed:", err.message);
  process.exit(1);
});
