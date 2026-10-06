# Current release: SkyMeet v3 New (3.1.0)

See START-HERE-V3-NEW.md and TEST-RESULTS.md for current changes and validation. The earlier release history follows.

> Historical release notes. The current bug-fix release is documented in UPGRADE-SKYMEET-V2.md; use that guide for current behavior and verification.

# SkyMeet update

This is the complete existing React/Vite + Node/Socket.IO application, updated in place. `index.html` is its entry point, not a standalone offline meeting app. Deploy the full project to keep meetings, whiteboard, notes and chat working.

## Appearance

All visible academy branding, the academy portal link, logo, page title and export filenames are replaced with SkyMeet. The landing page uses generic meeting and teamwork language.

| Theme | Dark | Light |
|---|---|---|
| 1 | Red and black | Pink and white |
| 2 | Green and purple | Light green and lavender |
| 3 | Red and blue | Dark coral and sky blue |
| 4 (default) | Navy blue and black | Baby blue and white |

New browsers open in dark mode, theme 4. First switching to light mode uses theme 4. Mode and color choices are stored locally; each mode remembers its own theme. The Appearance controls are available on the home, prejoin, meeting and end screens. The canvas follows the chosen theme and retains a light drawing surface for readable content.

The canvas has rounded floating tool panels, larger targets, a collapsible inspector and a horizontally scrollable mobile toolbar. Existing drawing colors and objects are preserved.

## Collaboration preserved

Image upload was already implemented. Its existing conversion, size checks, socket synchronization and image rendering remain intact. Use Whiteboard → Open full whiteboard → Add image. Guests and hosts can upload PNG, JPEG and WebP images. Uploads must be below 10 MB; the existing compression also enforces the 400,000-character embedded-image limit. Board capacity remains 1,500 objects / 6 MB.

Existing chat, notes, board editing, undo/redo, templates, exports, screen sharing, calling, attendance and moderation were retained. Notes use the existing latest-edit-wins model: take turns typing to avoid overwriting concurrent edits. Participants can collaborate by default; host-only administrative controls and host restrictions remain as before.

New JSON board backups use a SkyMeet format identifier. Imports accept both the new identifier and original v2 backups. Original browser room/participant keys, database table name and password salt intentionally remain unchanged internally, protecting existing saved rooms, attendance identities and password-protected rooms. These compatibility identifiers are not visible branding.

No calling, database, board-validation or attendance-calculation rewrite was made. Server changes are limited to the default new-room title. CSS appearance changes are primarily in the added `src/skymeet.css` layer.

## Run or deploy

Use Node.js 22 or newer:

```sh
npm ci
npm run build
npm start
```

Open http://localhost:3000. For Render, update the existing service with these project files and retain its environment variables, database credentials and hostname. Use `npm ci --include=dev && npm run build` as the build command and `npm start` as the start command. The included `render.yaml` is named SkyMeet for new service creation.

Keep `DATABASE_URL` configured for durable rooms, boards, notes and attendance. Without it, the existing temporary in-memory mode loses rooms on server restart. Calls on restricted networks may need the existing TURN configuration described in README.md. This update has not been deployed.

## Verification — 23 September 2026

- Production build passed.
- All 10 existing Node/server tests passed, including persistence round-trip, guest permissions, board operations, conflict detection, locks, notes and chat.
- Three targeted Chromium browser tests passed: mobile landing layout; all eight palettes and saved preferences; two-participant collaboration.
- The collaboration test covers guest image upload visible to the host, undo/redo synchronization, guest sticky-note text, host template synchronization, chat and notes in both directions, JSON export, inspector collapse and mobile canvas layout.
- The pre-existing full camera test could not pass in this execution environment: camera preview worked and offer/answer signaling completed, but Chromium produced no ICE candidates, so a remote video stream was not established. Live audio/video is not claimed verified. Calling code is byte-for-byte unchanged; retest on the deployed HTTPS site with real devices and networks.

Tests are included under `tests/`. Run `npm test` and `npm run test:browser` (install Chromium with `npx playwright install chromium` if needed). The full browser command includes the camera test and requires a network environment where WebRTC can establish a connection.
