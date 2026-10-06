import { createHmac, randomBytes } from 'node:crypto';
const list = value => (Array.isArray(value) ? value : String(value || '').split(',')).map(x => String(x).trim()).filter(Boolean);
const turnURL = s => {const m=s.match(/^turns?:([a-z0-9.-]+|\[[0-9a-f:]+\])(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/i);return !!m && (!m[2] || (Number(m[2])>0 && Number(m[2])<=65535 && Number(m[2])!==53));};
const stunURL = s => /^stuns?:[^\s/]+$/.test(s);
export function createIceProvider(env, {fetch: fetcher = globalThis.fetch, now = Date.now} = {}) {
  const errors = [], groups = [];
  const add = (value, name) => {
    const urls = list(value.urls).filter(turnURL);
    if (!urls.length || (!value.secret && !(value.username && value.credential))) { errors.push(`${name}: valid TURN URLs and credentials are required.`); return; }
    groups.push({urls, username:value.username, credential:value.credential, secret:value.secret});
  };
  if (env.TURN_URLS) add({urls:env.TURN_URLS,username:env.TURN_USERNAME,credential:env.TURN_PASSWORD,secret:env.TURN_SECRET}, 'Primary relay');
  if (env.TURN_BACKUP_URLS) add({urls:env.TURN_BACKUP_URLS,username:env.TURN_BACKUP_USERNAME,credential:env.TURN_BACKUP_PASSWORD,secret:env.TURN_BACKUP_SECRET}, 'Backup relay');
  if (env.TURN_SERVERS_JSON) {
    try { const rows = JSON.parse(env.TURN_SERVERS_JSON); if (!Array.isArray(rows) || rows.length > 8) throw Error(); rows.forEach((r,i)=>add(r || {},`Relay ${i+1}`)); }
    catch { errors.push('TURN_SERVERS_JSON must be an array of up to eight relay configurations.'); }
  }
  const cf = !!(env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN);
  if (!!env.CF_TURN_KEY_ID !== !!env.CF_TURN_API_TOKEN) errors.push('Cloudflare: both key ID and API token are required.');
  const policy = env.ICE_TRANSPORT_POLICY === 'relay' ? 'relay' : 'all';
  let cache, pending;
  const summary = () => ({turnConfigured:groups.length>0 || cf, relayProviders:groups.length+Number(cf), iceTransportPolicy:policy, relayWarnings:errors});
  async function get() {
    const urls = env.STUN_URL === 'none' || env.STUN_URLS === 'none' ? [] : list(env.STUN_URLS || env.STUN_URL || 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478').filter(stunURL);
    const iceServers = urls.length ? [{urls}] : [];
    for (const g of groups) {
      const username = g.secret ? `${Math.floor(now()/1000)+86400}:${randomBytes(6).toString('hex')}` : g.username;
      iceServers.push({urls:g.urls,username,credential:g.secret?createHmac('sha1',g.secret).update(username).digest('base64'):g.credential});
    }
    const warnings = [...errors];
    if (cf) {
      try {
        if (!cache || cache.until <= now()) {
          if (!pending) pending = (async()=>{
            const response = await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CF_TURN_KEY_ID)}/credentials/generate-ice-servers`,{method:'POST',headers:{Authorization:`Bearer ${env.CF_TURN_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({ttl:86400}),signal:AbortSignal.timeout(6000)});
            if (!response.ok) throw Error('Relay credential service failed');
            const body = await response.json();
            const servers = (Array.isArray(body.iceServers)?body.iceServers:[]).flatMap(r=>{
              const urls=list(r.urls).filter(turnURL);return urls.length && r.username && r.credential ? [{urls,username:r.username,credential:r.credential}] : [];
            });
            if (!servers.length) throw Error('No relay credentials returned');
            cache={servers,until:now()+12*3600000};
          })().finally(()=>{pending=null;});
          await pending;
        }
        iceServers.push(...cache.servers);
      } catch { warnings.push('Cloudflare credentials unavailable. Check its Render settings; other configured relays remain available.'); }
    }
    const hasRelay=iceServers.some(s=>list(s.urls).some(turnURL));
    return {iceServers,iceTransportPolicy:hasRelay?policy:'all',turnConfigured:hasRelay,relayWarnings:warnings};
  }
  return {get,summary};
}
