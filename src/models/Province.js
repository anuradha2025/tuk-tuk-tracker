import mongoose from "mongoose";

/**
 * @swagger
 * components:
 *   schemas:
 *     Province:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *           example: Western Province
 *         code:
 *           type: string
 *           example: WP
 *         capital:
 *           type: string
 *           example: Colombo
 */
const provinceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Province name is required"],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: [true, "Province code is required"],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [5, "Code cannot exceed 5 characters"],
    },
    capital: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

const Province = mongoose.model("Province", provinceSchema);
export default Province;
