// A relay candidate confirms allocation from this browser, not a complete call.
export async function checkRelay(iceServers, timeout = 12000) {
  if (!iceServers.some(s=>(Array.isArray(s.urls)?s.urls:[s.urls]).some(u=>/^turns?:/.test(u)))) return {ok:false,message:'No TURN relay is configured. Add relay credentials in Render.'};
  const pc = new RTCPeerConnection({iceServers,iceTransportPolicy:'relay'});
  let timer;
  try {
    const result = new Promise(resolve=>{
      timer=setTimeout(()=>resolve({ok:false,message:'No relay could be reached. Check credentials, relay availability and network restrictions.'}),timeout);
      pc.onicecandidate=e=>{if(e.candidate?.type==='relay'||/ typ relay(?: |$)/.test(e.candidate?.candidate||''))resolve({ok:true,message:'A TURN relay is reachable from this device. This tests relay access; join a call to check video and audio.'});};
    });
    pc.createDataChannel('relay-check');await pc.setLocalDescription(await pc.createOffer());return await result;
  } catch { return {ok:false,message:'Relay test could not start in this browser.'}; }
  finally {clearTimeout(timer);pc.close();}
}
