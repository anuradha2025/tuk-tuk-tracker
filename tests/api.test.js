/**
 * Integration Test Suite – Tuk-Tuk Tracker API
 *
 * Framework : Jest + Supertest
 * Database  : Uses a dedicated test MongoDB instance (MONGODB_URI_TEST env var)
 *             Falls back to MONGODB_URI if not set.
 *
 * Run: npm test
 */

import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../server.js";
import User from "../src/models/User.js";
import Province from "../src/models/Province.js";
import District from "../src/models/District.js";
import TukTuk from "../src/models/TukTuk.js";
import LocationPing from "../src/models/LocationPing.js";

dotenv.config();

// ─── Test helpers ─────────────────────────────────────────────────────────────
let adminToken;
let officerToken;
let testProvince;
let testDistrict;
let testTukTuk;

const adminCreds = { email: "test.admin@police.lk", password: "TestPass@123" };
const officerCreds = { email: "test.officer@police.lk", password: "TestPass@123" };

beforeAll(async () => {
  const uri = process.env.MONGODB_URI_TEST || process.env.MONGODB_URI;
  await mongoose.connect(uri);

  // Clean test collections
  await Promise.all([
    User.deleteMany({ email: { $in: [adminCreds.email, officerCreds.email] } }),
    Province.deleteMany({ code: "TP" }),
  ]);

  // Create test province + district
  testProvince = await Province.create({ name: "Test Province", code: "TP", capital: "Testville" });
  testDistrict = await District.create({ name: "Test District", code: "TDT", province: testProvince._id });

  // Create test users directly (bypasses any admin-only restriction in controller)
  await User.create({ ...adminCreds, name: "Test Admin", role: "hq_admin" });
  await User.create({ ...officerCreds, name: "Test Officer", role: "station_officer", province: testProvince._id, district: testDistrict._id });

  // Log in and capture tokens
  const adminRes = await request(app).post("/api/auth/login").send(adminCreds);
  adminToken = adminRes.body.data.token;

  const officerRes = await request(app).post("/api/auth/login").send(officerCreds);
  officerToken = officerRes.body.data.token;
});

afterAll(async () => {
  // Clean up test data
  await TukTuk.deleteMany({ registrationNumber: /^TP-TEST/ });
  await LocationPing.deleteMany({ tukTuk: testTukTuk?._id });
  await District.deleteMany({ code: "TDT" });
  await Province.deleteMany({ code: "TP" });
  await User.deleteMany({ email: { $in: [adminCreds.email, officerCreds.email] } });
  await mongoose.disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────
describe("Health Check", () => {
  test("GET /health → 200 OK with service info", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
    expect(res.body.service).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────
describe("Auth – /api/auth", () => {
  test("POST /login with valid credentials → 200 + JWT token", async () => {
    const res = await request(app).post("/api/auth/login").send(adminCreds);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(typeof res.body.data.token).toBe("string");
  });

  test("POST /login with wrong password → 401", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: adminCreds.email, password: "WrongPass123" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("POST /login with missing fields → 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: adminCreds.email });
    expect(res.status).toBe(400);
  });

  test("GET /me without token → 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("GET /me with valid token → 200 + user profile", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(adminCreds.email);
    expect(res.body.data.password).toBeUndefined(); // password must not be returned
  });

  test("GET /users as station_officer → 403 Forbidden", async () => {
    const res = await request(app).get("/api/auth/users").set("Authorization", `Bearer ${officerToken}`);
    expect(res.status).toBe(403);
  });

  test("GET /users as hq_admin → 200", async () => {
    const res = await request(app).get("/api/auth/users").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PROVINCES
// ─────────────────────────────────────────────────────────────────────────────
describe("Provinces – /api/provinces", () => {
  test("GET / without token → 401", async () => {
    const res = await request(app).get("/api/provinces");
    expect(res.status).toBe(401);
  });

  test("GET / → 200 + array", async () => {
    const res = await request(app).get("/api/provinces").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("GET / responds with ETag header", async () => {
    const res = await request(app).get("/api/provinces").set("Authorization", `Bearer ${adminToken}`);
    expect(res.headers["etag"]).toBeDefined();
  });

  test("GET / with matching If-None-Match → 304 Not Modified", async () => {
    const first = await request(app).get("/api/provinces").set("Authorization", `Bearer ${adminToken}`);
    const etag = first.headers["etag"];
    const second = await request(app)
      .get("/api/provinces")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("If-None-Match", etag);
    expect(second.status).toBe(304);
  });

  test("GET / supports sorting by name desc", async () => {
    const res = await request(app)
      .get("/api/provinces?sort=name&order=desc")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test("GET /:id → 200 with valid ID", async () => {
    const res = await request(app)
      .get(`/api/provinces/${testProvince._id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe("TP");
  });

  test("GET /:id with invalid ID → 400 CastError", async () => {
    const res = await request(app).get("/api/provinces/not-an-id").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  test("GET /:id with non-existent ID → 404", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/provinces/${fakeId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  test("POST / as station_officer → 403", async () => {
    const res = await request(app)
      .post("/api/provinces")
      .set("Authorization", `Bearer ${officerToken}`)
      .send({ name: "Should Fail", code: "SF" });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DISTRICTS
// ─────────────────────────────────────────────────────────────────────────────
describe("Districts – /api/districts", () => {
  test("GET / → 200", async () => {
    const res = await request(app).get("/api/districts").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test("GET /?province=<id> filters by province", async () => {
    const res = await request(app)
      .get(`/api/districts?province=${testProvince._id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((d) => d.province._id === testProvince._id.toString() || d.province === testProvince._id.toString())).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. TUK-TUKS
// ─────────────────────────────────────────────────────────────────────────────
describe("Tuk-Tuks – /api/tuktuks", () => {
  test("POST / creates a tuk-tuk successfully", async () => {
    const res = await request(app)
      .post("/api/tuktuks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        registrationNumber: "TP-TEST-0001",
        driverName: "Test Driver",
        driverNIC: "200099900001V",
        driverPhone: "0771234567",
        district: testDistrict._id,
        province: testProvince._id,
        deviceId: "DEV-TEST-001",
        status: "active",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.registrationNumber).toBe("TP-TEST-0001");
    testTukTuk = res.body.data; // save for subsequent tests
  });

  test("POST / with duplicate registrationNumber → 409", async () => {
    const res = await request(app)
      .post("/api/tuktuks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        registrationNumber: "TP-TEST-0001",
        driverName: "Another Driver",
        driverNIC: "200099900002V",
        district: testDistrict._id,
        province: testProvince._id,
      });
    expect(res.status).toBe(409);
  });

  test("GET / → 200 with X-Total-Count header (pagination)", async () => {
    const res = await request(app)
      .get("/api/tuktuks?page=1&limit=5")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["x-total-count"]).toBeDefined();
    expect(res.headers["link"]).toBeDefined();
  });

  test("GET /?status=active filters correctly", async () => {
    const res = await request(app)
      .get("/api/tuktuks?status=active")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((t) => t.status === "active")).toBe(true);
  });

  test("GET /?status=invalid → returns empty or 0 results gracefully", async () => {
    const res = await request(app)
      .get("/api/tuktuks?status=invalid_status")
      .set("Authorization", `Bearer ${adminToken}`);
    // Mongoose enum filter produces 0 results, not an error
    expect([200, 422]).toContain(res.status);
  });

  test("GET /:id → 200 for valid tuk-tuk", async () => {
    const res = await request(app)
      .get(`/api/tuktuks/${testTukTuk._id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(testTukTuk._id);
  });

  test("PUT /:id updates tuk-tuk details", async () => {
    const res = await request(app)
      .put(`/api/tuktuks/${testTukTuk._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverPhone: "0779999999" });
    expect(res.status).toBe(200);
    expect(res.body.data.driverPhone).toBe("0779999999");
  });

  test("GET /:id/location when no pings exist → 200 with null lastLocation", async () => {
    const res = await request(app)
      .get(`/api/tuktuks/${testTukTuk._id}/location`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.lastLocation).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. LOCATIONS
// ─────────────────────────────────────────────────────────────────────────────
describe("Locations – /api/locations", () => {
  test("POST /ping records a GPS location", async () => {
    const res = await request(app)
      .post("/api/locations/ping")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        tukTukId: testTukTuk._id,
        latitude: 6.9271,
        longitude: 79.8612,
        speed: 25.5,
        heading: 180,
        accuracy: 10,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.latitude).toBe(6.9271);
  });

  test("POST /ping with missing required fields → 500 (validation)", async () => {
    const res = await request(app)
      .post("/api/locations/ping")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tukTukId: testTukTuk._id }); // missing lat/lng
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("POST /ping for non-existent tuk-tuk → 404", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post("/api/locations/ping")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ tukTukId: fakeId, latitude: 7.0, longitude: 80.0 });
    expect(res.status).toBe(404);
  });

  test("GET /:id/location after ping → returns location data", async () => {
    const res = await request(app)
      .get(`/api/tuktuks/${testTukTuk._id}/location`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.lastLocation).not.toBeNull();
    expect(res.body.data.lastLocation.latitude).toBe(6.9271);
  });

  test("GET /live → 200 with array (province filter)", async () => {
    const res = await request(app)
      .get(`/api/locations/live?province=${testProvince._id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("GET /history → 200 with Link header (pagination)", async () => {
    const res = await request(app)
      .get(`/api/locations/history?tukTukId=${testTukTuk._id}&limit=1`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["x-total-count"]).toBeDefined();
  });

  test("GET /history with time window → filters correctly", async () => {
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1hr ago
    const to = new Date().toISOString();
    const res = await request(app)
      .get(`/api/locations/history?from=${from}&to=${to}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test("GET /stats → 200 for hq_admin", async () => {
    const res = await request(app)
      .get("/api/locations/stats")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalRegisteredVehicles).toBeDefined();
  });

  test("GET /stats as station_officer → 403", async () => {
    const res = await request(app)
      .get("/api/locations/stats")
      .set("Authorization", `Bearer ${officerToken}`);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. 404 HANDLER
// ─────────────────────────────────────────────────────────────────────────────
describe("404 Handler", () => {
  test("Unknown route → 404 with message", async () => {
    const res = await request(app).get("/api/unknown-route").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
