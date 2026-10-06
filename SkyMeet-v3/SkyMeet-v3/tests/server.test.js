import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApp } from '../server/app.js';

let service, base;
const clients = [];
before(async () => { service = createApp({ env: { HOST_ACCESS_KEY:'test-key', STUN_URL:'none', MAX_PARTICIPANTS:'3' } }); await new Promise(r => service.server.listen(0,'127.0.0.1',r)); base = `http://127.0.0.1:${service.server.address().port}`; });
after(() => { clients.forEach(s => s.disconnect()); service.close(); });
const once = (s,e) => new Promise((resolve,reject) => { const timer=setTimeout(() => reject(new Error(`Timeout: ${e}`)),4000); s.once(e,d => {clearTimeout(timer);resolve(d);}); });
const emit = (s,e,d={}) => new Promise((resolve,reject) => s.timeout(4000).emit(e,d,(err,res) => err ? reject(err) : resolve(res)));
async function client(){const s=io(base,{transports:['websocket'],forceNew:true});clients.push(s);await once(s,'connect');return s;}
async function room(){const res=await fetch(base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Test room',hostKey:'test-key',password:'abc123'})});assert.equal(res.status,201);return res.json();}
async function setup(){const r=await room();const host=await client();const admission=once(host,'admitted');assert.equal((await emit(host,'join',{code:r.code,hostToken:r.hostToken,name:'Host'})).ok,true);await admission;return {...r,host};}
async function guest(r,name='Guest'){const s=await client();const waiting=once(s,'waiting-room');const result=await emit(s,'join',{code:r.code,name,password:'abc123'});assert.equal(result.ok,true);await waiting;return {s,resumeToken:result.resumeToken};}
async function admit(r,s){const admission=once(s,'admitted');assert.equal((await emit(r.host,'admit',{id:s.id})).ok,true);await admission;}

test('health, config, host key and cross-origin protection',async()=>{
 assert.equal((await (await fetch(base+'/api/health')).json()).ok,true);
 assert.equal((await (await fetch(base+'/api/config')).json()).hostKeyRequired,true);
 assert.equal((await fetch(base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.example'},body:'{}'})).status,403);
});
test('password, waiting-room isolation, admission, chat and signaling',async()=>{
 const r=await setup(), bad=await client();assert.equal((await emit(bad,'join',{code:r.code,name:'Bad',password:'wrong'})).ok,false);
 const {s}=await guest(r);assert.equal((await emit(s,'chat',{text:'Not admitted'})).ok,false);assert.equal((await emit(s,'signal',{to:r.host.id,description:{type:'offer',sdp:'a'}})).ok,false);
 await admit(r,s);const message=once(r.host,'chat');assert.equal((await emit(s,'chat',{text:'Hello Academy'})).ok,true);assert.equal((await message).text,'Hello Academy');
 const signal=once(r.host,'signal');await emit(s,'signal',{to:r.host.id,candidate:{candidate:'test'}});assert.equal((await signal).from,s.id);
});
test('guest privileges, lock, chat controls, cohost and attendance',async()=>{
 const r=await setup(),{s}=await guest(r);await admit(r,s);
 assert.equal((await emit(s,'end')).ok,false);assert.equal((await emit(s,'attendance')).ok,false);assert.equal((await emit(s,'settings',{locked:true})).ok,false);
 await emit(r.host,'settings',{chatEnabled:false,locked:true});assert.equal((await emit(s,'chat',{text:'blocked'})).ok,false);
 const newcomer=await client();assert.equal((await emit(newcomer,'join',{code:r.code,name:'Late',password:'abc123'})).ok,false);
 await emit(r.host,'control',{id:s.id,action:'cohost'});assert.equal((await emit(s,'attendance')).rows.length,2);
 assert.equal((await emit(s,'control',{id:r.host.id,action:'remove'})).ok,false);
});
test('whiteboard validation, polls, notes, participant limit and end',async()=>{
 const r=await setup(), {s}=await guest(r);await admit(r,s);const {s:s2}=await guest(r,'Guest 2');await admit(r,s2);const {s:s3}=await guest(r,'Guest 3');assert.equal((await emit(r.host,'admit',{id:s3.id})).ok,false);
 assert.equal((await emit(s,'draw',{points:[[0,0],[2,2]],color:'#ff0000'})).ok,false);assert.equal((await emit(s,'draw',{points:[[0,0],[1,1]],color:'#ff0000'})).ok,true);
 assert.equal((await emit(s,'clear-board')).ok,false);assert.equal((await emit(r.host,'clear-board')).ok,true);
 await emit(r.host,'poll-create',{question:'Ready?',choices:['Yes','No']});let update=once(r.host,'poll');await emit(s,'poll-vote',{choice:0});assert.equal((await update).counts[0],1);update=once(r.host,'poll');await emit(s,'poll-vote',{choice:1});assert.deepEqual((await update).counts,[0,1]);
 await emit(r.host,'poll-close');assert.equal((await emit(s,'poll-vote',{choice:0})).ok,false);
 const note=once(r.host,'notes');await emit(s,'notes',{text:'Agenda'});assert.equal(await note,'Agenda');
 const ended=once(s,'ended');await emit(r.host,'end');assert.match(await ended,/ended/);assert.equal((await fetch(base+'/api/rooms/'+r.code)).status,404);
});
test('reconnect, removal token revocation and cross-room signaling',async()=>{
 const r=await setup(),{s,resumeToken}=await guest(r);await admit(r,s);await emit(s,'leave');const rejoined=await client();const event=once(rejoined,'admitted');assert.equal((await emit(rejoined,'join',{code:r.code,name:'Guest',resumeToken})).ok,true);await event;
 const other=await client();assert.equal((await emit(rejoined,'signal',{to:other.id,candidate:{candidate:'test'}})).ok,false);
 await emit(r.host,'control',{id:rejoined.id,action:'remove'});assert.equal((await emit(other,'join',{code:r.code,name:'Guest',resumeToken})).ok,false);
});
