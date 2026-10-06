// Compose the meeting itself: works without getDisplayMedia, including supported phones.
export async function meetingCapture(getStreams) {
 const c=document.createElement('canvas');c.width=960;c.height=540;
 if(!c.captureStream)throw Error('This browser cannot record the meeting canvas.');
 const ctx=c.getContext('2d'),Audio=window.AudioContext||window.webkitAudioContext;
 if(!Audio)throw Error('Audio mixing is unavailable in this browser.');
 const audio=new Audio();let resumeTimer;try{await Promise.race([audio.resume(),new Promise((_,reject)=>resumeTimer=setTimeout(()=>reject(Error('Tap the recording button again to allow audio.')),5000))]);}catch(e){audio.close().catch(()=>{});throw e;}finally{clearTimeout(resumeTimer);}
 const dest=audio.createMediaStreamDestination(),sources=new Map();
 let stopped=false,timer;
 const draw=()=>{if(stopped)return;ctx.fillStyle='#071225';ctx.fillRect(0,0,960,540);
 const tiles=[...document.querySelectorAll('[data-testid="video-tile"]')],cols=tiles.length<=1?1:tiles.length<=4?2:3,rows=Math.ceil(tiles.length/cols)||1,w=960/cols,h=540/rows,live=new Set();
 tiles.forEach((tile,i)=>{const x=(i%cols)*w,y=Math.floor(i/cols)*h,v=tile.querySelector('video');
 if(v&&!v.classList.contains('hidden-video')&&v.readyState>=2&&v.videoWidth>0&&v.videoHeight>0){const s=Math.min((w-8)/v.videoWidth,(h-32)/v.videoHeight);ctx.drawImage(v,x+(w-v.videoWidth*s)/2,y+(h-32-v.videoHeight*s)/2,v.videoWidth*s,v.videoHeight*s);}else{ctx.fillStyle='#16243d';ctx.fillRect(x+4,y+4,w-8,h-8);}
 ctx.fillStyle='white';ctx.font='16px sans-serif';ctx.fillText(tile.querySelector('.tile-caption')?.textContent?.slice(0,65)||'Participant',x+12,y+h-12,w-24);
 });
 for(const stream of getStreams())for(const track of stream.getAudioTracks()){if(track.readyState!=='live')continue;live.add(track.id);if(!sources.has(track.id)){const source=audio.createMediaStreamSource(new MediaStream([track]));source.connect(dest);sources.set(track.id,source);}}
 for(const [id,s] of sources)if(!live.has(id)){s.disconnect();sources.delete(id);}
 timer=setTimeout(draw,100);
 };
 let stream;const stop=()=>{if(stopped)return;stopped=true;clearTimeout(timer);sources.forEach(s=>s.disconnect());sources.clear();stream?.getTracks().forEach(t=>t.stop());audio.close().catch(()=>{});};
 try{stream=c.captureStream(10);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));draw();return {stream,stop};}catch(e){stop();throw e;}
}
