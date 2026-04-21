# Profile API (Next.js + MongoDB)

Queryable profile intelligence API built with the Next.js App Router and the MongoDB Node driver.

## Prerequisites
- Node.js `22.x`
- A MongoDB connection string in `MONGO_URI`

## Setup
```bash
npm install
```

Create `.env.local` and set:

```bash
MONGO_URI=<your mongodb uri>
```

## Scripts
```bash
npm run dev
npm run build
npm run start
npm test
npm run seed
```

## API Surface
```http
GET /api/profiles
GET /api/profiles/{id}
GET /api/profiles/search?q=...
POST /api/profiles
DELETE /api/profiles/{id}
```

## Stored Profile Contract
Every stored and returned profile follows this shape:

```json
{
  "id": "018f4f5c-6a90-7a33-b9d8-3c4f0e8b9f7a",
  "name": "ella",
  "gender": "female",
  "gender_probability": 0.98,
  "age": 28,
  "age_group": "adult",
  "country_id": "NG",
  "country_name": "Nigeria",
  "country_probability": 0.64,
  "created_at": "2026-04-15T08:00:00Z"
}
```

## Create A Profile
```http
POST /api/profiles
Content-Type: application/json

{ "name": "ella" }
```

Behavior:
- enriches the submitted name with `gender`, `age`, and `country` signals
- classifies `age_group` as `child | teenager | adult | senior`
- stores by normalized lowercase `name`
- repeated POSTs for the same normalized name return `200 OK` with `Profile already exists`

## List Profiles
`GET /api/profiles` supports combinable filters, sorting, and pagination.

### Filters
| Param | Description |
| --- | --- |
| `gender` | `male` or `female` |
| `age_group` | `child`, `teenager`, `adult`, `senior` |
| `country_id` | ISO alpha-2 country code such as `NG` or `US` |
| `min_age` | minimum age |
| `max_age` | maximum age |
| `min_gender_probability` | minimum `gender_probability` between `0` and `1` |
| `min_country_probability` | minimum `country_probability` between `0` and `1` |

### Sorting
| Param | Allowed Values |
| --- | --- |
| `sort_by` | `age`, `created_at`, `gender_probability` |
| `order` | `asc`, `desc` |

### Pagination
| Param | Default | Notes |
| --- | --- | --- |
| `page` | `1` | must be `>= 1` |
| `limit` | `10` | capped at `50` |

### Example List Queries
```http
GET /api/profiles?gender=female&country_id=NG&min_age=20&max_age=35

GET /api/profiles?age_group=adult&min_gender_probability=0.8&sort_by=gender_probability&order=desc&page=2&limit=25

GET /api/profiles?country_id=US&sort_by=created_at&order=desc&page=1&limit=10
```

### List Response Shape
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": []
}
```

## Natural-Language Search
`GET /api/profiles/search?q=...` uses deterministic rule matching only.

Supported rule families:
- gender words: `male`, `males`, `female`, `females`
- age groups: `child`, `children`, `teenager`, `teenagers`, `adult`, `adults`, `senior`, `seniors`
- special token: `young` which maps to `min_age=16` and `max_age=24`
- comparators such as `above 30`, `over 30`, `older than 30`, `below 20`, `under 20`
- country phrases in the form `from <country>`

Search uses the same pagination contract as `/api/profiles`.

### Example Search Queries
```http
GET /api/profiles/search?q=young%20females%20from%20nigeria&page=1&limit=5

GET /api/profiles/search?q=male%20and%20female%20teenagers%20above%2017

GET /api/profiles/search?q=adults%20from%20united%20kingdom%20older%20than%2030
```

If no supported rule can be extracted, the API returns:

```json
{
  "status": "error",
  "message": "Unable to interpret query"
}
```

## Fetch And Delete
```http
GET /api/profiles/018f4f5c-6a90-7a33-b9d8-3c4f0e8b9f7a

DELETE /api/profiles/018f4f5c-6a90-7a33-b9d8-3c4f0e8b9f7a
```

## Query Validation
Invalid query combinations and unsupported values return the exact body:

```json
{
  "status": "error",
  "message": "Invalid query parameters"
}
```

Typical status behavior:
- `200 OK` for successful list, search, fetch-by-id, or idempotent create
- `201 Created` for a newly inserted profile
- `204 No Content` for a successful delete
- `400 Bad Request` for invalid combinations, empty required params, invalid JSON, or missing ids/names
- `404 Not Found` when a profile does not exist
- `422 Unprocessable Entity` for invalid parameter types such as non-numeric numeric inputs or non-string names/ids
- `502 Bad Gateway` for invalid upstream enrichment responses
- `500 Internal Server Error` for unexpected database or server errors

## Seed Pipeline
The seed pipeline validates the supplied dataset, normalizes names, verifies age-group classification, derives `country_name` from `country_id`, and bulk-upserts by normalized `name` so reruns do not create duplicates.

### Default Source
```text
https://drive.google.com/uc?export=download&id=1Up06dcS9OfUEnDj_u6OV_xTRntupFhPH
```

### Seed Commands
```bash
npm run seed

npm run seed -- "https://drive.google.com/uc?export=download&id=1Up06dcS9OfUEnDj_u6OV_xTRntupFhPH"
```

You can also override the source with `SEED_PROFILES_SOURCE`.

## Environment Variables
| Variable | Description |
| --- | --- |
| `MONGO_URI` | MongoDB connection string |
| `SEED_PROFILES_SOURCE` | Optional override for the seed dataset URL or local file path |

## External APIs
- `https://api.genderize.io?name={name}`
- `https://api.agify.io?name={name}`
- `https://api.nationalize.io?name={name}`

## Notes
- Uses the Next.js App Router
- Database and collection are auto-created on first request
- Mongo indexes are ensured automatically for unique ids/names and active list query patterns
- All IDs are UUID v7 strings
- All timestamps are UTC ISO 8601 strings without milliseconds
- `country_name` is derived locally from ISO country mappings
- CORS headers are returned on success and error responses
