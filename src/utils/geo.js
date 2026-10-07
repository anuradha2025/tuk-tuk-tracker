/** Geo helpers (no external dependencies). */
const R = 6371008.8; // mean Earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance between two {latitude, longitude} points, in metres. */
export const haversineMetres = (a, b) => {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};

/** GeoJSON Point ([lng, lat] order!). */
export const toPoint = (latitude, longitude) => ({
  type: "Point",
  coordinates: [longitude, latitude],
});

/** Generous bounding box around Sri Lanka (incl. coastal waters). Rejects 0,0 "null island" fixes. */
export const SL_BOUNDS = { latMin: 5.5, latMax: 10.2, lngMin: 79.3, lngMax: 82.2 };
export const inSriLanka = (lat, lng) =>
  lat >= SL_BOUNDS.latMin && lat <= SL_BOUNDS.latMax && lng >= SL_BOUNDS.lngMin && lng <= SL_BOUNDS.lngMax;

/** Start of the current day in Sri Lanka time (UTC+05:30), returned as a UTC Date. */
export const startOfDayColombo = (now = new Date()) => {
  const offset = 5.5 * 3600 * 1000;
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
};
