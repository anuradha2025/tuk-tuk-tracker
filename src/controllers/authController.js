import User from "../models/User.js";
import { generateToken } from "../middleware/auth.js";

// ─── POST /api/auth/register ──────────────────────────────────────────────────
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role, province, district, station } = req.body;

    // Only hq_admin can create other hq_admins
    if (role === "hq_admin" && req.user?.role !== "hq_admin") {
      return res.status(403).json({ success: false, message: "Only HQ admins can create HQ admin accounts." });
    }

    const user = await User.create({ name, email, password, role, province, district, station });
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: "User registered successfully.",
      data: {
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    // Explicitly select password for comparison (it's excluded by default)
    const user = await User.findOne({ email }).select("+password");

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "Invalid credentials or account is deactivated." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          province: user.province,
          district: user.district,
        },
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

// ─── GET /api/auth/users (admin) ──────────────────────────────────────────────
export const getAllUsers = async (req, res, next) => {
  try {
    const { role, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role) filter.role = role;

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter).select("-password").skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: users,
      meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/auth/users/:id/deactivate (admin) ────────────────────────────
export const deactivateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    res.status(200).json({ success: true, message: "User deactivated.", data: user });
  } catch (error) {
    next(error);
  }
};
