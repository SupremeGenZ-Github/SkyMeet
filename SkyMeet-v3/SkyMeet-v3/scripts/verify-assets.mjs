import {stat} from 'node:fs/promises';
for(const file of ['selfie_segmenter.tflite','wasm/vision_wasm_internal.js','wasm/vision_wasm_internal.wasm','wasm/vision_wasm_nosimd_internal.js','wasm/vision_wasm_nosimd_internal.wasm']){
 try{const s=await stat(new URL('../public/background/'+file,import.meta.url));if(s.size<1000)throw Error('empty asset');}catch{throw Error('Missing background asset: public/background/'+file+'. Upload the complete public/background folder from SkyMeet-v3-New.zip before deploying.');}
}
console.log('Background assets verified.');
