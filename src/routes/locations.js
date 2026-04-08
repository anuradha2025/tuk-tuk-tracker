import { Router } from "express";
import { submitPing, getLiveLocations, getHistory, getStats } from "../controllers/locationController.js";
import { protect, authorize } from "../middleware/auth.js";
import { pingLimiter } from "../middleware/rateLimiter.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Locations
 *   description: GPS location pings, live view, and historical movement tracking
 */

/**
 * @swagger
 * /api/locations/ping:
 *   post:
 *     summary: Submit a GPS location ping from a tuk-tuk device
 *     tags: [Locations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tukTukId, latitude, longitude]
 *             properties:
 *               tukTukId:
 *                 type: string
 *                 description: MongoDB ID of the tuk-tuk
 *               latitude:
 *                 type: number
 *                 example: 6.9271
 *               longitude:
 *                 type: number
 *                 example: 79.8612
 *               speed:
 *                 type: number
 *                 description: Speed in km/h
 *               heading:
 *                 type: number
 *                 description: Direction in degrees (0-360)
 *               accuracy:
 *                 type: number
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: Device-side timestamp (defaults to server time)
 *     responses:
 *       201:
 *         description: Ping recorded
 *       403:
 *         description: Vehicle is suspended
 *       404:
 *         description: Tuk-tuk not found
 */
router.post("/ping", pingLimiter, protect, submitPing);

/**
 * @swagger
 * /api/locations/live:
 *   get:
 *     summary: Get the latest location for all active tuk-tuks (live view)
 *     tags: [Locations]
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
 *     responses:
 *       200:
 *         description: Live map data – one record per active vehicle
 */
router.get("/live", protect, getLiveLocations);

/**
 * @swagger
 * /api/locations/history:
 *   get:
 *     summary: Query movement history across vehicles with time-window and area filters
 *     tags: [Locations]
 *     parameters:
 *       - in: query
 *         name: tukTukId
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of time window
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of time window
 *       - in: query
 *         name: province
 *         schema:
 *           type: string
 *       - in: query
 *         name: district
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: Paginated movement history records
 */
router.get("/history", protect, getHistory);

/**
 * @swagger
 * /api/locations/stats:
 *   get:
 *     summary: Get system-wide tracking statistics (HQ Admin / Provincial Admin)
 *     tags: [Locations]
 *     responses:
 *       200:
 *         description: Summary statistics including active vehicles and daily pings
 */
router.get("/stats", protect, authorize("hq_admin", "provincial_admin"), getStats);

export default router;
