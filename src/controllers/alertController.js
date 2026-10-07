import Alert from "../models/Alert.js";
import { scopeFilter } from "../utils/scope.js";
import { setPaginationHeaders } from "../utils/pagination.js";

const clampInt = (v, def, min, max) => Math.min(Math.max(parseInt(v, 10) || def, min), max);

// ─── GET /api/alerts ──────────────────────────────────────────────────────────
export const getAlerts = async (req, res, next) => {
  try {
    const { type, severity, tukTukId, acknowledged, from, to } = req.query;
    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 50, 1, 200);
    const extra = {};
    if (type) extra.type = type;
    if (severity) extra.severity = severity;
    if (tukTukId) extra.tukTuk = tukTukId;
    if (acknowledged === "true") extra.acknowledgedAt = { $ne: null };
    if (acknowledged === "false") extra.acknowledgedAt = null;
    if (from || to) extra.timestamp = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
    const filter = { $and: [scopeFilter(req.user), extra] };

    const [alerts, total] = await Promise.all([
      Alert.find(filter)
        .populate("tukTuk", "registrationNumber driverName")
        .populate("geofence", "name type")
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Alert.countDocuments(filter),
    ]);
    const meta = { total, page, limit, pages: Math.ceil(total / limit) };
    setPaginationHeaders(res, req, meta);
    res.status(200).json({ success: true, count: alerts.length, data: alerts, meta });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/alerts/:id/acknowledge ────────────────────────────────────────
export const acknowledgeAlert = async (req, res, next) => {
  try {
    const alert = await Alert.findOneAndUpdate(
      { $and: [scopeFilter(req.user), { _id: req.params.id, acknowledgedAt: null }] },
      { acknowledgedAt: new Date(), acknowledgedBy: req.user._id },
      { new: true }
    );
    if (!alert) return res.status(404).json({ success: false, message: "Alert not found or already acknowledged." });
    res.status(200).json({ success: true, message: "Alert acknowledged.", data: alert });
  } catch (error) {
    next(error);
  }
};
