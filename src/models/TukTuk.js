import mongoose from "mongoose";

/**
 * @swagger
 * components:
 *   schemas:
 *     TukTuk:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         registrationNumber: { type: string, example: "WP ABC-1234" }
 *         driverName: { type: string }
 *         driverNIC: { type: string }
 *         driverPhone: { type: string }
 *         district: { $ref: '#/components/schemas/District' }
 *         province: { $ref: '#/components/schemas/Province' }
 *         station: { type: string, description: "Registering police station" }
 *         deviceId: { type: string, description: "Unique id of the GPS tracking device" }
 *         status: { type: string, enum: [active, inactive, suspended] }
 *         lastLocation:
 *           type: object
 *           description: Denormalised latest fix (updated on every ping)
 *           properties:
 *             point: { type: object, description: "GeoJSON Point [lng, lat]" }
 *             speed: { type: number }
 *             heading: { type: number }
 *             timestamp: { type: string, format: date-time }
 *         lastSeenAt: { type: string, format: date-time }
 */
const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point", required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false }
);

const lastLocationSchema = new mongoose.Schema(
  {
    point: { type: pointSchema, required: true },
    speed: { type: Number, default: 0 },
    heading: { type: Number, default: 0 },
    accuracy: { type: Number, default: null },
    timestamp: { type: Date, required: true },
  },
  { _id: false }
);

const tukTukSchema = new mongoose.Schema(
  {
    registrationNumber: {
      type: String,
      required: [true, "Registration number is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    driverName: { type: String, required: [true, "Driver name is required"], trim: true },
    driverNIC: { type: String, required: [true, "Driver NIC is required"], unique: true, trim: true },
    driverPhone: { type: String, trim: true },
    district: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: [true, "District reference is required"] },
    province: { type: mongoose.Schema.Types.ObjectId, ref: "Province", required: [true, "Province reference is required"] },
    station: { type: mongoose.Schema.Types.ObjectId, ref: "PoliceStation", default: null },
    deviceId: { type: String, unique: true, sparse: true, trim: true },
    // SHA-256 of the device API key. The plaintext key is shown once, at issue/rotation.
    deviceKeyHash: { type: String, select: false },
    deviceKeyIssuedAt: { type: Date },
    status: {
      type: String,
      enum: { values: ["active", "inactive", "suspended"], message: "{VALUE} is not a valid status" },
      default: "active",
    },
    isActive: { type: Boolean, default: true }, // false = soft-deleted (history is preserved for investigations)
    deletedAt: { type: Date, default: null },
    registeredAt: { type: Date, default: Date.now },
    lastLocation: { type: lastLocationSchema, default: undefined },
    lastSeenAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    // The key hash must never reach a client, even on a freshly created document
    // (`select: false` only protects documents loaded from the database).
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.deviceKeyHash;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

tukTukSchema.index({ province: 1, district: 1 });
tukTukSchema.index({ status: 1 });
tukTukSchema.index({ registrationNumber: "text", driverName: "text" });
tukTukSchema.index({ "lastLocation.point": "2dsphere" }); // nearest-vehicle queries
tukTukSchema.index({ lastSeenAt: -1 });

const TukTuk = mongoose.model("TukTuk", tukTukSchema);
export default TukTuk;
