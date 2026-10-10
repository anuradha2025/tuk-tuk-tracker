import mongoose from "mongoose";

/**
 * @swagger
 * components:
 *   schemas:
 *     LocationPing:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         tukTuk: { $ref: '#/components/schemas/TukTuk' }
 *         latitude: { type: number, example: 6.9271 }
 *         longitude: { type: number, example: 79.8612 }
 *         speed: { type: number, description: "km/h" }
 *         heading: { type: number, description: "degrees 0-360" }
 *         accuracy: { type: number, description: "GPS accuracy, metres" }
 *         timestamp: { type: string, format: date-time, description: "Device (GPS) time" }
 *         receivedAt: { type: string, format: date-time, description: "Server time the ping arrived" }
 */
const locationPingSchema = new mongoose.Schema(
  {
    tukTuk: { type: mongoose.Schema.Types.ObjectId, ref: "TukTuk", required: [true, "TukTuk reference is required"] },
    latitude: { type: Number, required: [true, "Latitude is required"], min: -90, max: 90 },
    longitude: { type: Number, required: [true, "Longitude is required"], min: -180, max: 180 },
    // GeoJSON copy of lat/lng for $geoWithin / $near ("who was near this crime scene between 21:00 and 23:00?")
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number] },
    },
    speed: { type: Number, min: [0, "Speed cannot be negative"], default: 0 },
    heading: { type: Number, min: 0, max: 360, default: 0 },
    accuracy: { type: Number, min: 0, default: null },
    timestamp: { type: Date, default: Date.now },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

locationPingSchema.pre("validate", function (next) {
  if (!this.location?.coordinates?.length && this.latitude != null && this.longitude != null) {
    this.location = { type: "Point", coordinates: [this.longitude, this.latitude] };
  }
  next();
});

// One index serves history (asc or desc) and range queries for a vehicle.
locationPingSchema.index({ tukTuk: 1, timestamp: -1 });
// Spatio-temporal investigations.
locationPingSchema.index({ location: "2dsphere", timestamp: 1 });

// Retention: keep pings for PING_TTL_DAYS (default 365; set 0 to keep forever).
// NOTE: if an older TTL index (90 days) already exists on `timestamp`, drop it once:
//       db.locationpings.dropIndex("timestamp_1")   (re-running `npm run seed` also fixes this)
const ttlDays = Number(process.env.PING_TTL_DAYS ?? 365);
if (ttlDays > 0) {
  locationPingSchema.index({ timestamp: 1 }, { expireAfterSeconds: ttlDays * 24 * 60 * 60 });
}

const LocationPing = mongoose.model("LocationPing", locationPingSchema);
export default LocationPing;
