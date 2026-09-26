# API reference

JSON over HTTP. Signed-in requests send `Authorization: Bearer <token>`. Errors are `{ "error": "…" }` with a 4xx/5xx status. Photos are sent as `{ dataUrl, lat, lng, takenAt, source: "camera", ahash }`.

## Public

| Method | Path | |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, ai, demo }` |
| GET | `/api/config` | Demo accounts (demo mode), leader minimum age |
| GET | `/api/map` | Hotspots (not rejected) |
| GET | `/api/hotspots/:id` | One hotspot |
| GET | `/api/news` | Approved news |
| GET | `/api/actions` | Open actions |
| GET | `/api/actions/:id` | Action; with a token also `me`, "why it fits you", and leader-only lists |
| GET | `/api/impact` | Public totals and cleaned sites |
| GET | `/api/schools` | Pilot schools leaderboard |
| GET | `/api/verify/:code` | Public passport or certificate (only what the user allows) |
| GET | `/api/surveys` | Open surveys |
| GET | `/api/photos/:id` | A stored photo |
| GET | `/api/push/key` | VAPID public key |

## Account

| Method | Path | |
| --- | --- | --- |
| POST | `/api/auth/signup` | Onboarding → `{ token, loginCode, user }` |
| POST | `/api/auth/login` | `{ code }` → token |
| POST | `/api/auth/staff` | `{ token: ADMIN_TOKEN }` → municipality session |
| POST | `/api/auth/demo` | Demo accounts (demo mode only) |
| POST | `/api/auth/logout` | |
| GET / PATCH / DELETE | `/api/me` | Profile, update categories and privacy, delete account |
| GET | `/api/me/export` | All my data |
| GET | `/api/me/home` | Municipality Space: counts, AI recommendations, news, demand prompt, surveys |
| POST | `/api/me/interest` | Demand signal |
| GET | `/api/me/passport` | Green Passport |
| GET | `/api/me/actions` | My actions |
| POST | `/api/rewards/:id/redeem` | |
| GET / POST | `/api/notifications`, `/api/notifications/read` | |
| POST | `/api/push/subscribe` | |
| POST | `/api/achievements/:id/seen`, `/api/surveys/:id/respond`, `/api/events` | |

## Reports

| Method | Path | |
| --- | --- | --- |
| POST | `/api/reports` | `{ photo, category, problemType, description }` → `retake` / `rejected` / `confirmed` (duplicate within 50 m) / `needs_confirmation` / `ai_verified` |
| POST | `/api/hotspots/:id/confirm` | `{ photo }` within 100 m |
| GET | `/api/reports/mine` | |

## Actions

| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/actions/:id/offer` | Reporter: `{ accept }` |
| POST | `/api/actions/:id/apply` | `{ motivation, availableOptionIds, availableDates }` |
| POST / DELETE | `/api/actions/:id/join` | `{ optionIds }` |
| POST | `/api/actions/:id/options` | Leader: `{ dates: [2–3 ISO dates] }` |
| POST | `/api/actions/:id/supervisor` | Leader under 18 |
| POST | `/api/actions/:id/withdraw` | Leader (deputy takes over) |
| GET / POST | `/api/actions/:id/messages` | Members |
| POST | `/api/actions/:id/safety`, `/start` | Leader |
| GET | `/api/actions/:id/qr?kind=checkin|checkout` | Leader |
| POST | `/api/actions/:id/scan` | `{ payload, lat, lng }` |
| POST | `/api/actions/:id/photos` | Leader: `{ kind: before|after|bags, photo }` |
| POST | `/api/actions/:id/finish` | Leader: `{ totalBags, kgPlastic, kgOther, treesPlanted }` → AI cleanup check, points, pickup |
| POST | `/api/actions/:id/quiz` | +5 |
| POST | `/api/actions/:id/datacard` | `{ bags, photo, items, localConcern }` |
| POST | `/api/actions/:id/datacards/:cardId/confirm` | Leader: `{ agree }` |

## Admin (municipality)

`/api/admin/overview`, `review`, `hotspots/:id/decision`, `actions/:id/cleanup-decision`, `datacards/:id/decision`, `leaders`, `actions/:id/rank`, `actions/:id/confirm-leader`, `demand`, `hotspots` (POST), `actions` (POST), `news` (GET/POST), `news/:id/approve`, `news/summarize` (PDF), `pickups`, `pickups/:id/status`, `indicators`, `schools`, `surveys` (GET/POST), `surveys/:id/close`, `rewards` (GET/POST/PATCH), `export/datacards.csv`, `settings` (GET/PATCH), `partners` (POST). Partners: `POST /api/partner/news`.
