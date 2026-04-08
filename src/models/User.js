import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         email:
 *           type: string
 *         role:
 *           type: string
 *           enum: [hq_admin, provincial_admin, station_officer, device]
 *         province:
 *           type: string
 *           description: Assigned province (for provincial_admin)
 *         district:
 *           type: string
 *           description: Assigned district (for station_officer)
 *         station:
 *           type: string
 *           description: Assigned police station (for station_officer)
 *         isActive:
 *           type: boolean
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Never return password in queries
    },
    role: {
      type: String,
      enum: {
        values: ["hq_admin", "provincial_admin", "station_officer", "device"],
        message: "{VALUE} is not a valid role",
      },
      default: "station_officer",
    },
    // Scope restrictions per role
    province: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Province",
      default: null,
    },
    district: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "District",
      default: null,
    },
    station: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoliceStation",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Pre-save Hook: Hash password before storing ──────────────────────────────
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ─── Instance Method: Compare plain password with hash ───────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
