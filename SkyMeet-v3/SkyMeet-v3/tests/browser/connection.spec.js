import {test,expect} from '@playwright/test';
import fs from 'node:fs';
test('real browser rebuilds a stalled media negotiation and rejects an old generation',async({page})=>{
 const source=fs.readFileSync(new URL('../../src/rtc.js',import.meta.url),'utf8').replace('export class Mesh','class Mesh');
 const result=await page.evaluate(async source=>{
  const Mesh=new Function(source+';return Mesh;')(),sockets={},errors=[];
  const socket=id=>sockets[id]={id,on(e,f){this.handler=f;},off(){this.handler=null;},emit(e,d){setTimeout(()=>sockets[d.to]?.handler?.({...d,from:id}),0);}};
  const cb={stream(){},connection(){},remove(){},error:e=>errors.push(e)};
  const a=new Mesh(socket('a'),[],cb),z=new Mesh(socket('z'),[],cb);
  const c=document.createElement('canvas');c.width=160;c.height=90;c.getContext('2d').fillRect(0,0,160,90);const media=c.captureStream(5);
  const ready=async()=>{for(let i=0;i<100;i++){const ap=a.peers.get('z'),zp=z.peers.get('a');if(ap?.pc.signalingState==='stable'&&ap.pc.remoteDescription&&zp?.pc.localDescription&&ap.epoch===zp.epoch)return;await new Promise(r=>setTimeout(r,20));}throw Error('Negotiation did not settle');};
  try{await a.media(media,null);await z.media(media,null);await Promise.all([a.sync([{id:'a'},{id:'z'}]),z.sync([{id:'a'},{id:'z'}])]);await ready();const old=a.peers.get('z'),epoch=old.epoch;
   await a.restart();await ready();await z.signal({from:'a',epoch,candidate:{candidate:'stale'}});
   return {changed:a.peers.get('z').epoch!==epoch,oldClosed:old.pc.signalingState==='closed',slots:z.peers.get('a').slots.length,directions:z.peers.get('a').slots.map(t=>t.currentDirection),errors};
  }finally{a.close();z.close();media.getTracks().forEach(t=>t.stop());}
 },source);
 expect(result.changed).toBe(true);expect(result.oldClosed).toBe(true);expect(result.slots).toBe(4);expect(result.directions).toEqual(['sendrecv','sendrecv','sendrecv','sendrecv']);expect(result.errors).toEqual([]);
});
test('relay diagnostic explains missing relay credentials in meeting settings',async({page})=>{
 await page.goto('/');await page.getByLabel('Your name',{exact:true}).fill('Host');await page.getByRole('button',{name:'Start a meeting'}).click();await page.getByRole('button',{name:'Enter your room'}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Test relay connection'}).click();await expect(page.getByRole('status')).toContainText('No TURN relay is configured');
});
