import mongoose from "mongoose";

/**
 * @swagger
 * components:
 *   schemas:
 *     PoliceStation:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *           example: Colombo Fort Police Station
 *         stationCode:
 *           type: string
 *           example: PS-CMB-001
 *         district:
 *           $ref: '#/components/schemas/District'
 *         address:
 *           type: string
 *         phone:
 *           type: string
 *         latitude:
 *           type: number
 *         longitude:
 *           type: number
 *         isActive:
 *           type: boolean
 */
const policeStationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Station name is required"],
      trim: true,
    },
    stationCode: {
      type: String,
      required: [true, "Station code is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    district: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "District",
      required: [true, "District reference is required"],
    },
    address: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    latitude: {
      type: Number,
      min: [-90, "Latitude must be between -90 and 90"],
      max: [90, "Latitude must be between -90 and 90"],
    },
    longitude: {
      type: Number,
      min: [-180, "Longitude must be between -180 and 180"],
      max: [180, "Longitude must be between -180 and 180"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

policeStationSchema.index({ district: 1 });

const PoliceStation = mongoose.model("PoliceStation", policeStationSchema);
export default PoliceStation;
