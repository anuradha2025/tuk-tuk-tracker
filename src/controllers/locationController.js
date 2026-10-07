import mongoose from "mongoose";
import LocationPing from "../models/LocationPing.js";
import TukTuk from "../models/TukTuk.js";
import Alert from "../models/Alert.js";
import { setPaginationHeaders } from "../utils/pagination.js";
import { scopeFilter } from "../utils/scope.js";
import { startOfDayColombo } from "../utils/geo.js";
import { evaluatePing } from "../services/alertService.js";

const ONLINE_MINUTES = Number(process.env.ONLINE_THRESHOLD_MINUTES || 10);
const MAX_FUTURE_MS = 5 * 60 * 1000; // tolerate small device clock drift
const MAX_BATCH_AGE_MS = 7 * 24 * 3600 * 1000; // offline buffering limit
const MAX_HISTORY_WINDOW_DAYS = 31;
const oid = (v) => new mongoose.Types.ObjectId(v);
const clampInt = (v, def, min, max) => Math.min(Math.max(parseInt(v, 10) || def, min), max);

// Builds the persisted ping from a validated payload; returns {error} for stale/future timestamps.
const buildPing = (vehicleId, p, maxAgeMs) => {
  const ts = p.timestamp ? new Date(p.timestamp) : new Date();
  const now = Date.now();
  if (ts.getTime() > now + MAX_FUTURE_MS) return { error: "timestamp is in the future" };
  if (ts.getTime() < now - maxAgeMs) return { error: "timestamp is too old" };
  return {
    ping: {
      tukTuk: vehicleId,
      latitude: p.latitude,
      longitude: p.longitude,
      location: { type: "Point", coordinates: [p.longitude, p.latitude] },
      speed: p.speed ?? 0,
      heading: p.heading ?? 0,
      accuracy: p.accuracy ?? null,
      timestamp: ts,
      receivedAt: new Date(),
    },
  };
};

// Moves the vehicle's denormalised "last known location" forward – never backwards,
// so late/out-of-order pings (offline buffering) cannot overwrite a newer fix.
const advanceLastLocation = async (vehicle, ping) => {
  const previous = vehicle.lastLocation;
  await TukTuk.updateOne(
    {
      _id: vehicle._id,
      $or: [{ "lastLocation.timestamp": { $exists: false } }, { "lastLocation.timestamp": { $lt: ping.timestamp } }],
    },
    {
      $set: {
        lastLocation: {
          point: ping.location,
          speed: ping.speed,
          heading: ping.heading,
          accuracy: ping.accuracy,
          timestamp: ping.timestamp,
        },
      },
    }
  );
  await TukTuk.updateOne({ _id: vehicle._id }, { $set: { lastSeenAt: new Date() } });
  return previous;
};

// ─── POST /api/locations/ping  (device) ───────────────────────────────────────
export const submitPing = async (req, res, next) => {
  try {
    const vehicle = req.device;
    const { ping, error } = buildPing(vehicle._id, req.body, MAX_FUTURE_MS + 60 * 60 * 1000);
    if (error) return res.status(422).json({ success: false, message: `Rejected: ${error}.` });

    const doc = await LocationPing.create(ping);
    const previous = await advanceLastLocation(vehicle, ping);
    const isNewest = !previous || previous.timestamp < ping.timestamp;
    const alerts = isNewest ? await evaluatePing(vehicle, ping, previous) : 0;

    res.status(201).json({
      success: true,
      message: "Location ping recorded.",
      data: { id: doc._id, timestamp: doc.timestamp, alertsRaised: alerts },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/locations/ping/batch  (device) ─────────────────────────────────
// Devices lose signal; they buffer fixes and upload them together later.
export const submitBatch = async (req, res, next) => {
  try {
    const vehicle = req.device;
    const accepted = [];
    const rejected = [];
    req.body.pings.forEach((p, index) => {
      const r = buildPing(vehicle._id, p, MAX_BATCH_AGE_MS);
      if (r.error) rejected.push({ index, reason: r.error });
      else accepted.push(r.ping);
    });

    if (accepted.length) {
      await LocationPing.insertMany(accepted, { ordered: false });
      const newest = accepted.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
      const previous = await advanceLastLocation(vehicle, newest);
      if (!previous || previous.timestamp < newest.timestamp) await evaluatePing(vehicle, newest, previous);
    }
    res.status(accepted.length ? 201 : 422).json({
      success: accepted.length > 0,
      message: `${accepted.length} accepted, ${rejected.length} rejected.`,
      data: { accepted: accepted.length, rejected },
    });
  } catch (error) {
    next(error);
  }
};

const shapeLive = (v) => {
  const ageSeconds = v.lastLocation ? Math.round((Date.now() - new Date(v.lastLocation.timestamp)) / 1000) : null;
  return {
    vehicleId: v._id,
    registrationNumber: v.registrationNumber,
    driverName: v.driverName,
    province: v.province,
    district: v.district,
    status: v.status,
    latitude: v.lastLocation?.point.coordinates[1] ?? null,
    longitude: v.lastLocation?.point.coordinates[0] ?? null,
    speed: v.lastLocation?.speed ?? null,
    heading: v.lastLocation?.heading ?? null,
    timestamp: v.lastLocation?.timestamp ?? null,
    ageSeconds,
    online: ageSeconds !== null && ageSeconds <= ONLINE_MINUTES * 60,
    moving: !!v.lastLocation && v.lastLocation.speed >= 3 && ageSeconds <= ONLINE_MINUTES * 60,
  };
};

// ─── GET /api/locations/live ──────────────────────────────────────────────────
// Reads the denormalised lastLocation – O(vehicles) instead of scanning every ping.
export const getLiveLocations = async (req, res, next) => {
  try {
    const { province, district, online, moving, format } = req.query;
    const page = clampInt(req.query.page, 1, 1, 10000);
    const limit = clampInt(req.query.limit, 200, 1, 500);

    const filter = { isActive: true, status: "active", lastLocation: { $exists: true }, ...scopeFilter(req.user) };
    // user-supplied filters can only NARROW the role scope, never widen it
    if (province && !filter.province) filter.province = province;
    if (district && !filter.district) filter.district = district;
    if (province && filter.province && String(filter.province) !== province) filter._id = { $in: [] };
    if (district && filter.district && String(filter.district) !== district) filter._id = { $in: [] };
    if (online === "true") filter.lastSeenAt = { $gte: new Date(Date.now() - ONLINE_MINUTES * 60000) };

    const [vehicles, total] = await Promise.all([
      TukTuk.find(filter)
        .select("registrationNumber driverName province district status lastLocation")
        .populate("province", "name code")
        .populate("district", "name code")
        .sort({ registrationNumber: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TukTuk.countDocuments(filter),
    ]);

    let data = vehicles.map(shapeLive);
    if (moving === "true") data = data.filter((d) => d.moving);
    const meta = { total, page, limit, pages: Math.ceil(total / limit) };
    setPaginationHeaders(res, req, meta);

    if (format === "geojson") {
      return res.status(200).json({
        type: "FeatureCollection",
        features: data.map((d) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [d.longitude, d.latitude] },
          properties: d,
        })),
      });
    }
    res.status(200).json({ success: true, count: data.length, data, meta });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/locations/nearby?lat&lng&radius ─────────────────────────────────
// "Which vehicles are within 2 km of this incident right now?"
export const getNearby = async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius ?? 2000);
    const limit = clampInt(req.query.limit, 20, 1, 100);

    const results = await TukTuk.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distanceMetres",
          maxDistance: radius,
          spherical: true,
          key: "lastLocation.point",
          query: { isActive: true, status: "active", ...scopeFilter(req.user) },
        },
      },
      { $limit: limit },
      {
        $project: {
          registrationNumber: 1, driverName: 1, driverPhone: 1, province: 1, district: 1,
          distanceMetres: { $round: ["$distanceMetres", 0] },
          latitude: { $arrayElemAt: ["$lastLocation.point.coordinates", 1] },
          longitude: { $arrayElemAt: ["$lastLocation.point.coordinates", 0] },
          speed: "$lastLocation.speed",
          timestamp: "$lastLocation.timestamp",
        },
      },
    ]);
    res.status(200).json({ success: true, count: results.length, data: results });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/locations/search-area?lat&lng&radius&from&to ────────────────────
// Investigative query: which vehicles were inside a circle during a time window?
export const searchArea = async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius ?? 500);
    const from = new Date(req.query.from);
    const to = new Date(req.query.to);
    if (to <= from) return res.status(422).json({ success: false, message: "'to' must be after 'from'." });
    if (to - from > 7 * 24 * 3600 * 1000) {
      return res.status(422).json({ success: false, message: "Time window cannot exceed 7 days." });
    }

    const scope = scopeFilter(req.user);
    const scoped = Object.keys(scope).length > 0;
    const match = {
      timestamp: { $gte: from, $lte: to },
      location: { $geoWithin: { $centerSphere: [[lng, lat], radius / 6378137] } },
    };
    if (scoped) {
      const ids = await TukTuk.find(scope).distinct("_id");
      match.tukTuk = { $in: ids };
    }

    const rows = await LocationPing.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$tukTuk",
          pings: { $sum: 1 },
          firstSeen: { $min: "$timestamp" },
          lastSeen: { $max: "$timestamp" },
          maxSpeed: { $max: "$speed" },
        },
      },
      { $sort: { firstSeen: 1 } },
      { $limit: 200 },
      { $lookup: { from: "tuktuks", localField: "_id", foreignField: "_id", as: "v" } },
      { $unwind: "$v" },
      {
        $project: {
          _id: 0,
          vehicleId: "$_id",
          registrationNumber: "$v.registrationNumber",
          driverName: "$v.driverName",
          driverPhone: "$v.driverPhone",
          pings: 1, firstSeen: 1, lastSeen: 1, maxSpeed: 1,
        },
      },
    ]);
    res.status(200).json({ success: true, count: rows.length, data: rows, query: { lat, lng, radius, from, to } });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/locations/history ───────────────────────────────────────────────
export const getHistory = async (req, res, next) => {
  try {
    const { tukTukId, province, district } = req.query;
    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 100, 1, 1000);
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 24 * 3600 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    if (to <= from) return res.status(422).json({ success: false, message: "'to' must be after 'from'." });
    if (to - from > MAX_HISTORY_WINDOW_DAYS * 24 * 3600 * 1000) {
      return res.status(422).json({ success: false, message: `Time window cannot exceed ${MAX_HISTORY_WINDOW_DAYS} days.` });
    }

    const scope = scopeFilter(req.user);
    const extra = {};
    if (province && !scope.province) extra.province = province;
    if (district && !scope.district) extra.district = district;
    if (tukTukId) extra._id = oid(tukTukId);
    // $and so a user-supplied tukTukId can never override the jurisdiction scope
    const ids = await TukTuk.find({ $and: [scope, extra] }).distinct("_id");

    const match = { tukTuk: { $in: ids }, timestamp: { $gte: from, $lte: to } };
    const [pings, total] = await Promise.all([
      LocationPing.find(match)
        .select("-location -__v")
        .populate("tukTuk", "registrationNumber driverName")
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LocationPing.countDocuments(match),
    ]);
    const meta = { total, page, limit, pages: Math.ceil(total / limit) };
    setPaginationHeaders(res, req, meta);
    res.status(200).json({ success: true, count: pings.length, data: pings, meta, window: { from, to } });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/locations/stats ─────────────────────────────────────────────────
export const getStats = async (req, res, next) => {
  try {
    const scope = scopeFilter(req.user);
    const since = new Date(Date.now() - ONLINE_MINUTES * 60000);
    const today = startOfDayColombo();
    const ids = await TukTuk.find({ ...scope, isActive: true }).distinct("_id");

    const [totalVehicles, activeVehicles, online, offline, pingsToday, openAlerts, provinceBreakdown] = await Promise.all([
      TukTuk.countDocuments({ ...scope, isActive: true }),
      TukTuk.countDocuments({ ...scope, isActive: true, status: "active" }),
      TukTuk.countDocuments({ ...scope, isActive: true, status: "active", lastSeenAt: { $gte: since } }),
      TukTuk.countDocuments({ ...scope, isActive: true, status: "active", $or: [{ lastSeenAt: { $lt: since } }, { lastSeenAt: null }] }),
      LocationPing.countDocuments({ tukTuk: { $in: ids }, timestamp: { $gte: today } }),
      Alert.countDocuments({ ...scope, acknowledgedAt: null }),
      TukTuk.aggregate([
        { $match: { ...scope, isActive: true, status: "active" } },
        { $group: { _id: "$province", count: { $sum: 1 } } },
        { $lookup: { from: "provinces", localField: "_id", foreignField: "_id", as: "province" } },
        { $unwind: "$province" },
        { $project: { province: "$province.name", count: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalRegisteredVehicles: totalVehicles,
        activeVehicles,
        onlineVehicles: online,
        offlineVehicles: offline,
        onlineThresholdMinutes: ONLINE_MINUTES,
        pingsToday,
        openAlerts,
        provinceBreakdown,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};
