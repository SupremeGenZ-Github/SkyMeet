import {FilesetResolver, ImageSegmenter} from '@mediapipe/tasks-vision';
export async function createBackground(raw, file, onError) {
 if (!raw?.getVideoTracks().some(t=>t.readyState==='live'&&t.enabled)) throw Error('Turn your camera on first.');
 if (!file || !/^(image|video)\//.test(file.type)) throw Error('Choose an image or video file.');
 if(file.size>80*1024*1024)throw Error('Choose a background smaller than 80 MB.');
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
 if(!canvas.captureStream)throw Error('Virtual backgrounds are unavailable in this browser.');
 const ctx=canvas.getContext('2d'), mask=document.createElement('canvas'), cut=document.createElement('canvas');cut.width=640;cut.height=360;
 const cutCtx=cut.getContext('2d'), camera=document.createElement('video');camera.muted=true;camera.playsInline=true;camera.srcObject=raw;
 const video=file.type.startsWith('video/'),bg=document.createElement(video?'video':'img'),url=URL.createObjectURL(file);
 let engine,output,timer,closed=false,lastTime=-1;
 const stop=()=>{closed=true;clearTimeout(timer);engine?.close();engine=null;output?.getVideoTracks().forEach(t=>t.stop());camera.pause();camera.srcObject=null;if(video)bg.pause();bg.removeAttribute('src');URL.revokeObjectURL(url);};
 try {
  if(video){bg.muted=true;bg.loop=true;bg.playsInline=true;}
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Background could not be decoded. Try JPG, PNG or MP4.')),15000);bg[video?'onloadeddata':'onload']=()=>{clearTimeout(timer);resolve();};bg.onerror=()=>{clearTimeout(timer);reject(Error('Unsupported background file.'));};bg.src=url;});
  await camera.play();if(video)await bg.play();
  const files=await FilesetResolver.forVisionTasks('/background/wasm');
  engine=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:'/background/selfie_segmenter.tflite'},runningMode:'VIDEO',outputConfidenceMasks:true,outputCategoryMask:false});
  function cover(c,source,w,h){const sw=source.videoWidth||source.naturalWidth,sh=source.videoHeight||source.naturalHeight;if(!sw||!sh)return;const scale=Math.max(w/sw,h/sh);c.drawImage(source,(w-sw*scale)/2,(h-sh*scale)/2,sw*scale,sh*scale);}
  const frame=()=>{if(closed)return;try{if(camera.readyState>=2&&camera.currentTime!==lastTime){lastTime=camera.currentTime;engine.segmentForVideo(camera,performance.now(),result=>{const m=result.confidenceMasks[0],values=m.getAsFloat32Array();mask.width=m.width;mask.height=m.height;const mc=mask.getContext('2d'),pixels=mc.createImageData(m.width,m.height);for(let i=0;i<values.length;i++){pixels.data[i*4]=255;pixels.data[i*4+1]=255;pixels.data[i*4+2]=255;pixels.data[i*4+3]=Math.max(0,Math.min(1,(values[i]-.25)/.5))*255;}mc.putImageData(pixels,0,0);cutCtx.globalCompositeOperation='source-over';cutCtx.clearRect(0,0,640,360);cutCtx.drawImage(camera,0,0,640,360);cutCtx.globalCompositeOperation='destination-in';cutCtx.drawImage(mask,0,0,640,360);ctx.globalCompositeOperation='source-over';cover(ctx,bg,640,360);ctx.drawImage(cut,0,0);});}timer=setTimeout(frame,80);}catch(e){stop();onError(e);}};
  frame();if(closed)throw Error('Background processing failed.');output=canvas.captureStream(12);raw.getAudioTracks().forEach(t=>output.addTrack(t));return {stream:output,stop};
 } catch(e) {stop();throw e;}
}
