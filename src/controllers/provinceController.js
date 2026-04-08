import Province from "../models/Province.js";

// ─── GET /api/provinces ───────────────────────────────────────────────────────
export const getProvinces = async (req, res, next) => {
  try {
    const { sort = "name", order = "asc" } = req.query;
    const sortObj = { [sort]: order === "desc" ? -1 : 1 };

    const provinces = await Province.find().sort(sortObj);
    res.status(200).json({ success: true, count: provinces.length, data: provinces });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/provinces/:id ───────────────────────────────────────────────────
export const getProvince = async (req, res, next) => {
  try {
    const province = await Province.findById(req.params.id);
    if (!province) return res.status(404).json({ success: false, message: "Province not found." });
    res.status(200).json({ success: true, data: province });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/provinces ──────────────────────────────────────────────────────
export const createProvince = async (req, res, next) => {
  try {
    const province = await Province.create(req.body);
    res.status(201).json({ success: true, message: "Province created.", data: province });
  } catch (error) {
    next(error);
  }
};

// ─── PUT /api/provinces/:id ───────────────────────────────────────────────────
export const updateProvince = async (req, res, next) => {
  try {
    const province = await Province.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!province) return res.status(404).json({ success: false, message: "Province not found." });
    res.status(200).json({ success: true, message: "Province updated.", data: province });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/provinces/:id ────────────────────────────────────────────────
export const deleteProvince = async (req, res, next) => {
  try {
    const province = await Province.findByIdAndDelete(req.params.id);
    if (!province) return res.status(404).json({ success: false, message: "Province not found." });
    res.status(200).json({ success: true, message: "Province deleted." });
  } catch (error) {
    next(error);
  }
};
