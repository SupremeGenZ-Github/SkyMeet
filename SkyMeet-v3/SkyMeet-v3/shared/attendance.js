export function summarizeAttendance(visits,now=Date.now()){
 const map=new Map();
 for(const r of visits){const key=(r.personId||r.id)+':'+r.meetingId;const v=map.get(key)||{name:r.name,personId:r.personId||r.id,meetingId:r.meetingId,joinedAt:r.joinedAt,leftAt:0,visits:0,live:false,intervals:[]};v.joinedAt=Math.min(v.joinedAt,r.joinedAt);v.leftAt=Math.max(v.leftAt,r.leftAt||0);v.visits++;v.live ||= !r.leftAt;v.intervals.push([r.joinedAt,Math.max(r.joinedAt,r.leftAt||now)]);map.set(key,v);}
 return [...map.values()].map(v=>{const intervals=v.intervals.sort((a,b)=>a[0]-b[0]);let total=0,start=null,end=null;for(const [a,b]of intervals){if(start===null){start=a;end=b;}else if(a<=end)end=Math.max(end,b);else{total+=end-start;start=a;end=b;}}if(start!==null)total+=end-start;const {intervals:_,...row}=v;return {...row,total};});
}
