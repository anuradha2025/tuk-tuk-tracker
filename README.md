# Student ID: COBSCCOMP242P-020

# 🛺 Tuk-Tuk Tracker API

Real-time GPS tracking and movement logging system for three-wheelers in Sri Lanka.

## 🚀 Deployed

| Service | URL |
|---------|-----|
| API | https://tuk-tuk-tracker-api.onrender.com |
| Swagger Docs | https://tuk-tuk-tracker-api.onrender.com/api/docs/ |
| Health Check | https://tuk-tuk-tracker-api.onrender.com/health |

---

## 📋 Quick Start

### Prerequisites
- Node.js >= 18
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free tier)
### 1. Clone and Install

```bash
git clone https://github.com/anuradha2025/tuk-tuk-tracker
cd tuk-tuk-tracker
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
# Edit .env — add MONGODB_URI and JWT_SECRET
```

### 3. Seed Database

```bash
npm run seed
```

Populates: 9 provinces, 25 districts, 27 police stations, 5 users, 200 tuk-tuks (each with a device key), 8 days of patterned location history relative to *now*, speeding alerts and 2 geofences. **Re-run it shortly before your demo** so "last week" is really last week. On a free Atlas tier use `SEED_PING_INTERVAL_SEC=240` to keep the data small.

### 4. Run Locally

```bash
npm run dev     # Development with auto-restart (nodemon)
npm start       # Production
```

Access at `http://localhost:3000`

---

## 🛠️ Available Commands

```bash
npm start              # Start server (production)
npm run dev            # Start with nodemon (development)
npm run seed           # Seed database with sample data
npm run simulate       # Run live ping simulator (Ctrl+C to stop)
npm run export-data    # Export simulation data to JSON/CSV
npm test               # Run test suite (needs MongoDB)
npm run test:coverage  # Run tests with coverage report
npm run lint           # Run ESLint (0 errors/warnings)
```

---

## 🔑 Demo Credentials (created by `npm run seed`)

The seed password is `police123` unless you set `SEED_PASSWORD`. **Re-seed the deployed database with your own password** – never leave demo credentials on a public URL.

| Role | Email |
|------|-------|
| HQ Admin | admin@police.lk |
| WP Provincial Admin | wp.admin@police.lk |
| CP Provincial Admin | cp.admin@police.lk |
| Colombo Station Officer | colombo.officer@police.lk |
| Kandy Station Officer | kandy.officer@police.lk |

There is **no public sign-up**: HQ admins create accounts via `POST /api/auth/register`.

Tracking devices do not log in. Each vehicle has a `deviceId` + secret `deviceKey` (issued once when the vehicle is registered; `npm run seed` writes all 200 to the git-ignored `simulation-data/device-keys.json`).

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@police.lk","password":"police123"}'
```

Use returned token as: `Authorization: Bearer <token>`

---

## 📚 API Endpoints

### Auth — `/api/auth`

- `POST /login` — Login, receive JWT
- `POST /register` — Create account
- `GET /me` — Own profile
- `GET /users` — List users (hq_admin only)
- `PATCH /users/:id/deactivate` — Deactivate user (hq_admin only)

### Provinces — `/api/provinces`

- `GET /` — List all (supports sort & order)
- `GET /:id` — Get one
- `POST /` — Create (hq_admin only)
- `PUT /:id` — Update (hq_admin only)
- `DELETE /:id` — Delete (hq_admin only)

### Districts — `/api/districts`

- `GET /` — List by province (`?province=<id>`)
- `GET /:id` — Get one
- `POST /` — Create (hq_admin only)
- `PUT /:id` — Update (hq_admin only)
- `DELETE /:id` — Delete (hq_admin only)

### Police Stations — `/api/stations`

- `GET /` — List by district (`?district=<id>&page=1&limit=50`)
- `GET /:id` — Get one
- `POST /` — Create (hq_admin, provincial_admin)
- `PUT /:id` — Update (hq_admin, provincial_admin)
- `DELETE /:id` — Delete (hq_admin only)

### Tuk-Tuks — `/api/tuktuks`  (all reads are jurisdiction-scoped; out-of-scope ids return 404)

- `GET /` — List (`?province=&district=&status=&search=&sort=&order=&page=&limit=`)
- `POST /` — Register (officer+; province derived from district; **returns the device key once**)
- `GET /:id` · `PUT /:id` · `PATCH /:id/status` · `DELETE /:id` (hq_admin, soft delete)
- `POST /:id/device-key` — Rotate the device key
- `GET /:id/location` — Last known position (+ age, online flag)
- `GET /:id/history` — Raw pings (`?from=&to=&limit=`)
- `GET /:id/route` — Route replay as GeoJSON LineString
- `GET /:id/trips` — Trips, stops, distance, idle time, top speed

### Locations — `/api/locations`

- `POST /ping` — **Device**: submit one fix (headers `X-Device-Id`, `X-Device-Key`)
- `POST /ping/batch` — **Device**: upload up to 100 buffered fixes after an outage
- `GET /live` — Live positions with `online`/`moving` flags (`?province=&district=&online=&moving=&format=geojson`)
- `GET /nearby` — Vehicles nearest to a point (`?lat=&lng=&radius=`)
- `GET /search-area` — Investigation: who was inside this circle during this window (`?lat=&lng=&radius=&from=&to=`)
- `GET /history` — Movement log (`?tukTukId=&province=&district=&from=&to=&page=&limit=`, max 31-day window)
- `GET /stats` — Online/offline counts, pings today, open alerts (hq_admin, provincial_admin)

### Alerts & Geofences

- `GET /api/alerts` · `PATCH /api/alerts/:id/acknowledge` — speeding / geofence alerts raised automatically from pings
- `GET|POST /api/geofences` · `DELETE /api/geofences/:id` — circular `restricted` (alert on entry) or `allowed` (alert on exit) zones

### Audit

- `GET /api/auth/audit-log` — who viewed which tracking data (hq_admin)

---

## 📊 Testing

```bash
npm test                    # Run all tests
npm run test:coverage       # With code coverage report
```

35 integration tests covering auth, CRUD, RBAC, pagination, and error handling.

---

## 🌐 Simulation

### Run Simulator

```bash
npm run simulate
# Pings 10 active vehicles every 5 seconds
# Press Ctrl+C to stop
```

### Export Data

```bash
npm run export-data
# Writes JSON + CSV files to ./simulation-data/
```

### Manual Ping

```bash
curl -X POST http://localhost:3000/api/locations/ping \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"tukTukId":"<id>","latitude":6.9271,"longitude":79.8612,"speed":30,"heading":90}'
```

---

## 📮 Postman

Import `TukTuk-Tracker.postman_collection.json` into Postman:

1. Set collection variable `baseUrl` to your API URL
2. Run **Auth > Login (HQ Admin)** — token auto-saved to `{{token}}`
3. All requests use `{{token}}` automatically

---

## 🚀 Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 18+ (ES Modules) |
| Framework | Express.js 4 |
| Database | MongoDB + Mongoose |
| Auth | JWT (JSON Web Tokens) |
| Security | Helmet, CORS, rate-limiting |
| Docs | Swagger UI (OpenAPI 3.0) |
| Tests | Jest + Supertest |
| Deployment | Render.com |

---

## 📝 Features

- ✅ Real-time GPS tracking  
- ✅ Role-based access control (4 roles)
- ✅ Province & district filtering  
- ✅ Historical movement logs with TTL auto-cleanup  
- ✅ ETag/conditional GET support  
- ✅ RFC 5988 Link header pagination  
- ✅ Three-tier rate limiting  
- ✅ Full test coverage  
- ✅ Swagger API documentation  
- ✅ Live simulator + data export



---

## 🎬 Demo script

```bash
BASE=http://localhost:3000
TOKEN=$(curl -s $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@police.lk","password":"police123"}' | jq -r .data.token)

# 1. Live view (GeoJSON, online vehicles only)
curl -s "$BASE/api/locations/live?online=true&format=geojson" -H "Authorization: Bearer $TOKEN" | jq '.features | length'

# 2. A device sends a fix (use a key from simulation-data/device-keys.json)
curl -s $BASE/api/locations/ping -H 'Content-Type: application/json' \
  -H "X-Device-Id: DEV-0030" -H "X-Device-Key: $(jq -r '."DEV-0030"' simulation-data/device-keys.json)" \
  -d '{"latitude":6.9344,"longitude":79.8428,"speed":24}'

# 3. Investigation: who was at Colombo Fort in the last 3 days?
curl -s "$BASE/api/locations/search-area?lat=6.9344&lng=79.8428&radius=300&from=$(date -u -d '-3 days' +%FT%TZ)&to=$(date -u +%FT%TZ)" \
  -H "Authorization: Bearer $TOKEN" | jq

# 4. Continuous live simulation of all devices
npm run simulate
```
