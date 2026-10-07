import mongoose from "mongoose";

/**
 * @swagger
 * components:
 *   schemas:
 *     Geofence:
 *       type: object
 *       properties:
 *         name: { type: string, example: "Colombo Fort restricted zone" }
 *         type: { type: string, enum: [restricted, allowed], description: "restricted: alert on ENTRY. allowed: alert on EXIT." }
 *         center: { type: object, description: "GeoJSON Point [lng, lat]" }
 *         radiusMetres: { type: number, example: 500 }
 *         district: { type: string, nullable: true }
 *         province: { type: string, nullable: true }
 */
const geofenceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500 },
    type: { type: String, enum: ["restricted", "allowed"], default: "restricted" },
    center: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
    },
    radiusMetres: { type: Number, required: true, min: 50, max: 100000 },
    // Optional jurisdiction: null/null = applies to every vehicle
    province: { type: mongoose.Schema.Types.ObjectId, ref: "Province", default: null },
    district: { type: mongoose.Schema.Types.ObjectId, ref: "District", default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
geofenceSchema.index({ isActive: 1, province: 1, district: 1 });

export default mongoose.model("Geofence", geofenceSchema);
