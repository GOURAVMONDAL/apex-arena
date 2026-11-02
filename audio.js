// Original, synthesized audio: no downloaded tracks or sound samples.
export class ArenaAudio {
  constructor() { this.enabled = false; this.context = null; this.nextBeat = 0; this.beat = 0; }
  async setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!enabled) { if(this.master)this.master.gain.setTargetAtTime(0,this.context.currentTime,.08); return; }
    try {
      if (!this.context) this.init();
      await this.context.resume(); this.master.gain.setTargetAtTime(.24,this.context.currentTime,.1);
    } catch { this.enabled = false; }
  }
  init() {
    const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
    const c=this.context=new Context();this.master=c.createGain();this.master.gain.value=0;this.master.connect(c.destination);
    this.engineGain=c.createGain();this.engineGain.gain.value=0;this.engineGain.connect(this.master);
    this.engine=c.createOscillator();this.engine.type='sawtooth';this.engine.frequency.value=40;
    this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=280;this.engine.connect(this.filter);this.filter.connect(this.engineGain);this.engine.start();
    const buffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;this.noiseBuffer=buffer;
  }
  tone(freq,duration=.12,type='sine',volume=.5,delay=0,endFreq=null) {
    if(!this.enabled||!this.context)return;const c=this.context,t=c.currentTime+delay;
    const osc=c.createOscillator(),gain=c.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,t);if(endFreq)osc.frequency.exponentialRampToValueAtTime(Math.max(10,endFreq),t+duration);
    gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.002,volume),t+.01);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+duration+.02);
  }
  noise(duration=.2,volume=.3,filter=600,type='lowpass') {
    if(!this.enabled||!this.context)return;const c=this.context,t=c.currentTime;
    const source=c.createBufferSource(),gain=c.createGain(),f=c.createBiquadFilter();source.buffer=this.noiseBuffer;f.type=type;f.frequency.value=filter;
    gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);source.connect(f);f.connect(gain);gain.connect(this.master);source.start();source.stop(t+duration);
  }
  event(e) {
    if(!this.enabled)return;
    if(e.type==='collect'){this.tone(660,.1,'sine',.28);this.tone(990,.17,'sine',.21,.08);}
    else if(e.type==='explosion'){this.noise(.6,.9,400);this.tone(80,.38,'triangle',.8,0,21);}
    else if(e.type==='damage'||e.type==='hit'){this.noise(.18,.45,900);this.tone(110,.14,'square',.16,0,55);}
    else if(e.type==='rocket'){this.noise(.3,.35,2100,'bandpass');this.tone(300,.18,'sawtooth',.12,0,55);}
    else if(e.type==='countdown'){this.tone(e.value?440:880,.12,'sine',.4);}
    else if(e.type==='stage'){[440,554,660,880].forEach((f,i)=>this.tone(f,.25,'triangle',.35,i*.12));}
    else if(e.type==='jump')this.tone(200,.2,'sine',.12,0,450);
    else if(e.type==='bomb')this.tone(150,.1,'square',.25);
  }
  update(state) {
    if(!this.context||!this.enabled)return;const c=this.context,active=state.mode==='playing';
    const speed=state.player.speed||0;this.engine.frequency.setTargetAtTime(38+speed*3.2+(state.player.boosting?35:0),c.currentTime,.08);
    this.filter.frequency.setTargetAtTime(180+speed*20,c.currentTime,.12);this.engineGain.gain.setTargetAtTime(active?.075+speed*.002:0,c.currentTime,.12);
    if(active&&c.currentTime>=this.nextBeat){
      this.nextBeat=c.currentTime+.25;const b=this.beat++%16;
      if(b%4===0)this.tone(110,.12,'sine',.45,0,36);
      if(b%4===2)this.noise(.09,.09,2300,'highpass');
      if(b%2===1)this.noise(.025,.035,6200,'highpass');
      const bass=[55,55,65.4,49][Math.floor(b/4)];if(b%2===0)this.tone(bass,.19,'triangle',.18);
      if(b===7||b===15)this.tone(bass*8,.09,'sine',.06);
    }
  }
}
