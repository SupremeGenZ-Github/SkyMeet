const types=new Set(['pen','rect','ellipse','diamond','sticky','text','arrow','frame','image']);
export function validateObject(raw) {
  if(!raw || !/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id||'') || !types.has(raw.type))throw Error('Invalid board object.');
  const out={id:raw.id,type:raw.type};
  for(const key of ['x','y','w','h']) { if(!Number.isFinite(raw[key]) || Math.abs(raw[key])>100000)throw Error('Board coordinates out of range.');out[key]=raw[key]; }
  if(out.w<1 || out.h<1 || out.w>20000 || out.h>20000)throw Error('Invalid object size.');
  out.color=/^#[0-9a-f]{6}$/i.test(raw.color||'')?raw.color:'#187e79';
  out.fill=/^#[0-9a-f]{6}$/i.test(raw.fill||'')?raw.fill:'#fff2ab';
  out.text=typeof raw.text==='string'?raw.text.slice(0,3000):'';
  out.fontSize=Math.max(12,Math.min(96,Number(raw.fontSize)||22));
  out.width=Math.max(1,Math.min(20,Number(raw.width)||3));
  out.locked=!!raw.locked;
  if(raw.type==='pen') { if(!Array.isArray(raw.points)||raw.points.length>800||raw.points.length<2||!raw.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000)))throw Error('Invalid drawing.');out.points=raw.points; }
  if(raw.type==='arrow') {for(const k of ['from','to']) if(typeof raw[k]==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(raw[k]))out[k]=raw[k];out.reverse=!!raw.reverse;}
  if(raw.type==='image'){if(typeof raw.src!=='string'||raw.src.length>400000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(raw.src))throw Error('Use a PNG, JPEG or WebP image under 300 KB.');out.src=raw.src;}
  return out;
}
export function applyBoard(r,actor,changes,host=false) {
  if(!Array.isArray(changes)||changes.length<1||changes.length>100)throw Error('Limit each operation to 100 objects.');
  const next=new Map(r.objects.map(o=>[o.id,o]));const before=[],after=[];
  for(const change of changes){const old=next.get(change.id);if(old?.locked&&!host)throw Error('Only the host can edit locked items.');
    if((old?.rev||0)!==(change.expectedRev||0))throw Error('This item changed. Refresh the selection and try again.');
    before.push(old||{id:change.id,deleted:true});
    if(change.deleted){if(!old)throw Error('Item no longer exists.');next.delete(change.id);after.push({id:change.id,deleted:true});}
    else{const obj=validateObject(change);if(obj.locked&&!host)throw Error('Only hosts can lock items.');const updated={...obj,rev:++r.objectVersion};next.set(obj.id,updated);after.push(updated);}
  }
  const objects=[...next.values()];if(objects.length>1500||JSON.stringify(objects).length>6000000)throw Error('Board limit reached (1,500 items / 6 MB). Export or remove items.');
  r.objects=objects;r.boardRevision++;return {before,after};
}
export function historyStep(r,entry,undo,host) {
  const expected=undo?entry.after:entry.before; const desired=undo?entry.before:entry.after;
  const changes=desired.map((obj,i)=>{const current=r.objects.find(o=>o.id===obj.id);const was=expected[i];if(was.deleted ? !!current : !current||current.rev!==was.rev)throw Error('Cannot undo/redo: another change affected this item.');return {...obj,expectedRev:current?.rev||0};});
  return applyBoard(r,'',changes,host);
}

// Undo recreates an older value with a new revision. Rebase only history entries
// referring to that exact previous revision; other participants' edits still conflict.
export function rebaseHistory(stack, field, desired, actual) {
  for (const entry of stack) entry[field] = entry[field].map(obj => {
    const i = desired.findIndex(v => v.id === obj.id && !v.deleted && !obj.deleted && v.rev === obj.rev);
    return i >= 0 && !actual[i].deleted ? {...obj, rev:actual[i].rev} : obj;
  });
}
