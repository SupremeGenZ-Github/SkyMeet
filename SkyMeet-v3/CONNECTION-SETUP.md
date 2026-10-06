# SkyMeet 3.3 — fix and configure student connections

This is a connection patch for 3.2, not the separate planned v4/v4.1 feature release.

## Deploy the correct app

Upload the extracted archive contents to the GitHub repository root. Do not add another containing folder. Clear Render Root Directory so it is blank. Build: `npm ci --include=dev && npm run build`. Start: `npm start`. Keep the existing Neon DATABASE_URL. Health /api/health should show 3.3.0. Reload every teacher/student tab after upgrading; old clients do not support the new negotiation generation messages.

The last inspected GitHub commit (d603483) contains several older app folders, including a newly uploaded SkyMeet folder at version 2.0.0. The root deployment files in this archive select SkyMeet-v3 at version 3.3.0. Avoid pointing Render to the old folders.

## Easiest managed relay configuration

1. Create a TURN key in Cloudflare Realtime TURN. Follow https://developers.cloudflare.com/realtime/turn/generate-credentials/ . A provider account and any usage charges are handled by you; this release does not create or subscribe to a service.
2. In Render → Environment, add CF_TURN_KEY_ID and CF_TURN_API_TOKEN using the values supplied by Cloudflare. Save and redeploy. Keep the API token private; do not put it in GitHub or browser code. A long-term API token is NOT the TURN_PASSWORD.
3. SkyMeet requests temporary credentials server-side, with a 24-hour TTL and refresh of the server cache after 12 hours. Credentials are renewed when a participant reconnects or media recovery requests a new configuration. A single continuously connected call exceeding the credentials' 24-hour lifetime needs reconnection.
4. For teaching on restrictive networks, optionally set ICE_TRANSPORT_POLICY=relay. This sends all media through configured relays. Use all for direct-or-relay operation with a relay-only retry after a stalled attempt.
5. Join a room → Settings → Test relay connection. A success confirms relay allocation from that device, not full end-to-end video/audio. Test a real teacher/student call on different networks as well.

Official Cloudflare endpoints support UDP, TCP and TLS, including TLS on port 443. SkyMeet uses the provider's returned endpoints and credentials. STUN discovery defaults to Google and Cloudflare; STUN is not a replacement for a relay.

## Alternative: any TURN provider or your own Coturn

Use provider-issued credentials in Render:

TURN_URLS=turn:YOUR_PRIMARY_HOST:3478?transport=udp,turn:YOUR_PRIMARY_HOST:3478?transport=tcp,turns:YOUR_PRIMARY_HOST:443?transport=tcp
TURN_USERNAME=YOUR_PRIMARY_USERNAME
TURN_PASSWORD=YOUR_PRIMARY_PASSWORD

Replace every placeholder. Include only ports/transports actually supported by your provider. Do not invent credentials or reuse another provider's credentials. A Coturn shared secret can instead be supplied as TURN_SECRET; SkyMeet generates HMAC credentials compatible with that setup.

For independent provider redundancy:

TURN_BACKUP_URLS=turn:YOUR_BACKUP_HOST:3478?transport=udp,turns:YOUR_BACKUP_HOST:443?transport=tcp
TURN_BACKUP_USERNAME=YOUR_BACKUP_USERNAME
TURN_BACKUP_PASSWORD=YOUR_BACKUP_PASSWORD

CF_* configuration can coexist with TURN_* and TURN_BACKUP_*; all valid relays are offered to the browser. TURN_BACKUP_SECRET is supported for a second shared-secret Coturn server.

For more providers, TURN_SERVERS_JSON accepts up to eight objects with urls (string or array), username and credential; a secret property may be used instead for Coturn. This setting belongs only in Render. See .env.example. The browser chooses among available relay candidates; the app does not promise a particular geographic or provider order.

## What this patch fixes

- Stuck initial negotiations have a deadline and bounded automatic retries.
- Retries rebuild an outstanding offer rather than silently dropping a restart while negotiation is busy.
- Recovery tries relay-only media when relays are available. An administrator can start in relay-only mode.
- New negotiation generations reject delayed offers/candidates from an older attempt.
- Authenticated reconnects replace lingering sockets from the same session instead of failing 'already connected'. Other users cannot take over without the private resume token.
- A late join acknowledgement timeout cannot tear down a meeting already admitted by the server.
- Configuration warnings and an in-browser relay allocation test distinguish missing credentials from reachability.
- Connected participant tiles show direct or relay path when browser statistics report the selected pair.

## If students still cannot connect

Check that health shows 3.3.0 and that /api/config reports turnConfigured=true. That flag means credentials were configured; use the relay test to check whether they work. If the relay test fails, fix credentials/provider availability before retrying class. If it succeeds but a call fails, send the deployed site URL and the visible error, without secrets. Also note whether failure means 'cannot join room' or 'joined, but no video/audio'.

No relay service has been activated in your Render account by this coding session. Render hosts meeting signaling; it does not automatically host a TURN relay. The release is not a guarantee of connectivity on every network.
