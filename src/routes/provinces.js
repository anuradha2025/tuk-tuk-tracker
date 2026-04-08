import { Router } from "express";
import {
  getProvinces, getProvince, createProvince, updateProvince, deleteProvince,
} from "../controllers/provinceController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Provinces
 *   description: Sri Lanka province management
 */

/**
 * @swagger
 * /api/provinces:
 *   get:
 *     summary: Get all provinces
 *     tags: [Provinces]
 *     parameters:
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
 *         description: List of all 9 provinces
 *   post:
 *     summary: Create a province (HQ Admin only)
 *     tags: [Provinces]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Western Province
 *               code:
 *                 type: string
 *                 example: WP
 *               capital:
 *                 type: string
 *                 example: Colombo
 *     responses:
 *       201:
 *         description: Province created
 */
router
  .route("/")
  .get(protect, getProvinces)
  .post(protect, authorize("hq_admin"), createProvince);

/**
 * @swagger
 * /api/provinces/{id}:
 *   get:
 *     summary: Get a single province by ID
 *     tags: [Provinces]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Province found
 *       404:
 *         description: Province not found
 *   put:
 *     summary: Update a province (HQ Admin only)
 *     tags: [Provinces]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Province updated
 *   delete:
 *     summary: Delete a province (HQ Admin only)
 *     tags: [Provinces]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Province deleted
 */
router
  .route("/:id")
  .get(protect, getProvince)
  .put(protect, authorize("hq_admin"), updateProvince)
  .delete(protect, authorize("hq_admin"), deleteProvince);

export default router;
