import Alert from "../models/Alert.js";
import Geofence from "../models/Geofence.js";
import { haversineMetres } from "../utils/geo.js";

const SPEED_LIMIT_KMH = Number(process.env.SPEED_LIMIT_KMH || 60);
const SPEED_ALERT_COOLDOWN_MS = 5 * 60 * 1000;

const inside = (fence, lat, lng) =>
  haversineMetres(
    { latitude: lat, longitude: lng },
    { latitude: fence.center.coordinates[1], longitude: fence.center.coordinates[0] }
  ) <= fence.radiusMetres;

/**
 * Evaluates one fresh ping against speed limit + geofences and stores any alerts.
 * `previous` is the vehicle's previous lastLocation (or undefined for its first ping).
 * Never throws: alerting must not make a location ping fail.
 */
export const evaluatePing = async (vehicle, ping, previous) => {
  try {
    const base = {
      tukTuk: vehicle._id,
      province: vehicle.province,
      district: vehicle.district,
      speed: ping.speed,
      location: { type: "Point", coordinates: [ping.longitude, ping.latitude] },
      timestamp: ping.timestamp,
    };
    const created = [];

    // 1. Speeding (de-duplicated: one alert per vehicle per cooldown window)
    if (ping.speed > SPEED_LIMIT_KMH) {
      const recent = await Alert.exists({
        tukTuk: vehicle._id,
        type: "speeding",
        timestamp: { $gte: new Date(new Date(ping.timestamp).getTime() - SPEED_ALERT_COOLDOWN_MS) },
      });
      if (!recent) {
        created.push({
          ...base,
          type: "speeding",
          severity: ping.speed > SPEED_LIMIT_KMH * 1.4 ? "critical" : "warning",
          message: `${vehicle.registrationNumber} travelling at ${ping.speed} km/h (limit ${SPEED_LIMIT_KMH} km/h).`,
        });
      }
    }

    // 2. Geofence transitions (needs a previous fix to detect a crossing)
    if (previous?.point) {
      const fences = await Geofence.find({
        isActive: true,
        $and: [
          { $or: [{ province: null }, { province: vehicle.province }] },
          { $or: [{ district: null }, { district: vehicle.district }] },
        ],
      });
      const [pLng, pLat] = previous.point.coordinates;
      for (const f of fences) {
        const wasIn = inside(f, pLat, pLng);
        const isIn = inside(f, ping.latitude, ping.longitude);
        if (wasIn === isIn) continue;
        const entered = isIn;
        // restricted zone: entering is a violation. allowed zone: leaving is a violation.
        const violation = (f.type === "restricted" && entered) || (f.type === "allowed" && !entered);
        if (!violation) continue;
        created.push({
          ...base,
          type: entered ? "geofence_entry" : "geofence_exit",
          severity: "critical",
          geofence: f._id,
          message: `${vehicle.registrationNumber} ${entered ? "entered" : "left"} ${f.type} zone "${f.name}".`,
        });
      }
    }

    if (created.length) await Alert.insertMany(created);
    return created.length;
  } catch (err) {
    console.error("[ALERTS] evaluation failed:", err.message);
    return 0;
  }
};
