import { test, expect } from '@playwright/test';
test('eight palettes and independent persistent mode preferences',async({page})=>{
 await page.goto('/');await expect(page).toHaveTitle(/SkyMeet/);await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 const backgrounds=new Set();
 for(const mode of ['dark','light']){
  if(mode==='light')await page.getByRole('button',{name:'Switch to light mode'}).click();
  await expect(page.getByLabel('Color theme')).toHaveValue('sky');
  for(const palette of ['ember','grove','pulse','sky']){
   await page.getByLabel('Color theme').selectOption(palette);await expect(page.locator('html')).toHaveAttribute('data-palette',palette);
   backgrounds.add(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()));
   await page.screenshot({path:`test-results/theme-${mode}-${palette}.png`,fullPage:true});
  }
 }
 expect(backgrounds.size).toBe(8);await page.getByLabel('Color theme').selectOption('grove');await page.reload();await expect(page.getByLabel('Color theme')).toHaveValue('grove');
 await page.getByRole('button',{name:'Switch to dark mode'}).click();await expect(page.getByLabel('Color theme')).toHaveValue('sky');
 await expect(page.locator('body')).not.toContainText(/aacharya|academy/i);
});
test('guest images, shared board, undo redo, notes and chat in both directions',async({browser,page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('Your name',{exact:true}).fill('Sky host');await page.getByRole('button',{name:'Start a meeting'}).click();
 await expect(page.getByRole('button',{name:'Enter your room'})).toBeVisible();const url=page.url();await page.getByRole('button',{name:'Enter your room'}).click();
 const context=await browser.newContext();const guest=await context.newPage();guest.on('pageerror',e=>errors.push(e.message));
 await guest.goto(url);await guest.getByLabel('Your name',{exact:true}).fill('Sky guest');await guest.getByRole('button',{name:'Ask to join'}).click();await page.getByRole('button',{name:'Admit',exact:true}).click();await expect(guest.getByTestId('video-tile')).toHaveCount(2);
 for(const [writer,reader,text] of [[guest,page,'Guest shared note'],[page,guest,'Host shared note']]){
  await writer.getByRole('button',{name:'Notes',exact:true}).click();await writer.getByLabel('Shared meeting notes').fill(text);await reader.getByRole('button',{name:'Notes',exact:true}).click();await expect(reader.getByLabel('Shared meeting notes')).toHaveValue(text);
  await writer.getByRole('button',{name:'Notes',exact:true}).click();await reader.getByRole('button',{name:'Notes',exact:true}).click();
 }
 for(const [writer,reader,text] of [[guest,page,'Hello from guest'],[page,guest,'Hello from host']]){
  await writer.getByRole('button',{name:'Chat',exact:true}).click();await writer.getByLabel('Chat message').fill(text);await writer.getByRole('button',{name:'Send message'}).click();await reader.getByRole('button',{name:'Chat',exact:true}).click();await expect(reader.getByText(text,{exact:true})).toBeVisible();
  await writer.getByRole('button',{name:'Chat',exact:true}).click();await reader.getByRole('button',{name:'Chat',exact:true}).click();
 }
 for(const p of [page,guest]){await p.getByRole('button',{name:'Whiteboard',exact:true}).click();await p.getByRole('button',{name:'Open full whiteboard'}).click();}
 const png=await guest.evaluate(()=>{const c=document.createElement('canvas');c.width=180;c.height=100;const x=c.getContext('2d');x.fillStyle='#589dde';x.fillRect(0,0,180,100);x.fillStyle='#fff';x.font='22px sans-serif';x.fillText('SkyMeet',35,58);return c.toDataURL().split(',')[1];});
 await guest.locator('.studio-tools input[type=file]').setInputFiles({name:'example.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(page.locator('.board-canvas image')).toHaveCount(1);
 await guest.getByRole('button',{name:'↶ Undo',exact:true}).click();await expect(page.locator('.board-canvas image')).toHaveCount(0);await guest.getByRole('button',{name:'↷ Redo',exact:true}).click();await expect(page.locator('.board-canvas image')).toHaveCount(1);
 await guest.getByRole('button',{name:'▣ Sticky',exact:true}).click();await guest.getByLabel('Board canvas',{exact:true}).click({position:{x:400,y:200}});await guest.getByLabel('Selected object text').fill('An idea from the guest');await guest.getByRole('button',{name:'Apply text & style'}).click();await expect(page.locator('.board-canvas')).toContainText(/An idea from\s*the guest/);
 await page.getByRole('button',{name:'Kanban board',exact:true}).click();await expect(guest.locator('.board-canvas')).toContainText('In progress');await page.getByRole('button',{name:'Fit all',exact:true}).click();await page.screenshot({path:'test-results/skymeet-canvas-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Hide tools',exact:true}).click();await expect(page.locator('#board-inspector')).toBeHidden();await page.getByRole('button',{name:'Show tools',exact:true}).click();await expect(page.locator('#board-inspector')).toBeVisible();
 const downloading=guest.waitForEvent('download');await guest.getByRole('button',{name:'JSON backup',exact:true}).click();expect((await downloading).suggestedFilename()).toBe('skymeet-board.json');
 await guest.setViewportSize({width:390,height:844});await guest.screenshot({path:'test-results/skymeet-canvas-mobile.png',fullPage:true});expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(guest.getByRole('button',{name:'＋ Add image',exact:true})).toBeEnabled();expect(errors).toEqual([]);await context.close();
});
