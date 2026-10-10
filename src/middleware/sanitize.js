/**
 * Strips MongoDB operator injection (`{"$gt": ""}`, `a.b` keys) from body, query and params.
 * Without this, `?province[$ne]=x` or `{"email": {"$gt": ""}}` become query operators.
 */
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith("$") || k.includes(".")) continue;
      out[k] = clean(v);
    }
    return out;
  }
  return value;
};

export const sanitize = (req, _res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.query) {
    // Express 4 allows reassigning req.query; Express 5 does not, so mutate in place there.
    const cleaned = clean(req.query);
    for (const k of Object.keys(req.query)) delete req.query[k];
    Object.assign(req.query, cleaned);
  }
  if (req.params) req.params = clean(req.params);
  next();
};
