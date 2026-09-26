# Contributing

1. Branch from `main`: `git checkout -b feature/short-name`.
2. `npm install`, copy `.env.example` to `.env`, then `npm run dev`.
3. Keep the front end build-free (plain ES modules in `public/js`) and put every rule that affects points or verification on the server.
4. Run `npm test` and check the youth app at 390 px wide (no horizontal scrolling).
5. Open a pull request and fill in the template.

## Where things live

- Categories, areas, quiz, points and phases: `public/js/config.js` (shared by server and browser).
- Thresholds that the municipality can change: `DEFAULT_SETTINGS` in the same file, editable in Admin → Settings.
- AI prompts and output schemas: `server/ai.js`. Fallback rules: `server/rules.js`.
- Colors and components: `public/css/app.css` (design system from the spec, section 4).
- Seed data: `server/seed.js`. Everything in it must stay made up.
