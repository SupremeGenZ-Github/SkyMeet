import pg from 'pg';
export class RoomStore {
  constructor(url) { this.durable = !!url; this.pool = url ? new pg.Pool({connectionString:url,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:30000}) : null; }
  async init() { if(this.pool) await this.pool.query(`CREATE TABLE IF NOT EXISTS academy_meet_rooms_v2 (code TEXT PRIMARY KEY, data JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); }
  async get(code) { if(!this.pool)return null; const row=(await this.pool.query('SELECT data,revision FROM academy_meet_rooms_v2 WHERE code=$1',[code])).rows[0];return row?{...row.data,storageVersion:row.revision}:null; }
  async save(room) { if(this.pool){const result=room.storageVersion?await this.pool.query(`UPDATE academy_meet_rooms_v2 SET data=$2::jsonb,revision=revision+1,updated_at=NOW() WHERE code=$1 AND revision=$3 RETURNING revision`,[room.code,JSON.stringify(room),room.storageVersion]):await this.pool.query(`INSERT INTO academy_meet_rooms_v2(code,data,revision) VALUES($1,$2::jsonb,1) ON CONFLICT(code) DO NOTHING RETURNING revision`,[room.code,JSON.stringify(room)]);if(!result.rows.length)throw Error('Database conflict: another server updated this classroom. Stop duplicate instances and restart.');return result.rows[0].revision;} }
  async close() { await this.pool?.end(); }
}
export function snapshot(r) {
  return {code:r.code,storageVersion:r.storageVersion,title:r.title,hostHash:r.hostHash,passwordHash:r.passwordHash,createdAt:r.createdAt,permanent:r.permanent,locked:r.locked,chatEnabled:r.chatEnabled,shareEnabled:r.shareEnabled,recordingEnabled:r.recordingEnabled!==false,participantPollsEnabled:r.participantPollsEnabled!==false,boardEnabled:r.boardEnabled,objects:r.objects,boardRevision:r.boardRevision,notes:r.notes,notesRevision:r.notesRevision||0,attendance:r.attendance,meetings:r.meetings,meetingId:r.meetingId,active:r.active,lastSeen:Date.now()};
}
export function restore(d) {
  const at=d.lastSeen || Date.now();
  return {...d,active:false,attendance:(d.attendance||[]).map(row=>row.leftAt ? row : {...row,leftAt:Math.max(row.joinedAt,row.lastSeen||at),endReason:'Server interrupted; last heartbeat'}),meetings:(d.meetings||[]).map(m=>m.endedAt ? m : {...m,endedAt:Math.max(m.startedAt,at),endReason:'Server interrupted'}),emptySince:Date.now(),members:new Map(),waiting:new Map(),sessions:new Map(),messages:[],board:[],poll:null,undo:new Map(),redo:new Map()};
}
