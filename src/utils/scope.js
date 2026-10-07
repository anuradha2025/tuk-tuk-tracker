/**
 * Role -> data-scope helpers.
 *
 * IMPORTANT: these FAIL CLOSED. A provincial_admin without an assigned province
 * (or a station_officer without a district) sees nothing, instead of everything.
 */
const NOTHING = { _id: { $in: [] } };

/** Mongo filter restricting a query on TukTuk / Alert (both have province & district) to the user's jurisdiction. */
export const scopeFilter = (user) => {
  switch (user.role) {
    case "hq_admin":
      return {};
    case "provincial_admin":
      return user.province ? { province: user.province } : NOTHING;
    case "station_officer":
      return user.district ? { district: user.district } : NOTHING;
    default:
      return NOTHING;
  }
};

/** True if the vehicle (with province/district as ObjectIds or populated docs) is inside the user's jurisdiction. */
export const inScope = (user, vehicle) => {
  const id = (v) => (v && v._id ? v._id : v);
  switch (user.role) {
    case "hq_admin":
      return true;
    case "provincial_admin":
      return !!user.province && String(id(vehicle.province)) === String(user.province);
    case "station_officer":
      return !!user.district && String(id(vehicle.district)) === String(user.district);
    default:
      return false;
  }
};
