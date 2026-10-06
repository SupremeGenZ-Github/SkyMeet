import {chromium} from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
const source=fs.readFileSync('./src/rtc.js','utf8').replace('export class Mesh','class Mesh');
console.log(JSON.stringify(await page.evaluate(async source=>{
 const Mesh=new Function(source+';return Mesh;')();const sockets={};const errors=[];
 const socket=id=>sockets[id]={id,on(e,f){this.handler=f},off(){},emit(e,d){setTimeout(()=>sockets[d.to].handler({...d,from:id}),0)}};
 const callbacks={stream(){},connection(){},remove(){},error:e=>errors.push(e)};
 const a=new Mesh(socket('a'),[],callbacks),z=new Mesh(socket('z'),[],callbacks);
 const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;const stream=canvas.captureStream(5);
 await a.media(stream,null);await z.media(stream,null);await a.sync([{id:'a'},{id:'z'}]);await z.sync([{id:'a'},{id:'z'}]);
 await new Promise(r=>setTimeout(r,800));
 const describe=m=>[...m.peers.values()].map(p=>p.pc.getTransceivers().map(t=>({mid:t.mid,direction:t.currentDirection,kind:t.receiver.track.kind,sending:!!t.sender.track})));
 const streams=m=>[...m.peers.values()].map(p=>({cameraVideoTracks:p.camera.getVideoTracks().length,screenVideoTracks:p.screen.getVideoTracks().length}));const result={a:describe(a),z:describe(z),streamsA:streams(a),streamsZ:streams(z),errors};a.close();z.close();return result;
},source),null,2));await browser.close();
