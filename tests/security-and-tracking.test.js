/**
 * Security regression + tracking-feature tests.
 * Needs a MongoDB (MONGODB_URI_TEST / MONGODB_URI), same as api.test.js.
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
import Alert from "../src/models/Alert.js";
import Geofence from "../src/models/Geofence.js";
import { analyseTrack } from "../src/utils/trips.js";
import { haversineMetres } from "../src/utils/geo.js";

dotenv.config();
const PW = "SecTest#2026pass";
let prov, d1, d2, admin, officer1, officer2, adminToken, o1Token, o2Token, v1, v2, k1, fence;

const login = async (email) => (await request(app).post("/api/auth/login").send({ email, password: PW })).body.data.token;
const dev = (v, k) => ({ "X-Device-Id": v.deviceId, "X-Device-Key": k });

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI_TEST_DIRECT || process.env.MONGODB_URI_TEST || process.env.MONGODB_URI_DIRECT || process.env.MONGODB_URI, { family: 4 });
  await Promise.all([Province.deleteMany({ code: "SEC" }), User.deleteMany({ email: /@sec\.test$/ })]);
  prov = await Province.create({ name: "Sec Province", code: "SEC", capital: "X" });
  d1 = await District.create({ name: "Sec D1", code: "SD1", province: prov._id });
  d2 = await District.create({ name: "Sec D2", code: "SD2", province: prov._id });
  admin = await User.create({ name: "A", email: "admin@sec.test", password: PW, role: "hq_admin" });
  officer1 = await User.create({ name: "O1", email: "o1@sec.test", password: PW, role: "station_officer", province: prov._id, district: d1._id });
  officer2 = await User.create({ name: "O2", email: "o2@sec.test", password: PW, role: "station_officer", province: prov._id, district: d2._id });
  [adminToken, o1Token, o2Token] = await Promise.all([login("admin@sec.test"), login("o1@sec.test"), login("o2@sec.test")]);

  const mk = (n, d) =>
    request(app).post("/api/tuktuks").set("Authorization", `Bearer ${adminToken}`).send({
      registrationNumber: `SEC-${n}`, driverName: `Driver ${n}`, driverNIC: `19900000000${n}`, district: d._id,
    });
  const r1 = await mk(1, d1);
  const r2 = await mk(2, d2);
  v1 = r1.body.data; k1 = r1.body.device.deviceKey; v2 = r2.body.data;
});

afterAll(async () => {
  await TukTuk.deleteMany({ registrationNumber: /^SEC-/ });
  await LocationPing.deleteMany({ tukTuk: { $in: [v1?._id, v2?._id] } });
  await Alert.deleteMany({ tukTuk: { $in: [v1?._id, v2?._id] } });
  await Geofence.deleteMany({ name: /^SEC / });
  await District.deleteMany({ code: { $in: ["SD1", "SD2"] } });
  await Province.deleteMany({ code: "SEC" });
  await User.deleteMany({ email: /@sec\.test$/ });
  await mongoose.disconnect();
});

describe("Access control", () => {
  test("public /register is closed → 401", async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "x", email: "x@sec.test", password: PW, role: "hq_admin" });
    expect(res.status).toBe(401);
  });
  test("station_officer cannot create users → 403", async () => {
    const res = await request(app).post("/api/auth/register").set("Authorization", `Bearer ${o1Token}`).send({ name: "x", email: "x@sec.test", password: PW, role: "hq_admin" });
    expect(res.status).toBe(403);
  });
  test("weak password rejected → 422", async () => {
    const res = await request(app).post("/api/auth/register").set("Authorization", `Bearer ${adminToken}`).send({ name: "x", email: "w@sec.test", password: "short", role: "hq_admin" });
    expect(res.status).toBe(422);
  });
  test("officer cannot read a vehicle in another district (IDOR) → 404", async () => {
    for (const path of [`/api/tuktuks/${v2._id}`, `/api/tuktuks/${v2._id}/location`, `/api/tuktuks/${v2._id}/history`, `/api/tuktuks/${v2._id}/trips`]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${o1Token}`);
      expect(res.status).toBe(404);
    }
  });
  test("officer cannot register a vehicle outside own district → 403", async () => {
    const res = await request(app).post("/api/tuktuks").set("Authorization", `Bearer ${o1Token}`).send({
      registrationNumber: "SEC-9", driverName: "D", driverNIC: "199000000009", district: d2._id,
    });
    expect(res.status).toBe(403);
  });
  test("NoSQL operator injection in login is rejected → 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: { $gt: "" }, password: { $gt: "" } });
    expect(res.status).toBe(400);
  });
  test("query-operator injection cannot widen scope", async () => {
    const res = await request(app).get("/api/tuktuks?district[$ne]=x").set("Authorization", `Bearer ${o1Token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((t) => String(t.district._id) === String(d1._id))).toBe(true);
  });
  test("account locks after 5 failed logins → 423", async () => {
    let last;
    for (let i = 0; i < 6; i++) last = await request(app).post("/api/auth/login").send({ email: "o2@sec.test", password: "wrong" });
    expect(last.status).toBe(423);
  });
});

describe("Tracking features", () => {
  test("ping updates live view with online flag", async () => {
    const now = Date.now();
    await request(app).post("/api/locations/ping").set(dev(v1, k1)).send({ latitude: 6.9344, longitude: 79.8428, speed: 30, timestamp: new Date(now - 1000).toISOString() });
    const res = await request(app).get("/api/locations/live").set("Authorization", `Bearer ${o1Token}`);
    expect(res.status).toBe(200);
    const row = res.body.data.find((r) => r.registrationNumber === "SEC-1");
    expect(row.online).toBe(true);
    expect(res.body.data.find((r) => r.registrationNumber === "SEC-2")).toBeUndefined(); // other district hidden
  });
  test("live supports GeoJSON", async () => {
    const res = await request(app).get("/api/locations/live?format=geojson").set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.type).toBe("FeatureCollection");
  });
  test("nearby finds the vehicle within radius, sorted by distance", async () => {
    const res = await request(app).get("/api/locations/nearby?lat=6.9344&lng=79.8428&radius=1000").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((r) => r.registrationNumber === "SEC-1")).toBe(true);
  });
  test("speeding ping raises an alert", async () => {
    const res = await request(app).post("/api/locations/ping").set(dev(v1, k1)).send({ latitude: 6.935, longitude: 79.843, speed: 95 });
    expect(res.body.data.alertsRaised).toBe(1);
    const alerts = await request(app).get("/api/alerts?type=speeding").set("Authorization", `Bearer ${o1Token}`);
    expect(alerts.body.count).toBeGreaterThan(0);
  });
  test("geofence entry raises a critical alert", async () => {
    const g = await request(app).post("/api/geofences").set("Authorization", `Bearer ${adminToken}`).send({ name: "SEC zone", latitude: 7.2, longitude: 80.2, radiusMetres: 300 });
    expect(g.status).toBe(201);
    await request(app).post("/api/locations/ping").set(dev(v1, k1)).send({ latitude: 7.25, longitude: 80.2, speed: 10 }); // outside
    const inside = await request(app).post("/api/locations/ping").set(dev(v1, k1)).send({ latitude: 7.2, longitude: 80.2, speed: 10 });
    expect(inside.body.data.alertsRaised).toBe(1);
  });
  test("search-area returns vehicles seen in the circle and window", async () => {
    const from = new Date(Date.now() - 3600e3).toISOString();
    const to = new Date(Date.now() + 60e3).toISOString();
    const res = await request(app).get(`/api/locations/search-area?lat=6.9344&lng=79.8428&radius=500&from=${from}&to=${to}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((r) => r.registrationNumber === "SEC-1")).toBe(true);
  });
  test("history rejects windows over 31 days → 422", async () => {
    const res = await request(app).get(`/api/locations/history?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });
  test("trips endpoint + route GeoJSON respond", async () => {
    const trips = await request(app).get(`/api/tuktuks/${v1._id}/trips`).set("Authorization", `Bearer ${o1Token}`);
    expect(trips.status).toBe(200);
    expect(trips.body.data.summary.pingCount).toBeGreaterThan(0);
    const route = await request(app).get(`/api/tuktuks/${v1._id}/route`).set("Authorization", `Bearer ${o1Token}`);
    expect(route.body.geometry.type).toBe("LineString");
  });
  test("rotating the device key revokes the old key", async () => {
    const rot = await request(app).post(`/api/tuktuks/${v1._id}/device-key`).set("Authorization", `Bearer ${adminToken}`);
    expect(rot.status).toBe(200);
    const old = await request(app).post("/api/locations/ping").set(dev(v1, k1)).send({ latitude: 6.9, longitude: 79.8 });
    expect(old.status).toBe(401);
    k1 = rot.body.device.deviceKey;
  });
  test("suspended vehicle's device is refused → 403", async () => {
    await request(app).patch(`/api/tuktuks/${v1._id}/status`).set("Authorization", `Bearer ${adminToken}`).send({ status: "suspended" });
    const res = await request(app).post("/api/locations/ping").set(dev(v1, k1)).send({ latitude: 6.9, longitude: 79.8 });
    expect(res.status).toBe(403);
  });
  test("deleting a vehicle is a soft delete – history is preserved", async () => {
    await request(app).delete(`/api/tuktuks/${v2._id}`).set("Authorization", `Bearer ${adminToken}`);
    const doc = await TukTuk.findById(v2._id);
    expect(doc.isActive).toBe(false);
  });
});

describe("Pure helpers", () => {
  test("haversine: Colombo Fort → Wellawatte ≈ 7 km", () => {
    const d = haversineMetres({ latitude: 6.9344, longitude: 79.8428 }, { latitude: 6.8742, longitude: 79.8617 });
    expect(d).toBeGreaterThan(6500);
    expect(d).toBeLessThan(7500);
  });
  test("analyseTrack splits two trips around a 10-minute stop", () => {
    const t0 = Date.parse("2026-01-01T08:00:00Z");
    const mk = (min, lat, speed) => ({ latitude: lat, longitude: 80, speed, timestamp: new Date(t0 + min * 60000) });
    const pings = [mk(0, 7.0, 0), mk(2, 7.005, 30), mk(4, 7.01, 30), mk(6, 7.01, 0), mk(16, 7.01, 0), mk(18, 7.015, 30), mk(20, 7.02, 30), mk(30, 7.02, 0)];
    const r = analyseTrack(pings);
    expect(r.trips.length).toBe(2);
    expect(r.stops.length).toBeGreaterThanOrEqual(1);
    expect(r.summary.totalDistanceKm).toBeGreaterThan(2);
  });
});
