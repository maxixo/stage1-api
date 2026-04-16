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
GET /api/profiles

GET /api/profiles?gender=male&country_id=NG&age_group=adult

GET /api/profiles/{id}

POST /api/profiles
Content-Type: application/json

{ "name": "ella" }

DELETE /api/profiles/{id}
```

## Behavior
- `POST /api/profiles` enriches the submitted name and stores the processed profile
- repeated `POST` requests for the same normalized name return `200 OK` with `Profile already exists`
- `GET /api/profiles/{id}` returns a single stored profile by public id
- `GET /api/profiles` returns all profiles or filters by `gender`, `country_id`, and `age_group`
- `DELETE /api/profiles/{id}` removes a stored profile by public id

## Environment Variables
| Variable | Description |
| --- | --- |
| `MONGO_URI` | MongoDB connection string |

## Response Behavior
- `200 OK` for a successful list request, id lookup, or idempotent create
- `201 Created` for a newly inserted profile
- `204 No Content` for a successful profile deletion
- `404 Not Found` when a profile does not exist
- `400 Bad Request` for invalid JSON or missing/empty names or ids
- `422 Unprocessable Entity` for non-string names or ids
- `502 Bad Gateway` for invalid external API responses or upstream failures
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
- Invalid upstream payloads return service-specific `502` messages for `Genderize`, `Agify`, or `Nationalize`
- CORS headers are returned on `GET`, `POST`, `DELETE`, `OPTIONS`, and all error responses
