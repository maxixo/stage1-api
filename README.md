# Profile API (Next.js + MongoDB)

## Prerequisites
- Node.js 18+
- MongoDB running locally or a MongoDB Atlas URI

## Setup
```bash
npm install
cp .env.local.example .env.local
# Set your MONGO_URI in .env.local
```

## Run
```bash
npm run dev
npm run build
npm start
```

## Endpoint
```http
GET /api/profiles?name=ella

POST /api/profiles
Content-Type: application/json

{ "name": "ella" }
```

## Lookup Behavior
- `GET /api/profiles?name=ella` returns the stored profile, or enriches and stores it on first request
- `GET /api/profiles` returns `400 Bad Request` when `name` is missing
- `GET /api/profiles?name=unknown` returns a provider error if the external APIs cannot supply enough data

## Environment Variables
| Variable | Description |
| --- | --- |
| `MONGO_URI` | MongoDB connection string |

## Response Behavior
- `200 OK` for a successful `GET` lookup or first-time `GET` enrichment
- `201 Created` for a newly inserted profile
- `200 OK` with `Profile already exists` for idempotent repeats
- `400 Bad Request` for invalid JSON or missing/empty names
- `422 Unprocessable Entity` for non-string names
- `502 Bad Gateway` for external enrichment failures or missing enrichment data
- `500 Internal Server Error` for unexpected database or server errors

## External APIs
- `https://api.genderize.io?name={name}`
- `https://api.agify.io?name={name}`
- `https://api.nationalize.io?name={name}`

## Notes
- Uses the Next.js 14 App Router only
- Database and collection are auto-created on first request
- A unique index on `name` is ensured automatically at first connection
- Browser extension DOM injection warnings are suppressed at the `<body>` level in development
- All IDs are UUID v7 strings
- All timestamps are UTC ISO 8601 strings without milliseconds
- CORS headers are returned on `GET`, `POST`, `OPTIONS`, and all error responses
