import mongoose from "mongoose";

const mongoServerSelectionTimeoutMS = Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 30000);

/**
 * Connects to MongoDB using the URI defined in environment variables.
 * Exits the process if connection fails (fail-fast on startup).
 */
export const connectDB = async () => {
  try {
    // Prefer a direct (non-`mongodb+srv`) URI when provided, since some
    // environments can fail during SRV DNS resolution.
    const mongoUri = process.env.MONGODB_URI_DIRECT || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error(
        "Missing MongoDB URI. Set MONGODB_URI (and optionally MONGODB_URI_DIRECT) in .env"
      );
    }

    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: mongoServerSelectionTimeoutMS,
      family: 4,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);

    // Log disconnect/reconnect events for monitoring
    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected. Attempting to reconnect...");
    });
    mongoose.connection.on("reconnected", () => {
      console.log("✅ MongoDB reconnected.");
    });
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};
