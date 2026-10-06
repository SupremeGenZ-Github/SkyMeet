import {test} from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.js';
import {snapshot,restore} from '../server/store.js';
const emit=(s,e,d={})=>new Promise((resolve,reject)=>s.timeout(4000).emit(e,d,(err,r)=>err?reject(err):resolve(r)));
async function fixture(fn){
 const app=createApp({env:{DATABASE_URL:'',HOST_ACCESS_KEY:''}});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;const sockets=[];
 try{const room=await(await fetch(base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json();
 const connect=async name=>{const s=io(base,{transports:['websocket'],forceNew:true});sockets.push(s);await new Promise(r=>s.once('connect',r));await emit(s,'join',{code:room.code,name,hostToken:name==='Host'?room.hostToken:undefined});return s;};
 const host=await connect('Host'),guest=await connect('Guest');await emit(host,'admit',{id:guest.id});await fn({host,guest,room:app.rooms.get(room.code)});
 }finally{sockets.forEach(s=>s.disconnect());await app.close();}
}
const item={id:'note',type:'sticky',x:0,y:0,w:200,h:100,text:'one'};
test('three undo/redo operations on the same object, including creation',()=>fixture(async({guest})=>{
 let r=await emit(guest,'board-edit',{changes:[item]});
 for(const text of ['two','three']){const o=r.objects[0];r=await emit(guest,'board-edit',{changes:[{...o,text,expectedRev:o.rev}]});assert(r.ok);}
 for(const text of ['two','one',undefined]){r=await emit(guest,'board-undo');assert(r.ok,r.error);assert.equal(r.objects[0]?.text,text);}
 for(const text of ['one','two','three']){r=await emit(guest,'board-redo');assert(r.ok,r.error);assert.equal(r.objects[0]?.text,text);}
}));
test('undo still refuses to overwrite another participant change',()=>fixture(async({host,guest})=>{
 let r=await emit(guest,'board-edit',{changes:[item]});const o=r.objects[0];await emit(host,'board-edit',{changes:[{...o,text:'Host update',expectedRev:o.rev}]});r=await emit(guest,'board-undo');assert.equal(r.ok,false);assert.match(r.error,/another change/);
}));
test('multiple valid embedded images above 512 KB do not disconnect the guest',()=>fixture(async({guest})=>{
 const src='data:image/jpeg;base64,'+'A'.repeat(280000);
 const r=await emit(guest,'board-edit',{changes:[{...item,id:'i1',type:'image',src},{...item,id:'i2',type:'image',src}]});assert(r.ok,r.error);assert.equal(r.objects.length,2);assert.equal(guest.connected,true);
}));
test('shared notes preserve formatting, reject stale writers, and persist revision',()=>fixture(async({host,guest,room})=>{
 const r=await emit(host,'notes',{text:'  indented\n',expectedRevision:0});assert.equal(r.notes,'  indented\n');assert.equal(r.notesRevision,1);
 const stale=await emit(guest,'notes',{text:'stale',expectedRevision:0});assert.equal(stale.conflict,true);assert.equal(room.notes,'  indented\n');assert.equal(room.notesRevision,1);
 const saved=restore(snapshot(room));assert.equal(saved.notesRevision,1);assert.equal(saved.notes,'  indented\n');
 const fresh=await emit(guest,'notes',{text:'resolved',expectedRevision:1});assert.equal(fresh.notesRevision,2);
}));
