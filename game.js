// The simulation is independent of the renderer and runs in fixed, small steps.
// Coordinates are metres; a heading of zero points along the positive Z axis.
import { getLevel } from './levels.js';
import { PLAYGROUNDS } from './playgrounds.js';
const TAU = Math.PI * 2;
const STAGE_SCORES = [0, 50, 100, 200, 500];
const VEHICLES = [
  { name: 'Viper', speed: 28, boost: 44, acceleration: 31, turn: 1.9, damage: 1 },
  { name: 'Bruiser', speed: 25, boost: 40, acceleration: 27, turn: 1.65, damage: 0.65 },
  { name: 'Phantom', speed: 31, boost: 47, acceleration: 34, turn: 2.1, damage: 1.18 },
];
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const wrapAngle = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

export class ArenaGame {
  constructor({ seed = Math.floor(Math.random() * 0xffffffff) } = {}) {
    this._seed = seed >>> 0 || 1;
    this._events = [];
    this._id = 0;
    this.vehicle = 0;
    this.level = 0;
    this.playground = 'yard';
    this._reset('garage');
  }

  _random() {
    let n = this._seed;
    n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
    this._seed = n >>> 0;
    return this._seed / 4294967296;
  }

  _range(low, high) { return low + this._random() * (high - low); }

  _reset(mode) {
    const mission=getLevel(this.level);
    const playground=mission.id?mission.playground:this.playground;
    this._events.length = 0;
    this._cells = new Set();
    this._timers = { rocket: 0, bomb: 0, jump: 0, hurt: 0, stream: 0, rivals: 0, combo: 0 };
    this._paletteTick = 0;
    this._lastCountdown = 3;
    this.state = {
      mode, countdown: 3, elapsed: 0, score: 0, likes: 0, distance: 0,
      level:mission.id,won:false,objective:mission.metric?{metric:mission.metric,target:mission.target,value:0,label:mission.objective}:null,
      playground,
      defeats: 0, driftTime: 0, airTime: 0, destruction: 0,
      performance: [0, 0, 0, 0], baseScore: null, styleBonus: 0,
      stage: mission.difficulty, nextStageScore: STAGE_SCORES[mission.difficulty]??null, paletteIndex: (mission.difficulty-1)*3, multiplier: 1, combo: 0,
      speedKph: 0, vehicle: this.vehicle,
      player: {
        id: 'player', x: 0, z: 0, angle: 0, vx: 0, vz: 0,
        speed: 0, y: 0, vy: 0, hp: 100, shield: 0, nitro: 100,
        rockets: 8, bombs: 3, boosting: false, drifting: false,
      },
      rivals: [], obstacles: [], pickups: [], projectiles: [],
    };
    this._stream(true);
    // A readable trail teaches the collection loop before the first rival arrives.
    for (let i = 0; i < 7; i++) this._pickup('like', Math.sin(i * 0.7) * 1.2, 12 + i * 7, 'intro');
    this._pickup('shield', -7, 30, 'intro');
    this._pickup('gold', 8, 44, 'intro');
    this._pickup('rocket', -12, 52, 'intro');
  }

  start() {
    this._reset('countdown');
    this._event('countdown', { value: 3, text: '3' });
  }
  restart() { this.start(); }
  // A selection never rewrites an active run; it is applied by start/restart.
  setLevel(id) { this.level=getLevel(id).id; }
  setPlayground(id) { this.playground=Object.hasOwn(PLAYGROUNDS,id)?id:'yard'; }
  setVehicle(index) {
    const selected = Math.round(Number(index));
    this.vehicle = Number.isFinite(selected) ? clamp(selected, 0, VEHICLES.length - 1) : 0;
    this.state.vehicle = this.vehicle;
  }
  garage() { this._reset('garage'); }
  pause() {
    if (this.state.mode === 'playing' || this.state.mode === 'countdown') {
      this._resumeMode = this.state.mode;
      this.state.mode = 'paused';
    }
  }
  resume() { if (this.state.mode === 'paused') this.state.mode = this._resumeMode || 'playing'; }
  drainEvents() { return this._events.splice(0); }
  _event(type, data = {}) {
    const p = this.state.player;
    this._events.push({ type, x: p.x, z: p.z, ...data });
    // Avoid retaining unbounded feedback if a consumer is temporarily suspended.
    if (this._events.length > 150) this._events.splice(0, this._events.length - 150);
  }

  update(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const s = this.state;
    if (s.mode === 'countdown') {
      s.countdown = Math.max(0, s.countdown - Math.min(dt, 0.25));
      const count = Math.ceil(s.countdown);
      if (count !== this._lastCountdown) {
        this._lastCountdown = count;
        this._event('countdown', { value: count, text: count ? String(count) : 'GO!' });
      }
      if (s.countdown === 0) { s.mode = 'playing'; this._spawnRival(); this._spawnRival(); }
      return;
    }
    if (s.mode !== 'playing') return;
    // Ignore tab-suspension gaps rather than letting the car teleport or take burst damage.
    let left = Math.min(dt, 0.1);
    while (left > 0.000001 && s.mode === 'playing') {
      const step = Math.min(left, 1 / 60);
      this._step(step, input);
      left -= step;
    }
  }

  _step(dt, input) {
    const s = this.state, p = s.player, t = this._timers;
    const vehicle = VEHICLES[this.vehicle];
    const grip=PLAYGROUNDS[s.playground].grip;
    s.elapsed += dt;
    for (const key of Object.keys(t)) t[key] = Math.max(0, t[key] - dt);
    if (t.combo === 0 && s.combo) { s.combo = 0; s.multiplier = 1; }
    p.shield = Math.max(0, p.shield - dt * 2.5);

    const throttle = clamp(Number(input.throttle) || 0, -1, 1);
    const steer = clamp(Number(input.steer) || 0, -1, 1);
    let fx = Math.sin(p.angle), fz = Math.cos(p.angle);
    let longitudinal = p.vx * fx + p.vz * fz;
    const turnGrip = clamp(Math.abs(longitudinal) / 7, 0, 1);
    const direction = longitudinal < -0.8 ? -1 : 1;
    p.angle = wrapAngle(p.angle + steer * direction * turnGrip * (vehicle.turn - Math.min(Math.abs(longitudinal), 47) * 0.012) * dt);
    fx = Math.sin(p.angle); fz = Math.cos(p.angle);
    const sx = Math.cos(p.angle), sz = -Math.sin(p.angle);
    longitudinal = p.vx * fx + p.vz * fz;
    let lateral = p.vx * sx + p.vz * sz;
    p.boosting = !!input.boost && throttle > 0 && p.nitro > 0.5;
    const maximum = p.boosting ? vehicle.boost : vehicle.speed;
    const acceleration = p.boosting ? vehicle.acceleration + 18 : vehicle.acceleration;
    if (throttle < 0 && longitudinal > 2) longitudinal += throttle * 49 * grip * dt;
    else longitudinal += throttle * acceleration * dt;
    longitudinal *= Math.exp(-(throttle ? 0.42 : 1.1) * dt);
    longitudinal = clamp(longitudinal, -10, maximum);
    // Lateral grip falls while steering: the rear steps out without losing control.
    lateral *= Math.exp(-(Math.abs(steer) > 0.15 && Math.abs(longitudinal) > 9 ? 2.15 : 7.5) * grip * dt);
    p.vx = fx * longitudinal + sx * lateral;
    p.vz = fz * longitudinal + sz * lateral;
    p.speed = Math.hypot(p.vx, p.vz);
    s.speedKph = Math.round(p.speed * 5.1);
    p.drifting = p.speed > 10 && Math.abs(lateral) > 1.35 && Math.abs(steer) > 0.1;
    if (p.drifting) { s.driftTime += dt; s.score += dt * 0.45 * s.multiplier; }
    p.nitro = clamp(p.nitro + (p.boosting ? -28 : 7) * dt, 0, 100);
    if (input.jump && t.jump === 0 && p.y <= 0.01) {
      p.vy = 9; t.jump = 1.4; this._event('jump', { text: 'AIR TIME' });
    }
    if (p.y > 0 || p.vy > 0) {
      p.vy -= 23 * dt; p.y += p.vy * dt;
      s.airTime += dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; }
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    s.distance += p.speed * dt;
    s.score += p.speed * dt * 0.004;
    if (input.rocket && t.rocket === 0 && p.rockets > 0) this._fireRocket(p, 'player');
    if (input.bomb && t.bomb === 0 && p.bombs > 0) {
      p.bombs--; t.bomb = 0.9;
      s.projectiles.push({ id: ++this._id, kind: 'bomb', x: p.x - fx * 3.5, z: p.z - fz * 3.5, y: 0.3, angle: p.angle, age: 0, owner: 'player', vx: -fx * 2, vz: -fz * 2 });
      this._event('bomb', { text: 'BOMB DEPLOYED' });
    }
    this._updateRivals(dt);
    this._updateObjects(dt);
    this._updateProjectiles(dt);
    this._collectPickups(dt);
    this._progress();
    if(s.objective) s.objective.value=Math.min(s.objective.target,Math.max(0,s[s.objective.metric]||0));
    if (t.stream === 0) { this._stream(); t.stream = 0.6; }
    const target = Math.min(6, 2 + s.stage);
    if (t.rivals === 0 && s.rivals.length < target) { this._spawnRival(); t.rivals = 5.5; }
    if(p.hp<=0) this._finish(false);
    else if(s.objective&&s.objective.value>=s.objective.target) this._finish(true);
  }

  _finish(won=false) {
    const s=this.state,p=s.player;
    if(s.mode!=='playing'||s.baseScore!==null) return;
    s.won=!!won;s.mode='over';p.boosting=false;
    if(!won) {p.hp=0;this._event('explosion',{size:8,text:'WRECKED'});}
    s.baseScore=Math.floor(s.score);
    const [design,usability,creativity,content]=s.performance;
    const weightedPerformance=(.4*design+.3*usability+.2*creativity+.1*content)/100;
    s.styleBonus=Math.round(s.baseScore*weightedPerformance);
    s.score=s.baseScore+s.styleBonus;
    this._event('over',{score:s.score,baseScore:s.baseScore,styleBonus:s.styleBonus,performance:[...s.performance],won:s.won,level:s.level,text:won?'MISSION COMPLETE':'RUN COMPLETE'});
  }

  _reward(points, combo = true) {
    const s = this.state;
    if (combo) {
      s.combo++;
      s.multiplier = Math.min(5, 1 + Math.floor(s.combo / 5));
      this._timers.combo = 6;
    }
    s.score += points * s.multiplier;
  }

  _pickup(kind, x, z, cell) {
    this.state.pickups.push({ id: ++this._id, kind, x, z, age: 0, cell });
  }

  _collectPickups(dt) {
    const s = this.state, p = s.player;
    s.pickups = s.pickups.filter(item => {
      item.age += dt;
      const d2 = distance2(p, item);
      // Mild magnetism feels generous at speed, but special pickups still need aiming.
      if ((item.kind === 'like' || item.kind === 'gold') && d2 < 70 && p.y < 3) {
        const pull = Math.min(1, dt * 7);
        item.x += (p.x - item.x) * pull; item.z += (p.z - item.z) * pull;
      }
      if (distance2(p, item) > 8 || p.y > 3.2) return true;
      let text;
      switch (item.kind) {
        case 'like': s.likes++; this._reward(2); text = 'LIKE +1'; break;
        case 'gold': s.likes += 5; this._reward(10); text = 'GOLD LIKE +5'; break;
        case 'health': p.hp = Math.min(100, p.hp + 30); this._reward(1, false); text = 'REPAIRED +30'; break;
        case 'shield': p.shield = 100; text = 'SHIELD ONLINE'; break;
        case 'rocket': p.rockets = Math.min(30, p.rockets + 5); text = 'ROCKETS +5'; break;
        case 'bomb': p.bombs = Math.min(12, p.bombs + 2); text = 'BOMBS +2'; break;
        case 'nitro': p.nitro = Math.min(100, p.nitro + 55); text = 'NITRO +55'; break;
      }
      this._event('collect', { x: item.x, z: item.z, kind: item.kind, text, value: item.kind === 'gold' ? 5 : 1 });
      return false;
    });
  }

  _fireRocket(car, owner) {
    const s = this.state;
    const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    s.projectiles.push({ id: ++this._id, kind: 'rocket', x: car.x + fx * 3.4, z: car.z + fz * 3.4, y: 0.9, angle: car.angle, age: 0, owner, speed: owner === 'player' ? 75 : 43 });
    if (owner === 'player') {
      car.rockets--; this._timers.rocket = 0.36;
      this._event('rocket', { text: 'ROCKET LAUNCHED' });
    }
  }

  _spawnRival() {
    const s = this.state, p = s.player;
    const a = this._range(0, TAU), radius = this._range(38, 56);
    const boss = s.stage >= 2 && !s.rivals.some(c => c.boss) && this._random() < 0.32;
    const x = p.x + Math.sin(a) * radius, z = p.z + Math.cos(a) * radius;
    s.rivals.push({ id: ++this._id, x, z, angle: Math.atan2(p.x - x, p.z - z), vx: 0, vz: 0, y: 0, hp: boss ? 210 : 65, maxHp: boss ? 210 : 65, boss, speed: 0, fireTimer: this._range(4, 9), hitTimer: 0, wobble: this._range(0, TAU) });
    if (boss) this._event('boss', { x, z, text: 'BOSS INBOUND' });
  }

  _updateRivals(dt) {
    const s = this.state, p = s.player;
    for (const car of s.rivals) {
      if (car.hp <= 0) continue;
      const dx = p.x - car.x, dz = p.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d > 155) {
        const a = this._range(0, TAU);
        car.x = p.x + Math.sin(a) * 65; car.z = p.z + Math.cos(a) * 65;
      }
      const aim = Math.atan2(dx + p.vx * 0.3, dz + p.vz * 0.3);
      const delta = wrapAngle(aim - car.angle);
      car.angle = wrapAngle(car.angle + clamp(delta, -dt * 2.1, dt * 2.1));
      const maxSpeed = 16 + s.stage * 1.7 + (car.boss ? 1.5 : 0);
      const desired = maxSpeed * (Math.abs(delta) > 1.3 ? 0.55 : 1);
      car.speed += (desired - car.speed) * Math.min(1, dt * 1.6);
      const targetVx = Math.sin(car.angle) * car.speed, targetVz = Math.cos(car.angle) * car.speed;
      car.vx += (targetVx - car.vx) * Math.min(1, dt * 4);
      car.vz += (targetVz - car.vz) * Math.min(1, dt * 4);
      car.x += car.vx * dt; car.z += car.vz * dt;
      car.hitTimer = Math.max(0, car.hitTimer - dt);
      car.fireTimer -= dt;
      if (s.stage >= 2 && car.fireTimer <= 0 && d < 65 && Math.abs(delta) < 0.38) {
        this._fireRocket(car, car.id); car.fireTimer = this._range(5, 9) / (1 + s.stage * 0.12);
      }
      const radius = car.boss ? 4.2 : 3.4;
      if (distance2(car, p) < radius * radius && p.y < 2) {
        const len = Math.max(0.01, Math.hypot(p.x - car.x, p.z - car.z));
        const nx = len < 0.02 ? 1 : (p.x - car.x) / len, nz = len < 0.02 ? 0 : (p.z - car.z) / len;
        const overlap = radius - len;
        p.x += nx * overlap * 0.55; p.z += nz * overlap * 0.55;
        car.x -= nx * overlap * 0.45; car.z -= nz * overlap * 0.45;
        const relativeSpeed = Math.hypot(p.vx - car.vx, p.vz - car.vz);
        p.vx += nx * 7; p.vz += nz * 7;
        car.vx -= nx * 11; car.vz -= nz * 11;
        if (car.hitTimer === 0) {
          car.hitTimer = 0.9;
          car.hp -= Math.max(5, relativeSpeed * (p.boosting ? 2.2 : 0.95));
          this._hurtPlayer(car.boss ? 12 : 7, 'RAMMED');
          this._event('hit', { x: (p.x + car.x) / 2, z: (p.z + car.z) / 2, text: p.boosting ? 'NITRO RAM' : 'COLLISION' });
        }
      }
    }
    // Rivals separate instead of occupying exactly the same space while pursuing.
    for (let i = 0; i < s.rivals.length; i++) for (let j = i + 1; j < s.rivals.length; j++) {
      const a = s.rivals[i], b = s.rivals[j], dx = a.x - b.x, dz = a.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < 3.5) {
        const force = (3.5 - d) * 0.35;
        a.x += dx / d * force; a.z += dz / d * force;
        b.x -= dx / d * force; b.z -= dz / d * force;
      }
    }
    this._removeDefeated();
  }

  _hurtPlayer(amount, reason) {
    const p = this.state.player;
    if (this._timers.hurt > 0) return;
    amount *= VEHICLES[this.vehicle].damage;
    this._timers.hurt = 0.55;
    const absorbed = Math.min(p.shield, amount);
    p.shield -= absorbed;
    p.hp = Math.max(0, p.hp - (amount - absorbed));
    this._event('damage', { value: amount - absorbed, text: absorbed === amount ? 'SHIELD HIT' : reason });
  }

  _removeDefeated() {
    const s = this.state;
    s.rivals = s.rivals.filter(car => {
      if (car.hp > 0) return true;
      s.defeats++; this._reward(car.boss ? 22 : 7);
      this._event('defeat', { x: car.x, z: car.z, boss: car.boss, text: car.boss ? 'BOSS DEFEATED' : 'RIVAL DEFEATED', value: car.boss ? 22 : 7 });
      this._event('explosion', { x: car.x, z: car.z, size: car.boss ? 9 : 6 });
      for (let i = 0; i < (car.boss ? 7 : 3); i++) this._pickup(i === 0 && car.boss ? 'gold' : 'like', car.x + this._range(-4, 4), car.z + this._range(-4, 4), 'loot');
      if (this._random() < 0.55) this._pickup('health', car.x + 4, car.z + 2, 'loot');
      return false;
    });
  }

  _updateObjects(dt) {
    const s = this.state, p = s.player;
    s.obstacles = s.obstacles.filter(o => {
      o.x += o.vx * dt; o.z += o.vz * dt;
      o.vx *= Math.exp(-dt * 2.5); o.vz *= Math.exp(-dt * 2.5);
      if (o.y > 0 || o.vy > 0) {
        o.vy -= dt * 20; o.y += o.vy * dt;
        if (o.y < 0) { o.y = 0; o.vy = -o.vy * 0.15; if (o.vy < 0.5) o.vy = 0; }
        o.angle += dt * (o.vx + o.vz) * 0.3;
      }
      if (o.broken) return false;
      const r = 1.45 + o.size * 0.55;
      if (distance2(o, p) < r * r && p.y < o.size + 0.8) {
        const impact = p.speed;
        const dx = o.x - p.x, dz = o.z - p.z, d = Math.max(0.01, Math.hypot(dx, dz));
        const nx = d < 0.02 ? Math.sin(p.angle) : dx / d, nz = d < 0.02 ? Math.cos(p.angle) : dz / d;
        o.x += nx * (r - d + 0.15); o.z += nz * (r - d + 0.15);
        o.vx += p.vx * 0.75 + nx * 4; o.vz += p.vz * 0.75 + nz * 4;
        if (impact > 8) {
          o.vy = impact * 0.35; o.y += 0.1;
          if (!o.hit) {
            s.destruction++; this._reward(o.kind === 'pillar' ? 1.5 : 0.6);
            this._event('smash', { x: o.x, z: o.z, kind: o.kind, text: 'SMASH', value: 1 });
          }
          p.vx *= 0.93; p.vz *= 0.93;
          if (o.kind === 'barrel') {
            o.broken = true;
            this._explode(o.x, o.z, 8, 34, 'player');
            return false;
          }
          // Flying debris remains physical briefly, then streams out normally.
          o.hit = true;
        } else {
          p.vx *= 0.92; p.vz *= 0.92;
        }
      }
      return true;
    });
  }

  _updateProjectiles(dt) {
    const s = this.state, p = s.player;
    s.projectiles = s.projectiles.filter(shot => {
      shot.age += dt;
      if (shot.kind === 'bomb') {
        shot.x += shot.vx * dt; shot.z += shot.vz * dt;
        if (shot.age >= 0.95) { this._explode(shot.x, shot.z, 13, 95, shot.owner); return false; }
        return true;
      }
      shot.x += Math.sin(shot.angle) * shot.speed * dt;
      shot.z += Math.cos(shot.angle) * shot.speed * dt;
      if (shot.age > 2.8) return false;
      if (shot.owner === 'player') {
        const car = s.rivals.find(r => r.hp > 0 && distance2(r, shot) < (r.boss ? 10 : 6));
        if (car) { this._explode(shot.x, shot.z, 6.5, 46, 'player'); return false; }
      } else if (p.y < 2.1 && distance2(p, shot) < 5) {
        this._explode(shot.x, shot.z, 5.5, 15, shot.owner); return false;
      }
      const object = s.obstacles.find(o => !o.broken && distance2(o, shot) < (o.size * 0.65 + 0.5) ** 2);
      if (object) { this._explode(shot.x, shot.z, 6, shot.owner === 'player' ? 40 : 15, shot.owner); return false; }
      return true;
    });
    this._removeDefeated();
  }

  _explode(x, z, radius, damage, owner) {
    const s = this.state, p = s.player;
    this._event('explosion', { x, z, size: radius, text: radius > 10 ? 'BOOM!' : '' });
    for (const car of s.rivals) {
      const dx = car.x - x, dz = car.z - z, d = Math.hypot(dx, dz);
      if (d < radius + (car.boss ? 2 : 0) && owner !== car.id) {
        car.hp -= damage * (0.4 + 0.6 * (1 - Math.min(1, d / radius)));
        if (d > 0) { car.vx += dx / d * 25; car.vz += dz / d * 25; }
      }
    }
    if (owner !== 'player' && Math.hypot(p.x - x, p.z - z) < radius && p.y < 3) this._hurtPlayer(damage, 'ROCKET HIT');
    for (const o of s.obstacles) {
      if (o.broken) continue;
      const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz);
      if (d < radius) {
        const force = 1 - d / radius;
        const len = Math.max(0.1, d);
        o.vx += dx / len * force * 38; o.vz += dz / len * force * 38;
        o.vy += force * 13; o.y += 0.05;
        if (!o.hit && owner === 'player') { s.destruction++; this._reward(0.45, false); }
        o.hit = true;
      }
    }
  }

  _progress() {
    const s = this.state;
    s.performance = [
      Math.min(100, s.destruction * 3),
      Math.min(100, s.distance / 15),
      Math.min(100, s.airTime * 8 + s.driftTime * 1.2),
      Math.min(100, s.defeats * 12),
    ];
    const nextStage = Math.min(5, STAGE_SCORES.filter(value => s.score >= value).length);
    if (nextStage > s.stage) {
      s.stage = nextStage;
      s.nextStageScore = STAGE_SCORES[nextStage] ?? null;
      if (s.player.hp > 0) s.player.hp = Math.min(100, s.player.hp + 15);
      s.player.rockets = Math.min(30, s.player.rockets + 3);
      s.paletteIndex = (s.stage - 1) * 3 + this._paletteTick % 3;
      this._event('stage', { value: nextStage, text: ['','IGNITION','OVERDRIVE','AFTERBURN','REDLINE','APEX'][nextStage] });
      if (nextStage >= 2 && !s.rivals.some(r => r.boss)) {
        this._spawnRival();
        const last = s.rivals[s.rivals.length - 1];
        last.boss = true; last.hp = 210 + (nextStage - 2) * 35; last.maxHp = last.hp;
        this._event('boss', { x: last.x, z: last.z, text: 'BOSS INBOUND' });
      }
    }
    const tick = Math.floor(s.elapsed / 20);
    if (tick !== this._paletteTick) {
      this._paletteTick = tick;
      s.paletteIndex = (s.stage - 1) * 3 + tick % 3;
      this._event('palette', { value: s.paletteIndex, text: 'ARENA SHIFT' });
    }
  }

  _stream(initial = false) {
    const s = this.state, p = s.player, side = 30;
    const playground=PLAYGROUNDS[s.playground];
    const cx = Math.floor(p.x / side), cz = Math.floor(p.z / side);
    const active = new Set();
    for (let ix = cx - 2; ix <= cx + 2; ix++) for (let iz = cz - 2; iz <= cz + 2; iz++) {
      const cell = `${ix},${iz}`;
      active.add(cell);
      if (this._cells.has(cell)) continue;
      const count = playground.count;
      for (let i = 0; i < count; i++) {
        // City props hug block edges, leaving continuous avenues through the grid.
        const offsetX=s.playground==='city'?(i%2?this._range(22,27):this._range(3,8)):this._range(2,28);
        const x = ix * side + offsetX, z = iz * side + this._range(2, 28);
        if (Math.hypot(x - p.x, z - p.z) < (initial ? 13 : 23)) continue;
        if(s.playground==='road' && Math.abs(x)<12)continue;
        const kind = playground.propKinds[Math.floor(this._random() * playground.propKinds.length)];
        const size = kind === 'pillar' ? this._range(2, 3.5) : kind === 'cone' ? 1.1 : this._range(1.3, 2.2);
        s.obstacles.push({ id: ++this._id, cell, x, z, kind, size, angle: this._range(0, TAU), vx: 0, vz: 0, y: 0, vy: 0, hit: false });
      }
      for (let i = 0; i < 3; i++) {
        const roll = this._random();
        const kind = roll < 0.59 ? 'like' : roll < 0.68 ? 'gold' : roll < 0.77 ? 'nitro' : roll < 0.84 ? 'rocket' : roll < 0.91 ? 'health' : roll < 0.96 ? 'shield' : 'bomb';
        this._pickup(kind, ix * side + this._range(2, 28), iz * side + this._range(2, 28), cell);
      }
    }
    this._cells = active;
    s.obstacles = s.obstacles.filter(o => distance2(o, p) < 145 ** 2 && (active.has(o.cell) || o.y > 0));
    s.pickups = s.pickups.filter(o => distance2(o, p) < 145 ** 2 && (active.has(o.cell) || o.cell === 'intro' || o.cell === 'loot'));
  }
}

export { STAGE_SCORES, VEHICLES };
