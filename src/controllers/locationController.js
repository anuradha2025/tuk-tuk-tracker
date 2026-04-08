import LocationPing from "../models/LocationPing.js";
import TukTuk from "../models/TukTuk.js";
import { setPaginationHeaders } from "../utils/pagination.js";

// ─── POST /api/locations/ping ─────────────────────────────────────────────────
// Called by GPS tracking devices to submit a location update
export const submitPing = async (req, res, next) => {
  try {
    const { tukTukId, latitude, longitude, speed, heading, accuracy, timestamp } = req.body;

    // Verify the tuk-tuk exists and is active
    const tukTuk = await TukTuk.findById(tukTukId);
    if (!tukTuk) return res.status(404).json({ success: false, message: "Tuk-tuk not found." });
    if (tukTuk.status === "suspended") {
      return res.status(403).json({ success: false, message: "This vehicle is suspended and cannot submit pings." });
    }

    const ping = await LocationPing.create({
      tukTuk: tukTukId,
      latitude,
      longitude,
      speed: speed ?? 0,
      heading: heading ?? 0,
      accuracy: accuracy ?? null,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    res.status(201).json({ success: true, message: "Location ping recorded.", data: ping });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/locations/live ──────────────────────────────────────────────────
// Returns the most recent ping for every active tuk-tuk (live view)
export const getLiveLocations = async (req, res, next) => {
  try {
    const { province, district } = req.query;

    // Build vehicle filter based on query params and user role
    const vehicleFilter = { status: "active" };
    if (province) vehicleFilter.province = province;
    if (district) vehicleFilter.district = district;

    // Role-based scope restriction
    if (req.user.role === "provincial_admin" && req.user.province) {
      vehicleFilter.province = req.user.province;
    }
    if (req.user.role === "station_officer" && req.user.district) {
      vehicleFilter.district = req.user.district;
    }

    const tukTuks = await TukTuk.find(vehicleFilter).select("_id registrationNumber driverName district province");

    // Get the latest ping per tuk-tuk using aggregation
    const tukTukIds = tukTuks.map((t) => t._id);

    const latestPings = await LocationPing.aggregate([
      { $match: { tukTuk: { $in: tukTukIds } } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$tukTuk",
          latitude: { $first: "$latitude" },
          longitude: { $first: "$longitude" },
          speed: { $first: "$speed" },
          heading: { $first: "$heading" },
          timestamp: { $first: "$timestamp" },
        },
      },
    ]);

    // Map tuk-tuk info onto each ping result
    const tukTukMap = Object.fromEntries(tukTuks.map((t) => [t._id.toString(), t]));
    const liveView = latestPings.map((ping) => ({
      ...ping,
      vehicle: tukTukMap[ping._id.toString()] ?? null,
    }));

    res.status(200).json({ success: true, count: liveView.length, data: liveView });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/locations/history ───────────────────────────────────────────────
// Returns movement history across all vehicles with optional filters
export const getHistory = async (req, res, next) => {
  try {
    const { tukTukId, from, to, province, district, page = 1, limit = 100 } = req.query;

    // Build the match stage
    const match = {};
    if (tukTukId) match.tukTuk = new (await import("mongoose")).default.Types.ObjectId(tukTukId);
    if (from || to) {
      match.timestamp = {};
      if (from) match.timestamp.$gte = new Date(from);
      if (to) match.timestamp.$lte = new Date(to);
    }

    // If province or district filter is required, first resolve the vehicle IDs
    if (province || district || req.user.role !== "hq_admin") {
      const vehicleFilter = {};
      if (province) vehicleFilter.province = province;
      if (district) vehicleFilter.district = district;
      if (req.user.role === "provincial_admin") vehicleFilter.province = req.user.province;
      if (req.user.role === "station_officer") vehicleFilter.district = req.user.district;

      if (Object.keys(vehicleFilter).length > 0) {
        const vehicles = await TukTuk.find(vehicleFilter).select("_id");
        const ids = vehicles.map((v) => v._id);
        match.tukTuk = { $in: ids };
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [pings, total] = await Promise.all([
      LocationPing.find(match)
        .populate("tukTuk", "registrationNumber driverName")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit)),
      LocationPing.countDocuments(match),
    ]);

    const meta = { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) };
    setPaginationHeaders(res, req, meta);

    res.status(200).json({
      success: true,
      count: pings.length,
      data: pings,
      meta,
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/locations/stats ─────────────────────────────────────────────────
// Returns summary statistics (vehicles active in last 10 min, pings today, etc.)
export const getStats = async (req, res, next) => {
  try {
    const now = new Date();
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000);
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    const [totalVehicles, activeVehicles, pingsToday, recentlyActive] = await Promise.all([
      TukTuk.countDocuments({ isActive: true }),
      TukTuk.countDocuments({ status: "active" }),
      LocationPing.countDocuments({ timestamp: { $gte: startOfDay } }),
      LocationPing.distinct("tukTuk", { timestamp: { $gte: tenMinutesAgo } }),
    ]);

    // Province-wise active vehicle breakdown
    const provinceBreakdown = await TukTuk.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$province", count: { $sum: 1 } } },
      { $lookup: { from: "provinces", localField: "_id", foreignField: "_id", as: "province" } },
      { $unwind: "$province" },
      { $project: { province: "$province.name", count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalRegisteredVehicles: totalVehicles,
        activeVehicles,
        vehiclesSeenInLast10Min: recentlyActive.length,
        pingsToday,
        provinceBreakdown,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};
