import rateLimit from "express-rate-limit";

/**
 * Global rate limiter – applied to all routes.
 * Allows 200 requests per 15-minute window per IP.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP. Please try again after 15 minutes.",
  },
});

/**
 * Strict limiter for authentication endpoints.
 * Mitigates brute-force attacks on login/register.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again after 15 minutes.",
  },
});

/**
 * High-throughput limiter for device location ping endpoints.
 * Tuk-tuk devices may ping frequently; allow up to 1000/15 min per IP.
 */
export const pingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Ping rate limit exceeded.",
  },
});
