# SkyMeet v2 — bug-fix release

Release date: 24 September 2026. Package/API version: **2.1.0** (the inherited original package already used 2.0.0).

This release fixes the eight confirmed audit findings. Visual effects, custom backgrounds and sound effects are deferred as requested. It is not a claim that every possible defect has been eliminated.

## Fixes

| Finding | Fix |
| --- | --- |
| One-way camera/audio | Only the offerer creates the four media transceivers. The answerer reuses the negotiated transceivers and attaches its tracks before answering. Both directions negotiate `sendrecv`. |
| Camera and screen tracks mixed | Incoming tracks map by negotiated media ID to separate camera and screen streams, with one audio/video track per stream. Stream updates trigger the interface to bind updated tracks. |
| Repeated undo fails | Undo/redo rebases the affected revision references in the same participant's history while retaining protection against another participant's changes. |
| Multiple-image import disconnects | The Socket.IO inbound message limit is raised from 512 KiB to 8 MiB, accommodating the existing 6 MB import limit. Object, image and board-capacity validation remains in place. |
| Remote notes overwrite a local draft | Revision checks reject stale writes. Unsaved local text stays visible, with controls to inspect/use the latest shared notes or explicitly save the local draft instead. |
| Leaving loses the last note edit | Leave waits for pending notes to save; unresolved or failed saves prompt before discarding. Host End for all also checks the host's draft. |
| Notes lose whitespace | Saving preserves leading spaces and trailing newlines within the existing 12,000-character limit. |
| Malformed saved-room data crashes home | Stored room lists are checked for array and entry shape. Invalid entries are ignored without clearing host ownership keys. |

## Update your existing deployment

You do **not** need a new Neon project or Render service.

1. Download and extract this package.
2. Upload its contents to the same GitHub project folder currently used by Render. Include both `package.json` and `package-lock.json`, the new `src/notes-sync.js`, and all updated source files.
3. Keep your existing Render Root Directory. It must point to the directory containing `package.json`.
4. Keep `DATABASE_URL` pointing at the same Neon database. Do not reset or delete the database.
5. Keep the build command `npm ci --include=dev && npm run build` and start command `npm start`.
6. Deploy the latest commit on your existing Render service.
7. Check `/api/health`. It should report `"version":"2.1.0"` and `"storage":"postgresql"`.
8. Have **every participant close the old meeting tab and reload the updated site** before testing. Avoid mixing the old and new calling implementations.

No destructive SQL migration is required. Notes revisions are added to the existing JSON room record; old records default to revision zero. Existing room codes, host keys, password hashing, database tables and board backup compatibility are preserved. Existing data that was already lost by the old bugs cannot be reconstructed by this update.

If you previously omitted `HOST_ACCESS_KEY`, continue leaving it absent. The manual deployment does not require one. The inherited Blueprint file still generates one for a *new Blueprint deployment*; this update does not require creating a new Blueprint.

## Notes workflow

Ordinary edits save automatically after a short pause. **Save notes now** flushes the draft immediately. When another participant edits while you have an unsaved draft:

- Your text stays in the editor.
- **View latest shared notes** shows the competing saved version.
- **Use latest notes** discards your local draft in favor of the shared version.
- **Save my draft instead** explicitly replaces that version, subject to a new revision check.

This is conflict detection, not character-by-character collaborative text merging. Closing the browser abruptly, losing power, or a host ending someone else's session can still interrupt an unsaved draft. Use the in-app Leave control and save important notes before ending a meeting.

## Validation

See TEST-RESULTS.md for the recorded results and limits. The real Chromium negotiation regression verifies four negotiated bidirectional media slots, distinct camera/screen streams, camera track replacement, and stopping a screen track.

The full remote-video test could not establish a media path in this execution environment: no usable ICE network candidates were produced. Consequently, real-device audio/video across the internet is not claimed verified. Network-restricted users may still need a working TURN relay; correcting negotiation cannot supply a missing network relay.

## Two-device acceptance test after deployment

1. Open the same permanent room on two devices and admit the guest. Enable camera and microphone on both.
2. Confirm **both** host and guest see the other person's moving video and hear speech. Use headphones to avoid feedback.
3. Switch each camera off/on, then share and stop a screen from each device. Confirm camera view returns afterward.
4. Swap who creates the room and repeat to exercise both host roles.
5. Verify chat, image upload, repeated undo/redo and note edits in both directions.
6. Type in both notes editors before either saves. Confirm a draft-preserving conflict appears.
7. Type a final note and immediately use Leave. Confirm the other device receives it.
8. Test a different network, such as mobile data. If media works on Wi-Fi but not across networks, inspect/configure TURN settings and share the visible connection status for diagnosis.

## Rollback

Keep the prior Git commit or ZIP. If rollback becomes necessary, redeploy that commit while retaining the existing database and settings. The extra notes revision field is additive. Refresh all participant tabs after changing versions.
