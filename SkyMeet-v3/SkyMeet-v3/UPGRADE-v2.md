> Historical release notes. The current bug-fix release is documented in UPGRADE-SKYMEET-V2.md; use that guide for current behavior and verification.

# SkyMeet 2.0 — permanent classrooms, whiteboard studio and attendance

## Deploy the upgrade

1. Preserve your previous source/repository version. Replace its application files with this package, including `shared/`, `src/`, `server/`, `public/`, `tests/`, `package.json`, `package-lock.json`, `index.html`, `vite.config.js` and `render.yaml`.
2. Keep a single Render **Free Web Service**. Build command: `npm ci --include=dev && npm run build`. Start command: `npm start`. No paid disk is needed.
3. For permanent classrooms, create or use a PostgreSQL database, then set its connection string as **`DATABASE_URL`** in Render Environment. Use the provider's recommended TLS-verified URL. Do not use a `VITE_` prefix, disable certificate verification, or commit the URL to GitHub. The database user needs CREATE TABLE and SELECT/INSERT/UPDATE privileges for `academy_meet_rooms_v2`.
4. Keep your existing `HOST_ACCESS_KEY` and optional TURN settings. Deploy the new source. Startup creates the new namespaced database table automatically, without dropping other tables. An invalid configured database stops startup; it does not silently fall back to temporary storage.
5. On the home screen, confirm **DATABASE CONNECTED** and select **Permanent classroom link**. With a working database, this option is selected by default. Create a new classroom.
6. Save its **Private host link** securely. Give students only the normal `/meet/...` link. The private link contains `#host=...` and grants host privileges; it is not a student invitation.

No database account was created or connected as part of this delivery. The ZIP alone cannot provide durable storage on Render's ephemeral filesystem. PostgreSQL-provider costs, quotas, expiration and retention rules still apply. Do not rely on an expiring database for permanent classrooms. Consult current provider documentation before selecting a plan. Existing v1/v1.1 temporary rooms are not migrated: export their notes/boards/attendance before replacing the running app, then create permanent rooms in v2.

## Permanent links and session lifecycle

- A permanent link has **no application-set expiry** and can be reused across sessions and restarts while the database, application and hostname remain available. This does not promise infinite storage, uptime or participants.
- **End for all** ends the current session; it retains the link, board, notes and attendance. The next time the original host enters, a new session starts under the same URL. Guests must be admitted again. Co-host privileges are session-only.
- After a restart, a classroom reopens when its host returns. Guests are told to wait for the host to start. Previous in-progress attendance is closed at each participant's last saved heartbeat (an estimate), rather than treating them as present through server downtime.
- If everyone leaves and the room stays empty for ten minutes, the session closes and the loaded room can be removed from RAM. Its permanent database record remains.
- Host keys and the classroom list are retained in the creator's browser local storage. The private recovery link allows host access on another browser/device. Its fragment is consumed and removed from the visible address. Anyone possessing it is effectively the host. This is token ownership, not an account/password system. Use **Forget** on a shared computer after saving a secure backup.
- Chat and polls remain session-only. Whiteboard objects, notes, room settings and attendance are saved for permanent rooms. Undo history and cursors are not persisted.
- Run **one instance** of this application against the table. A revision check rejects stale saves by another instance. Deploy between classes; if a conflict warning appears, stop duplicate instances, finish the deployment and restart. This is not a horizontally distributed conferencing backend.
- Resource limits remain: eight simultaneous participants, 1,500 board objects / approximately 6 MB of object JSON per classroom, 50,000 attendance visits per classroom, 100 locally bookmarked classrooms. Exceeding the attendance limit requires exporting records and creating another classroom; there is no silent history deletion. Provider database/bandwidth limits may be lower.

## Whiteboard essentials

Open **Whiteboard → Open full whiteboard**. Calls continue while the board fills the screen. This is an original collaborative board with common Miro-style essentials, not Miro itself or a complete Miro feature clone.

| Tool | How to use |
|---|---|
| Select / move / resize | Click an object; drag to move; drag its blue corner to resize. Shift-click selects multiple. |
| Pan / zoom | Hand tool or Alt-drag. Scroll to pan; Ctrl/⌘-scroll or buttons to zoom from 10% to 400%. Fit all resets to the content bounds. |
| Pen / eraser | Drag freehand; Erase removes a clicked object/stroke. It is an object eraser, not partial-stroke erasing. |
| Sticky notes / text | Click to insert, then edit text/font in the inspector and choose Apply text & style. |
| Rectangle / ellipse / diamond | Drag to draw; use ink and fill selectors, then Apply text & style for selected items. |
| Connectors | Click a source object then a destination object with Connector; the line follows their centers when moved. Drag on empty canvas for a standalone diagonal arrow. |
| Frames | Click to create a labeled frame. Frames visually organize work; moving one does not automatically move its contents. Shift-select the contents to move together. |
| Images | Upload PNG/JPEG/WebP (up to 10 MB input); the browser resizes and compresses to a JPEG under 300 KB before sharing. Transparency is not preserved. |
| Undo / redo | Per-participant history, up to 40 operations. A conflicting edit by another user blocks undo instead of overwriting their work. Ctrl/⌘-Z, Shift-Ctrl/⌘-Z. |
| Duplicate / align | Duplicate selected items; align multiple items left or top. Ctrl/⌘-D duplicates. Delete removes selected items. |
| Host locks | Hosts can lock individual objects, disable participant board editing in Settings, or clear the board. Clear cannot be undone. |
| Templates | Insert a lesson planner or a three-column Kanban board. |
| Exports | PNG or SVG of board contents; JSON object backup. JSON import appends up to 100 objects at a time with new IDs. |
| Live cursors | Other participants' cursor positions appear with their names. |

This release uses a large, bounded virtual canvas (coordinates up to ±100,000), not mathematically infinite content. It does not include Miro AI, plugins, comments/mentions, grouping hierarchies, presentations, embedded documents/PDFs, a CRDT text editor, an unlimited version archive, or full Miro template parity. Text editing is explicit whole-object editing with revision conflict checks. PNG export is capped at 4,000 pixels on its longest edge. Large JSON exports are valid backups, but UI re-import is currently limited to 100 objects per import.

Database saves occur after each accepted board operation before its success acknowledgement. Clients may see the live broadcast slightly before the save completes. A save failure shows an error; export a backup and repair the database. A board initially showing “Saved” means no pending local edits; it is not an independent database health guarantee. Temporary rooms never retain board data across server restarts.

## Attendance tracker

- Hosts/co-hosts open **Attendance tracker** from the bottom toolbar or Settings. The original host can also use **Your classrooms → Attendance history** before or after a session, using their saved host key.
- View all sessions or choose one, search names, see present/left status, first join, last leave, visit count and total minutes. The view refreshes every 15 seconds.
- Export **Summary CSV** for participant/session totals or **Visit log CSV** for every admission and departure, with exit reasons. CSV exports escape formula-like text.
- Attendance begins when a person is **admitted**, excluding waiting-room time. Rejoins create visits; totals merge overlapping intervals so two tabs do not automatically double-count the same browser identity.
- Identity is a browser-generated participant key scoped on the server to the classroom. Different devices or cleared browser storage count separately. Names are self-reported, keys can be copied, and this is not verified student identity. There is no automatic connection to the tuition-management database..
- Active clients send a heartbeat every 20 seconds. A crash closes visits at the last saved heartbeat, with an interruption reason. Sleep, network loss and database failures can make this estimate less precise. Normal departures and ending a session record actual server times.
- Absence, tardiness, enrolment matching, attendance percentages and automated parent notifications require a roster/schedule integration and are not part of this release.

## Verification and deployment acceptance

See `TEST-RESULTS.md`. Run `npm ci --include=dev`, `npm test`, `npm run build`, then `npm run test:browser` after `npx playwright install chromium` on a computer that permits Chromium. Browser media/layout verification remains outstanding in the provided environment.

Before regular teaching: connect a real database; create a permanent room; add board items; admit a second device; end the session; restart Render; open the same URL as host; confirm board/notes and attendance survived. Check exported files and test two networks with TURN if needed. Back up the PostgreSQL database according to your provider's documentation. Browser test results or SQL emulation do not certify the live deployment.
