import { Router } from "express";
import { body, query } from "express-validator";
import { submitPing, submitBatch, getLiveLocations, getHistory, getStats, getNearby, searchArea } from "../controllers/locationController.js";
import { protect, authorize, deviceAuth } from "../middleware/auth.js";
import { pingLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { audit } from "../middleware/audit.js";
import { SL_BOUNDS } from "../utils/geo.js";

const router = Router();

const pingFields = (prefix = "") => [
  body(`${prefix}latitude`).isFloat({ min: SL_BOUNDS.latMin, max: SL_BOUNDS.latMax }).withMessage("latitude must be a number inside Sri Lanka").toFloat(),
  body(`${prefix}longitude`).isFloat({ min: SL_BOUNDS.lngMin, max: SL_BOUNDS.lngMax }).withMessage("longitude must be a number inside Sri Lanka").toFloat(),
  body(`${prefix}speed`).optional().isFloat({ min: 0, max: 250 }).toFloat(),
  body(`${prefix}heading`).optional().isFloat({ min: 0, max: 360 }).toFloat(),
  body(`${prefix}accuracy`).optional().isFloat({ min: 0, max: 10000 }).toFloat(),
  body(`${prefix}timestamp`).optional().isISO8601().withMessage("timestamp must be ISO-8601"),
];
const window = [
  query("from").optional().isISO8601(),
  query("to").optional().isISO8601(),
];
const circle = [
  query("lat").isFloat({ min: -90, max: 90 }).withMessage("lat required"),
  query("lng").isFloat({ min: -180, max: 180 }).withMessage("lng required"),
  query("radius").optional().isFloat({ min: 10, max: 20000 }).withMessage("radius must be 10–20000 metres"),
];

/**
 * @swagger
 * tags:
 *   - name: Device Ingest
 *     description: Called by tracking devices. Auth = X-Device-Id + X-Device-Key headers (NOT a user JWT).
 *   - name: Locations
 *     description: Live view, history, spatial and investigative queries for authorised officers
 */

/**
 * @swagger
 * /api/locations/ping:
 *   post:
 *     summary: Submit one GPS fix (device)
 *     tags: [Device Ingest]
 *     security: [ { DeviceKey: [], DeviceId: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number, example: 6.9344 }
 *               longitude: { type: number, example: 79.8428 }
 *               speed: { type: number, example: 24.5 }
 *               heading: { type: number, example: 90 }
 *               accuracy: { type: number, example: 8 }
 *               timestamp: { type: string, format: date-time }
 *     responses:
 *       201: { description: Recorded }
 *       401: { description: Bad device credentials }
 *       403: { description: Vehicle suspended / deregistered }
 *       422: { description: Validation failed or timestamp rejected }
 *       429: { description: Per-device rate limit exceeded }
 */
router.post("/ping", pingLimiter, deviceAuth, validate(pingFields()), submitPing);

/**
 * @swagger
 * /api/locations/ping/batch:
 *   post:
 *     summary: Upload up to 100 buffered fixes after a signal outage (device)
 *     tags: [Device Ingest]
 *     security: [ { DeviceKey: [], DeviceId: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pings]
 *             properties:
 *               pings: { type: array, maxItems: 100, items: { type: object, required: [latitude, longitude, timestamp] } }
 *     responses:
 *       201: { description: Accepted (response lists any rejected indexes) }
 *       422: { description: Nothing accepted }
 */
router.post(
  "/ping/batch",
  pingLimiter,
  deviceAuth,
  validate([
    body("pings").isArray({ min: 1, max: 100 }).withMessage("pings must be an array of 1–100 fixes"),
    ...pingFields("pings.*."),
    body("pings.*.timestamp").exists().withMessage("timestamp is required for buffered fixes").isISO8601(),
  ]),
  submitBatch
);

/**
 * @swagger
 * /api/locations/live:
 *   get:
 *     summary: Last-known position of every vehicle in the caller's jurisdiction
 *     tags: [Locations]
 *     parameters:
 *       - { in: query, name: province, schema: { type: string } }
 *       - { in: query, name: district, schema: { type: string } }
 *       - { in: query, name: online, schema: { type: boolean }, description: "only vehicles seen in the last 10 min" }
 *       - { in: query, name: moving, schema: { type: boolean } }
 *       - { in: query, name: format, schema: { type: string, enum: [json, geojson] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 500 } }
 *     responses:
 *       200: { description: Live positions with online/moving flags }
 */
router.get("/live", protect, audit("VIEW_LIVE"), getLiveLocations);

/**
 * @swagger
 * /api/locations/nearby:
 *   get:
 *     summary: Vehicles currently nearest to a point (e.g. an incident)
 *     tags: [Locations]
 *     parameters:
 *       - { in: query, name: lat, required: true, schema: { type: number }, example: 6.9344 }
 *       - { in: query, name: lng, required: true, schema: { type: number }, example: 79.8428 }
 *       - { in: query, name: radius, schema: { type: number, default: 2000 }, description: metres }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: Vehicles sorted by distance }
 */
router.get("/nearby", protect, audit("VIEW_NEARBY"), validate(circle), getNearby);

/**
 * @swagger
 * /api/locations/search-area:
 *   get:
 *     summary: "Investigation: which vehicles were inside this circle during this time window?"
 *     tags: [Locations]
 *     parameters:
 *       - { in: query, name: lat, required: true, schema: { type: number } }
 *       - { in: query, name: lng, required: true, schema: { type: number } }
 *       - { in: query, name: radius, schema: { type: number, default: 500 } }
 *       - { in: query, name: from, required: true, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, required: true, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { description: Vehicles with first/last seen in the area }
 */
router.get(
  "/search-area",
  protect,
  audit("SEARCH_AREA"),
  validate([...circle, query("from").isISO8601().withMessage("from required"), query("to").isISO8601().withMessage("to required")]),
  searchArea
);

/**
 * @swagger
 * /api/locations/history:
 *   get:
 *     summary: Movement log across vehicles (max 31-day window; default last 24h)
 *     tags: [Locations]
 *     parameters:
 *       - { in: query, name: tukTukId, schema: { type: string } }
 *       - { in: query, name: province, schema: { type: string } }
 *       - { in: query, name: district, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 1000 } }
 *     responses:
 *       200: { description: Paginated pings (Link / X-Total-Count headers) }
 */
router.get(
  "/history",
  protect,
  audit("VIEW_HISTORY"),
  validate([...window, query("tukTukId").optional().isMongoId(), query("province").optional().isMongoId(), query("district").optional().isMongoId()]),
  getHistory
);

/**
 * @swagger
 * /api/locations/stats:
 *   get:
 *     summary: Fleet statistics – online/offline counts, pings today, open alerts (hq_admin, provincial_admin)
 *     tags: [Locations]
 *     responses:
 *       200: { description: Statistics scoped to the caller's jurisdiction }
 */
router.get("/stats", protect, authorize("hq_admin", "provincial_admin"), getStats);

export default router;
