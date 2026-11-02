import Peer from 'peerjs';
import { VEHICLE_ROSTER, vehicleIndex } from './roster.js';
import { PLAYGROUNDS } from './playgrounds.js';

export const MAX_PLAYERS=4, ROUND_SECONDS=180;
export const validRoom=id=>typeof id==='string'&&/^apex-[a-f0-9]{16}$/.test(id);
export function roomFrom(value){
  if(validRoom(value))return value;
  try{return new URLSearchParams(new URL(value).hash.slice(1)).get('room')||'';}catch{return '';}
}
export function cleanRacer(value){
  if(!value||typeof value!=='object')return null;
  const p=value.player||{};
  if(!['x','z','y','angle','speed'].every(key=>Number.isFinite(p[key])&&Math.abs(p[key])<1e7))return null;
  return {name:String(value.name||'RACER').slice(0,18),car:vehicleIndex(value.car),color:/^#[0-9a-f]{6}$/i.test(value.color)?value.color:VEHICLE_ROSTER[vehicleIndex(value.car)].color,
    score:Math.max(0,Math.min(1e9,Math.floor(Number(value.score)||0))),alive:value.alive!==false,
    player:{x:p.x,z:p.z,y:Math.max(0,Math.min(30,p.y)),angle:p.angle,speed:Math.max(0,Math.min(100,p.speed)),boosting:!!p.boosting}};
}

// The host owns membership, starts and the round clock. Peers share movement and
// score for a casual score competition; scenery and AI are simulated locally.
export class ArenaRoom{
  constructor({onChange=()=>{},onStart=()=>{},onFinish=()=>{},onLeave=()=>{},PeerClass=Peer,now=()=>Date.now()}={}){
    Object.assign(this,{onChange,onStart,onFinish,onLeave,PeerClass,now});this.links=new Map();this.racers=new Map();this.phase='offline';this.round=0;
  }
  get active(){return !!this.peer;}
  get host(){return this.role==='host';}
  notify(message=this.message){this.message=message;this.onChange(this);}
  send(link,data){if(link?.open)try{link.send(data);}catch{this.notify('Connection interrupted. Leave and rejoin the room.');}}
  broadcast(data){for(const link of this.links.values())this.send(link,data);}
  snapshot(){return {type:'roster',room:this.id,phase:this.phase,round:this.round,venue:this.venue,remaining:this.remaining(),racers:[...this.racers].map(([id,racer])=>({id,...racer}))};}
  remaining(){return this.phase==='playing'?Math.max(0,(this.endsAt-this.now())/1000):ROUND_SECONDS;}
  async open(id){
    this.leave(false);this.id=id||`apex-${[...crypto.getRandomValues(new Uint8Array(8))].map(n=>n.toString(16).padStart(2,'0')).join('')}`;
    if(!validRoom(this.id))throw new Error('Use a room invite link or a valid room code.');
    this.role=id?'guest':'host';this.phase='connecting';this.notify('Connecting to the room service…');
    const peer=this.peer=new this.PeerClass(id?undefined:this.id,{debug:0});
    peer.on('error',error=>{if(this.peer!==peer)return;this.notify(error.type==='peer-unavailable'?'Room not found. Ask the host for a fresh QR code.':'Could not connect. Check your internet connection or try another network.');});
    peer.on('disconnected',()=>{if(this.peer===peer)this.notify('Room service disconnected. Existing players may continue; reconnect to accept new players.');});
    peer.on('connection',link=>{
      if(!this.host||this.links.size>=MAX_PLAYERS-1||!['lobby','finished'].includes(this.phase)){
        link.on('open',()=>{this.send(link,{type:'rejected',message:this.phase==='playing'?'Round already started. Join after it finishes.':'Room full. Maximum four players.'});setTimeout(()=>link.close(),300);});return;
      }
      this.attach(link);
    });
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{if(this.peer===peer&&this.phase==='connecting'){this.notify('Connection timed out. Leave the room and try again.');reject(new Error(this.message));}},15000);
      peer.on('open',()=>{
        clearTimeout(timeout);if(this.peer!==peer)return;
        this.self=peer.id;
        if(this.host){this.phase='lobby';this.notify('Room ready. Share the QR code to invite friends.');}
        else this.attach(peer.connect(this.id,{reliable:true}));
        resolve();
      });
      peer.on('error',()=>{clearTimeout(timeout);reject(new Error(this.message));});
    });
  }
  attach(link){
    this.links.set(link.peer,link);
    const timer=setTimeout(()=>{if(!this.racers.has(link.peer)&&this.host)link.close();else if(!this.host&&this.phase==='connecting'){link.close();this.notify('Could not reach the host. Try another network or create a new room.');}},15000);
    link.on('open',()=>{if(!this.host){this.send(link,{type:'hello',racer:this.local});this.notify('Connected. Waiting for the host…');}});
    link.on('data',data=>this.receive(link,data));
    link.on('close',()=>{clearTimeout(timer);this.links.delete(link.peer);this.racers.delete(link.peer);
      if(this.host){this.broadcast(this.snapshot());this.notify('A racer left the room.');}
      else if(this.peer){this.leave();this.notify('Host disconnected. The room has ended. Create or join a new room.');}
    });
    link.on('error',()=>this.notify('A player connection failed. Leave and rejoin if needed.'));
  }
  receive(link,data){
    if(!data||typeof data!=='object'||JSON.stringify(data).length>20000)return;
    if(this.host){
      if(data.type!=='hello'&&data.type!=='update')return;
      const racer=cleanRacer(data.racer);if(!racer)return;
      if(data.type==='hello'&&!['lobby','finished'].includes(this.phase))return;
      if(data.type==='update'&&!this.racers.has(link.peer))return;
      this.racers.set(link.peer,racer);this.broadcast(this.snapshot());
      if(data.type==='hello')this.notify('A racer joined. Start when everyone is ready.');
      return;
    }
    if(link.peer!==this.id)return;
    if(data.type==='rejected'){const message=String(data.message).slice(0,150);this.leave();this.notify(message);return;}
    if(data.type==='roster'&&data.room===this.id&&Array.isArray(data.racers)&&data.racers.length<=MAX_PLAYERS){
      this.racers.clear();for(const row of data.racers){const racer=cleanRacer(row);if(racer&&typeof row.id==='string')this.racers.set(row.id,racer);}
      if(this.phase==='connecting'){this.phase='lobby';this.notify('Joined the room. Choose a vehicle, then wait for the host.');}
      if(this.phase==='playing'&&Number.isFinite(data.remaining))this.endsAt=this.now()+Math.max(0,Math.min(ROUND_SECONDS,data.remaining))*1000;
    }
    if(data.type==='start'&&Number.isInteger(data.round)&&data.round>this.round&&Number.isInteger(data.seed)&&Object.hasOwn(PLAYGROUNDS,data.venue))this.begin(data);
    if(data.type==='finish'&&data.round===this.round&&this.phase==='playing'){this.phase='finished';this.onFinish();this.notify('Round finished. The host can start a rematch.');}
  }
  start(venue='yard'){
    if(!this.host||!['lobby','finished'].includes(this.phase)||this.racers.size<2)return false;
    const data={type:'start',round:this.round+1,seed:crypto.getRandomValues(new Uint32Array(1))[0],venue:Object.hasOwn(PLAYGROUNDS,venue)?venue:'yard',players:[...this.racers.keys()]};
    this.broadcast(data);this.begin(data);return true;
  }
  begin(data){this.round=data.round;this.venue=data.venue;this.phase='playing';this.endsAt=this.now()+(ROUND_SECONDS+3)*1000;this.onStart({...data,slot:Math.max(0,(data.players||[]).indexOf(this.self)),count:(data.players||[]).length||2});this.notify('Round live. Highest arena score wins.');}
  update(racer){
    this.local=cleanRacer(racer);if(!this.local||!this.active||!this.self)return;
    this.racers.set(this.self,this.local);
    if(this.now()-(this.lastSent||0)<100)return;this.lastSent=this.now();
    if(this.host){
      if(this.phase==='playing'&&this.remaining()===0){this.phase='finished';this.onFinish();this.broadcast({type:'finish',round:this.round});this.notify('Round finished. Start a rematch or return to single player.');}
      this.broadcast(this.snapshot());
    }else this.send(this.links.get(this.id),{type:'update',racer:this.local});
  }
  leave(announce=true){
    const wasActive=this.active;const peer=this.peer;this.peer=null;this.self=null;
    for(const link of this.links.values())link.close();this.links.clear();peer?.destroy();this.racers.clear();
    this.phase='offline';this.role=null;this.round=0;this.lastSent=0;
    if(announce&&wasActive)this.onLeave();
  }
}
