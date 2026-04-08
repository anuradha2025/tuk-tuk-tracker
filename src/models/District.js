import mongoose from "mongoose";

/**
 * @swagger
 * components:
 *   schemas:
 *     District:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *           example: Colombo
 *         code:
 *           type: string
 *           example: CMB
 *         province:
 *           $ref: '#/components/schemas/Province'
 */
const districtSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "District name is required"],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: [true, "District code is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    province: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Province",
      required: [true, "Province reference is required"],
    },
  },
  { timestamps: true }
);

// Index for quick province-based lookups
districtSchema.index({ province: 1 });

const District = mongoose.model("District", districtSchema);
export default District;
