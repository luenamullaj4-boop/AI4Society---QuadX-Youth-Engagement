# Contributing

1. Create a branch from `main`: `git checkout -b feature/short-name`.
2. Make your change. Keep the front end build-free (plain HTML, CSS and JS modules) and the server dependency-free unless the team agrees otherwise.
3. Run `npm test` and check the page at phone width.
4. Open a pull request and fill in the template.

## Where things live

- New hotspot fields: update `public/data/hotspots.json`, `server/validate.js` (if the youth office sets them), the list and detail views in `public/js/app.js`, and `docs/API.md`.
- New categories or units: `public/js/config.js`. The server picks them up automatically.
- Colours and fonts: the tokens at the top of `public/css/styles.css`. Update both the light and dark sets.

## Code style

Two-space indent, single quotes, semicolons, ES modules. `.editorconfig` sets the basics for most editors.
