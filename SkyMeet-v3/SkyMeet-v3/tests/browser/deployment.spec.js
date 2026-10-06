import {test,expect} from '@playwright/test';

test('room lookup can recover from a temporary server failure without reloading',async({page})=>{
 await page.goto('/');
 await page.getByLabel('Your name',{exact:true}).fill('Recovery Host');
 await page.getByRole('button',{name:'Start a meeting'}).click();
 await expect(page.getByRole('button',{name:'Enter your room'})).toBeVisible();
 const url=page.url();
 let attempts=0;
 await page.route('**/api/rooms/*',route=>{
   if(++attempts===1)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporarily unavailable'})});
   return route.continue();
 });
 await page.goto(url);
 await expect(page.getByRole('button',{name:'Retry loading room'})).toBeVisible();
 await page.getByRole('button',{name:'Retry loading room'}).click();
 await expect(page.getByRole('button',{name:'Enter your room'})).toBeEnabled();
 await page.getByLabel('Your name',{exact:true}).fill('Recovery Host');
 await page.getByRole('button',{name:'Enter your room'}).click();
 await expect(page.getByRole('heading',{name:'Participants',exact:true})).toBeVisible();
});
