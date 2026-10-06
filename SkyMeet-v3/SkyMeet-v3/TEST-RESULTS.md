# SkyMeet 3.2.0 verification — 5 October 2026

Source inspected: SupremeGenZ-Github/SkyMeet, commit b12ae45.

## Confirmed failures before the change

- Repository root had no package.json; several app folders allowed selecting an older version.
- SkyMeet-v3 npm ci failed EUSAGE: three nested content-type@3.0.0 entries did not satisfy content-type@2.1.0.

## Passing checks

- Fresh root npm ci: 157 packages installed.
- Isolated standalone app npm ci with repaired lockfile: 156 packages installed.
- 26 Node tests: authorization, waiting room, host/guest privileges, poll ownership/reconnect, guest recording/sharing revocation, chat/hand events, notes concurrency/flush, board history/images/locks, attendance, permanent room restart, pg-mem persistence/conflict protection, sound throttling, and leaving during pending media negotiation.
- Vite production build and bundled background model/WASM verification.
- 16 Chromium browser checks: four negotiated media slots and separated streams; notes conflicts/flush; malformed local storage; large multi-image imports; chat pop-ups/badge; guest polls/toggle; nonempty local recording download and host revocation in a mobile viewport with screen capture unavailable; photo/video segmentation and camera-off behavior; mobile homepage width; delayed camera permission after leave; camera-off during delayed background setup; wrong-password retry; startup config retry; malformed recovery link; late screen picker cancellation; eight themes; board/notes/chat both directions; room-load failure recovery.

The new room recovery test initially omitted re-entering the display name after page reload; that test setup was corrected and the full recovered join passed.

## Unresolved live validation

The full two-browser-context video test FAILED: expected two decoded video elements, received only the local one. An independent RTCPeerConnection gathering check returned only a final null candidate and no usable candidates, even with no STUN server. This environment cannot establish the media path used by this test. SDP negotiation is verified; end-to-end camera frames and remote mixed audio are NOT verified. The failed test remains in npm run test:browser and has not been weakened.

No physical Android/iPhone devices, live Render service, real Neon database or configured TURN relay were tested. Mobile checks used Chromium viewport emulation; PostgreSQL checks used pg-mem. Sound generation/preferences are tested, not human listening.

No claim is made that all possible bugs are eliminated. Test live host/guest video and audio on separate networks after deployment, using configured TURN when needed.
