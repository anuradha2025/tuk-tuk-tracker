# Review notes & changes (branch: `feature/security-and-tracking`)

## Defects found in the original
| # | Severity | Problem | Fix |
|---|----------|---------|-----|
| 1 | **Critical** | `POST /auth/register` was public: anyone could create a `provincial_admin` / `station_officer` account | HQ-only, strong-password rules, scope fields required per role |
| 2 | **Critical** | Any logged-in user (even a station officer) could submit pings for any vehicle; no device identity | Per-device `X-Device-Id` + `X-Device-Key` (SHA-256 hashed, rotatable, revoked on delete/suspend); `device` role removed |
| 3 | **Critical** | Authorization holes: `GET /tuktuks/:id`, `/location`, `/history` ignored jurisdiction (IDOR); scope filters *failed open* when a user had no province/district | `scopeFilter`/`inScope` fail closed; out-of-scope = 404 |
| 4 | High | Mass assignment (`create(req.body)`, `findByIdAndUpdate(req.body)`); client chose `province` independent of `district` | Field whitelist; province derived from district; officers limited to own jurisdiction |
| 5 | High | NoSQL operator injection (`?district[$ne]=x`, `{"email":{"$gt":""}}`) | `sanitize` middleware + type checks + `express-validator` (was installed but never used) |
| 6 | High | Seed TTL of 90 days deletes the "one week of history" before/after the demo | `PING_TTL_DAYS` (default 365); **re-seed before the demo** |
| 7 | High | `trust proxy` missing on Render → all clients share one rate-limit bucket | `app.set("trust proxy", 1)`; ping limiter keyed per device |
| 8 | Medium | Validation errors returned 500; unbounded `limit`, no date validation, unbounded history windows | 422 with field errors; caps; max 31-day window |
| 9 | Medium | `/live` scanned every ping with `$sort`+`$group` (slow at scale) | Denormalised `lastLocation` + indexes |
| 10 | Medium | Seeded vehicles and simulator barely moved (distance formula off by ~10⁵) and were placed around *province* centres, not their district | Realistic generator (see below) |
| 11 | Medium | No brute-force lockout, 7-day JWT, default password published for the deployed instance | 5-try/15-min lock, 8h JWT, password change invalidates tokens, seed password configurable |
| 12 | Low | Hard delete orphaned pings (evidence loss); redundant indexes; stats used server-timezone "today" | Soft delete; index clean-up; Asia/Colombo day boundary |

## New vehicle-tracking functionality
Live view with online/moving flags and GeoJSON · nearest vehicles · spatio-temporal "who was here" search · route replay (GeoJSON) · trips / stops / distance / idle time / top speed · speeding alerts · geofences with entry/exit alerts · alert acknowledgement · offline buffering via `/ping/batch` (out-of-order safe) · device-key rotation · suspend/reactivate · audit log of every tracking-data access.

## Simulation data
Every district has vehicles; each has a home and a town-centre stand inside its district; morning/evening peaks, lunch break, ~50% of Sundays off, overnight parking, 3 vehicles with unusual night movement, 5 occasional speeders, 4 vehicles that went silent 3 h ago, 4 vehicles sharing a stand at Colombo Fort for the investigation demo.

## Not done (worth mentioning in your report)
Refresh tokens · polygon (not circular) geofences and district polygons (so "currently located in district X" is approximated by registration district) · WebSocket/SSE push · HMAC-signed device payloads / mTLS · per-station user→vehicle assignment.
