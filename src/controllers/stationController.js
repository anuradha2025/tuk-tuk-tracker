import PoliceStation from "../models/PoliceStation.js";

// ─── GET /api/stations ────────────────────────────────────────────────────────
export const getStations = async (req, res, next) => {
  try {
    const { district, sort = "name", order = "asc", page = 1, limit = 50 } = req.query;
    const filter = {};
    if (district) filter.district = district;

    const skip = (Number(page) - 1) * Number(limit);
    const [stations, total] = await Promise.all([
      PoliceStation.find(filter)
        .populate({ path: "district", select: "name code", populate: { path: "province", select: "name code" } })
        .sort({ [sort]: order === "desc" ? -1 : 1 })
        .skip(skip)
        .limit(Number(limit)),
      PoliceStation.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: stations.length,
      data: stations,
      meta: { total, page: Number(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/stations/:id ────────────────────────────────────────────────────
export const getStation = async (req, res, next) => {
  try {
    const station = await PoliceStation.findById(req.params.id).populate({
      path: "district",
      select: "name code",
      populate: { path: "province", select: "name code" },
    });
    if (!station) return res.status(404).json({ success: false, message: "Police station not found." });
    res.status(200).json({ success: true, data: station });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/stations ───────────────────────────────────────────────────────
export const createStation = async (req, res, next) => {
  try {
    const station = await PoliceStation.create(req.body);
    res.status(201).json({ success: true, message: "Police station created.", data: station });
  } catch (error) {
    next(error);
  }
};

// ─── PUT /api/stations/:id ────────────────────────────────────────────────────
export const updateStation = async (req, res, next) => {
  try {
    const station = await PoliceStation.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!station) return res.status(404).json({ success: false, message: "Police station not found." });
    res.status(200).json({ success: true, message: "Police station updated.", data: station });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/stations/:id ─────────────────────────────────────────────────
export const deleteStation = async (req, res, next) => {
  try {
    const station = await PoliceStation.findByIdAndDelete(req.params.id);
    if (!station) return res.status(404).json({ success: false, message: "Police station not found." });
    res.status(200).json({ success: true, message: "Police station deleted." });
  } catch (error) {
    next(error);
  }
};
