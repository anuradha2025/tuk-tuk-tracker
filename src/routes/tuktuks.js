import { Router } from "express";
import { body, param, query } from "express-validator";
import {
  getTukTuks, getTukTuk, createTukTuk, updateTukTuk, deleteTukTuk,
  getLastKnownLocation, getLocationHistory, getRoute, getTrips, rotateDeviceKey, setStatus,
} from "../controllers/tukTukController.js";
import { protect, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { audit } from "../middleware/audit.js";

const router = Router();
const id = validate([param("id").isMongoId().withMessage("Invalid id")]);
const win = [query("from").optional().isISO8601(), query("to").optional().isISO8601()];
const officers = authorize("hq_admin", "provincial_admin", "station_officer");

/**
 * @swagger
 * tags:
 *   name: Tuk-Tuks
 *   description: Vehicle / driver / device registry and per-vehicle tracking
 */

/**
 * @swagger
 * /api/tuktuks:
 *   get:
 *     summary: List vehicles in the caller's jurisdiction
 *     tags: [Tuk-Tuks]
 *     parameters:
 *       - { in: query, name: province, schema: { type: string } }
 *       - { in: query, name: district, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [active, inactive, suspended] } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: sort, schema: { type: string, enum: [registrationNumber, driverName, status, registeredAt, lastSeenAt] } }
 *       - { in: query, name: order, schema: { type: string, enum: [asc, desc] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 200 } }
 *     responses:
 *       200: { description: Paginated list }
 *   post:
 *     summary: Register a vehicle (province derived from district). Returns the device key ONCE.
 *     tags: [Tuk-Tuks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [registrationNumber, driverName, driverNIC, district]
 *             properties:
 *               registrationNumber: { type: string, example: "WP ABC-1234" }
 *               driverName: { type: string }
 *               driverNIC: { type: string }
 *               driverPhone: { type: string }
 *               district: { type: string }
 *               station: { type: string }
 *               deviceId: { type: string }
 *     responses:
 *       201: { description: Created; body includes device.deviceKey }
 *       403: { description: District outside caller's jurisdiction }
 *       409: { description: Duplicate registration number / NIC / deviceId }
 */
router
  .route("/")
  .get(protect, getTukTuks)
  .post(
    protect,
    officers,
    validate([
      body("registrationNumber").isString().trim().notEmpty(),
      body("driverName").isString().trim().notEmpty().isLength({ max: 100 }),
      body("driverNIC").isString().trim().matches(/^(\d{9}[VvXx]|\d{12})$/).withMessage("driverNIC must be old (9 digits + V/X) or new (12 digits) format"),
      body("driverPhone").optional().matches(/^(\+94|0)\d{9}$/).withMessage("driverPhone must be a Sri Lankan number"),
      body("district").isMongoId(),
      body("station").optional().isMongoId(),
      body("deviceId").optional().isString().trim().isLength({ min: 3, max: 40 }),
    ]),
    createTukTuk
  );

/**
 * @swagger
 * /api/tuktuks/{id}:
 *   get:
 *     summary: Get one vehicle (404 if outside jurisdiction)
 *     tags: [Tuk-Tuks]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: OK }, 404: { description: Not found } }
 *   put:
 *     summary: Update driver / district / status (whitelisted fields only)
 *     tags: [Tuk-Tuks]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: Updated }, 403: { description: Outside jurisdiction } }
 *   delete:
 *     summary: Deregister (soft delete; history retained, device key revoked) – hq_admin
 *     tags: [Tuk-Tuks]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: Deregistered } }
 */
router
  .route("/:id")
  .get(id, protect, getTukTuk)
  .put(
    protect,
    officers,
    validate([
      param("id").isMongoId(),
      body("status").optional().isIn(["active", "inactive", "suspended"]),
      body("district").optional().isMongoId(),
      body("driverNIC").optional().matches(/^(\d{9}[VvXx]|\d{12})$/),
    ]),
    updateTukTuk
  )
  .delete(id, protect, authorize("hq_admin"), deleteTukTuk);

/**
 * @swagger
 * /api/tuktuks/{id}/status:
 *   patch:
 *     summary: Suspend / reactivate a vehicle
 *     tags: [Tuk-Tuks]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { type: object, properties: { status: { type: string, enum: [active, inactive, suspended] } } } } }
 *     responses: { 200: { description: Updated } }
 */
router.patch("/:id/status", protect, officers, validate([param("id").isMongoId(), body("status").isIn(["active", "inactive", "suspended"])]), setStatus);

/**
 * @swagger
 * /api/tuktuks/{id}/device-key:
 *   post:
 *     summary: Rotate the device API key (old key stops working immediately)
 *     tags: [Tuk-Tuks]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: New key, shown once } }
 */
router.post("/:id/device-key", id, protect, officers, rotateDeviceKey);

/**
 * @swagger
 * /api/tuktuks/{id}/location:
 *   get:
 *     summary: Last-known location with age and online flag
 *     tags: [Tuk-Tuks]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: OK } }
 */
router.get("/:id/location", id, protect, audit("VIEW_VEHICLE_LOCATION"), getLastKnownLocation);

/**
 * @swagger
 * /api/tuktuks/{id}/history:
 *   get:
 *     summary: Raw pings for a time window (default last 24h, max 31 days)
 *     tags: [Tuk-Tuks]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 5000 } }
 *     responses: { 200: { description: OK } }
 */
router.get("/:id/history", protect, audit("VIEW_VEHICLE_HISTORY"), validate([param("id").isMongoId(), ...win]), getLocationHistory);

/**
 * @swagger
 * /api/tuktuks/{id}/route:
 *   get:
 *     summary: Route replay as a GeoJSON LineString (max 7 days)
 *     tags: [Tuk-Tuks]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *     responses: { 200: { description: GeoJSON Feature } }
 */
router.get("/:id/route", protect, audit("VIEW_ROUTE"), validate([param("id").isMongoId(), ...win]), getRoute);

/**
 * @swagger
 * /api/tuktuks/{id}/trips:
 *   get:
 *     summary: Trips, stops, distance travelled, idle time and top speed (max 7 days)
 *     tags: [Tuk-Tuks]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *       - { in: query, name: stopMinutes, schema: { type: integer, default: 5 } }
 *     responses: { 200: { description: Trip analysis } }
 */
router.get("/:id/trips", protect, audit("VIEW_TRIPS"), validate([param("id").isMongoId(), ...win]), getTrips);

export default router;
