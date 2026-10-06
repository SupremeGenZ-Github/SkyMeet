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
