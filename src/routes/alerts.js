import { Router } from "express";
import { param, query } from "express-validator";
import { getAlerts, acknowledgeAlert } from "../controllers/alertController.js";
import { protect, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Alerts
 *   description: Speeding and geofence alerts raised automatically from incoming pings
 */

/**
 * @swagger
 * /api/alerts:
 *   get:
 *     summary: List alerts in the caller's jurisdiction
 *     tags: [Alerts]
 *     parameters:
 *       - { in: query, name: type, schema: { type: string, enum: [speeding, geofence_entry, geofence_exit] } }
 *       - { in: query, name: severity, schema: { type: string, enum: [info, warning, critical] } }
 *       - { in: query, name: acknowledged, schema: { type: boolean } }
 *       - { in: query, name: tukTukId, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *     responses: { 200: { description: Paginated alerts } }
 */
router.get(
  "/",
  protect,
  validate([
    query("type").optional().isIn(["speeding", "geofence_entry", "geofence_exit"]),
    query("severity").optional().isIn(["info", "warning", "critical"]),
    query("tukTukId").optional().isMongoId(),
    query("from").optional().isISO8601(),
    query("to").optional().isISO8601(),
  ]),
  getAlerts
);

/**
 * @swagger
 * /api/alerts/{id}/acknowledge:
 *   patch:
 *     summary: Acknowledge an alert
 *     tags: [Alerts]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: Acknowledged }, 404: { description: Not found } }
 */
router.patch("/:id/acknowledge", protect, authorize("hq_admin", "provincial_admin", "station_officer"), validate([param("id").isMongoId()]), acknowledgeAlert);

export default router;
