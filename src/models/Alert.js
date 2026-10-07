import mongoose from "mongoose";

/**
 * @swagger
 * components:
 *   schemas:
 *     Alert:
 *       type: object
 *       properties:
 *         type: { type: string, enum: [speeding, geofence_entry, geofence_exit] }
 *         severity: { type: string, enum: [info, warning, critical] }
 *         tukTuk: { type: string }
 *         message: { type: string }
 *         speed: { type: number }
 *         timestamp: { type: string, format: date-time }
 *         acknowledgedAt: { type: string, format: date-time, nullable: true }
 */
const alertSchema = new mongoose.Schema(
  {
    tukTuk: { type: mongoose.Schema.Types.ObjectId, ref: "TukTuk", required: true },
    type: { type: String, enum: ["speeding", "geofence_entry", "geofence_exit"], required: true },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "warning" },
    message: { type: String, required: true },
    geofence: { type: mongoose.Schema.Types.ObjectId, ref: "Geofence", default: null },
    speed: { type: Number },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number] },
    },
    timestamp: { type: Date, default: Date.now },
    // Denormalised so alerts can be scoped by jurisdiction with one indexed query
    province: { type: mongoose.Schema.Types.ObjectId, ref: "Province" },
    district: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    acknowledgedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
alertSchema.index({ province: 1, district: 1, timestamp: -1 });
alertSchema.index({ tukTuk: 1, type: 1, timestamp: -1 });
alertSchema.index({ acknowledgedAt: 1 });

export default mongoose.model("Alert", alertSchema);
