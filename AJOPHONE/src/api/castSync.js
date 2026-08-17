const DEVICE_KEY = 'ajo_device_id_v2';
const ROOM_KEY = 'ajo_cast_room_v2';
const COMMAND_KEY = 'ajo_cast_last_cmd_v2';
const ALLOWED_TYPES = new Set(['PLAY_MEDIA','PLAY','PAUSE','STOP','SEEK','VOLUME','NEXT_CHANNEL','PREVIOUS_CHANNEL']);

function randomCode(length = 12) {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return [...bytes].map(value => (value % 36).toString(36)).join('').toUpperCase();
}
export function getDeviceId() { let value = localStorage.getItem(DEVICE_KEY); if (!value) { value = 'DEV-' + randomCode(16); localStorage.setItem(DEVICE_KEY,value); } return value; }
export function getPairingRoom() { let value = localStorage.getItem(ROOM_KEY); if (!value) { value = 'AJO-' + randomCode(12); localStorage.setItem(ROOM_KEY,value); } return value; }
export function setPairingRoom(roomId) { const clean = String(roomId || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,24); if (clean.length < 8) throw new Error('Pairing code must contain at least 8 characters'); localStorage.setItem(ROOM_KEY,clean); return clean; }
export function sanitizeCastItem(item) { if (!item) return null; const players = Array.isArray(item.players) ? item.players : []; return { id:item.id||item.tmdb_id, tmdb_id:item.tmdb_id, title:item.title_en||item.title||item.name, title_en:item.title_en||item.title||item.name, poster_url:item.poster_url||item.poster||'', backdrop_url:item.backdrop_url||item.poster_url||item.poster||'', type:item.type||'movie', category:item.category||'', year:item.year||null, url:item.url||'', is_live:Boolean(item.is_live||item.type==='live'||item.year==='LIVE'), players:players.slice(0,3).flatMap(player => player?.url && /^https?:\/\//i.test(player.url) ? [{name:player.name||player.translator,url:player.url,source:player.source||player.type,headers:player.headers||{}}] : []) }; }

class CastSyncService {
  constructor(){ this.roomId=getPairingRoom(); this.deviceId=getDeviceId(); this.listeners=new Set(); this.seen=new Set(); this.ws=null; this.reconnect=null; this.storageHandler=event=>{if(event.key===COMMAND_KEY&&event.newValue){try{this.handle(JSON.parse(event.newValue));}catch{}}}; window.addEventListener('storage',this.storageHandler); this.connect(); }
  topic(){ return 'ajo_cast_' + this.roomId.toLowerCase(); }
  connect(){ if(this.ws){try{this.ws.close();}catch{}} clearTimeout(this.reconnect); try{this.ws=new WebSocket('wss://ntfy.sh/'+this.topic()+'/ws'); this.ws.onmessage=event=>{try{const packet=JSON.parse(event.data);if(packet.event==='message'&&packet.message)this.handle(JSON.parse(packet.message));}catch{}}; this.ws.onclose=()=>{this.reconnect=setTimeout(()=>this.connect(),5000);}; this.ws.onerror=()=>this.ws?.close();}catch{this.reconnect=setTimeout(()=>this.connect(),5000);} }
  updateRoom(roomId){ this.roomId=setPairingRoom(roomId); this.seen.clear(); this.connect(); }
  sendToTV(payload){ if(!payload?.type||!ALLOWED_TYPES.has(payload.type)) return false; const message={...payload,item:payload.item?sanitizeCastItem(payload.item):undefined,msg_id:this.deviceId+'-'+Date.now()+'-'+randomCode(6),sender:this.deviceId,room:this.roomId,token:this.roomId,timestamp:Date.now()}; this.seen.add(message.msg_id); try{localStorage.setItem(COMMAND_KEY,JSON.stringify(message));}catch{} fetch('https://ntfy.sh/'+this.topic(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(message)}).catch(()=>{}); return true; }
  handle(message){ if(!message||message.sender===this.deviceId||message.room!==this.roomId||message.token!==this.roomId||!ALLOWED_TYPES.has(message.type)) return; if(Math.abs(Date.now()-Number(message.timestamp||0))>60000||this.seen.has(message.msg_id)) return; this.seen.add(message.msg_id); if(this.seen.size>100)this.seen=new Set([...this.seen].slice(-50)); for(const listener of this.listeners){try{listener(message);}catch{}} }
  subscribe(callback){this.listeners.add(callback);return()=>this.listeners.delete(callback);}
  destroy(){clearTimeout(this.reconnect);this.ws?.close();window.removeEventListener('storage',this.storageHandler);this.listeners.clear();}
}
export const castEngine = new CastSyncService();
