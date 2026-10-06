import {test} from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.js';
import {validateObject,applyBoard,historyStep} from '../server/board.js';
import {summarizeAttendance} from '../shared/attendance.js';
import {restore} from '../server/store.js';
class TestStore{durable=true;data=new Map();async init(){}async get(k){return structuredClone(this.data.get(k)||null);}async save(r){this.data.set(r.code,structuredClone(r));}async close(){}}
const emit=(s,e,d={})=>new Promise((resolve,reject)=>s.timeout(4000).emit(e,d,(err,r)=>err?reject(err):resolve(r)));
const connect=base=>new Promise((resolve,reject)=>{const s=io(base,{transports:['websocket'],forceNew:true});s.once('connect',()=>resolve(s));s.once('connect_error',reject);});
async function boot(store){const app=createApp({store,env:{HOST_ACCESS_KEY:'',DATABASE_URL:'',STUN_URL:'none'}});await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return {...app,base:'http://127.0.0.1:'+app.server.address().port};}
const object={id:'note-1',type:'sticky',x:0,y:0,w:200,h:150,text:'Persistent idea',fill:'#fff2ab',color:'#187e79'};
test('permanent classroom survives end/reopen and process recreation; private attendance remains protected',async()=>{
 const store=new TestStore();let app=await boot(store);const sockets=[];
 try{
 const result=await fetch(app.base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({permanent:true,title:'Chemistry'})});assert.equal(result.status,201);const room=await result.json();assert.equal(room.permanent,true);
 let host=await connect(app.base);sockets.push(host);assert.equal((await emit(host,'join',{code:room.code,name:'Teacher',hostToken:room.hostToken,participantKey:'teacher-device'})).ok,true);
 let guest=await connect(app.base);sockets.push(guest);await emit(guest,'join',{code:room.code,name:'Student',participantKey:'student-device'});const requested=Date.now();await new Promise(r=>setTimeout(r,40));await emit(host,'admit',{id:guest.id});
 let report=await emit(host,'attendance');assert(report.rows[1].joinedAt>=requested);assert.equal((await emit(guest,'attendance')).ok,false);
 assert.equal((await emit(guest,'board-edit',{changes:[object]})).ok,true);await emit(host,'notes',{text:'Homework'});await emit(host,'end');assert.equal((await fetch(app.base+'/api/rooms/'+room.code)).status,200);
 const api=await fetch(app.base+'/api/rooms/'+room.code+'/attendance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hostToken:room.hostToken})});assert.equal(api.status,200);report=await api.json();assert(report.rows.every(r=>r.leftAt));assert.equal(report.meetings.length,1);
 assert.equal((await emit(guest,'join',{code:room.code,name:'Student'})).ok,false);
 await app.close();app=await boot(store);host=await connect(app.base);sockets.push(host);assert.equal((await emit(host,'join',{code:room.code,name:'Teacher',hostToken:room.hostToken,participantKey:'teacher-device'})).ok,true);
 assert.equal((await emit(host,'board-get')).objects[0].text,'Persistent idea');assert.equal((await emit(host,'attendance')).meetings.length,2);assert.equal(app.rooms.get(room.code).notes,'Homework');
 const denied=await fetch(app.base+'/api/rooms/'+room.code+'/attendance',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(denied.status,403);
 }finally{sockets.forEach(s=>s.disconnect());await app.close();}
});
test('temporary mode does not falsely allow permanent rooms',async()=>{const app=await boot({durable:false,init:async()=>{},get:async()=>null,save:async()=>{},close:async()=>{}});try{const res=await fetch(app.base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({permanent:true})});assert.equal(res.status,400);}finally{await app.close();}});
test('board operations validate, undo/redo, detect concurrent revisions, preserve other items and locks',()=>{
 const r={objects:[],boardRevision:0,objectVersion:0};const first=applyBoard(r,'a',[object]);assert.equal(r.objects.length,1);applyBoard(r,'b',[{...object,id:'note-2'}]);
 const undo=historyStep(r,first,true,true);assert.equal(r.objects.length,1);assert.equal(r.objects[0].id,'note-2');const redo=historyStep(r,{before:undo.after,after:first.after},false,true);assert.equal(r.objects.length,2);
 const item=r.objects.find(o=>o.id==='note-1');applyBoard(r,'b',[{...item,text:'Other edit',expectedRev:item.rev}]);assert.throws(()=>historyStep(r,{before:first.before,after:redo.after},true,true),/another change/);
 const current=r.objects.find(o=>o.id==='note-1');applyBoard(r,'host',[{...current,locked:true,expectedRev:current.rev}],true);const locked=r.objects.find(o=>o.id==='note-1');assert.throws(()=>applyBoard(r,'guest',[{...locked,text:'No',expectedRev:locked.rev}]),/locked/);
 assert.throws(()=>validateObject({...object,type:'image',src:'javascript:alert(1)'}),/PNG/);assert.throws(()=>validateObject({...object,x:Infinity}),/coordinates/);
});
test('attendance merges overlap, separates devices and sessions; interrupted visits close at saved heartbeat',()=>{
 const rows=[{id:'a',personId:'p',meetingId:'m',name:'A',joinedAt:1000,leftAt:5000},{id:'b',personId:'p',meetingId:'m',name:'A',joinedAt:3000,leftAt:7000},{id:'c',personId:'p',meetingId:'m',name:'A',joinedAt:9000,leftAt:null}];const summary=summarizeAttendance(rows,11000);assert.equal(summary[0].total,8000);assert.equal(summary[0].visits,3);assert.equal(summary[0].live,true);
 const restored=restore({lastSeen:9000,attendance:[{joinedAt:1000,lastSeen:6000,leftAt:null}],meetings:[{startedAt:1000}]});assert.equal(restored.attendance[0].leftAt,6000);assert.equal(restored.active,false);
});
