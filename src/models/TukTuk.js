import mongoose from "mongoose";

/**
 * @swagger
 * components:
 *   schemas:
 *     TukTuk:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         registrationNumber:
 *           type: string
 *           example: WP ABC-1234
 *         driverName:
 *           type: string
 *         driverNIC:
 *           type: string
 *         driverPhone:
 *           type: string
 *         district:
 *           $ref: '#/components/schemas/District'
 *         province:
 *           $ref: '#/components/schemas/Province'
 *         deviceId:
 *           type: string
 *           description: Unique identifier of the GPS tracking device
 *         status:
 *           type: string
 *           enum: [active, inactive, suspended]
 *         isActive:
 *           type: boolean
 */
const tukTukSchema = new mongoose.Schema(
  {
    registrationNumber: {
      type: String,
      required: [true, "Registration number is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    driverName: {
      type: String,
      required: [true, "Driver name is required"],
      trim: true,
    },
    driverNIC: {
      type: String,
      required: [true, "Driver NIC is required"],
      unique: true,
      trim: true,
    },
    driverPhone: {
      type: String,
      trim: true,
    },
    district: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "District",
      required: [true, "District reference is required"],
    },
    province: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Province",
      required: [true, "Province reference is required"],
    },
    deviceId: {
      type: String,
      unique: true,
      sparse: true, // Allow multiple nulls
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ["active", "inactive", "suspended"],
        message: "{VALUE} is not a valid status",
      },
      default: "active",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    registeredAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes for common query patterns ───────────────────────────────────────
tukTukSchema.index({ province: 1, district: 1 });
tukTukSchema.index({ status: 1 });
tukTukSchema.index({ deviceId: 1 });
tukTukSchema.index({ registrationNumber: "text", driverName: "text" });

const TukTuk = mongoose.model("TukTuk", tukTukSchema);
export default TukTuk;
