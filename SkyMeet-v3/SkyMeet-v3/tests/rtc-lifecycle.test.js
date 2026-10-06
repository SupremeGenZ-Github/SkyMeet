import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh } from '../src/rtc.js';

// Hold a real asynchronous negotiation boundary to reproduce leave/offer races.
test('leaving while an offer is being created does not send a stale offer', async () => {
  const previousPC = globalThis.RTCPeerConnection, previousStream = globalThis.MediaStream;
  let release;
  class PC {
    signalingState = 'stable';
    addTransceiver() { return { sender: { replaceTrack: async () => {} } }; }
    createOffer() { return new Promise(resolve => { release = resolve; }); }
    async setLocalDescription(d) { this.localDescription = d; }
    close() { this.signalingState = 'closed'; }
  }
  globalThis.RTCPeerConnection = PC;
  globalThis.MediaStream = class { getTracks() { return []; } };
  const emitted = [], errors = [];
  const socket = { id:'a', on(){}, off(){}, emit:(...args)=>emitted.push(args) };
  const mesh = new Mesh(socket, [], {stream(){},connection(){},remove(){},error:e=>errors.push(e)});
  try {
    const offer = mesh.offer('z');
    while (!release) await new Promise(resolve => setImmediate(resolve));
    mesh.remove('z');
    release({type:'offer',sdp:'a=mid:0\r\n'});
    await offer;
    assert.equal(emitted.length, 0);
    assert.equal(mesh.peers.size, 0);
    assert.deepEqual(errors, []);
  } finally { mesh.close(); globalThis.RTCPeerConnection = previousPC; globalThis.MediaStream = previousStream; }
});

test('a stuck outstanding offer automatically reaches its deadline and is rebuilt with TURN, and stale candidates are ignored',async()=>{
 const beforePC=globalThis.RTCPeerConnection,beforeStream=globalThis.MediaStream;const pcs=[];
 class PC {
  constructor(config){this.config=config;this.signalingState='stable';this.connectionState='new';pcs.push(this);}
  addTransceiver(){return {sender:{replaceTrack:async()=>{}}};}
  async createOffer(){return {type:'offer',sdp:'a=mid:0\r\n'};}
  async setLocalDescription(d){this.localDescription=d;this.signalingState='have-local-offer';}
  close(){this.signalingState='closed';}
 }
 globalThis.RTCPeerConnection=PC;globalThis.MediaStream=class{getTracks(){return []}};
 const emitted=[],mesh=new Mesh({id:'a',on(){},off(){},emit:(e,d)=>emitted.push(d)},[{urls:'turn:relay.example:3478',username:'u',credential:'p'}],{stream(){},connection(){},remove(){},error(){}},{connectionTimeout:20});
 try{await mesh.offer('z');const oldEpoch=emitted[0].epoch;assert.equal(pcs[0].signalingState,'have-local-offer');for(let i=0;i<50&&pcs.length<2;i++)await new Promise(r=>setTimeout(r,10));assert.equal(pcs.length,2);assert.equal(pcs[0].signalingState,'closed');assert.equal(pcs[1].config.iceTransportPolicy,'relay');assert.notEqual(emitted[1].epoch,oldEpoch);await mesh.signal({from:'z',epoch:oldEpoch,candidate:{candidate:'stale'}});assert.equal(mesh.peers.get('z').candidates.length,0);}finally{mesh.close();globalThis.RTCPeerConnection=beforePC;globalThis.MediaStream=beforeStream;}
});
