import rateLimit from "express-rate-limit";

const json = (message) => ({ success: false, message });

const isProd = process.env.NODE_ENV === "production";

/** Global limiter – per IP. Device pings are excluded: they have their own per-device limiter. */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GLOBAL || 1000),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.path.startsWith("/api/locations/ping") ||
    // local testing only: RATE_LIMIT_DISABLED=true is ignored in production
    (!isProd && process.env.RATE_LIMIT_DISABLED === "true"),
  message: json("Too many requests from this IP. Please try again later."),
});

/** Strict limiter for login – mitigates credential stuffing / brute force. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: json("Too many authentication attempts. Please try again after 15 minutes."),
});

/**
 * Device ping limiter – keyed per DEVICE (not per IP): many devices can share one
 * mobile-carrier NAT address, and one noisy device must not starve the others.
 */
export const pingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PINGS_PER_MIN || 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers["x-device-id"] || req.ip,
  message: json("Ping rate limit exceeded for this device."),
});
