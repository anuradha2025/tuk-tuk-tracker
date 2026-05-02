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

Populates: 9 provinces, 25 districts, 27 police stations, 5 users, 200 tuk-tuks, and 100k+ location pings.

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
npm test               # Run test suite (35 tests)
npm run test:coverage  # Run tests with coverage report
npm run lint           # Run ESLint (0 errors/warnings)
```

---

## 🔑 Default Credentials

| Role | Email | Password |
|------|-------|----------|
| HQ Admin | admin@police.lk | Password@123 |
| WP Provincial Admin | wp.admin@police.lk | Password@123 |
| CP Provincial Admin | cp.admin@police.lk | Password@123 |
| Colombo Station Officer | colombo.officer@police.lk | Password@123 |
| Kandy Station Officer | kandy.officer@police.lk | Password@123 |

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@police.lk","password":"Password@123"}'
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

### Tuk-Tuks — `/api/tuktuks`

- `GET /` — List with filters (`?province=&district=&status=&search=&sort=&order=&page=&limit=`)
- `GET /:id` — Get one
- `GET /:id/location` — Last known position
- `GET /:id/history` — Movement history (`?from=<ISO>&to=<ISO>&limit=500`)
- `POST /` — Create (officer+)
- `PUT /:id` — Update (officer+)
- `DELETE /:id` — Delete (hq_admin only)

### Locations — `/api/locations`

- `POST /ping` — Submit GPS ping (rate limited: 1000/15 min)
- `GET /live` — Latest positions per vehicle (`?province=&district=`)
- `GET /history` — Ping history (`?tukTukId=&from=&to=&province=&district=&page=&limit=`)
- `GET /stats` — Fleet statistics (hq_admin, provincial_admin)

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

