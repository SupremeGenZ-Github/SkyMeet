// Per-device sounds, never added to the outgoing microphone stream.
let context, enabled = true, clicks = false, last = -Infinity, lastClick = -Infinity;
export function soundPreferences(on, buttons) { enabled = on; clicks = buttons; }
export function unlockSounds() { try { context ||= new (window.AudioContext || window.webkitAudioContext)(); context.resume().catch(()=>{}); } catch {} }
export function playSound(kind) {
 if (!enabled || (kind === 'click' && !clicks) || !context || context.state !== 'running') return;
 const now=context.currentTime;if(kind==='click'){if(now-lastClick<.08)return;lastClick=now;}else{if(now-last<.08)return;last=now;}
 const tone=(freq,at,duration,volume=.08)=>{const o=context.createOscillator(),g=context.createGain();o.frequency.value=freq;g.gain.setValueAtTime(volume,at);g.gain.exponentialRampToValueAtTime(.001,at+duration);o.connect(g).connect(context.destination);o.start(at);o.stop(at+duration);};
 if(kind==='clap'){for(let i=0;i<5;i++){const b=context.createBuffer(1,context.sampleRate*.09,context.sampleRate),a=b.getChannelData(0);for(let j=0;j<a.length;j++)a[j]=(Math.random()*2-1)*Math.exp(-j/(a.length/6));const s=context.createBufferSource(),g=context.createGain();s.buffer=b;g.gain.value=.18;s.connect(g).connect(context.destination);s.start(now+i*.12);}return;}
 if(kind==='click')tone(480,now,.035,.025);
 else {tone(kind==='hand'?660:880,now,.15);tone(kind==='hand'?880:1100,now+.12,.2);}
}
