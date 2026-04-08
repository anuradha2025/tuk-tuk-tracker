import District from "../models/District.js";

// ─── GET /api/districts ───────────────────────────────────────────────────────
export const getDistricts = async (req, res, next) => {
  try {
    const { province, sort = "name", order = "asc" } = req.query;
    const filter = {};
    if (province) filter.province = province;

    const sortObj = { [sort]: order === "desc" ? -1 : 1 };
    const districts = await District.find(filter)
      .populate("province", "name code")
      .sort(sortObj);

    res.status(200).json({ success: true, count: districts.length, data: districts });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/districts/:id ───────────────────────────────────────────────────
export const getDistrict = async (req, res, next) => {
  try {
    const district = await District.findById(req.params.id).populate("province", "name code");
    if (!district) return res.status(404).json({ success: false, message: "District not found." });
    res.status(200).json({ success: true, data: district });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/districts ──────────────────────────────────────────────────────
export const createDistrict = async (req, res, next) => {
  try {
    const district = await District.create(req.body);
    res.status(201).json({ success: true, message: "District created.", data: district });
  } catch (error) {
    next(error);
  }
};

// ─── PUT /api/districts/:id ───────────────────────────────────────────────────
export const updateDistrict = async (req, res, next) => {
  try {
    const district = await District.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("province", "name code");
    if (!district) return res.status(404).json({ success: false, message: "District not found." });
    res.status(200).json({ success: true, message: "District updated.", data: district });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/districts/:id ────────────────────────────────────────────────
export const deleteDistrict = async (req, res, next) => {
  try {
    const district = await District.findByIdAndDelete(req.params.id);
    if (!district) return res.status(404).json({ success: false, message: "District not found." });
    res.status(200).json({ success: true, message: "District deleted." });
  } catch (error) {
    next(error);
  }
};
