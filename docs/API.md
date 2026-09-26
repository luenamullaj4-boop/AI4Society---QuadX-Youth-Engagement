# API reference

All endpoints are under `/api`, accept and return JSON, and send errors as:

```json
{ "error": "A sentence that explains what went wrong." }
```

Write requests (`POST`, `DELETE`) are rate limited to 30 per 10 minutes per IP address. Request bodies are limited to 10 KB and must be sent with `Content-Type: application/json`.

## Public

### `GET /api/health`
Returns `{ "ok": true, "mode": "live" }`. The front end uses this to choose between live and demo mode.

### `GET /api/stats`
```json
{ "open": 13, "signedUp": 102, "freeSpots": 129, "pendingReports": 0 }
```

### `GET /api/hotspots`
Optional query: `cat` (`env`, `heritage`, `social`, `edu`, `spaces`) and `urg` (`hi`, `mid`, `lo`).

```json
{
  "hotspots": [
    {
      "id": "h1", "title": "Shkumbin riverbank clean-up", "unit": "Elbasan",
      "cat": "env", "urg": "hi", "x": 392, "y": 340,
      "when": "Sat 3 Oct · 09:00–12:00", "meet": "South end of Ura e Shkumbinit",
      "need": 40, "have": 23, "bring": "…", "desc": "…"
    }
  ]
}
```

`x` and `y` are positions on the 800 × 600 schematic map.

### `GET /api/hotspots/:id`
Returns `{ "hotspot": { … } }` or `404`.

### `POST /api/hotspots/:id/signups`
Join a crew.

```json
{ "name": "Arta", "email": "arta@example.com", "ageGroup": "18-29", "parentConsent": false }
```

- `ageGroup` is `15-17` or `18-29`. For `15-17`, `parentConsent` must be `true`.
- `409` if the crew is full or the email is already signed up for this action.

Response `201`:
```json
{ "signup": { "id": "…", "cancelToken": "…" }, "hotspot": { …, "have": 24 } }
```
Keep `cancelToken`: it is the only way to leave the crew later.

### `DELETE /api/signups/:id?token=CANCEL_TOKEN`
Leave a crew. Returns the updated `hotspot`.

### `POST /api/reports`
Report a problem.

```json
{ "unit": "Shirgjan", "cat": "spaces", "desc": "Broken glass all over the basketball court.", "name": "Ilir" }
```
`unit` must be one of the 14 administrative units. `desc` is 10–600 characters. `name` is optional.
Response `201`: `{ "report": { "id", "unit", "cat", "status": "pending", "createdAt" } }`

### `GET /api/reports/:id`
Check a report's status: `pending`, `approved` (with `hotspotId`) or `rejected`.

## Youth office (admin)

Send `Authorization: Bearer <ADMIN_TOKEN>`. Returns `401` with a wrong or missing token, `503` if the server has no `ADMIN_TOKEN` set.

### `GET /api/admin/reports?status=pending`
All reports, including the reporter's name. `status` is optional.

### `POST /api/admin/reports/:id/approve`
Turns a report into a public hotspot.

```json
{ "title": "Court clean-up in Shirgjan", "when": "Sat 17 Oct · 10:00", "meet": "School gate",
  "need": 8, "urg": "mid", "bring": "Gloves", "desc": "…", "x": 455, "y": 440 }
```
`bring`, `desc`, `x` and `y` are optional; the pin defaults to the unit's position. Returns `{ report, hotspot }`.

### `POST /api/admin/reports/:id/reject`
Body `{ "reason": "Duplicate" }` (optional).

### `GET /api/admin/signups?hotspot=h1`
Active sign-ups with name, email, age group and consent. `hotspot` is optional.
