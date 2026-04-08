import mongoose from "mongoose";

/**
 * @swagger
 * components:
 *   schemas:
 *     LocationPing:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         tukTuk:
 *           $ref: '#/components/schemas/TukTuk'
 *         latitude:
 *           type: number
 *           example: 6.9271
 *         longitude:
 *           type: number
 *           example: 79.8612
 *         speed:
 *           type: number
 *           description: Speed in km/h
 *         heading:
 *           type: number
 *           description: Direction in degrees (0-360)
 *         accuracy:
 *           type: number
 *           description: GPS accuracy in metres
 *         timestamp:
 *           type: string
 *           format: date-time
 */
const locationPingSchema = new mongoose.Schema(
  {
    tukTuk: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TukTuk",
      required: [true, "TukTuk reference is required"],
    },
    latitude: {
      type: Number,
      required: [true, "Latitude is required"],
      min: [-90, "Latitude must be between -90 and 90"],
      max: [90, "Latitude must be between -90 and 90"],
    },
    longitude: {
      type: Number,
      required: [true, "Longitude is required"],
      min: [-180, "Longitude must be between -180 and 180"],
      max: [180, "Longitude must be between -180 and 180"],
    },
    speed: {
      type: Number,
      min: [0, "Speed cannot be negative"],
      default: 0,
    },
    heading: {
      type: Number,
      min: [0, "Heading must be between 0 and 360"],
      max: [360, "Heading must be between 0 and 360"],
      default: 0,
    },
    accuracy: {
      type: Number, // metres
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    // No automatic createdAt/updatedAt – timestamp field serves this purpose
    timestamps: false,
  }
);

// ─── Compound indexes for efficient history & live-view queries ───────────────
locationPingSchema.index({ tukTuk: 1, timestamp: -1 }); // History per vehicle
locationPingSchema.index({ timestamp: -1 }); // Global recency
locationPingSchema.index({ tukTuk: 1, timestamp: 1 }); // Range queries

// ─── TTL index: auto-delete pings older than 90 days to manage storage ────────
locationPingSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const LocationPing = mongoose.model("LocationPing", locationPingSchema);
export default LocationPing;
