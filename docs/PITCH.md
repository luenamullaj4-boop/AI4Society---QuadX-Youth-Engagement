# Pitch and live demo

## One line

GreenELB turns Elbasan's waste problem into missions young people can report, lead and get recognized for, with AI doing the verification the municipality has no staff for.

## How it scores

| Criterion | GreenELB |
| --- | --- |
| Municipal relevance (20%) | Built on the Municipality's own Local Plan 2025–2030: awareness, volunteers, digital platforms, pilot schools, incentives. It produces data the municipality can act on: verified hotspots, pickup requests, kg collected, Local Plan indicators. |
| Feasibility (20%) | A mobile web app (PWA) plus a small server and an AI API. No hardware. Runs today. |
| AI / digital (15%) | AI verifies reports and cleanups from photos, checks data cards, ranks leaders, personalizes, filters personal data and summarizes documents. |
| User logic (15%) | Onboard → report or join → lead → check in → data card → verified → points → share. |
| Innovation (10%) | Youth leaders chosen by AI and confirmed by the municipality; verified data cards compatible with citizen-science formats. |
| Scalability (10%) | Areas, categories, schools and settings are data; the same app works for Tirana, Gjakova or Pristina. |
| Next steps (10%) | 4-week pilot with the municipality and the 5 pilot schools. |

## Before the demo

1. In `.env`: `DEMO_MODE=true`, `ADMIN_TOKEN=…`, `ANTHROPIC_API_KEY=…`. Delete `data/` for fresh seed data. Run `npm start`.
2. Deploy somewhere with HTTPS (the phone camera needs it), or run on a laptop and use the laptop's browser.
3. On the phone: sign in as **Arta K.** On the laptop: open `/admin` and use **Demo: sign in as the Municipality**.
4. On the report screen, tick **Demo mode: use a location in Elbasan** and pick **City centre**.
5. Have a photo of rubbish ready (printed, or on a second screen) to photograph. No people in it.

## Live loop (about 3 minutes)

1. **Report** (Arta): Report → take the photo → Waste · Illegal dump → "bags and bottles dumped by the path" → Send. The AI verifies it: confidence, waste types, suggested volunteers and tools, +20 points.
2. **Lead**: "Your report was verified! Do you want to lead this action?" → Yes. Set two dates → Publish volunteer call.
3. **Volunteers**: in the admin, *View as youth* → Beni / Genti / Ersi join the first date. The counter fills and the action becomes **Confirmed**. (Or show the seeded *Shkumbin riverbank cleanup* at 7/10: three joins confirm it.)
4. **Action day** (Arta as leader): tick the safety checklist → Start → the QR code appears. A volunteer scans it → checked in. Leader takes the **before** photo.
5. **Check-out and data card**: the volunteer scans the check-out QR and fills the data card (bags, photo, items). The leader taps "Attended and completed tasks".
6. **Verify**: the leader takes the **after** and **bags** photos, enters kg → Finish and verify with AI → clean → the hotspot turns green on the map, a pickup request appears in the admin.
7. **Points and share**: the achievement screen shows +points, progress to the next phase, and the story cards (before and after, my points, my type) → Share.

## Leader selection (about 1 minute)

Admin → **Leader confirmations** → *Tree planting in Rinia park* has 3 applicants (Beni, Genti, Ersi) → **Rank with AI now** → scores and one-sentence reasons → **Confirm** the top one → the deputy is assigned and everyone is notified (show a phone's bell).

## Close

Admin → **Overview** (active hotspots, sites discovered by youth, % verified by AI, kg collected) → **Local Plan indicators** → **Pilot schools** → "4-week pilot with the municipality and the five pilot schools".
