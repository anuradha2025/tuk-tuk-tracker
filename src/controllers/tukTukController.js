import TukTuk from "../models/TukTuk.js";
import LocationPing from "../models/LocationPing.js";
import { setPaginationHeaders } from "../utils/pagination.js";

// ─── GET /api/tuktuks ─────────────────────────────────────────────────────────
export const getTukTuks = async (req, res, next) => {
  try {
    const {
      province, district, status,
      search,
      sort = "registrationNumber", order = "asc",
      page = 1, limit = 20,
    } = req.query;

    const filter = {};
    if (province) filter.province = province;
    if (district) filter.district = district;
    if (status) filter.status = status;
    if (search) filter.$text = { $search: search };

    // Scope restriction: provincial_admin can only see their province
    if (req.user.role === "provincial_admin" && req.user.province) {
      filter.province = req.user.province;
    }
    // station_officer can only see their district
    if (req.user.role === "station_officer" && req.user.district) {
      filter.district = req.user.district;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [tuktuks, total] = await Promise.all([
      TukTuk.find(filter)
        .populate("province", "name code")
        .populate("district", "name code")
        .sort({ [sort]: order === "desc" ? -1 : 1 })
        .skip(skip)
        .limit(Number(limit)),
      TukTuk.countDocuments(filter),
    ]);

    const meta = { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) };
    setPaginationHeaders(res, req, meta);

    res.status(200).json({
      success: true,
      count: tuktuks.length,
      data: tuktuks,
      meta,
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/tuktuks/:id ─────────────────────────────────────────────────────
export const getTukTuk = async (req, res, next) => {
  try {
    const tukTuk = await TukTuk.findById(req.params.id)
      .populate("province", "name code")
      .populate("district", "name code");
    if (!tukTuk) return res.status(404).json({ success: false, message: "Tuk-tuk not found." });
    res.status(200).json({ success: true, data: tukTuk });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/tuktuks ────────────────────────────────────────────────────────
export const createTukTuk = async (req, res, next) => {
  try {
    const tukTuk = await TukTuk.create(req.body);
    res.status(201).json({ success: true, message: "Tuk-tuk registered.", data: tukTuk });
  } catch (error) {
    next(error);
  }
};

// ─── PUT /api/tuktuks/:id ─────────────────────────────────────────────────────
export const updateTukTuk = async (req, res, next) => {
  try {
    const tukTuk = await TukTuk.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!tukTuk) return res.status(404).json({ success: false, message: "Tuk-tuk not found." });
    res.status(200).json({ success: true, message: "Tuk-tuk updated.", data: tukTuk });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/tuktuks/:id ──────────────────────────────────────────────────
export const deleteTukTuk = async (req, res, next) => {
  try {
    const tukTuk = await TukTuk.findByIdAndDelete(req.params.id);
    if (!tukTuk) return res.status(404).json({ success: false, message: "Tuk-tuk not found." });
    res.status(200).json({ success: true, message: "Tuk-tuk removed." });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/tuktuks/:id/location ───────────────────────────────────────────
export const getLastKnownLocation = async (req, res, next) => {
  try {
    const tukTuk = await TukTuk.findById(req.params.id);
    if (!tukTuk) return res.status(404).json({ success: false, message: "Tuk-tuk not found." });

    const lastPing = await LocationPing.findOne({ tukTuk: req.params.id })
      .sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      data: {
        tukTuk: {
          _id: tukTuk._id,
          registrationNumber: tukTuk.registrationNumber,
          driverName: tukTuk.driverName,
          status: tukTuk.status,
        },
        lastLocation: lastPing || null,
        message: lastPing ? "Last known location retrieved." : "No location data available for this vehicle.",
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/tuktuks/:id/history ────────────────────────────────────────────
export const getLocationHistory = async (req, res, next) => {
  try {
    const { from, to, limit = 500 } = req.query;

    const tukTuk = await TukTuk.findById(req.params.id);
    if (!tukTuk) return res.status(404).json({ success: false, message: "Tuk-tuk not found." });

    const timeFilter = { tukTuk: req.params.id };
    if (from || to) {
      timeFilter.timestamp = {};
      if (from) timeFilter.timestamp.$gte = new Date(from);
      if (to) timeFilter.timestamp.$lte = new Date(to);
    }

    const history = await LocationPing.find(timeFilter)
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    next(error);
  }
};
