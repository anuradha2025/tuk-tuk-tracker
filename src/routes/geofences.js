import { Router } from "express";
import { body, param } from "express-validator";
import { getGeofences, createGeofence, deleteGeofence } from "../controllers/geofenceController.js";
import { protect, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Geofences
 *   description: Circular zones that raise alerts when vehicles enter (restricted) or leave (allowed)
 */

/**
 * @swagger
 * /api/geofences:
 *   get:
 *     summary: List active geofences visible to the caller
 *     tags: [Geofences]
 *     responses: { 200: { description: OK } }
 *   post:
 *     summary: Create a geofence (hq_admin; provincial_admin for own districts)
 *     tags: [Geofences]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, latitude, longitude, radiusMetres]
 *             properties:
 *               name: { type: string }
 *               type: { type: string, enum: [restricted, allowed] }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *               radiusMetres: { type: number, example: 500 }
 *               district: { type: string }
 *     responses: { 201: { description: Created } }
 */
router
  .route("/")
  .get(protect, getGeofences)
  .post(
    protect,
    authorize("hq_admin", "provincial_admin"),
    validate([
      body("name").isString().trim().notEmpty(),
      body("type").optional().isIn(["restricted", "allowed"]),
      body("latitude").isFloat({ min: -90, max: 90 }).toFloat(),
      body("longitude").isFloat({ min: -180, max: 180 }).toFloat(),
      body("radiusMetres").isFloat({ min: 50, max: 100000 }).toFloat(),
      body("district").optional().isMongoId(),
    ]),
    createGeofence
  );

/**
 * @swagger
 * /api/geofences/{id}:
 *   delete:
 *     summary: Disable a geofence
 *     tags: [Geofences]
 *     parameters: [ { in: path, name: id, required: true, schema: { type: string } } ]
 *     responses: { 200: { description: Disabled } }
 */
router.delete("/:id", protect, authorize("hq_admin", "provincial_admin"), validate([param("id").isMongoId()]), deleteGeofence);

export default router;
