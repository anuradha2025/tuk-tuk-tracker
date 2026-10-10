import AuditLog from "../models/AuditLog.js";

/**
 * Records WHO looked at tracking data, WHAT they asked for, and the outcome.
 * Essential for a law-enforcement location system (accountability / misuse detection).
 * Usage: router.get("/live", protect, audit("VIEW_LIVE"), handler)
 */
export const audit = (action) => (req, res, next) => {
  res.on("finish", () => {
    AuditLog.create({
      user: req.user?._id,
      role: req.user?.role,
      action,
      path: req.originalUrl.split("?")[0],
      params: { ...req.params },
      query: { ...req.query },
      ip: req.ip,
      statusCode: res.statusCode,
    }).catch((e) => console.error("[AUDIT] failed to write log:", e.message));
  });
  next();
};
