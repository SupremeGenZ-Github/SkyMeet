// One offerer owns the four media sections: microphone, camera, screen, screen audio.
// The answerer MUST reuse the transceivers created by setRemoteDescription.
const newEpoch = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
const kinds = ['audio', 'video', 'video', 'audio'];
const mids = sdp => [...sdp.matchAll(/^a=mid:(.+)$/gm)].map(m => m[1].trim());
export class Mesh {
  constructor(socket, iceServers, callbacks, options = {}) {
    this.socket = socket; this.config = { iceServers, iceTransportPolicy:options.iceTransportPolicy || 'all' }; this.callbacks = callbacks;
    this.attempts = new Map(); this.retired = new Map(); this.recovering = new Set(); this.options = options; this.peers = new Map(); this.local = null; this.screen = null; this.closed = false; this.mediaQueue=Promise.resolve();
    this.signalHandler = d => this.signal(d).catch(e => { if (!this.closed) callbacks.error(e.message); });
    socket.on('signal', this.signalHandler);
  }
  hasRelay() { return this.config.iceServers.some(s => (Array.isArray(s.urls)?s.urls:[s.urls]).some(u => /^turns?:/.test(u))); }
  alive(id,p) { return !this.closed && this.peers.get(id) === p; }
  get(id, settings = {}) {
    if (this.closed) throw Error('Media connection is closed.');
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection({...this.config,...(settings.relay && this.hasRelay()?{iceTransportPolicy:'relay'}:{})});
    const slots = this.socket.id < id ? kinds.map(kind => pc.addTransceiver(kind, { direction:'sendrecv' })) : [];
    const peer = { pc, slots, midOrder:[], candidates:[], camera:new MediaStream(), screen:new MediaStream(), epoch:settings.epoch || (this.socket.id < id ? newEpoch() : ''), busy:false, recoveryTimer:null, deadline:null, queue:Promise.resolve() };
    this.peers.set(id, peer);
    peer.deadline = setTimeout(() => {
      if (this.alive(id,peer) && pc.connectionState !== 'connected') this.recover(id).catch(e=>this.callbacks.error(e.message));
    }, this.options.connectionTimeout || 15000);
    peer.deadline.unref?.();
    const publish = () => {
      if (this.peers.get(id) === peer) this.callbacks.stream(id, new MediaStream(peer.camera.getTracks()), new MediaStream(peer.screen.getTracks()));
    };
    pc.onicecandidate = e => { if (e.candidate && !this.closed) this.socket.emit('signal', { to:id, candidate:e.candidate.toJSON(), epoch:peer.epoch }); };
    pc.ontrack = e => {
      const index = peer.midOrder.indexOf(e.transceiver.mid);
      if (index < 0) { this.callbacks.error('Unrecognized incoming media track. Rejoin the meeting.'); return; }
      const stream = index >= 2 ? peer.screen : peer.camera;
      // Keep exactly one track of each kind in each stream, including after replacement.
      stream.getTracks().filter(t => t.kind === e.track.kind && t !== e.track).forEach(t => stream.removeTrack(t));
      stream.addTrack(e.track); publish();
      e.track.onunmute = publish;
      e.track.onended = () => { stream.removeTrack(e.track); publish(); };
    };
    pc.onconnectionstatechange = () => {
      if (!this.alive(id,peer)) return;
      this.callbacks.connection(id, pc.connectionState);
      clearTimeout(peer.recoveryTimer);
      if (pc.connectionState === 'connected') {
        clearTimeout(peer.deadline); this.attempts.delete(id);
        pc.getStats?.().then(stats => {
          if (!this.alive(id,peer)) return;
          const pair = [...stats.values()].find(r=>r.type==='candidate-pair' && (r.selected || (r.nominated && r.state==='succeeded')));
          if (pair) { const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);this.callbacks.diagnostic?.(id,{path:local?.candidateType==='relay'||remote?.candidateType==='relay'?'relay':'direct'}); }
        }).catch(()=>{});
      }
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        peer.recoveryTimer = setTimeout(() => {
          if (this.alive(id,peer) && pc.connectionState !== 'connected') this.recover(id).catch(e=>this.callbacks.error(e.message));
        }, pc.connectionState==='failed'?1000:5000);
        peer.recoveryTimer.unref?.();
      }
    };
    return peer;
  }
  async replace(peer) {
    const tracks = [this.local?.getAudioTracks()[0], this.local?.getVideoTracks()[0], this.screen?.getVideoTracks()[0], this.screen?.getAudioTracks()[0]];
    await Promise.all(peer.slots.map((t, i) => t.sender.replaceTrack(tracks[i]?.readyState === 'live' ? tracks[i] : null)));
  }
  async media(local, screen) {
    this.local=local;this.screen=screen;
    const next=this.mediaQueue.then(async()=>{if(this.closed)return;await Promise.all([...this.peers.entries()].map(async([id,p])=>{try{await this.replace(p);}catch(e){if(!this.closed&&this.peers.get(id)===p)this.callbacks.error('Could not update media: '+e.message);}}));});
    this.mediaQueue=next.catch(()=>{});return next;
  }
  async recover(id) {
    const original=this.peers.get(id);
    if (!original || this.closed || this.recovering.has(id)) return;
    if (this.socket.id > id) { this.socket.emit('signal',{to:id,restart:true}); return; }
    const attempt=(this.attempts.get(id)||0)+1;
    if (attempt>4) {clearTimeout(original.deadline);this.callbacks.connection(id,'failed');this.callbacks.error(this.hasRelay()?'Could not connect after relay retries. Run Test relay connection in Settings.':'No TURN relay is configured. Restricted networks need a working relay.');return;}
    this.recovering.add(id);this.attempts.set(id,attempt);
    try {
      if(this.callbacks.refresh) {try{const ice=await this.callbacks.refresh();if(ice?.iceServers)this.config={iceServers:ice.iceServers,iceTransportPolicy:ice.iceTransportPolicy||'all'};}catch{}}
      if(!this.alive(id,original))return;
      this.remove(id);this.get(id,{relay:this.hasRelay()});
      this.callbacks.connection(id,this.hasRelay()?'retrying via relay':'retrying');
      await this.offer(id);
    } finally {this.recovering.delete(id);}
  }
  async restart() { if(this.closed)return;for(const id of this.peers.keys())this.attempts.delete(id);await Promise.all([...this.peers.keys()].map(id=>this.recover(id))); }

  async sync(participants) {
    if (this.closed) return;
    const ids = participants.map(p => p.id).filter(id => id !== this.socket.id);
    for (const id of this.peers.keys()) if (!ids.includes(id)) this.remove(id);
    for (const id of ids) {
      const p = this.get(id);
      if (this.socket.id < id && !p.pc.localDescription) await this.offer(id);
    }
  }
  async offer(id, restart = false) {
    if (this.closed || this.socket.id >= id) return;
    const p = this.get(id); if (p.busy || p.pc.signalingState !== 'stable') return;
    p.busy = true;
    try {
      await this.replace(p);
      if (this.closed || this.peers.get(id) !== p) return;
      const description = await p.pc.createOffer({ iceRestart:restart });
      if (this.closed || this.peers.get(id) !== p) return;
      await p.pc.setLocalDescription(description);
      if (this.closed || this.peers.get(id) !== p) return;
      p.midOrder = mids(p.pc.localDescription.sdp);
      if (!this.closed) this.socket.emit('signal', { to:id, description:p.pc.localDescription, epoch:p.epoch });
    } finally { p.busy = false; }
  }
  signal({ from, description, candidate, restart, epoch }) {
    if (this.closed) return Promise.resolve();
    if (epoch && this.retired.get(from)?.has(epoch)) return Promise.resolve();
    let p = this.get(from);
    if (restart) return this.recover(from);
    if (description?.type === 'offer' && epoch && p.epoch !== epoch) {
      if(this.socket.id < from) return Promise.resolve();
      if(p.epoch){this.remove(from);p=this.get(from,{epoch});}
      else p.epoch=epoch;
    } else if(epoch && p.epoch && epoch!==p.epoch) return Promise.resolve();
    const task = p.queue.then(async () => {
      if (this.closed || this.peers.get(from) !== p) return;
      if (epoch && p.epoch && epoch !== p.epoch) return;
      if (description) {
        if (description.type === 'offer') p.midOrder = mids(description.sdp);
        await p.pc.setRemoteDescription(description);
        if (this.closed || this.peers.get(from) !== p) return;
        if (description.type === 'offer') {
          p.slots = p.midOrder.map(mid => p.pc.getTransceivers().find(t => t.mid === mid));
          if (p.slots.length !== 4 || p.slots.some((t,i) => !t || t.receiver.track.kind !== kinds[i])) throw Error('Unexpected media layout. Both participants should refresh SkyMeet.');
          p.slots.forEach(t => { t.direction = 'sendrecv'; });
          await this.replace(p);
          if (this.closed || this.peers.get(from) !== p) return;
          const answer = await p.pc.createAnswer();
          if (this.closed || this.peers.get(from) !== p) return;
          await p.pc.setLocalDescription(answer);
          if (!this.closed && this.peers.get(from) === p) this.socket.emit('signal', { to:from, description:p.pc.localDescription, epoch:p.epoch });
        }
        for (const c of p.candidates.splice(0)) if(!c.epoch || c.epoch===p.epoch) await p.pc.addIceCandidate(c.candidate);
      } else if (candidate) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(candidate);
        else p.candidates.push({candidate,epoch});
      }
    });
    p.queue = task.catch(() => {}); return task;
  }
  remove(id) {
    const p = this.peers.get(id); if (!p) return;
    clearTimeout(p.recoveryTimer);clearTimeout(p.deadline);
    if(p.epoch){const retired=this.retired.get(id)||new Set();retired.add(p.epoch);if(retired.size>12)retired.delete(retired.values().next().value);this.retired.set(id,retired);}
    this.peers.delete(id); p.pc.onconnectionstatechange = null; p.pc.onicecandidate = null; p.pc.ontrack = null;
    for (const t of [...p.camera.getTracks(), ...p.screen.getTracks()]) { t.onunmute = null; t.onended = null; }
    p.pc.close(); this.callbacks.remove(id);
  }
  close() { this.closed = true; this.socket.off('signal', this.signalHandler); for (const id of this.peers.keys()) this.remove(id); }
}
