import { Router } from "express";
import {
  getDistricts, getDistrict, createDistrict, updateDistrict, deleteDistrict,
} from "../controllers/districtController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Districts
 *   description: Sri Lanka district management
 */

/**
 * @swagger
 * /api/districts:
 *   get:
 *     summary: Get all districts (optionally filter by province)
 *     tags: [Districts]
 *     parameters:
 *       - in: query
 *         name: province
 *         schema:
 *           type: string
 *         description: Filter by Province ID
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
 *     responses:
 *       200:
 *         description: List of districts
 *   post:
 *     summary: Create a district (HQ Admin only)
 *     tags: [Districts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, province]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Colombo
 *               code:
 *                 type: string
 *                 example: CMB
 *               province:
 *                 type: string
 *                 description: Province ObjectId
 *     responses:
 *       201:
 *         description: District created
 */
router
  .route("/")
  .get(protect, getDistricts)
  .post(protect, authorize("hq_admin"), createDistrict);

/**
 * @swagger
 * /api/districts/{id}:
 *   get:
 *     summary: Get a single district
 *     tags: [Districts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: District data
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update a district (HQ Admin only)
 *     tags: [Districts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: District updated
 *   delete:
 *     summary: Delete a district (HQ Admin only)
 *     tags: [Districts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: District deleted
 */
router
  .route("/:id")
  .get(protect, getDistrict)
  .put(protect, authorize("hq_admin"), updateDistrict)
  .delete(protect, authorize("hq_admin"), deleteDistrict);

export default router;
