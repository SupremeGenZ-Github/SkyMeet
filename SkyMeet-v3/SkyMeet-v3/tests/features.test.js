import {test} from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.js';
import {snapshot,restore} from '../server/store.js';
const emit=(s,e,d={})=>new Promise((resolve,reject)=>s.timeout(4000).emit(e,d,(err,r)=>err?reject(err):resolve(r)));
async function fixture(fn){
 const app=createApp({env:{DATABASE_URL:'',HOST_ACCESS_KEY:''}});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;const sockets=[];
 try{const room=await(await fetch(base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json();
 const connect=async (name,resumeToken)=>{const s=io(base,{transports:['websocket'],forceNew:true});sockets.push(s);await new Promise(r=>s.once('connect',r));const joined=await emit(s,'join',{code:room.code,name,resumeToken,hostToken:name==='Host'?room.hostToken:undefined});s.resume=joined.resumeToken;return s;};
 const host=await connect('Host'),guest=await connect('Guest');await emit(host,'admit',{id:guest.id});await fn({host,guest,connect,room:app.rooms.get(room.code)});
 }finally{sockets.forEach(s=>s.disconnect());await app.close();}
}

test('participant recording permission is enforced and revocation stops active recording',()=>fixture(async({host,guest,room})=>{
 assert.equal((await emit(guest,'media',{recording:true})).ok,true);
 assert.equal(room.members.get(guest.id).recording,true);
 assert.equal((await emit(guest,'settings',{recordingEnabled:false})).ok,false);
 const stopped=new Promise(r=>guest.once('control',r));
 await emit(host,'settings',{recordingEnabled:false});assert.equal((await stopped).action,'stop-recording');
 assert.equal(room.members.get(guest.id).recording,false);
 assert.equal((await emit(guest,'media',{recording:true})).ok,false);
 assert.equal((await emit(host,'media',{recording:true})).ok,true);
 assert.equal(restore(snapshot(room)).recordingEnabled,false);
 await emit(host,'settings',{recordingEnabled:true});assert.equal((await emit(guest,'media',{recording:true})).ok,true);
}));
test('guest polls respect host permission and cannot overwrite active polls',()=>fixture(async({host,guest,room})=>{
 const question={question:'Ready?',choices:['Yes','No']};
 assert.equal((await emit(guest,'poll-create',question)).ok,true);
 assert.equal((await emit(guest,'poll-create',question)).ok,false);
 assert.equal((await emit(guest,'poll-vote',{choice:1})).ok,true);
 assert.equal((await emit(guest,'poll-close')).ok,true);
 await emit(host,'poll-create',question);assert.equal((await emit(guest,'poll-close')).ok,false);
 await emit(host,'poll-close');await emit(host,'settings',{participantPollsEnabled:false});
 assert.equal((await emit(guest,'poll-create',question)).ok,false);
 assert.equal(restore(snapshot(room)).participantPollsEnabled,false);
 assert.equal((await emit(host,'poll-create',question)).ok,true);
}));
test('chat carries sender identity and hand raise emits one event per transition',()=>fixture(async({host,guest})=>{
 const chat=new Promise(r=>host.once('chat',r));await emit(guest,'chat',{text:'Hello'});assert.equal((await chat).senderId,guest.id);
 let hands=0;host.on('hand-raised',()=>hands++);await emit(guest,'media',{hand:true});await emit(guest,'media',{hand:true});await emit(guest,'media',{hand:false});await emit(guest,'media',{hand:true});await new Promise(r=>setTimeout(r,30));assert.equal(hands,2);
}));

test('screen sharing is revoked immediately and cannot restart while disabled',()=>fixture(async({host,guest,room})=>{
 assert.equal((await emit(guest,'media',{sharing:true})).ok,true);
 await emit(host,'settings',{shareEnabled:false});assert.equal(room.members.get(guest.id).sharing,false);assert.equal((await emit(guest,'media',{sharing:true})).ok,false);
}));
test('demoting a cohost enforces the existing recording and sharing restrictions',()=>fixture(async({host,guest,room})=>{
 await emit(host,'settings',{shareEnabled:false,recordingEnabled:false});await emit(host,'control',{id:guest.id,action:'cohost'});assert.equal((await emit(guest,'media',{sharing:true,recording:true})).ok,true);await emit(host,'control',{id:guest.id,action:'guest'});assert.equal(room.members.get(guest.id).recording,false);assert.equal(room.members.get(guest.id).sharing,false);
}));

test('poll creator keeps closing controls after reconnecting',()=>fixture(async({host,guest,connect,room})=>{
 await emit(guest,'poll-create',{question:'Rejoin?',choices:['Yes','No']});const resume=guest.resume;const left=new Promise(r=>host.once('state',r));guest.disconnect();await left;const rejoined=await connect('Guest',resume);assert.equal(room.poll.creatorId,rejoined.id);assert.equal((await emit(rejoined,'poll-close')).ok,true);
}));
