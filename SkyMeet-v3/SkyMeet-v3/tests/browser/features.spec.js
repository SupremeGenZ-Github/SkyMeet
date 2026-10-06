import {test,expect} from '@playwright/test';
import fs from 'node:fs';
async function pair(page,browser){
 await page.goto('/');await page.getByLabel('Your name',{exact:true}).fill('Host');await page.getByRole('button',{name:'Start a meeting'}).click();await expect(page.getByRole('button',{name:'Enter your room'})).toBeVisible();const url=page.url();await page.getByRole('button',{name:'Enter your room'}).click();
 const context=await browser.newContext(),guest=await context.newPage();await guest.goto(url);await guest.getByLabel('Your name',{exact:true}).fill('Guest');await guest.getByRole('button',{name:'Ask to join'}).click();await page.getByRole('button',{name:'Admit',exact:true}).click();await expect(guest.getByTestId('video-tile')).toHaveCount(2);return {context,guest};
}

test('chat alerts, participant polls, recording revocation and sound preferences',async({page,browser})=>{
 const {context,guest}=await pair(page,browser);page.on('dialog',d=>d.accept());guest.on('dialog',d=>d.accept());
 try{
 await guest.getByRole('button',{name:'Chat',exact:true}).click();await guest.getByLabel('Chat message').fill('New message');await guest.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.locator('.chat-popup')).toContainText('New message');await expect(page.getByRole('button',{name:'Chat',exact:true}).locator('.badge')).toHaveText('1');
 await page.getByRole('button',{name:'Open chat',exact:true}).click();await expect(page.locator('.chat-popup')).toHaveCount(0);
 await guest.getByRole('button',{name:'Polls',exact:true}).click();await guest.getByLabel('Question',{exact:true}).fill('Guest poll');await guest.getByRole('button',{name:'Launch poll'}).click();await expect(guest.getByRole('heading',{name:'Guest poll'})).toBeVisible();
 await guest.getByRole('button',{name:'Close poll',exact:true}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Allow participants to create polls',{exact:true}).click();await expect(guest.getByRole('button',{name:'Launch poll'})).toHaveCount(0);
 await guest.evaluate(()=>{Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:undefined,configurable:true});});
 await guest.setViewportSize({width:390,height:844});await guest.getByRole('button',{name:'Record locally'}).click();await expect(guest.getByRole('button',{name:'Stop recording',exact:true})).toBeVisible();
 await expect(page.locator('.recording-banner')).toBeVisible();await guest.waitForTimeout(1200);
 await page.getByLabel('Allow participant recording',{exact:true}).click();await expect(guest.getByRole('link',{name:'Save recording',exact:true})).toBeVisible();await expect(guest.getByRole('button',{name:'Record locally'})).toBeDisabled();
 const downloadEvent=guest.waitForEvent('download');await guest.getByRole('link',{name:'Save recording',exact:true}).click();const downloaded=await downloadEvent;expect(fs.statSync(await downloaded.path()).size).toBeGreaterThan(100);
 await page.getByLabel('Meeting sounds',{exact:true}).uncheck();await expect(page.getByLabel('Button click sounds')).toBeDisabled();expect(await page.evaluate(()=>localStorage.getItem('skymeet-sounds'))).toBe('off');
 await guest.getByRole('button',{name:'Share screen',exact:true}).click();await expect(guest.locator('.toast')).toContainText('cannot share its screen');
 }finally{await context.close();}
});
test('real segmentation applies and removes an uploaded photo and video background',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('Your name',{exact:true}).fill('Host');await page.getByRole('button',{name:'Start a meeting'}).click();await page.getByRole('button',{name:'Enable camera & mic'}).click();await expect(page.getByRole('button',{name:'Turn camera off',exact:true})).toBeVisible();await page.getByRole('button',{name:'Enter your room'}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,64,64);return c.toDataURL().split(',')[1];});
 await page.getByLabel('Background file').setInputFiles({name:'red.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.getByRole('button',{name:'Remove background'})).toBeEnabled({timeout:30000});await expect(page.locator('.panel-content')).toContainText('red.png');
 await expect.poll(()=>page.locator('.tile video').evaluate(v=>v.srcObject?.getVideoTracks()[0]?.getSettings().width)).toBe(640);
 await page.getByRole('button',{name:'Remove background'}).click();await expect(page.getByRole('button',{name:'Remove background'})).toBeDisabled();
 const clip=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=64;c.height=64;c.getContext('2d').fillRect(0,0,64,64);const s=c.captureStream(10),r=new MediaRecorder(s),chunks=[];const done=new Promise(resolve=>r.onstop=()=>resolve());r.ondataavailable=e=>chunks.push(e.data);r.start();await new Promise(resolve=>setTimeout(resolve,350));r.stop();await done;s.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));});
 await page.getByLabel('Background file').setInputFiles({name:'custom.webm',mimeType:'video/webm',buffer:Buffer.from(clip)});await expect(page.locator('.panel-content')).toContainText('custom.webm',{timeout:30000});await page.getByRole('button',{name:'Turn camera off',exact:true}).click();await page.getByRole('button',{name:'Remove background'}).click();expect(await page.locator('.tile video').evaluate(v=>v.srcObject.getVideoTracks()[0].enabled)).toBe(false);expect(errors).toEqual([]);
});
