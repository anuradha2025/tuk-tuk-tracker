import TukTuk from "../models/TukTuk.js";
import LocationPing from "../models/LocationPing.js";
import District from "../models/District.js";
import { setPaginationHeaders } from "../utils/pagination.js";
import { scopeFilter, inScope } from "../utils/scope.js";
import { analyseTrack } from "../utils/trips.js";
import { generateDeviceKey, hashDeviceKey } from "../middleware/auth.js";

const clampInt = (v, def, min, max) => Math.min(Math.max(parseInt(v, 10) || def, min), max);
const WRITABLE = ["registrationNumber", "driverName", "driverNIC", "driverPhone", "district", "station", "status"];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

/** Loads a vehicle and enforces jurisdiction. Responds 404 for both "missing" and "out of scope" (no existence leak). */
const loadScoped = async (req, res, projection) => {
  const v = await TukTuk.findById(req.params.id, projection);
  if (!v || !inScope(req.user, v)) {
    res.status(404).json({ success: false, message: "Tuk-tuk not found." });
    return null;
  }
  return v;
};

const parseWindow = (req, res, { defaultHours = 24, maxDays = 31 } = {}) => {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(to - defaultHours * 3600 * 1000);
  if (to <= from) {
    res.status(422).json({ success: false, message: "'to' must be after 'from'." });
    return null;
  }
  if (to - from > maxDays * 24 * 3600 * 1000) {
    res.status(422).json({ success: false, message: `Time window cannot exceed ${maxDays} days.` });
    return null;
  }
  return { from, to };
};

// ─── GET /api/tuktuks ─────────────────────────────────────────────────────────
export const getTukTuks = async (req, res, next) => {
  try {
    const { province, district, status, search, order = "asc" } = req.query;
    const sortable = ["registrationNumber", "driverName", "status", "registeredAt", "lastSeenAt"];
    const sort = sortable.includes(req.query.sort) ? req.query.sort : "registrationNumber";
    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 20, 1, 200);

    const scope = scopeFilter(req.user);
    const extra = { isActive: true };
    if (province && !scope.province) extra.province = province;
    if (district && !scope.district) extra.district = district;
    if (status) extra.status = status;
    if (search) extra.$text = { $search: String(search) };
    const filter = { $and: [scope, extra] };

    const [tuktuks, total] = await Promise.all([
      TukTuk.find(filter)
        .populate("province", "name code")
        .populate("district", "name code")
        .sort({ [sort]: order === "desc" ? -1 : 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      TukTuk.countDocuments(filter),
    ]);
    const meta = { total, page, limit, pages: Math.ceil(total / limit) };
    setPaginationHeaders(res, req, meta);
    res.status(200).json({ success: true, count: tuktuks.length, data: tuktuks, meta });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/tuktuks/:id ─────────────────────────────────────────────────────
export const getTukTuk = async (req, res, next) => {
  try {
    const v = await loadScoped(req, res);
    if (!v) return;
    await v.populate([{ path: "province", select: "name code" }, { path: "district", select: "name code" }]);
    res.status(200).json({ success: true, data: v });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/tuktuks ────────────────────────────────────────────────────────
// Province is DERIVED from the district (never trusted from the client), and the
// caller may only register vehicles inside their own jurisdiction.
export const createTukTuk = async (req, res, next) => {
  try {
    const body = pick(req.body, WRITABLE);
    const district = await District.findById(body.district);
    if (!district) return res.status(422).json({ success: false, message: "Unknown district." });
    const candidate = { district: district._id, province: district.province };
    if (!inScope(req.user, candidate)) {
      return res.status(403).json({ success: false, message: "You can only register vehicles inside your own jurisdiction." });
    }

    const deviceId = req.body.deviceId || `DEV-${Date.now().toString(36).toUpperCase()}`;
    const deviceKey = generateDeviceKey();
    const tukTuk = await TukTuk.create({
      ...body,
      province: district.province,
      deviceId,
      deviceKeyHash: hashDeviceKey(deviceKey),
      deviceKeyIssuedAt: new Date(),
    });
    res.status(201).json({
      success: true,
      message: "Tuk-tuk registered. Store the device key now – it cannot be retrieved again.",
      data: tukTuk,
      device: { deviceId, deviceKey },
    });
  } catch (error) {
    next(error);
  }
};

// ─── PUT /api/tuktuks/:id ─────────────────────────────────────────────────────
export const updateTukTuk = async (req, res, next) => {
  try {
    const v = await loadScoped(req, res);
    if (!v) return;
    const changes = pick(req.body, WRITABLE);
    if (changes.district) {
      const d = await District.findById(changes.district);
      if (!d) return res.status(422).json({ success: false, message: "Unknown district." });
      if (!inScope(req.user, { district: d._id, province: d.province })) {
        return res.status(403).json({ success: false, message: "Cannot move a vehicle outside your jurisdiction." });
      }
      changes.province = d.province;
    }
    v.set(changes);
    await v.save();
    res.status(200).json({ success: true, message: "Tuk-tuk updated.", data: v });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/tuktuks/:id  (soft delete – history is evidence and is kept) ─
export const deleteTukTuk = async (req, res, next) => {
  try {
    const v = await TukTuk.findById(req.params.id);
    if (!v) return res.status(404).json({ success: false, message: "Tuk-tuk not found." });
    v.isActive = false;
    v.status = "inactive";
    v.deletedAt = new Date();
    v.deviceKeyHash = undefined; // revoke device access immediately
    await v.save();
    res.status(200).json({ success: true, message: "Tuk-tuk deregistered. Movement history is retained." });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/tuktuks/:id/device-key  (rotate / revoke-and-reissue) ──────────
export const rotateDeviceKey = async (req, res, next) => {
  try {
    const v = await loadScoped(req, res);
    if (!v) return;
    const deviceKey = generateDeviceKey();
    v.deviceKeyHash = hashDeviceKey(deviceKey);
    v.deviceKeyIssuedAt = new Date();
    await v.save();
    res.status(200).json({
      success: true,
      message: "Device key rotated. The previous key no longer works.",
      device: { deviceId: v.deviceId, deviceKey },
    });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/tuktuks/:id/status ────────────────────────────────────────────
export const setStatus = async (req, res, next) => {
  try {
    const v = await loadScoped(req, res);
    if (!v) return;
    v.status = req.body.status;
    await v.save();
    res.status(200).json({ success: true, message: `Vehicle marked ${v.status}.`, data: { _id: v._id, status: v.status } });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/tuktuks/:id/location ───────────────────────────────────────────
export const getLastKnownLocation = async (req, res, next) => {
  try {
    const v = await loadScoped(req, res);
    if (!v) return;
    const last = v.lastLocation;
    const ageSeconds = last ? Math.round((Date.now() - last.timestamp) / 1000) : null;
    res.status(200).json({
      success: true,
      data: {
        tukTuk: { _id: v._id, registrationNumber: v.registrationNumber, driverName: v.driverName, status: v.status },
        lastLocation: last
          ? {
              latitude: last.point.coordinates[1],
              longitude: last.point.coordinates[0],
              speed: last.speed,
              heading: last.heading,
              accuracy: last.accuracy,
              timestamp: last.timestamp,
              ageSeconds,
              online: ageSeconds <= Number(process.env.ONLINE_THRESHOLD_MINUTES || 10) * 60,
            }
          : null,
        message: last ? "Last known location retrieved." : "No location data available for this vehicle.",
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/tuktuks/:id/history ────────────────────────────────────────────
export const getLocationHistory = async (req, res, next) => {
  try {
    const v = await loadScoped(req, res, "_id province district");
    if (!v) return;
    const win = parseWindow(req, res);
    if (!win) return;
    const limit = clampInt(req.query.limit, 500, 1, 5000);
    const history = await LocationPing.find({ tukTuk: v._id, timestamp: { $gte: win.from, $lte: win.to } })
      .select("-location -__v")
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.status(200).json({ success: true, count: history.length, data: history, window: win });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/tuktuks/:id/route  (GeoJSON LineString for map replay) ──────────
export const getRoute = async (req, res, next) => {
  try {
    const v = await loadScoped(req, res, "_id province district registrationNumber");
    if (!v) return;
    const win = parseWindow(req, res, { defaultHours: 24, maxDays: 7 });
    if (!win) return;
    const pings = await LocationPing.find({ tukTuk: v._id, timestamp: { $gte: win.from, $lte: win.to } })
      .select("latitude longitude timestamp speed")
      .sort({ timestamp: 1 })
      .limit(20000)
      .lean();
    res.status(200).json({
      type: "Feature",
      geometry: { type: "LineString", coordinates: pings.map((p) => [p.longitude, p.latitude]) },
      properties: {
        registrationNumber: v.registrationNumber,
        from: win.from,
        to: win.to,
        pointCount: pings.length,
        timestamps: pings.map((p) => p.timestamp),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/tuktuks/:id/trips  (trips, stops, distance, idle time) ──────────
export const getTrips = async (req, res, next) => {
  try {
    const v = await loadScoped(req, res, "_id province district registrationNumber");
    if (!v) return;
    const win = parseWindow(req, res, { defaultHours: 24, maxDays: 7 });
    if (!win) return;
    const pings = await LocationPing.find({ tukTuk: v._id, timestamp: { $gte: win.from, $lte: win.to } })
      .select("latitude longitude timestamp speed")
      .sort({ timestamp: 1 })
      .limit(20000)
      .lean();
    const { trips, stops, summary } = analyseTrack(pings, {
      stopMinutes: clampInt(req.query.stopMinutes, 5, 1, 120),
    });
    res.status(200).json({
      success: true,
      data: { vehicle: { _id: v._id, registrationNumber: v.registrationNumber }, window: win, summary, trips, stops },
    });
  } catch (error) {
    next(error);
  }
};
