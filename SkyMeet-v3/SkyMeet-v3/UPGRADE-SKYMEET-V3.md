# Upgrade to SkyMeet v3

Use your existing GitHub repository, Render service and Neon database. Back up the current source before replacing it with these files. Keep all environment variables and DATABASE_URL unchanged. Permanent room IDs, host recovery links, board data, notes and attendance use the existing database table.

1. Upload the extracted contents at the same repository directory that contains package.json. Include package-lock.json and all of public/background (the model and WASM files).
2. Render build: `npm ci --include=dev && npm run build`; start: `npm start`; health: `/api/health`.
3. Deploy the latest commit. The health response should report version `3.1.0` and storage `postgresql`.
4. Everyone must close old meeting tabs and reload before joining. Do not mix old and new clients.

## Where to find features

In a meeting, open Settings for uploaded photo/video backgrounds, sound controls, chat alerts, and host permissions for participant polls and recording. Camera must be on before applying a background. Sources are local files and aren't uploaded to Neon. Background processing can slow older phones; remove the effect if needed.

The footer includes Raise hand, applause, Share screen and Record locally. Polls contains participant poll creation when permitted. The chat badge indicates unread messages; pop-ups have an Open chat button.

## Mobile limits

This is a web app, not an Android/iOS native app. It cannot bypass a phone browser that does not support getDisplayMedia. The screen-sharing button explains this; the phone can still watch other participants' presentations. Native mobile screen broadcasting is outside this package.

Recording uses a canvas video grid plus available microphone/screen audio, without getDisplayMedia. It requires canvas.captureStream, MediaRecorder and Web Audio support. Keep the phone unlocked and SkyMeet visible. It does not capture shared notes, whiteboard or chat. Choose Save recording after stopping; save before refreshing. Limits: 20 minutes or approximately 150 MB. A shorter recording can still hit a device memory limit. No recording files are uploaded to Render or Neon.

The host recording toggle governs the built-in recorder only; it cannot prevent OS-level or external recording. Obtain participants' consent. Everyone sees an active recording indicator.

## Acceptance check on your deployed site

- Join from two devices, admit the guest, and confirm both cameras and microphones work both ways. Test camera replacement and screen sharing separately. Configure TURN for networks that cannot connect directly (existing README instructions).
- From a phone, record 10 seconds, stop, save and play it. Confirm local and remote speech are present. Test with and without headphones and while a participant shares a screen.
- Apply a photo, then a supported video background. Confirm the other device receives it; turn the camera off and verify it stops transmitting. Remove the background.
- Raise a hand, clap and send chat with the receiver's chat panel closed. Check mute and click-sound preferences.
- Let a guest launch/vote/close a poll, then disable participant poll creation. Check the guest can no longer create polls.
- Start a guest recording and revoke recording permission. Confirm it stops, offers the partial recording for saving, and cannot restart until re-enabled.
- Reopen a permanent link after a Render restart and check the board, notes and attendance.

This package has not been deployed to your account. Real mobile hardware and live internet calls need the above acceptance checks.
