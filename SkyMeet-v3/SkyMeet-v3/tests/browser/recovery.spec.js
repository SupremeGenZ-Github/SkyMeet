import {test,expect} from '@playwright/test';
async function host(page){await page.goto('/');await page.getByLabel('Your name',{exact:true}).fill('Host');await page.getByRole('button',{name:'Start a meeting'}).click();await page.getByRole('button',{name:'Enter your room'}).click();await expect(page.getByTestId('video-tile')).toHaveCount(1);}
test('camera permission finishing after Leave must release the acquired camera',async({page})=>{
 await page.addInitScript(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const s=await original(options);window.acquired=s;await new Promise(r=>window.releaseMedia=r);return s;};});
 await host(page);await page.getByRole('button',{name:'Turn camera on',exact:true}).click();await page.waitForFunction(()=>!!window.releaseMedia);
 await page.getByRole('button',{name:'Leave meeting',exact:true}).click();await expect(page.getByRole('heading',{name:'Thanks for meeting with us.'})).toBeVisible();await page.evaluate(()=>window.releaseMedia());
 await expect.poll(()=>page.evaluate(()=>window.acquired.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});
test('turning camera off while a background loads must not re-enable the outgoing camera',async({page})=>{
 await host(page);await page.getByRole('button',{name:'Turn camera on',exact:true}).click();await expect(page.getByRole('button',{name:'Turn camera off',exact:true})).toBeVisible();await page.getByRole('button',{name:'Settings',exact:true}).click();
 let release;const gate=new Promise(r=>release=r);let requested=false;
 await page.route('**/selfie_segmenter.tflite',async route=>{requested=true;await gate;await route.continue();});
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;return c.toDataURL().split(',')[1];});
 await page.getByLabel('Background file').setInputFiles({name:'bg.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect.poll(()=>requested).toBe(true);
 await page.getByRole('button',{name:'Turn camera off',exact:true}).click();release();
 await expect(page.getByLabel('Background file')).toBeDisabled();await page.waitForTimeout(1500);
 expect(await page.locator('.tile video').evaluate(v=>v.srcObject.getVideoTracks()[0].enabled)).toBe(false);
});
test('bad meeting password leaves a usable retry form',async({page,browser})=>{
 await page.goto('/');await page.getByLabel('Your name',{exact:true}).fill('Host');await page.getByLabel('Room password').fill('correct');await page.getByRole('button',{name:'Start a meeting'}).click();await expect(page.getByRole('button',{name:'Enter your room'})).toBeVisible();const url=page.url();await page.getByRole('button',{name:'Enter your room'}).click();
 const context=await browser.newContext();try{const guest=await context.newPage();await guest.goto(url);await guest.getByLabel('Your name',{exact:true}).fill('Guest');await guest.getByLabel('Meeting password',{exact:true}).fill('wrong');await guest.getByRole('button',{name:'Ask to join'}).click();await expect(guest.getByText('Incorrect meeting password.',{exact:true}).first()).toBeVisible();await expect(guest.getByLabel('Meeting password',{exact:true})).toBeVisible();await guest.getByLabel('Meeting password',{exact:true}).fill('correct');await guest.getByRole('button',{name:'Ask to join'}).click();await page.getByRole('button',{name:'Admit',exact:true}).click();await expect(guest.getByTestId('video-tile')).toHaveCount(2);}finally{await context.close();}
});

test('homepage recovers after a temporary server failure',async({page})=>{
 let attempts=0;await page.route('**/api/config',route=>++attempts===1?route.fulfill({status:503,contentType:'text/html',body:'Starting'}):route.continue());await page.goto('/');await expect(page.getByRole('button',{name:'Start a meeting'})).toBeEnabled({timeout:10000});expect(attempts).toBeGreaterThan(1);
});
test('malformed host recovery encoding does not crash the application',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#host=%zz');await expect(page.getByRole('button',{name:'Start a meeting'})).toBeVisible();expect(errors).toEqual([]);
});

test('screen picker completing after Leave releases its stream',async({page})=>{
 await page.addInitScript(()=>{navigator.mediaDevices.getDisplayMedia=async()=>{const c=document.createElement('canvas');c.width=c.height=64;const stream=c.captureStream();window.screenCapture=stream;await new Promise(r=>window.finishPicker=r);return stream;};});
 await host(page);await page.getByRole('button',{name:'Share screen',exact:true}).click();await page.waitForFunction(()=>!!window.finishPicker);await page.getByRole('button',{name:'Leave meeting',exact:true}).click();await expect(page.getByRole('heading',{name:'Thanks for meeting with us.'})).toBeVisible();await page.evaluate(()=>window.finishPicker());await expect.poll(()=>page.evaluate(()=>window.screenCapture.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});
