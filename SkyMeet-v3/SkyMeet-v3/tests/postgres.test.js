import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newDb} from 'pg-mem';
import {RoomStore} from '../server/store.js';
test('PostgreSQL schema, JSON snapshot round-trip and stale-writer protection (pg-mem emulator)',async()=>{
 const db=newDb();const {Pool}=db.adapters.createPg();const store=new RoomStore();store.pool=new Pool();store.durable=true;
 try{await store.init();const row={code:'classroom-a',title:'Chemistry',objects:[{text:'Keep me'}],attendance:[{name:'Student'}]};row.storageVersion=await store.save(row);assert.equal(row.storageVersion,1);const loaded=await store.get(row.code);assert.equal(loaded.title,'Chemistry');assert.equal(loaded.objects[0].text,'Keep me');assert.equal(loaded.attendance[0].name,'Student');loaded.title='Updated';assert.equal(await store.save(loaded),2);await assert.rejects(()=>store.save(row),/conflict/);assert.equal((await store.get(row.code)).title,'Updated');assert.equal(await store.get('missing'),null);}finally{await store.close();}
});
