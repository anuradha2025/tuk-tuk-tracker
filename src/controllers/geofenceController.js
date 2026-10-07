import Geofence from "../models/Geofence.js";
import District from "../models/District.js";

// ─── GET /api/geofences ───────────────────────────────────────────────────────
export const getGeofences = async (req, res, next) => {
  try {
    const filter = { isActive: true };
    if (req.user.role === "provincial_admin") {
      filter.$or = [{ province: null }, { province: req.user.province }];
    } else if (req.user.role === "station_officer") {
      filter.$or = [{ district: null, province: null }, { district: req.user.district }, { province: req.user.province, district: null }];
    }
    const data = await Geofence.find(filter).sort({ name: 1 });
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/geofences ──────────────────────────────────────────────────────
export const createGeofence = async (req, res, next) => {
  try {
    const { name, description, type, latitude, longitude, radiusMetres, district } = req.body;
    let province = null;
    let districtId = null;
    if (district) {
      const d = await District.findById(district);
      if (!d) return res.status(422).json({ success: false, message: "Unknown district." });
      districtId = d._id;
      province = d.province;
    }
    if (req.user.role === "provincial_admin") {
      if (!districtId || String(province) !== String(req.user.province)) {
        return res.status(403).json({ success: false, message: "Provincial admins may only create geofences for districts in their own province." });
      }
    }
    const fence = await Geofence.create({
      name, description, type, radiusMetres,
      center: { type: "Point", coordinates: [longitude, latitude] },
      district: districtId, province, createdBy: req.user._id,
    });
    res.status(201).json({ success: true, message: "Geofence created.", data: fence });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/geofences/:id ────────────────────────────────────────────────
export const deleteGeofence = async (req, res, next) => {
  try {
    const f = await Geofence.findById(req.params.id);
    if (!f) return res.status(404).json({ success: false, message: "Geofence not found." });
    if (req.user.role === "provincial_admin" && String(f.province) !== String(req.user.province)) {
      return res.status(403).json({ success: false, message: "Geofence is outside your province." });
    }
    f.isActive = false;
    await f.save();
    res.status(200).json({ success: true, message: "Geofence disabled." });
  } catch (error) {
    next(error);
  }
};
