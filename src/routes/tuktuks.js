import { Router } from "express";
import {
  getTukTuks, getTukTuk, createTukTuk, updateTukTuk, deleteTukTuk,
  getLastKnownLocation, getLocationHistory,
} from "../controllers/tukTukController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Tuk-Tuks
 *   description: Vehicle registration and management
 */

/**
 * @swagger
 * /api/tuktuks:
 *   get:
 *     summary: List all registered tuk-tuks with optional filtering
 *     tags: [Tuk-Tuks]
 *     parameters:
 *       - in: query
 *         name: province
 *         schema:
 *           type: string
 *         description: Filter by Province ID
 *       - in: query
 *         name: district
 *         schema:
 *           type: string
 *         description: Filter by District ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, suspended]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Full-text search on registration number or driver name
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: registrationNumber
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated list of tuk-tuks
 *   post:
 *     summary: Register a new tuk-tuk
 *     tags: [Tuk-Tuks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [registrationNumber, driverName, driverNIC, district, province]
 *             properties:
 *               registrationNumber:
 *                 type: string
 *                 example: WP ABC-1234
 *               driverName:
 *                 type: string
 *               driverNIC:
 *                 type: string
 *               driverPhone:
 *                 type: string
 *               district:
 *                 type: string
 *               province:
 *                 type: string
 *               deviceId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tuk-tuk registered
 */
router
  .route("/")
  .get(protect, getTukTuks)
  .post(protect, authorize("hq_admin", "provincial_admin", "station_officer"), createTukTuk);

/**
 * @swagger
 * /api/tuktuks/{id}:
 *   get:
 *     summary: Get a single tuk-tuk by ID
 *     tags: [Tuk-Tuks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tuk-tuk data
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update tuk-tuk details
 *     tags: [Tuk-Tuks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated successfully
 *   delete:
 *     summary: Remove a tuk-tuk (HQ Admin only)
 *     tags: [Tuk-Tuks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 */
router
  .route("/:id")
  .get(protect, getTukTuk)
  .put(protect, authorize("hq_admin", "provincial_admin", "station_officer"), updateTukTuk)
  .delete(protect, authorize("hq_admin"), deleteTukTuk);

/**
 * @swagger
 * /api/tuktuks/{id}/location:
 *   get:
 *     summary: Get last known location of a specific tuk-tuk
 *     tags: [Tuk-Tuks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Last known GPS location
 */
router.get("/:id/location", protect, getLastKnownLocation);

/**
 * @swagger
 * /api/tuktuks/{id}/history:
 *   get:
 *     summary: Get movement history for a specific tuk-tuk
 *     tags: [Tuk-Tuks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of time window (ISO 8601)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of time window (ISO 8601)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 500
 *     responses:
 *       200:
 *         description: Historical location pings
 */
router.get("/:id/history", protect, getLocationHistory);

export default router;
