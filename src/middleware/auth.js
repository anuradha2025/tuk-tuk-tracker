import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import TukTuk from "../models/TukTuk.js";

/**
 * Verifies the JWT Bearer token and attaches the user to req.user.
 * Re-reads the user on every request so deactivation takes effect immediately,
 * and rejects tokens issued before the last password change.
 */
export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Access denied. No valid authorization header provided." });
    }

    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "User account not found or has been deactivated." });
    }
    if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
      return res.status(401).json({ success: false, message: "Password was changed. Please log in again." });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token has expired." });
    }
    return res.status(401).json({ success: false, message: "Invalid token." });
  }
};

/** Role-based access control: authorize("hq_admin", "provincial_admin") */
export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Role '${req.user.role}' is not permitted to perform this action.`,
    });
  }
  next();
};

export const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "8h" });

// ─── Device authentication ───────────────────────────────────────────────────
// Tracking devices are not users. Each device holds its own API key
// (headers: X-Device-Id + X-Device-Key) bound to exactly ONE vehicle, so a
// compromised device can only ever report its own position.
export const hashDeviceKey = (key) => crypto.createHash("sha256").update(key).digest("hex");
export const generateDeviceKey = () => `dk_${crypto.randomBytes(32).toString("hex")}`;

// SHA-256 (not bcrypt) is appropriate here: the key is 256 bits of randomness, and
// devices authenticate on every ping, so a deliberately slow hash would only add load.
export const deviceAuth = async (req, res, next) => {
  try {
    const deviceId = req.headers["x-device-id"];
    const key = req.headers["x-device-key"];
    if (typeof deviceId !== "string" || typeof key !== "string") {
      return res.status(401).json({ success: false, message: "Missing X-Device-Id / X-Device-Key headers." });
    }

    const vehicle = await TukTuk.findOne({ deviceId }).select("+deviceKeyHash");
    const given = Buffer.from(hashDeviceKey(key));
    const stored = Buffer.from(vehicle?.deviceKeyHash || "0".repeat(64));
    const ok = given.length === stored.length && crypto.timingSafeEqual(given, stored);
    if (!vehicle || !vehicle.deviceKeyHash || !ok) {
      return res.status(401).json({ success: false, message: "Invalid device credentials." });
    }
    if (!vehicle.isActive || vehicle.status !== "active") {
      return res.status(403).json({ success: false, message: `Vehicle is ${vehicle.isActive ? vehicle.status : "deregistered"}; pings are not accepted.` });
    }
    req.device = vehicle;
    next();
  } catch (error) {
    next(error);
  }
};
