import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NotesSync} from '../src/notes-sync.js';
const initial={notes:'Initial',notesRevision:0};
test('incoming edits preserve unsaved draft; explicit latest/draft resolution',async()=>{
 let sent;
 const n=new NotesSync(async(e,d)=>{sent=d;return {notes:d.text,notesRevision:2};},()=>{},100000);
 n.attach('room',initial);n.edit('My draft');n.receive({notes:'Their draft',notesRevision:1});
 assert.equal(n.text,'My draft');assert.equal(n.conflict,true);assert.equal(await n.flush(),false);assert.equal(sent,undefined);
 assert.equal(await n.replaceWithDraft(),true);assert.deepEqual(sent,{text:'My draft',expectedRevision:1});assert.equal(n.dirty,false);
 n.edit('Another draft');n.receive({notes:'Newest shared',notesRevision:3});n.useLatest();assert.equal(n.text,'Newest shared');assert.equal(n.dirty,false);n.cancel();
});
test('flush saves pending whitespace exactly and failed saves keep the draft',async()=>{
 let sent;const n=new NotesSync(async(e,d)=>{sent=d;return {notes:d.text,notesRevision:1};},()=>{},100000);
 n.attach('room',initial);n.edit('  indented\n');assert.equal(await n.flush(),true);assert.equal(sent.text,'  indented\n');assert.equal(n.text,sent.text);
 n.send=async()=>{throw Error('Offline');};n.edit('Keep me');assert.equal(await n.flush(),false);assert.equal(n.text,'Keep me');assert.equal(n.dirty,true);assert.match(n.status,/Offline/);n.cancel();
});
test('conflict response from server keeps local text and exposes latest notes',async()=>{
 const n=new NotesSync(async()=>({conflict:true,notes:'New shared text',notesRevision:1}),()=>{},100000);
 n.attach('room',initial);n.edit('Local text');assert.equal(await n.flush(),false);assert.equal(n.text,'Local text');assert.equal(n.remoteText,'New shared text');assert.equal(n.conflict,true);n.cancel();
});
test('typing during a pending save flushes the newest draft using the new revision',async()=>{
 let done;let count=0;const sent=[];
 const n=new NotesSync(async(e,d)=>{sent.push(d);if(++count===1)await new Promise(r=>done=r);return {notes:d.text,notesRevision:count};},()=>{},100000);
 n.attach('room',initial);n.edit('First');const pending=n.flush();n.edit('Second');done();assert.equal(await pending,true);assert.deepEqual(sent,[{text:'First',expectedRevision:0},{text:'Second',expectedRevision:1}]);assert.equal(n.dirty,false);n.cancel();
});
