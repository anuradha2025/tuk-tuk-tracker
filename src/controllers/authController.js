import User from "../models/User.js";
import District from "../models/District.js";
import { generateToken } from "../middleware/auth.js";

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const clampInt = (v, def, min, max) => Math.min(Math.max(parseInt(v, 10) || def, min), max);

// ─── POST /api/auth/register  (hq_admin only) ─────────────────────────────────
// Accounts are issued by headquarters; there is no public sign-up for a police system.
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role, province, district } = req.body;
    const data = { name, email, password, role };

    if (role === "provincial_admin") {
      if (!province) return res.status(422).json({ success: false, message: "provincial_admin requires a province." });
      data.province = province;
    }
    if (role === "station_officer") {
      if (!district) return res.status(422).json({ success: false, message: "station_officer requires a district." });
      const d = await District.findById(district);
      if (!d) return res.status(422).json({ success: false, message: "Unknown district." });
      data.district = d._id;
      data.province = d.province; // derived, never trusted from the client
      if (req.body.station) data.station = req.body.station;
    }

    const user = await User.create(data);
    res.status(201).json({
      success: true,
      message: "User created.",
      data: { user: { _id: user._id, name: user.name, email: user.email, role: user.role, province: user.province, district: user.district } },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password +failedLoginAttempts +lockUntil");
    const generic = { success: false, message: "Invalid credentials." };

    if (!user || !user.isActive) return res.status(401).json(generic);
    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(423).json({ success: false, message: "Account temporarily locked after repeated failed logins. Try again later." });
    }

    if (!(await user.comparePassword(password))) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED) {
        user.lockUntil = new Date(Date.now() + LOCK_MS);
        user.failedLoginAttempts = 0;
      }
      await User.updateOne({ _id: user._id }, { failedLoginAttempts: user.failedLoginAttempts, lockUntil: user.lockUntil });
      return res.status(401).json(generic);
    }

    await User.updateOne({ _id: user._id }, { failedLoginAttempts: 0, lockUntil: null });
    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        token: generateToken(user._id),
        user: { _id: user._id, name: user.name, email: user.email, role: user.role, province: user.province, district: user.district },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("province", "name code")
      .populate("district", "name code")
      .populate("station", "name stationCode");
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/auth/me/password ──────────────────────────────────────────────
export const changePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.comparePassword(req.body.currentPassword))) {
      return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }
    user.password = req.body.newPassword;
    await user.save();
    res.status(200).json({ success: true, message: "Password changed. Please log in again.", data: { token: generateToken(user._id) } });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/auth/users (admin) ──────────────────────────────────────────────
export const getAllUsers = async (req, res, next) => {
  try {
    const { role } = req.query;
    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 20, 1, 100);
    const filter = {};
    if (typeof role === "string") filter.role = role;
    const [users, total] = await Promise.all([
      User.find(filter).select("-password").skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(filter),
    ]);
    res.status(200).json({ success: true, data: users, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/auth/users/:id/deactivate (admin) ────────────────────────────
export const deactivateUser = async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "You cannot deactivate your own account." });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    res.status(200).json({ success: true, message: "User deactivated.", data: user });
  } catch (error) {
    next(error);
  }
};
