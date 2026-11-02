import './styles.css';
import { ArenaGame } from './game.js';
import { ArenaWorld } from './world.js';
import { createUI } from './ui.js';
import { ArenaAudio } from './audio.js';
import { createLoader } from './loading.js';

const loader = createLoader();
loader.setProgress(25, 'ASSEMBLING YOUR MACHINE');

const game = new ArenaGame();
const audio = new ArenaAudio();
let world;
const ui = createUI({
  onPlay: () => { clearKeys(); audio.setEnabled(ui.getSettings().sound); game.start(); },
  onPause: () => { clearKeys(); game.pause(); },
  onResume: () => { clearKeys(); audio.setEnabled(ui.getSettings().sound); game.resume(); },
  onGarage: () => { clearKeys(); game.garage(); },
  onRestart: () => { clearKeys(); audio.setEnabled(ui.getSettings().sound); game.restart(); },
  onSettingsChange: settings => { game.setLevel(settings.level); game.setPlayground(settings.playground); world?.applySettings(settings); audio.setEnabled(settings.sound); },
  onLevelChange: id => game.setLevel(id),
  onCustomize: profile => { world?.customize(profile); game.setVehicle(profile.car); },
  onCarChange: index => { game.setVehicle(index); },
  onSoundChange: enabled => audio.setEnabled(enabled),
  onAction: action => { if(action==='camera')toggleCamera(); },
});
game.setVehicle(ui.getProfile().car);
game.setLevel(ui.getSettings().level);
game.setPlayground(ui.getSettings().playground);
loader.setProgress(60, 'BUILDING THE PLAYGROUND');
try { world = new ArenaWorld(document.getElementById('game-canvas'), ui.getSettings(), ui.getProfile()); }
catch (error) { console.error(error); loader.fail('The 3D renderer could not start. Enable hardware acceleration and reload.'); }

const keys = new Set();
const pulses = new Set();
function clearKeys() { keys.clear(); pulses.clear(); }
function panelOpen() { return !!document.getElementById('game-panel')?.open; }
function editing() { return /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName); }
function toggleCamera() { const settings = ui.getSettings(); ui.setSettings({...settings,camera:settings.camera==='chase'?'overhead':'chase'});ui.toast({type:'camera',text:settings.camera==='chase'?'OVERHEAD CAMERA':'CHASE CAMERA'}); }
window.addEventListener('keydown', e => {
  if (editing()||panelOpen()) return;
  const code=e.code;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(code))e.preventDefault();
  keys.add(code);
  if(!e.repeat&&['Space','KeyQ','KeyE'].includes(code))pulses.add(code);
  if(e.repeat)return;
  if(code==='Escape'||code==='KeyP'){
    if(game.state.mode==='playing'||game.state.mode==='countdown')game.pause();
    else if(game.state.mode==='paused')game.resume();
    clearKeys();
  }
  if(code==='KeyR'&&['playing','paused','over'].includes(game.state.mode)){game.restart();clearKeys();}
  if(code==='KeyC')toggleCamera();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { clearKeys(); game.pause(); });
document.addEventListener('visibilitychange', () => { if(document.hidden){clearKeys();game.pause();} });

let gamepadPause=false;
function readInput() {
  if(panelOpen()||editing())return {};
  const touch=ui.getInput();
  const input={
    throttle:(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),
    steer:(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0),
    boost:keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.boost,
    jump:keys.has('Space')||pulses.has('Space')||touch.jump,rocket:keys.has('KeyQ')||pulses.has('KeyQ')||touch.rocket,bomb:keys.has('KeyE')||pulses.has('KeyE')||touch.bomb,
  };
  if(Math.abs(touch.throttle)>Math.abs(input.throttle))input.throttle=touch.throttle;
  if(Math.abs(touch.steer)>Math.abs(input.steer))input.steer=-touch.steer;
  const pads=navigator.getGamepads?.()||[];const pad=Array.from(pads).find(Boolean);
  if(pad){
    const axis=Math.abs(pad.axes[0])>.15?pad.axes[0]:0;
    if(Math.abs(axis)>Math.abs(input.steer))input.steer=-axis;
    const throttle=(pad.buttons[7]?.value||0)-(pad.buttons[6]?.value||0);
    if(Math.abs(throttle)>Math.abs(input.throttle))input.throttle=throttle;
    input.jump||=pad.buttons[0]?.pressed;input.rocket||=pad.buttons[2]?.pressed;input.bomb||=pad.buttons[1]?.pressed;input.boost||=pad.buttons[5]?.pressed;
    const pause=pad.buttons[9]?.pressed;
    if(pause&&!gamepadPause){if(game.state.mode==='garage')game.start();else if(game.state.mode==='paused')game.resume();else game.pause();}
    gamepadPause=pause;
  }
  return input;
}

let last=performance.now(),frameTime=0,renderElapsed=0;
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed=Math.min(.1,(now-last)/1000);last=now;
  const input=readInput();game.update(elapsed,input);pulses.clear();
  for(const event of game.drainEvents()){world?.event(event);audio.event(event);ui.toast(event);}
  ui.update(game.state,elapsed);audio.update(game.state);
  frameTime+=elapsed;renderElapsed+=elapsed;const cap=Number(ui.getSettings().fps)||60;
  const interval=1/cap;
  if(frameTime+0.000001>=interval){world?.update(game.state,Math.min(renderElapsed,.1),input);frameTime=Math.max(0,frameTime-interval)%interval;renderElapsed=0;}
}
requestAnimationFrame(frame);
if (world) requestAnimationFrame(() => { loader.setProgress(95, 'CHECKING THE ENGINE'); requestAnimationFrame(() => loader.finish()); });
