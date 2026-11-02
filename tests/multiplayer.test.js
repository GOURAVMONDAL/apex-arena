import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ArenaRoom, roomFrom, cleanRacer } from '../multiplayer.js';
import { ArenaGame } from '../game.js';
const peers=new Map();let ids=0;
class Link extends EventEmitter{
  constructor(peer){super();this.peer=peer;this.open=false;}
  send(data){queueMicrotask(()=>this.other.emit('data',structuredClone(data)));}
  close(){if(this.closed)return;this.closed=true;this.open=false;this.emit('close');this.other.close();}
}
class FakePeer extends EventEmitter{
  constructor(id){super();this.id=id||`guest-${++ids}`;peers.set(this.id,this);queueMicrotask(()=>this.emit('open',this.id));}
  connect(id){const remote=peers.get(id),a=new Link(id),b=new Link(this.id);a.other=b;b.other=a;remote.emit('connection',b);queueMicrotask(()=>{a.open=b.open=true;b.emit('open');a.emit('open');});return a;}
  destroy(){peers.delete(this.id);}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const racer=(x=0)=>({name:'RACER',car:5,color:'#e759ac',score:37,alive:true,player:{x,z:1,y:0,angle:.3,speed:20}});

test('QR invite round trips and malformed movement is rejected',()=>{
  const id='apex-1234567890abcdef';assert.equal(roomFrom(`https://example.test/game/#room=${id}`),id);assert.equal(roomFrom(id),id);
  assert.equal(cleanRacer({player:{x:Infinity}}),null);
  const safe=cleanRacer({...racer(),name:'x'.repeat(200),car:900,color:'bad'});assert.equal(safe.name.length,18);assert.equal(safe.car,5);assert.equal(safe.color,'#e759ac');
});
test('host and QR joiner exchange racers, start one seeded round and finish together',async()=>{
  let now=1000,hostStart,guestStart,finished=0,left=0;
  const host=new ArenaRoom({PeerClass:FakePeer,now:()=>now,onStart:data=>hostStart=data,onFinish:()=>finished++});
  const guest=new ArenaRoom({PeerClass:FakePeer,now:()=>now,onStart:data=>guestStart=data,onFinish:()=>finished++,onLeave:()=>left++});
  host.local=guest.local=cleanRacer(racer());
  try{
    await host.open();host.update(racer());await guest.open(host.id);await settle();guest.update(racer(4));await settle();
    assert.equal(host.racers.size,2);assert.equal(guest.racers.size,2);assert.equal(host.racers.get(guest.self).player.x,4);
    assert.equal(guest.start('road'),false);
    host.receive(host.links.get(guest.self),{type:'start',round:99,seed:1,venue:'road'});assert.equal(host.phase,'lobby');
    assert.equal(host.start('road'),true);await settle();assert.equal(host.phase,'playing');assert.equal(guest.phase,'playing');assert.equal(hostStart.seed,guestStart.seed);assert.equal(guestStart.venue,'road');
    now+=184000;host.update(racer(8));await settle();assert.equal(host.phase,'finished');assert.equal(guest.phase,'finished');assert.equal(finished,2);
    const late=new ArenaRoom({PeerClass:FakePeer,now:()=>now});late.local=cleanRacer(racer());await late.open(host.id);await settle();assert.equal(late.phase,'lobby');assert.equal(host.racers.size,3);late.leave();await settle();
    assert.equal(host.start('ice'),true);await settle();assert.equal(guest.round,2);
    host.leave();await settle();assert.equal(guest.active,false);assert.equal(left,1);
  }finally{guest.leave();host.leave();}
});
test('all players start the same deterministic arena',()=>{
  const a=new ArenaGame(),b=new ArenaGame();a.start({seed:2718});b.start({seed:2718});assert.deepEqual(a.state.obstacles,b.state.obstacles);assert.deepEqual(a.state.rivals,b.state.rivals);
});


test('round timeout freezes a paused player and cannot award the style bonus twice',()=>{
  const game=new ArenaGame();game.start({seed:1});for(let i=0;i<190;i++)game.update(1/60);game.state.score=50;game.pause();game.endRound();
  assert.equal(game.state.mode,'over');const score=game.state.score;game.endRound();game.resume();game.update(1/60,{throttle:1});assert.equal(game.state.mode,'over');assert.equal(game.state.score,score);
});
