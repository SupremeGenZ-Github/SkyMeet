# Connection patch: read CONNECTION-SETUP.md first

This release adds multiple STUN/TURN providers, managed Cloudflare credentials, stalled-negotiation recovery, and a relay test. Working relay credentials in Render are required for restricted networks.

# SkyMeet v3.3.0 — deployment repair and recovery improvements

This release uses the latest app in `SkyMeet-v3/`. The repository root now contains its own package.json and lockfile, so Render starts v3.3 rather than an older uploaded app folder.

## Update your existing GitHub repository and Render service

1. Extract the ZIP. Upload its **contents** to the root of SupremeGenZ-Github/SkyMeet, replacing matching files. Keep the `SkyMeet-v3` folder. Do not upload only the ZIP or add another containing folder.
2. Commit all changes to the branch connected to Render. Old SkyMeet-v2, supreme-meet and mnt folders may stay; the new root scripts do not use them.
3. In the existing Render service, clear Root Directory so it is **blank**. This is essential if it currently points at SkyMeet-v2.
4. Build: `npm ci --include=dev && npm run build`
5. Start: `npm start`; health path: `/api/health`.
6. Keep your existing Neon `DATABASE_URL`. Do not reset the database. Set NODE_ENV=production and NODE_VERSION=24.19.0. HOST_ACCESS_KEY is optional; leave it unset if you do not want an extra room-creation key. If APP_ORIGIN is set, it must match the deployed HTTPS origin with no trailing slash.
7. Deploy the latest commit. Health must report version `3.3.0`; storage must be `postgresql` for permanent rooms. Close/reload old meeting tabs after upgrading.

A successful root start prints `skymeet-deploy@3.3.0`, followed by `skymeet@3.3.0` and a listening event with version 3.3.0. A missing .env message is normal when using Render environment variables.

## What changed

- Fixed the three incompatible nested content-type lockfile entries that broke npm ci.
- Added a root workspace entry point and root Render configuration to prevent deploying the older app accidentally.
- Added Retry loading room after a transient room lookup failure; older asynchronous lookups cannot overwrite the current room.
- Cancelled pending offer/answer work after a participant leaves.
- Added an ICE restart after five seconds of a disconnected peer; reset the retry count when the peer reconnects and clear timers when it leaves.
- Read the server version from package.json so startup and health responses stay consistent.
- Split browser checks across fresh server groups to respect the real room creation limit. Full browser checks still include the remote-video test.

## Included meeting features

Host admission, camera/microphone controls, permanent room links with Neon, whiteboard images and undo/redo, shared notes with conflict handling, attendance, chat pop-ups/unread badge, raise-hand and clap sounds, optional click sounds, photo/video virtual backgrounds, eight theme palettes, participant polls and recording with host permission toggles.

## Mobile and network support

- Phone browsers that expose getDisplayMedia can present their screen. Others can watch presentations but cannot capture their screen from a website. Installing a PWA does not remove this restriction.
- Local recording uses the video grid and available participant audio without screen capture, when MediaRecorder, canvas capture and AudioContext are supported. Keep the page visible and phone unlocked. Save the recording before closing the page. It excludes board/chat/notes; stops at 20 minutes or 150 MB.
- TURN relay credentials are needed for reliable calls on restrictive networks. Configure TURN_URLS (comma-separated turn:/turns: URLs) plus TURN_USERNAME and TURN_PASSWORD, or TURN_SECRET for a compatible shared-secret server. Credentials must come from your relay provider; none are bundled. Render hosts signaling, not a TURN relay.
- Meeting sounds and button sounds are individually togglable; browser audio begins after a user interaction.

## Local checks

From repository root:

```sh
npm ci --include=dev
npm run check
npx playwright install chromium --only-shell
npm run test:browser:regression
npm run test:browser
```

For local use, build and run `npm start`, then open http://localhost:3000. Without DATABASE_URL rooms are temporary. See SkyMeet-v3/.env.example for optional settings. The standalone SkyMeet-v3 folder also supports the same commands.

## Verification and limits

See TEST-RESULTS.md. This is a tested bugfix release, not a claim that every possible device or bug is covered. It has not been pushed to GitHub or deployed to your Render account by this session. No real Neon credentials or physical phones were used. End-to-end remote media still requires testing on the deployed site with functioning ICE/TURN networking.
