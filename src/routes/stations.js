import { Router } from "express";
import {
  getStations, getStation, createStation, updateStation, deleteStation,
} from "../controllers/stationController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Police Stations
 *   description: Police station management
 */

/**
 * @swagger
 * /api/stations:
 *   get:
 *     summary: Get all police stations (optionally filter by district)
 *     tags: [Police Stations]
 *     parameters:
 *       - in: query
 *         name: district
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: name
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of police stations
 *   post:
 *     summary: Create a police station (HQ Admin or Provincial Admin)
 *     tags: [Police Stations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, stationCode, district]
 *             properties:
 *               name:
 *                 type: string
 *               stationCode:
 *                 type: string
 *               district:
 *                 type: string
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       201:
 *         description: Police station created
 */
router
  .route("/")
  .get(protect, getStations)
  .post(protect, authorize("hq_admin", "provincial_admin"), createStation);

/**
 * @swagger
 * /api/stations/{id}:
 *   get:
 *     summary: Get a single police station
 *     tags: [Police Stations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Station details
 *       404:
 *         description: Station not found
 *   put:
 *     summary: Update a police station
 *     tags: [Police Stations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Station updated
 *   delete:
 *     summary: Delete a police station (HQ Admin only)
 *     tags: [Police Stations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Station deleted
 */
router
  .route("/:id")
  .get(protect, getStation)
  .put(protect, authorize("hq_admin", "provincial_admin"), updateStation)
  .delete(protect, authorize("hq_admin"), deleteStation);

export default router;
