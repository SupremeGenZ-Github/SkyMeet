import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('button clicks do not suppress applause and the master mute disables both',()=>{
 let claps=0,tones=0;
 class Context{constructor(){this.currentTime=1;this.state='running';this.sampleRate=100;this.destination={};}resume(){return Promise.resolve();}createOscillator(){tones++;return {frequency:{},connect(){return this;},start(){},stop(){}};}createGain(){return {gain:{value:1,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;}};}createBuffer(){return {getChannelData:()=>new Float32Array(9)};}createBufferSource(){claps++;return {connect(){return this;},start(){}};}}
 const src=readFileSync(new URL('../src/sounds.js',import.meta.url),'utf8').replaceAll('export ','');const f=new Function('window',src+';return {soundPreferences,unlockSounds,playSound};')({AudioContext:Context});
 f.soundPreferences(true,true);f.unlockSounds();f.playSound('click');f.playSound('clap');assert.equal(tones,1);assert.equal(claps,5);f.soundPreferences(false,true);f.playSound('clap');assert.equal(claps,5);
});
