import { haversineMetres } from "./geo.js";

/**
 * Turns an ascending list of pings into trips, stops and summary statistics.
 *  - A trip starts when speed >= movingKmh and ends after `stopMinutes` of no movement.
 *  - Implied speeds above 200 km/h between consecutive fixes are treated as GPS glitches
 *    and excluded from distance.
 */
export const analyseTrack = (pings, { stopMinutes = 5, movingKmh = 3 } = {}) => {
  const trips = [];
  const stops = [];
  let trip = null;
  let lastMoving = null;
  let stopStart = pings[0] || null;
  let totalM = 0;
  let movingMs = 0;
  let maxSpeed = 0;

  const dist = (a, b) => {
    const m = haversineMetres(a, b);
    const dt = (new Date(b.timestamp) - new Date(a.timestamp)) / 1000;
    return dt > 0 && (m / dt) * 3.6 > 200 ? 0 : m;
  };
  const point = (p) => ({ latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp });
  const closeTrip = (endPing) => {
    trip.end = point(endPing);
    trip.durationMinutes = +((new Date(endPing.timestamp) - new Date(trip.start.timestamp)) / 60000).toFixed(1);
    trip.distanceKm = +(trip.distanceM / 1000).toFixed(2);
    trip.averageSpeedKmh = trip.durationMinutes ? +((trip.distanceKm / trip.durationMinutes) * 60).toFixed(1) : 0;
    delete trip.distanceM;
    trips.push(trip);
    trip = null;
    stopStart = endPing;
  };

  for (let i = 0; i < pings.length; i++) {
    const p = pings[i];
    const prev = pings[i - 1];
    const d = prev ? dist(prev, p) : 0;
    totalM += d;
    if (p.speed > maxSpeed) maxSpeed = p.speed;

    if (p.speed >= movingKmh) {
      if (!trip) {
        const origin = prev || p;
        if (stopStart && new Date(origin.timestamp) - new Date(stopStart.timestamp) > 0) {
          stops.push({
            start: point(stopStart),
            end: point(origin),
            durationMinutes: +((new Date(origin.timestamp) - new Date(stopStart.timestamp)) / 60000).toFixed(1),
          });
        }
        trip = { start: point(origin), distanceM: 0, maxSpeedKmh: 0 };
      }
      trip.distanceM += d;
      trip.maxSpeedKmh = Math.max(trip.maxSpeedKmh, p.speed);
      if (prev) movingMs += new Date(p.timestamp) - new Date(prev.timestamp);
      lastMoving = p;
    } else if (trip && new Date(p.timestamp) - new Date(lastMoving.timestamp) >= stopMinutes * 60000) {
      closeTrip(lastMoving);
    } else if (trip) {
      trip.distanceM += d;
    }
  }
  if (trip && lastMoving) closeTrip(lastMoving);
  const last = pings[pings.length - 1];
  if (last && stopStart && new Date(last.timestamp) - new Date(stopStart.timestamp) >= stopMinutes * 60000) {
    stops.push({
      start: point(stopStart),
      end: point(last),
      durationMinutes: +((new Date(last.timestamp) - new Date(stopStart.timestamp)) / 60000).toFixed(1),
    });
  }

  const spanMs = pings.length > 1 ? new Date(last.timestamp) - new Date(pings[0].timestamp) : 0;
  const movingMin = movingMs / 60000;
  return {
    trips,
    stops,
    summary: {
      pingCount: pings.length,
      tripCount: trips.length,
      stopCount: stops.length,
      totalDistanceKm: +(totalM / 1000).toFixed(2),
      movingMinutes: +movingMin.toFixed(1),
      idleMinutes: +Math.max(0, spanMs / 60000 - movingMin).toFixed(1),
      maxSpeedKmh: +maxSpeed.toFixed(1),
      averageMovingSpeedKmh: movingMin ? +(totalM / 1000 / (movingMin / 60)).toFixed(1) : 0,
    },
  };
};
