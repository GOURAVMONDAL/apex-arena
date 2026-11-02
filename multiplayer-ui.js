import QRCode from 'qrcode';
import { ArenaRoom, roomFrom, validRoom, ROUND_SECONDS } from './multiplayer.js';
import { VEHICLE_ROSTER } from './roster.js';

export function createMultiplayer({game,ui,onStart,onFinish,onLeave}){
  const mode=document.createElement('div');mode.className='session-picker';mode.setAttribute('aria-label','Player mode');
  mode.innerHTML='<button type="button" data-session="solo" aria-pressed="true">SINGLE PLAYER</button><button type="button" data-session="multi" aria-pressed="false">MULTIPLAYER ↗</button>';
  document.querySelector('.hero-copy .primary-btn').before(mode);
  const dialog=document.createElement('dialog');dialog.className='multiplayer-dialog';dialog.setAttribute('aria-labelledby','room-title');
  dialog.innerHTML=`<header><div><span class="eyebrow">PLAY WITH FRIENDS / 2–4 PLAYERS</span><h2 id="room-title">MULTIPLAYER</h2></div><button class="secondary-btn" data-room-action="close" aria-label="Close multiplayer">✕</button></header><p>Three minutes. Highest arena score wins. Drive together and compete against arena AI; player vehicles pass through one another.</p><p class="room-status" role="status" aria-live="polite"></p><div class="room-entry"><button class="primary-btn" data-room-action="create">Create room ↗</button><label for="room-input">Have an invite?</label><div class="room-join-row"><input id="room-input" placeholder="Paste room code or invite link" autocomplete="off" spellcheck="false"/><button class="secondary-btn" data-room-action="join">Join</button></div><p>Or scan the host’s QR code with your phone camera to open the invite.</p></div><div class="room-connected" hidden><div class="room-invite"><img class="room-qr" alt="Scan to join this Apex Arena room"/><div><strong>SCAN TO JOIN</strong><p>Keep the host’s tab open.</p><input class="room-link" readonly aria-label="Room invite link"/><button class="secondary-btn" data-room-action="copy">Copy invite link</button></div></div><label class="room-vehicle-label" for="room-vehicle">Your vehicle<select id="room-vehicle">${VEHICLE_ROSTER.map((car,index)=>`<option value="${index}">${car.name}</option>`).join('')}</select></label><div class="room-players" aria-label="Racers in room"></div><div class="room-actions"><button class="primary-btn" data-room-action="start">Start round ↗</button><button class="secondary-btn" data-room-action="leave">Leave room</button></div><p class="room-help"></p></div>`;
  document.body.append(dialog);
  const hud=document.createElement('aside');hud.className='multiplayer-hud';hud.hidden=true;hud.innerHTML='<button type="button" class="room-hud-open">ROOM ↗</button><strong class="room-clock"></strong><ol class="room-scoreboard"></ol>';document.body.append(hud);
  const $=selector=>dialog.querySelector(selector);let lastRender=0,inviteVersion=0;
  const room=new ArenaRoom({onChange:render,onStart:data=>{dialog.close();onStart(data);render();},onFinish:()=>{onFinish();render();},onLeave:()=>{onLeave();render();}});
  const invite=()=>{const url=new URL(location.href);url.hash=new URLSearchParams({room:room.id}).toString();return url.href;};
  function show(){if(!dialog.open)dialog.showModal();render();}
  function players(target){
    target.replaceChildren();
    for(const [id,racer] of [...room.racers].sort((a,b)=>b[1].score-a[1].score)){
      const row=document.createElement(target.tagName==='OL'?'li':'div');row.className='room-player';
      const name=document.createElement('span');name.textContent=`${racer.name}${id===room.self?' (YOU)':''} · ${VEHICLE_ROSTER[racer.car].name}${!racer.alive?' · WRECKED':''}`;
      const score=document.createElement('b');score.textContent=racer.score.toLocaleString();row.append(name,score);target.append(row);
    }
  }
  function render(){
    const connected=room.active&&room.phase!=='connecting';
    $('.room-status').textContent=room.message||'Create a room, or join a friend using their invite.';
    $('.room-entry').hidden=connected;$('.room-connected').hidden=!connected;
    mode.querySelector('[data-session="solo"]').setAttribute('aria-pressed',String(!room.active));mode.querySelector('[data-session="multi"]').setAttribute('aria-pressed',String(room.active));
    $('.room-entry [data-room-action="create"]').disabled=room.phase==='connecting';$('.room-entry [data-room-action="join"]').disabled=room.phase==='connecting';
    if(connected){
      $('.room-link').value=invite();$('.room-vehicle-label').hidden=room.phase==='playing';$('#room-vehicle').value=String(ui.getProfile().car);
      players($('.room-players'));
      const start=$('[data-room-action="start"]');start.hidden=!room.host;start.disabled=room.racers.size<2||room.phase==='playing';start.textContent=room.phase==='finished'?'Start rematch ↗':'Start round ↗';
      $('.room-help').textContent=room.phase==='playing'?'Round clock keeps running while menus are open.':room.host?'Choose the environment in the garage. Start once your friends have joined.':'Choose your vehicle here. The host chooses the environment and starts the round.';
    }
    hud.hidden=!room.active;hud.querySelector('.room-clock').textContent=room.phase==='playing'?`${Math.floor(room.remaining()/60)}:${String(Math.floor(room.remaining()%60)).padStart(2,'0')}`:room.phase==='finished'?'FINAL SCORES':'LOBBY';players(hud.querySelector('ol'));
  }
  async function connect(id){
    try{
      await room.open(id);if(room.host)room.venue=ui.getSettings().playground;
      room.update(localRacer());render();const version=++inviteVersion;
      const src=await QRCode.toDataURL(invite(),{width:256,margin:4,errorCorrectionLevel:'M'});
      if(version===inviteVersion)$('.room-qr').src=src;
    }catch(error){room.leave();room.notify(error.message||'Unable to open room. Please try again.');render();}
  }
  mode.addEventListener('click',event=>{if(event.target.dataset.session==='multi')show();else if(event.target.dataset.session==='solo'){room.leave();clearInvite();render();}});
  function clearInvite(){const url=new URL(location.href);url.hash='';history.replaceState(null,'',url);}
  dialog.addEventListener('click',async event=>{
    const action=event.target.closest('[data-room-action]')?.dataset.roomAction;if(!action)return;
    if(action==='close')dialog.close();
    if(action==='create')await connect();
    if(action==='join'){const id=roomFrom($('#room-input').value.trim());if(validRoom(id))await connect(id);else room.notify('Paste a valid room invite link or room code.');}
    if(action==='leave'){room.leave();clearInvite();render();}
    if(action==='copy'){try{await navigator.clipboard.writeText(invite());room.notify('Invite link copied.');}catch{$('.room-link').select();room.notify('Select and copy the invite link.');}}
    if(action==='start')room.start(ui.getSettings().playground);
  });
  $('#room-vehicle').addEventListener('change',event=>{const picker=document.getElementById('vehicle-select');picker.value=event.target.value;picker.dispatchEvent(new Event('change'));room.update(localRacer());render();});
  hud.querySelector('button').addEventListener('click',show);
  function localRacer(){const profile=ui.getProfile(),p=game.state.player;return {name:profile.name,car:profile.car,color:profile.color,score:game.state.score,alive:p.hp>0,player:{x:p.x,z:p.z,y:p.y,angle:p.angle,speed:p.speed,boosting:p.boosting}};}
  function tick(){room.update(localRacer());if(performance.now()-lastRender>250){lastRender=performance.now();if(room.active)render();}
    game.state.peers=room.phase==='playing'?[...room.racers].filter(([id])=>id!==room.self).map(([id,racer])=>({id,...racer})):[];
  }
  const initial=roomFrom(location.href);
  render();
  window.addEventListener('pagehide',()=>room.leave(false));
  return {room,show,tick,async ready(){if(validRoom(initial)){show();$('#room-input').value=initial;await connect(initial);}},requestPlay(){if(room.active){show();return false;}return true;}};
}
