import { version } from './version.js';
import express from 'express';
import { RoomStore, snapshot, restore } from './store.js';
import { applyBoard, historyStep, rebaseHistory } from './board.js';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'node:http';
import { randomBytes, createHash, createHmac, timingSafeEqual, scryptSync } from 'node:crypto';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';

const clean = (s, max = 80) => typeof s === 'string' ? s.trim().slice(0, max) : '';
const token = () => randomBytes(24).toString('base64url');
const hash = s => createHash('sha256').update(s).digest();
const equal = (a, b) => timingSafeEqual(hash(a), hash(b));
const safePassword = p => scryptSync(p, 'aacharya-meet-room-password-v1', 32).toString('hex');
const publicPeer = p => ({ id: p.id, name: p.name, role: p.role, hand: p.hand, mic: p.mic, camera: p.camera, sharing: p.sharing, recording: p.recording, joinedAt: p.joinedAt });

export function createApp(options = {}) {
  const env = { ...process.env, ...options.env };
  const store=options.store || new RoomStore(env.DATABASE_URL);
  const ready=store.init();
  let serial=Promise.resolve();
  const enqueue=fn=>{const task=serial.then(()=>ready).then(fn);serial=task.catch(()=>{});return task;};
  const persist=async r=>{if(r?.permanent){try{const version=await store.save(snapshot(r));if(version)r.storageVersion=version;}catch(e){io.to(r.code).emit('storage-error','Database save failed. Export your board now and check the database before leaving.');throw e;}}};
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'", "'wasm-unsafe-eval'"], 'connect-src': ["'self'", 'ws:', 'wss:'], 'img-src': ["'self'", 'data:', 'blob:'], 'media-src': ["'self'", 'blob:'], 'style-src': ["'self'", "'unsafe-inline'"] } } }));
  app.use(express.json({ limit: '8kb' }));
  const originAllowed = req => !req.headers.origin || req.headers.origin === (env.APP_ORIGIN || `${req.headers.origin.startsWith('https:') ? 'https' : 'http'}://${req.headers.host}`);
  app.use('/api', (req, res, next) => originAllowed(req) ? next() : res.status(403).json({ error: 'Origin not allowed' }));
  app.use('/api', rateLimit({ windowMs: 60000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false }));
  const server = createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 8 * 1024 * 1024, allowRequest: (req, cb) => cb(null, originAllowed(req)) });
  const rooms = new Map();
  const joinAttempts = new Map();
  async function load(code){let room=rooms.get(code);if(!room){const saved=await store.get(code);if(saved){room=restore(saved);room.objectVersion=Math.max(0,...(room.objects||[]).map(o=>o.rev||0));rooms.set(code,room);await persist(room);}}return room;}
  function closeAttendance(r,reason){const at=Date.now();for(const row of r.attendance)if(!row.leftAt){row.leftAt=at;row.lastSeen=at;row.endReason=reason;}const m=r.meetings.find(m=>m.id===r.meetingId);if(m&&!m.endedAt){m.endedAt=at;m.endReason=reason;}}
  function reports(r){return {rows:r.attendance,meetings:r.meetings,meetingId:r.meetingId,permanent:r.permanent,now:Date.now()};}
  function startSession(r){r.active=true;r.meetingId=token();r.sessions.clear();r.undo.clear();r.redo.clear();r.messages=[];r.poll=null;r.locked=false;r.meetings.push({id:r.meetingId,startedAt:Date.now(),endedAt:null});}
  function boardState(r){return {objects:r.objects,revision:r.boardRevision,enabled:r.boardEnabled};}
  function emitBoard(r){io.to(r.code).emit('board-state',boardState(r));}
  const maximum = Math.min(8, Math.max(2, Number(env.MAX_PARTICIPANTS) || 8));
  const emitState = r => {
    io.to(r.code).emit('state', { code: r.code, title: r.title, createdAt: r.meetings.find(m=>m.id===r.meetingId)?.startedAt || r.createdAt, permanent:r.permanent, meetingId:r.meetingId, boardEnabled:r.boardEnabled, locked: r.locked, chatEnabled: r.chatEnabled, shareEnabled: r.shareEnabled, recordingEnabled:r.recordingEnabled!==false, participantPollsEnabled:r.participantPollsEnabled!==false, participants: [...r.members.values()].map(publicPeer) });
    for (const p of r.members.values()) if (p.role !== 'guest') io.to(p.id).emit('waiting', [...r.waiting.values()].map(p => ({ id: p.id, name: p.name })));
  };
  function endRoom(r, reason = 'The host ended this meeting.') {
    closeAttendance(r,'Session ended');
    io.to(r.code).emit('ended', reason);
    for (const p of [...r.members.values(), ...r.waiting.values()]) {
      const s = io.sockets.sockets.get(p.id);
      s?.emit('ended', reason); s?.leave(r.code); if (s) s.data = {};
    }
    if(r.permanent){r.active=false;r.members.clear();r.waiting.clear();r.sessions.clear();r.messages=[];r.poll=null;r.emptySince=Date.now();}else rooms.delete(r.code);
  }
  const cleanup = setInterval(() => {
    for (const [ip, limit] of joinAttempts) if (Date.now() - limit.at > 60000) joinAttempts.delete(ip);
    enqueue(async()=>{for (const r of rooms.values()) {
      if(!r.permanent && (Date.now()-r.createdAt>12*3600000 || (r.emptySince && Date.now()-r.emptySince>10*60000)))endRoom(r,'This temporary meeting expired. Please create a new one.');
      else if(r.permanent && r.emptySince && Date.now()-r.emptySince>10*60000){if(r.active)endRoom(r,'Session ended after the room became empty. Reuse the link next time.');await persist(r);rooms.delete(r.code);}
    }}).catch(()=>{});
  }, 60000);
  cleanup.unref();
  app.get('/api/health', (_req, res) => res.json({ ok: true, version, storage:store.durable?'postgresql':'temporary-memory' }));
  app.get('/api/config', (_req, res) => res.json({ permanentRooms:store.durable, hostKeyRequired: !!env.HOST_ACCESS_KEY, maxParticipants: maximum, turnConfigured: !!(env.TURN_URLS && (env.TURN_SECRET || (env.TURN_USERNAME && env.TURN_PASSWORD))) }));
  app.post('/api/rooms', rateLimit({ windowMs: 60000, limit: 8, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    await ready;
    if (req.body.permanent && !store.durable)return res.status(400).json({error:'Connect DATABASE_URL before creating a permanent room.'});
    if (env.HOST_ACCESS_KEY && !equal(clean(req.body.hostKey, 256), env.HOST_ACCESS_KEY)) return res.status(403).json({ error: 'Incorrect host access key.' });
    if (rooms.size >= (Number(env.MAX_ROOMS) || 100)) return res.status(503).json({ error: 'Server is at capacity. Please try later.' });
    const code = randomBytes(9).toString('hex').match(/.{6}/g).join('-');
    const hostToken = token();
    const password = clean(req.body.password, 128);
    const r = { code, title: clean(req.body.title) || 'Team meeting', hostHash: hash(hostToken).toString('hex'), passwordHash: password ? safePassword(password) : '', createdAt: Date.now(), emptySince: Date.now(), locked: false, chatEnabled: true, shareEnabled: true, recordingEnabled:true, participantPollsEnabled:true, members: new Map(), waiting: new Map(), sessions: new Map(), attendance: [], messages: [], board: [], notes: '', poll: null };
    Object.assign(r,{permanent:!!req.body.permanent,active:true,meetingId:token(),meetings:[],objects:[],boardRevision:0,objectVersion:0,boardEnabled:true,undo:new Map(),redo:new Map()});
    r.meetings.push({id:r.meetingId,startedAt:Date.now(),endedAt:null});
    await persist(r);
    rooms.set(code, r);
    res.status(201).json({ code, hostToken, title: r.title, permanent:r.permanent });
  });
  app.get('/api/rooms/:code', async (req, res) => {
    const r = await enqueue(()=>load(req.params.code));
    if (!r) return res.status(404).json({ error: 'Meeting not found. It may have ended or the server restarted. Ask the host for a new link.' });
    res.json({ title: r.title, code: r.code, locked: r.locked, passwordRequired: !!r.passwordHash, permanent:r.permanent, active:r.active });
  });
  app.post('/api/rooms/:code/attendance',async(req,res)=>{
    const report=await enqueue(async()=>{const r=await load(req.params.code);if(!r||typeof req.body.hostToken!=='string'||!equal(hash(req.body.hostToken).toString('hex'),r.hostHash))return null;return reports(r);});
    if(!report)return res.status(403).json({error:'Private host key required.'});res.json(report);
  });
  function iceServers() {
    const result = env.STUN_URL === 'none' ? [] : [{ urls: env.STUN_URL || 'stun:stun.l.google.com:19302' }];
    if (env.TURN_URLS) {
      const urls = env.TURN_URLS.split(',').map(s => s.trim());
      if (env.TURN_SECRET) { const username = `${Math.floor(Date.now() / 1000) + 86400}:${randomBytes(6).toString('hex')}`; result.push({ urls, username, credential: createHmac('sha1', env.TURN_SECRET).update(username).digest('base64') }); }
      else if (env.TURN_USERNAME && env.TURN_PASSWORD) result.push({ urls, username: env.TURN_USERNAME, credential: env.TURN_PASSWORD });
    }
    return result;
  }
  io.on('connection', socket => {
    let tick = Date.now(), count = 0;
    socket.use((_packet, next) => { if (Date.now() - tick > 10000) { tick = Date.now(); count = 0; } if (++count > 400) return next(new Error('Too many messages.')); next(); });
    function context(host = false) {
      const r = rooms.get(socket.data.code); const p = r?.members.get(socket.id);
      if (!r || !p) throw new Error('Join the meeting first.');
      if (host && p.role === 'guest') throw new Error('Host permission required.');
      return { r, p };
    }
    function on(event, fn) { socket.on(event,(data,ack)=>{const run=async()=>{const roomCode=socket.data.code;const result=await fn(data||{});if(!['signal','media','reaction','cursor','attendance','board-get'].includes(event))await persist(rooms.get(socket.data.code||roomCode));return result;};
      (['signal','media','reaction','cursor'].includes(event)?Promise.resolve().then(run):enqueue(run)).then(result=>{if(typeof ack==='function')ack({ok:true,...result});}).catch(e=>{if(typeof ack==='function')ack({ok:false,error:e.message});if(!e.message || /database|connect|timeout|ECONN|relation|SSL/i.test(e.message))socket.emit('storage-error','Saving failed. Check the database and export your board before leaving.');});
    }); }
    function admit(r, s, p) {
      if (r.members.size >= maximum) throw new Error(`This meeting is limited to ${maximum} participants.`);
      r.waiting.delete(s.id); r.members.set(s.id, p); r.emptySince = null;
      s.join(r.code); s.data.code = r.code;
      p.joinedAt=Date.now();r.attendance.push({id:p.id,personId:p.personId,meetingId:r.meetingId,name:p.name,joinedAt:p.joinedAt,lastSeen:p.joinedAt,leftAt:null,endReason:''});
      if(r.poll?.creatorSession===p.sessionId){r.poll.creatorId=p.id;io.to(r.code).emit('poll',publicPoll(r.poll));}
      s.emit('admitted', { selfId: s.id, iceServers: iceServers(), messages: r.messages, board: r.board, notes: r.notes, notesRevision:r.notesRevision||0, poll: publicPoll(r.poll), whiteboard:boardState(r) });
      emitState(r);
    }
    on('join', async d => {
      // Trust Render's immediate proxy only (rightmost forwarded IP), never a
      // client-supplied leftmost entry. Apply before password hashing.
      const forwarded = socket.handshake.headers['x-forwarded-for'];
      const ip = typeof forwarded === 'string' ? forwarded.split(',').at(-1).trim() : socket.handshake.address;
      const now = Date.now();
      let limit = joinAttempts.get(ip);
      if (!limit || now - limit.at > 60000) { limit = { at: now, count: 0 }; joinAttempts.set(ip, limit); }
      if (++limit.count > 30) throw new Error('Too many join attempts. Please wait one minute.');
      if (socket.data.code) throw new Error('Already joined or waiting.');
      const r = await load(clean(d.code)); if (!r) throw new Error('Meeting no longer exists. Ask the host for a new link.');
      if(r.attendance.length>=50000)throw Error('Attendance storage limit reached (50,000 visits). Export records and create another classroom.');
      const name = clean(d.name, 40); if (!name) throw new Error('Enter your name.');
      const owner = typeof d.hostToken === 'string' && equal(hash(d.hostToken).toString('hex'), r.hostHash);
      if(!r.active){if(!owner)throw Error('The host has not started the next session. Try again when class begins.');startSession(r);}
      const resumeKey = clean(d.resumeToken, 128);
      const session = resumeKey ? r.sessions.get(hash(resumeKey).toString('hex')) : null;
      if (session?.banned) throw new Error('You were removed from this meeting.');
      if (session && [...r.members.values()].some(p => p.sessionId === session.id)) throw new Error('This session is already connected.');
      if (owner && [...r.members.values()].some(p => p.role === 'host')) throw new Error('Host is already connected.');
      if (!owner && !session && r.locked) throw new Error('This meeting is locked.');
      if (!owner && !session && r.passwordHash && !equal(safePassword(clean(d.password, 128)), r.passwordHash)) throw new Error('Incorrect meeting password.');
      if (r.waiting.size >= 30) throw new Error('Waiting room is full. Try later.');
      if (r.sessions.size >= 500 && !session) throw new Error('Meeting session limit reached.');
      const secret = session ? resumeKey : token(); const sessionId = hash(secret).toString('hex');
      const role = owner ? 'host' : session?.role || 'guest';
      const p = { id: socket.id, name, role, sessionId, personId:hash(r.code+':'+(clean(d.participantKey,128)||sessionId)).toString('hex').slice(0,24), hand: false, mic: false, camera: false, sharing: false, recording: false, joinedAt: Date.now() };
      r.sessions.set(sessionId, { id: sessionId, role, admitted: owner || !!session?.admitted, banned: false });
      if (owner || session?.admitted) admit(r, socket, p);
      else { socket.data.code = r.code; r.waiting.set(socket.id, p); socket.emit('waiting-room'); emitState(r); }
      return { resumeToken: secret };
    });
    on('admit', d => { const { r } = context(true); const p = r.waiting.get(d.id); const s = io.sockets.sockets.get(d.id); if (!p || !s) throw new Error('Participant has left.'); admit(r, s, p); r.sessions.get(p.sessionId).admitted = true; });
    on('reject', d => { const { r } = context(true); const p = r.waiting.get(d.id); if (!p) return; const s = io.sockets.sockets.get(d.id); s?.emit('ended', 'The host declined your request.'); if (s) s.data = {}; r.waiting.delete(d.id); r.sessions.delete(p.sessionId); emitState(r); });
    on('signal', d => { const { r } = context(); if (!r.members.has(d.to) || d.to === socket.id) throw new Error('Invalid recipient.'); if (!d.description && !d.candidate && d.restart!==true) throw new Error('Invalid signal.'); io.to(d.to).emit('signal', { from: socket.id, description: d.description, candidate: d.candidate, restart:d.restart===true }); });
    on('media', d => { const { r, p } = context();
      if(d.sharing===true&&p.role==='guest'&&!r.shareEnabled)throw Error('Screen sharing is disabled by the host.');
      if(d.recording===true && p.role==='guest' && r.recordingEnabled===false)throw Error('Participant recording is disabled by the host.');
      const raised=d.hand===true&&!p.hand;
      for (const k of ['mic','camera','hand','sharing','recording']) if(typeof d[k]==='boolean')p[k]=k==='sharing'&&p.role==='guest'&&!r.shareEnabled?false:d[k];
      if(raised)io.to(r.code).emit('hand-raised',{id:p.id,name:p.name});emitState(r);
    });
    on('chat', d => { const { r, p } = context(); if (!r.chatEnabled && p.role === 'guest') throw new Error('Chat is disabled.'); const text = clean(d.text, 2000); if (!text) return; const msg = { id: token(), senderId:p.id, name: p.name, text, at: Date.now() }; r.messages.push(msg); r.messages = r.messages.slice(-200); io.to(r.code).emit('chat', msg); });
    on('reaction', d => { const { r, p } = context(); if (!['👏','❤️','👍','🎉','💡'].includes(d.emoji)) return; io.to(r.code).emit('reaction', { name: p.name, emoji: d.emoji }); });
    on('settings', d => { const { r } = context(true); for (const k of ['locked', 'chatEnabled', 'shareEnabled', 'boardEnabled','recordingEnabled','participantPollsEnabled']) if (typeof d[k] === 'boolean') r[k] = d[k]; if(r.recordingEnabled===false)for(const p of r.members.values())if(p.role==='guest'){p.recording=false;io.to(p.id).emit('control',{action:'stop-recording'});} if (!r.shareEnabled) for (const p of r.members.values()) if (p.role === 'guest') {p.sharing=false;io.to(p.id).emit('control', { action: 'stop-sharing' });} emitState(r); });
    on('control', d => { const { r, p } = context(true); const target = r.members.get(d.id); if (!target || target.id === p.id || target.role === 'host' || (p.role === 'cohost' && target.role === 'cohost')) throw new Error('Cannot control this participant.'); if (!['mute', 'request-unmute', 'remove', 'cohost', 'guest'].includes(d.action)) throw new Error('Unknown action.'); if (['cohost', 'guest'].includes(d.action)) { if (p.role !== 'host') throw new Error('Only the host can change roles.'); target.role = d.action; if(d.action==='guest'){if(r.recordingEnabled===false){target.recording=false;io.to(target.id).emit('control',{action:'stop-recording'});}if(!r.shareEnabled){target.sharing=false;io.to(target.id).emit('control',{action:'stop-sharing'});}} r.sessions.get(target.sessionId).role = d.action; emitState(r); } else if (d.action === 'remove') { r.sessions.get(target.sessionId).banned = true; const s = io.sockets.sockets.get(d.id); s?.emit('ended', 'The host removed you from the meeting.'); leave(s); } else io.to(d.id).emit('control', { action: d.action }); });
    on('end', () => { const { r } = context(true); endRoom(r); });
    on('attendance', () => { const { r } = context(true); return reports(r); });
    on('heartbeat',()=>{const {r}=context();const row=r.attendance.findLast(a=>a.id===socket.id&&!a.leftAt);if(row)row.lastSeen=Date.now();});
    on('board-get',()=>{const {r}=context();return boardState(r);});
    on('board-edit',d=>{const {r,p}=context();if(!r.boardEnabled&&p.role==='guest')throw Error('The host locked the board.');const entry=applyBoard(r,p.sessionId,d.changes,p.role!=='guest');const history=r.undo.get(p.sessionId)||[];history.push(entry);r.undo.set(p.sessionId,history.slice(-40));r.redo.set(p.sessionId,[]);emitBoard(r);return boardState(r);});
    for(const event of ['board-undo','board-redo'])on(event,()=>{const {r,p}=context();if(!r.boardEnabled&&p.role==='guest')throw Error('The host locked the board.');const undo=event==='board-undo';const from=undo?r.undo:r.redo;const to=undo?r.redo:r.undo;const stack=from.get(p.sessionId)||[];if(!stack.length)throw Error('Nothing to '+(undo?'undo':'redo'));const entry=stack.at(-1);const result=historyStep(r,entry,undo,p.role!=='guest');stack.pop();rebaseHistory(stack,undo?'after':'before',undo?entry.before:entry.after,result.after);const dest=to.get(p.sessionId)||[];dest.push(undo?{before:result.after,after:entry.after}:{before:entry.before,after:result.after});to.set(p.sessionId,dest.slice(-40));emitBoard(r);return boardState(r);});
    on('board-clear',()=>{const {r}=context(true);r.objects=[];r.boardRevision++;r.undo.clear();r.redo.clear();emitBoard(r);return boardState(r);});
    on('cursor',d=>{const {r,p}=context();if(Number.isFinite(d.x)&&Number.isFinite(d.y)&&Math.abs(d.x)<100000&&Math.abs(d.y)<100000)socket.to(r.code).emit('cursor',{id:p.id,name:p.name,x:d.x,y:d.y});});
    on('notes', d => {
      const { r } = context(); const revision=r.notesRevision||0;
      if(d.expectedRevision!==undefined && d.expectedRevision!==revision)return {conflict:true,notes:r.notes,notesRevision:revision};
      r.notes=typeof d.text==='string'?d.text.slice(0,12000):'';r.notesRevision=revision+1;
      const state={notes:r.notes,notesRevision:r.notesRevision};
      socket.to(r.code).emit('notes-state',state);socket.to(r.code).emit('notes',r.notes);return state;
    });
    on('draw', d => { const { r } = context(); if (r.board.length >= 1000) throw new Error('Whiteboard full. Ask the host to clear it.'); if (!Array.isArray(d.points) || d.points.length < 2 || d.points.length > 400 || !d.points.every(p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(v) && v >= 0 && v <= 1))) throw new Error('Invalid stroke.'); const stroke = { points: d.points, color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#12392d' }; r.board.push(stroke); socket.to(r.code).emit('draw', stroke); });
    on('clear-board', () => { const { r } = context(true); r.board = []; io.to(r.code).emit('board', []); });
    on('poll-create', d => { const { r,p } = context(); if(p.role==='guest'&&r.participantPollsEnabled===false)throw Error('Participant polls are disabled by the host.'); if(r.poll&&!r.poll.closed&&p.role==='guest')throw Error('Wait for the current poll to close.'); const question = clean(d.question, 180); const choices = Array.isArray(d.choices) ? d.choices.map(c => clean(c, 80)).filter(Boolean).slice(0, 6) : []; if (!question || choices.length < 2) throw new Error('Add a question and at least two choices.'); r.poll = { creatorId:p.id, creatorSession:p.sessionId, question, choices, votes: new Map(), closed: false }; io.to(r.code).emit('poll', publicPoll(r.poll)); });
    on('poll-vote', d => { const { r, p } = context(); if (!r.poll || r.poll.closed || !Number.isInteger(d.choice) || !r.poll.choices[d.choice]) throw new Error('Poll is unavailable.'); r.poll.votes.set(p.sessionId, d.choice); io.to(r.code).emit('poll', publicPoll(r.poll)); });
    on('poll-close', () => { const { r,p } = context(); if(p.role==='guest'&&r.poll?.creatorSession!==p.sessionId)throw Error('Only the poll creator or host can close it.'); if (r.poll) { r.poll.closed = true; io.to(r.code).emit('poll', publicPoll(r.poll)); } });
    function leave(s = socket) { if (!s) return; const r = rooms.get(s.data.code); if (!r) return; const row = r.attendance.findLast(a => a.id === s.id && !a.leftAt); if(row){row.leftAt=Date.now();row.lastSeen=row.leftAt;row.endReason='Left meeting';} r.members.delete(s.id); const waiting = r.waiting.get(s.id); if (waiting) r.sessions.delete(waiting.sessionId); r.waiting.delete(s.id); s.leave(r.code); s.data = {}; if (!r.members.size) r.emptySince = Date.now(); emitState(r); }
    on('leave', () => leave());
    socket.on('disconnect',()=>{const code=socket.data.code;enqueue(async()=>{leave();await persist(rooms.get(code));}).catch(()=>{});});
    socket.on('error', () => {});
  });
  app.use((req,res,next)=>{if(req.path==='/'||req.path.startsWith('/meet/'))res.set('Cache-Control','no-store');next();});
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
  app.use(['/background','/assets'],(_req,res)=>res.status(404).type('text/plain').send('Application asset missing. Upload all project files and redeploy.'));
  app.get('/{*path}', (req, res) => req.path.startsWith('/api/') ? res.status(404).json({ error: 'Not found' }) : res.sendFile(fileURLToPath(new URL('../dist/index.html', import.meta.url))));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.status === 400 ? 'Invalid request.' : 'Request failed.' }));
  return {app,server,io,rooms,ready,flush:()=>serial,close:async()=>{clearInterval(cleanup);await serial;for(const r of rooms.values()){closeAttendance(r,'Server shutdown');await persist(r);}await new Promise(resolve=>io.close(resolve));await serial;await store.close();}};
}
function publicPoll(p) { return p ? { creatorId:p.creatorId, question: p.question, choices: p.choices, counts: p.choices.map((_, i) => [...p.votes.values()].filter(v => v === i).length), total: p.votes.size, closed: p.closed } : null; }
