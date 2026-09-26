# GreenELB

**Inform. Encourage. Recognize. Reward.** A youth environmental platform for the Municipality of Elbasan, Albania.
Built by team **QuadX** for Track C of the **AI4Society Youth Innovation Hackathon** (Tirana, 25–27 September 2026).

[![CI](https://github.com/luenamullaj4-boop/AI4Society---QuadX-Youth-Engagement/actions/workflows/ci.yml/badge.svg)](https://github.com/luenamullaj4-boop/AI4Society---QuadX-Youth-Engagement/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## The problem (Track C)

Low youth participation in environmental initiatives in Elbasan, and no digital platform to encourage, recognize or reward it. The Municipality's own **Local Plan for Integrated Urban Solid Waste Management 2025–2030** says:

- insufficient education and awareness is one of the main problems;
- no recycling or composting is recorded, and a three-bin sorting pilot on main streets did not work;
- only about 200,000 ALL (≈ €2,000) is budgeted for public awareness over two years, mostly for leaflets;
- it calls for volunteers and students, incentive schemes, digital platforms and five pilot schools.

## What GreenELB does

| Need | How |
| --- | --- |
| **Inform** | A Municipality Space with official news and a live map of environmental hotspots (OpenStreetMap). AI turns municipal PDFs into 5 easy cards. |
| **Encourage** | Actions with a volunteer threshold ("7/10"), youth team leaders, personalized AI recommendations, demand signals ("10 young people in Tregan want a Climate activity"). |
| **Recognize** | A Green Passport, verified personal data cards, certificates with a public verify page, shareable story cards. |
| **Reward** | Server-side points with three phases (Recognition → Engagement → Young Leader) and a rewards catalog the municipality controls. |

**AI does the work the municipality has no staff for:** verifying reports from photos, verifying cleanups (before vs after), checking data cards, ranking team-leader applicants, personalizing the feed, filtering personal data, and summarizing documents.

## The core loop (under 3 minutes live)

1. A young person photographs a problem with the **in-app camera** (GPS + time captured, no gallery uploads).
2. **AI checks the photo**: confidence ≥ 85 → published as "Verified by AI" (+20 points); 50–84 → dashed pin until 2 nearby people confirm with a photo or the municipality approves; < 50 → rejected with the reason. Photos with faces, plates or documents are never stored.
3. The reporter is **offered the leader role** first (24 h), otherwise it becomes a public "Team leader wanted" call. The AI ranks applicants (anonymous ids), the municipality confirms, rank 2 becomes deputy.
4. The leader sets 2–3 dates; volunteers join; the first date to reach the threshold is **confirmed**.
5. Action day: safety checklist → rotating **QR check-in** (within 200 m) → before photo → QR check-out → after + bags photos → totals → automatic **pickup request**.
6. Each member fills a **data card** (bags, photo, items); the leader confirms; the AI checks the photo, and code checks place, time and duplicates.
7. **AI compares before and after**. Clean → hotspot turns green, everyone gets points (half if they stayed < 75%), certificates unlock, and the **achievement screen** offers story cards to share.

## Screens

**Youth app** (mobile, 390 px): `/onboarding` · `/` Municipality Space · `/map` · `/report` · `/actions` · `/action/:id` · `/action/:id/apply-leader` · `/action/:id/manage` · `/action/:id/checkin` · `/action/:id/datacard` · `/profile` Green Passport · `/profile/privacy` · `/achievement/:id` · `/notifications` · public `/verify/:code` and `/impact`.

**Municipality admin** (desktop, `/admin`): overview KPIs and sign-ups by source · needs review · leader confirmations · demand signals · map and hotspots · news, partner proposals and AI PDF summaries · pickup requests · Local Plan indicators · pilot schools leaderboard · surveys · rewards · CSV exports · QR posters · settings.

## Run it

Needs [Node.js](https://nodejs.org) 22 or newer.

```bash
git clone https://github.com/luenamullaj4-boop/AI4Society---QuadX-Youth-Engagement.git
cd AI4Society---QuadX-Youth-Engagement
npm install
cp .env.example .env    # set ADMIN_TOKEN and ANTHROPIC_API_KEY; DEMO_MODE=true for the pitch
npm start
```

- Youth app: http://localhost:3000 (open it on a phone on the same Wi-Fi via your computer's IP, or deploy for HTTPS: the camera and GPS need HTTPS outside localhost)
- Admin: http://localhost:3000/admin (sign in with `ADMIN_TOKEN`, or the demo button in demo mode)

On first start the server creates `data/db.json` with made-up seed data (section 16 of the spec). Delete the `data/` folder to reset.

```bash
npm test     # 25 end-to-end API tests with a fake AI
npm run dev  # restart on file changes
```

### Demo mode

`DEMO_MODE=true` shows made-up demo accounts (Arta K., Beni, Genti, Ersi, and the Municipality) on the sign-in screen, and adds a switch so the phone can use a location in Elbasan instead of its GPS, because the hackathon is in Tirana. The admin has **View as youth / View as Municipality**. Turn it off for real use.

### Deploy

Any Node host with a persistent disk works (Render, Railway, Fly.io, a VPS). With Docker:

```bash
docker build -t greenelb .
docker run -p 3000:3000 --env-file .env -v greenelb-data:/app/data greenelb
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `ADMIN_TOKEN` | Municipality staff sign-in. Empty = staff sign-in off. |
| `ANTHROPIC_API_KEY` | Claude API key for the AI functions. Server-side only. |
| `CLAUDE_MODEL` | Optional model override (default `claude-opus-5`). |
| `DEMO_MODE` | `true` for demo accounts and the location override. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push. Generate with `npx web-push generate-vapid-keys`. |
| `DATA_FILE` | Where the database lives (default `data/db.json`; photos go to `data/uploads/`). |
| `PORT` | Default 3000. |

Thresholds (verification confidence, radii, application windows, notification caps, `leader_min_age`, reward caps) are editable in **Admin → Settings**.

## AI

All AI runs on the server through the official Anthropic SDK (`claude-opus-5`, structured JSON output). Every result is **cached by a hash of its input**, so the same photo or text is never sent twice. **No names, emails or phone numbers are sent**: the AI sees ids, areas and categories, and free text is scrubbed first.

| Function | What it decides |
| --- | --- |
| `checkReport` | Is it a real environmental problem? Confidence, category, waste types, size, volunteers and tools needed, urgency, safety, personal data |
| `verifyCleanup` | Before vs after: is the site clean? Estimated kg and waste types |
| `checkDatacard` | Does the member's photo show cleanup work? Estimated kg (place, time and duplicates are checked in code) |
| `rankLeaders` | Scores leader applicants with a one-sentence reason each |
| `recommend` | Top 3 actions for a user with a reason |
| `privacyFilter` | Removes names, phone numbers, emails and addresses from text |
| `summarizeDocument` | A municipal PDF (often in Albanian) → 5 English cards |
| `quizType` | The onboarding quiz → The Doer / Storyteller / Organizer / Innovator |

Without an API key everything still runs: reports wait for peer or municipal confirmation, cleanups go to municipal review, and rankings and recommendations use transparent rules (labelled "rule-based" in the UI).

## Privacy by design

Only a nickname (display name optional), age group, optional school, neighbourhood, categories and activity. No phone numbers. Location is saved only when taking a report photo or checking in. Users aged 16–17 are private with the nickname shown by default. Users can download all their data as JSON and delete their account (profile, activity and photos). The public verify page shows only what the user allows. All points and verification rules run on the server.

## Project structure

```
server/            Node.js API (no framework)
  index.js         entry point, timers
  app.js           routing and auth
  routes/          public, me (account), reports, actions, admin
  logic.js         points, phases, notifications, action state machine, QR tokens
  ai.js            Claude functions with caching and fallbacks
  rules.js         rule-based fallbacks and text scrubbing
  db.js, seed.js   JSON database and made-up seed data
public/            the PWA (plain ES modules, no build step)
  app.html, admin.html, sw.js, manifest.webmanifest
  js/screens/      youth app screens
  js/admin/        admin dashboard
  js/lib/          API client, router, camera/GPS/QR, map, share cards, UI helpers
test/flow.test.js  end-to-end tests of the full loop
docs/              API, architecture, pitch and demo script
```

## Docs

- [Pitch and live demo script](docs/PITCH.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)

## Next steps: 4-week pilot

A pilot with the Municipality of Elbasan and 2–3 schools or youth organizations: week 1 onboarding at the pilot schools, weeks 2–3 two cleanups per week from youth reports, week 4 review of the Local Plan indicators and rewards. The same setup can serve Tirana, Gjakova, Pristina and other municipalities.

## Team QuadX

| Name | Role |
| --- | --- |
| *add name* | *add role* |
| *add name* | *add role* |
| *add name* | *add role* |
| *add name* | *add role* |

## License

[MIT](LICENSE). All seed data (people, organisations, numbers) is made up.
