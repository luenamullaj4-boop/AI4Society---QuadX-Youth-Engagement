# Elbasani Vepron

**Youth volunteering on the map of Elbasan Municipality.**
Built by team **QuadX** for the **AI4Society** hackathon.

[![CI](https://github.com/luenamullaj4-boop/AI4Society---QuadX-Youth-Engagement/actions/workflows/ci.yml/badge.svg)](https://github.com/luenamullaj4-boop/AI4Society---QuadX-Youth-Engagement/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Elbasani Vepron ("Elbasan acts") shows young people aged 15–29 exactly where their help is needed across the 14 administrative units of Elbasan Municipality: a riverbank full of plastic on the Shkumbin, a village school that needs tutors, a road above Labinot-Mal where the next wildfire could spread. Pick a pin, claim a spot on the crew, show up.

---

## The problem

- Young people in Elbasan want to help but don't know **where** or **when**. Volunteering calls are scattered across Facebook groups and school notice boards.
- The municipality and NGOs know where the problems are, but have no simple way to **turn a problem into a crew** of volunteers with a date and a meeting point.
- Villages outside the city (Gracen, Zavalinë, Funarë…) rarely get volunteers at all, because nobody sees what they need.

## Our solution

| For | What they get |
| --- | --- |
| **Volunteers (15–29)** | A map of every open action, filtered by cause and urgency. One-tap sign-up with the meeting point, what to bring and how many spots are left. |
| **Residents** | A form to report a problem anywhere in the municipality. The report shows on the map as "awaiting review". |
| **Municipal youth office** | A dashboard to approve reports into public actions, set crew size and urgency, and see who signed up. |

Safety is built in: volunteers aged 15–17 need a parent or guardian's agreement before they can join, and only the youth office sees contact details.

## Features

- Interactive schematic map of all 14 administrative units, with the Shkumbin river, main roads and terrain
- Hotspots coloured by urgency (urgent / this month / ongoing), filterable by five causes: environment, heritage, neighbours, learning and public spaces
- Crew sign-up with capacity limits, duplicate protection and cancellation
- Citizen reports with status tracking (pending → approved / rejected)
- Youth office dashboard at `/admin`, protected by an admin token
- Works on phones, supports light and dark mode, keyboard accessible
- **Two modes:** a full live app with the Node server, or a static demo on GitHub Pages with sample data saved in the visitor's browser

## Quick start

You need [Node.js](https://nodejs.org) 22 or newer. There are **no npm dependencies** to install.

```bash
git clone https://github.com/luenamullaj4-boop/AI4Society---QuadX-Youth-Engagement.git
cd AI4Society---QuadX-Youth-Engagement
cp .env.example .env      # then set ADMIN_TOKEN to a long random value
npm start
```

Open:
- http://localhost:3000 for the volunteer map
- http://localhost:3000/admin for the youth office dashboard (enter your `ADMIN_TOKEN`)

On first start the server copies the sample hotspots from `public/data/hotspots.json` into `data/db.json`. Delete `data/db.json` to reset the demo.

Other commands:

```bash
npm run dev    # restart automatically when files change
npm test       # run the API test suite
```

### Run with Docker

```bash
docker build -t elbasani-vepron .
docker run -p 3000:3000 -e ADMIN_TOKEN=change-me -v vepron-data:/app/data elbasani-vepron
```

### Static demo on GitHub Pages

The `public/` folder works on its own: without the server it switches to **demo mode** (sample data, sign-ups and reports stored only in the visitor's browser). To publish it:

1. Repository **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**, add `DEPLOY_PAGES` = `true`.
3. Push to `main`. The demo appears at `https://luenamullaj4-boop.github.io/AI4Society---QuadX-Youth-Engagement/`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `ADMIN_TOKEN` | *(empty)* | Password for `/admin`. When empty, the dashboard is turned off. |
| `DATA_FILE` | `data/db.json` | Where the JSON database is stored |

## Project structure

```
├── public/                 Front end (static, no build step)
│   ├── index.html          Volunteer landing page and map
│   ├── admin.html          Youth office dashboard
│   ├── css/styles.css      Design tokens, light + dark theme
│   ├── js/config.js        Units, map geometry, categories (shared with the server)
│   ├── js/api.js           Live API client with a demo-mode fallback
│   ├── js/map.js           d3 map drawing and pins
│   ├── js/app.js           Landing page logic
│   ├── js/admin.js         Dashboard logic
│   └── data/hotspots.json  Sample hotspots (seed data)
├── server/                 Back end (Node.js, zero dependencies)
│   ├── index.js            Entry point
│   ├── app.js              Routes, static files, security headers, rate limit
│   ├── store.js            JSON file database
│   └── validate.js         Input validation
├── test/api.test.js        API tests (node:test)
├── docs/                   API reference, architecture, pitch
├── .github/workflows/      CI tests and GitHub Pages deploy
└── Dockerfile
```

## Documentation

- [API reference](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Pitch and demo script](docs/PITCH.md)
- [Contributing](CONTRIBUTING.md)

## Tech stack

- **Front end:** HTML, CSS and vanilla JavaScript modules, [d3](https://d3js.org) for the map
- **Back end:** Node.js built-in `http` module, JSON file storage
- **Testing:** Node's built-in test runner
- **CI/CD:** GitHub Actions (tests on Node 22 and 24, Pages deploy)

## Roadmap

- [ ] Real map tiles (Leaflet + OpenStreetMap) and official unit boundaries
- [ ] Albanian / English language switch
- [ ] Attendance check-in by the crew leader and downloadable volunteer-hour certificates
- [ ] Email or SMS reminders the day before an action
- [ ] Photo uploads on reports, before/after photos on completed actions
- [ ] AI triage of incoming reports: suggest category, urgency and a title for the youth office to confirm
- [ ] Move from the JSON file to SQLite or Postgres

## Data and privacy

The hotspots in this repository are **sample data** written for the demo, and the map is **schematic, not to scale**. Volunteer names and emails are stored only on the server, are never returned by public API routes, and are visible only to the youth office dashboard.

## Team QuadX

| Name | Role |
| --- | --- |
| Denisa Muca | Team Lead |
| Erlis Fortuzi | Business & Marketing Lead |
| Luena Mullaj | Environmental & Impact Lead |


## License

[MIT](LICENSE)
