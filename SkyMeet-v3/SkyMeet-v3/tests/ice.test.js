import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIceProvider} from '../server/ice.js';
test('multiple STUN and independent primary/backup TURN credentials are kept separate',async()=>{
 const p=createIceProvider({TURN_URLS:'turn:a.example:3478?transport=udp,turns:a.example:443?transport=tcp',TURN_USERNAME:'a',TURN_PASSWORD:'password-a',TURN_BACKUP_URLS:'turn:b.example:3478?transport=tcp',TURN_BACKUP_USERNAME:'b',TURN_BACKUP_PASSWORD:'password-b'});
 const c=await p.get();assert.equal(c.turnConfigured,true);assert.equal(p.summary().relayProviders,2);assert.equal(c.iceServers[0].urls.length,2);assert.equal(c.iceServers[1].credential,'password-a');assert.equal(c.iceServers[2].credential,'password-b');assert.equal(JSON.stringify(p.summary()).includes('password'),false);
});
test('bad relay configuration reports a warning rather than pretending TURN is working',async()=>{
 const p=createIceProvider({TURN_URLS:'https://bad.example',TURN_SERVERS_JSON:'bad',ICE_TRANSPORT_POLICY:'relay',STUN_URL:'none'});const c=await p.get();assert.equal(c.turnConfigured,false);assert.equal(c.iceTransportPolicy,'all');assert.equal(c.relayWarnings.length,2);assert.deepEqual(c.iceServers,[]);
});
test('shared-secret relays generate signed short-lived credentials',async()=>{
 const c=await createIceProvider({TURN_URLS:'turn:a.example:3478',TURN_SECRET:'secret'},{now:()=>100000}).get();assert.match(c.iceServers[1].username,/^86500:/);assert.notEqual(c.iceServers[1].credential,'secret');
});
test('Cloudflare credential requests are cached and do not expose the API token',async()=>{
 let calls=0;const p=createIceProvider({CF_TURN_KEY_ID:'key',CF_TURN_API_TOKEN:'private-token'},{fetch:async(url,options)=>{calls++;assert.match(url,/generate-ice-servers$/);assert.equal(options.headers.Authorization,'Bearer private-token');return {ok:true,json:async()=>({iceServers:[{urls:['turn:relay.example:3478?transport=udp','turns:relay.example:443?transport=tcp'],username:'short-user',credential:'short-secret'}]})};}});
 const [a,b]=await Promise.all([p.get(),p.get()]);assert.equal(calls,1);assert.equal(a.turnConfigured,true);assert.deepEqual(a,b);assert.equal(JSON.stringify(a).includes('private-token'),false);await p.get();assert.equal(calls,1);
});
test('provider outage still leaves an independent backup relay available',async()=>{
 const c=await createIceProvider({CF_TURN_KEY_ID:'key',CF_TURN_API_TOKEN:'private-token',TURN_BACKUP_URLS:'turn:backup.example:3478',TURN_BACKUP_USERNAME:'u',TURN_BACKUP_PASSWORD:'p'},{fetch:async()=>{throw Error('provider offline');}}).get();assert.equal(c.turnConfigured,true);assert.equal(c.iceServers[1].username,'u');assert.match(c.relayWarnings[0],/unavailable/);
});
