import {test,expect} from '@playwright/test';
import fs from 'node:fs';

test('real Chromium negotiation maps four bidirectional slots and separate remote streams',async({page})=>{
 const source=fs.readFileSync(new URL('../../src/rtc.js',import.meta.url),'utf8').replace('export class Mesh','class Mesh');
 const result=await page.evaluate(async source=>{
  const Mesh=new Function(source+';return Mesh;')();const sockets={},errors=[];
  const socket=id=>sockets[id]={id,on(e,f){this.handler=f},off(){this.handler=null},emit(e,d){setTimeout(()=>sockets[d.to]?.handler?.({...d,from:id}),0)}};
  const cb={stream(){},connection(){},remove(){},error:e=>errors.push(e)};
  const ctx=new AudioContext(),osc=ctx.createOscillator(),dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();
  const make=()=>{const c=document.createElement('canvas');c.width=160;c.height=90;c.getContext('2d').fillRect(0,0,160,90);const s=c.captureStream(5);s.addTrack(dest.stream.getAudioTracks()[0]);return s;};
  const cameraA=make(),cameraZ=make(),screenA=make(),screenZ=make();
  const a=new Mesh(socket('a'),[],cb),z=new Mesh(socket('z'),[],cb);
  await a.media(cameraA,screenA);await z.media(cameraZ,screenZ);await Promise.all([a.sync([{id:'a'},{id:'z'}]),z.sync([{id:'a'},{id:'z'}])]);
  for(let i=0;i<100;i++){if(a.peers.get('z')?.pc.remoteDescription&&z.peers.get('a')?.pc.localDescription)break;await new Promise(r=>setTimeout(r,20));}
  const describe=(m,id,camera,screen)=>{const p=m.peers.get(id);return {slots:p.pc.getTransceivers().map(t=>({mid:t.mid,direction:t.currentDirection})),cameraSender:p.slots[1]?.sender.track?.id===camera.getVideoTracks()[0].id,screenSender:p.slots[2]?.sender.track?.id===screen.getVideoTracks()[0].id,cameraTracks:p.camera.getTracks().map(t=>t.kind).sort(),screenTracks:p.screen.getTracks().map(t=>t.kind).sort()};};
  const before=[describe(a,'z',cameraA,screenA),describe(z,'a',cameraZ,screenZ)];
  const next=make();await z.media(next,null);
  const replaced=z.peers.get('a').slots[1].sender.track.id===next.getVideoTracks()[0].id;
  const screenStopped=z.peers.get('a').slots[2].sender.track===null;
  a.close();z.close();for(const s of [cameraA,cameraZ,screenA,screenZ,next])s.getTracks().forEach(t=>t.stop());await ctx.close();return {before,replaced,screenStopped,errors};
 },source);
 expect(result.errors).toEqual([]);expect(result.replaced).toBe(true);expect(result.screenStopped).toBe(true);
 for(const p of result.before){expect(p.slots).toHaveLength(4);expect(p.slots.every(t=>t.mid!==null&&t.direction==='sendrecv')).toBe(true);expect(p.cameraSender).toBe(true);expect(p.screenSender).toBe(true);expect(p.cameraTracks).toEqual(['audio','video']);expect(p.screenTracks).toEqual(['audio','video']);}
});
async function pair(page,browser){
 await page.goto('/');await page.getByLabel('Your name',{exact:true}).fill('Host');await page.getByRole('button',{name:'Start a meeting'}).click();await expect(page.getByRole('button',{name:'Enter your room'})).toBeVisible();const url=page.url();await page.getByRole('button',{name:'Enter your room'}).click();
 const context=await browser.newContext(),guest=await context.newPage();await guest.goto(url);await guest.getByLabel('Your name',{exact:true}).fill('Guest');await guest.getByRole('button',{name:'Ask to join'}).click();await page.getByRole('button',{name:'Admit',exact:true}).click();await expect(guest.getByTestId('video-tile')).toHaveCount(2);return {context,guest};
}
test('concurrent notes keep the draft and leaving flushes the last edit',async({page,browser})=>{
 const {context,guest}=await pair(page,browser);
 try{
 for(const p of [page,guest])await p.getByRole('button',{name:'Notes',exact:true}).click();
 await page.getByLabel('Shared meeting notes').fill('Host draft');await guest.getByLabel('Shared meeting notes').fill('Guest draft');
 await expect(guest.getByRole('button',{name:'Use latest notes'})).toBeVisible();
 await expect(guest.getByLabel('Shared meeting notes')).toHaveValue('Guest draft');await expect(page.getByLabel('Shared meeting notes')).toHaveValue('Host draft');
 await guest.getByRole('button',{name:'Save my draft instead'}).click();await expect(page.getByLabel('Shared meeting notes')).toHaveValue('Guest draft');
 await page.getByLabel('Shared meeting notes').fill('  Final note before leaving\n');await page.getByRole('button',{name:'Leave meeting',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Thanks for meeting with us.'})).toBeVisible();await expect(guest.getByLabel('Shared meeting notes')).toHaveValue('  Final note before leaving\n');
 }finally{await context.close();}
});
test('malformed saved-room data does not crash the homepage',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('academy-classrooms','{}'));await page.goto('/');await expect(page.getByRole('button',{name:'Start a meeting'})).toBeVisible();expect(errors).toEqual([]);
});
test('JSON import with three decoded images over 512 KB remains connected',async({page,browser})=>{
 const {context,guest}=await pair(page,browser);
 try{
 for(const p of [page,guest]){await p.getByRole('button',{name:'Whiteboard',exact:true}).click();await p.getByRole('button',{name:'Open full whiteboard'}).click();}
 const data=await guest.evaluate(()=>{
  const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');const img=ctx.createImageData(512,512);for(let i=0;i<img.data.length;i+=4){img.data[i]=Math.random()*255;img.data[i+1]=Math.random()*255;img.data[i+2]=Math.random()*255;img.data[i+3]=255;}ctx.putImageData(img,0,0);const src=c.toDataURL('image/jpeg',.8);
  return JSON.stringify({format:'skymeet-board-v2',objects:[0,1,2].map(i=>({id:'image'+i,type:'image',src,x:i*210,y:0,w:200,h:200}))});
 });
 expect(Buffer.byteLength(data)).toBeGreaterThan(512*1024);
 await guest.locator('.studio-inspector input[type=file]').setInputFiles({name:'images.json',mimeType:'application/json',buffer:Buffer.from(data)});
 await expect(page.locator('.board-canvas image')).toHaveCount(3);await expect(guest.locator('.studio-header')).toContainText('Saved');
 await guest.getByRole('button',{name:'Back to meeting'}).click();await guest.getByRole('button',{name:'Chat',exact:true}).click();await guest.getByLabel('Chat message').fill('Still connected after import');await guest.getByRole('button',{name:'Send message'}).click();
 await page.getByRole('button',{name:'Back to meeting'}).click();await page.getByRole('button',{name:'Chat',exact:true}).click();await expect(page.getByText('Still connected after import',{exact:true})).toBeVisible();
 }finally{await context.close();}
});
