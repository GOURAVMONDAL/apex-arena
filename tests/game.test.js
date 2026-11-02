import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaGame } from '../game.js';

function advance(game, seconds, input = {}) {
  for (let n = 0; n < Math.round(seconds * 60); n++) game.update(1 / 60, input);
}
function running() {
  const game = new ArenaGame({ seed: 42 });
  game.start(); advance(game, 3.1);
  game.state.obstacles = [];
  game.state.pickups = [];
  game.state.rivals = [];
  game._timers.stream = 10; game._timers.rivals = 10;
  game.drainEvents();
  return game;
}

test('countdown transitions into a new playable run and restart resets inventory and score', () => {
  const game = new ArenaGame({ seed: 4 });
  assert.equal(game.state.mode, 'garage');
  game.start();
  assert.equal(game.state.mode, 'countdown');
  advance(game, 2);
  assert.equal(game.state.mode, 'countdown');
  advance(game, 1.1);
  assert.equal(game.state.mode, 'playing');
  game.state.score = 400; game.state.player.hp = 1; game.state.player.rockets = 0;
  game.restart();
  assert.equal(game.state.score, 0);
  assert.equal(game.state.player.hp, 100);
  assert.equal(game.state.player.rockets, 8);
  assert.equal(game.state.rivals.length, 0);
});

test('pause freezes countdown and simulation and resumes the previous mode', () => {
  const game = new ArenaGame({ seed: 2 });
  game.start(); advance(game, 1);
  const countdown = game.state.countdown;
  game.pause(); advance(game, 10);
  assert.equal(game.state.countdown, countdown);
  game.resume(); assert.equal(game.state.mode, 'countdown');
  advance(game, 3); game.pause();
  const elapsed = game.state.elapsed;
  advance(game, 2, { throttle: 1 });
  assert.equal(game.state.elapsed, elapsed);
  game.resume(); assert.equal(game.state.mode, 'playing');
});

test('driving, steering, nitro and jumping change the physical state without invalid numbers', () => {
  const game = running();
  advance(game, 2, { throttle: 1 });
  assert.ok(game.state.player.z > 20);
  assert.ok(game.state.player.speed <= 28.1);
  const beforeNitro = game.state.player.nitro;
  advance(game, 1, { throttle: 1, boost: true, steer: 0.5 });
  assert.ok(game.state.player.nitro < beforeNitro);
  assert.ok(game.state.player.angle > 0.1);
  game.update(1 / 60, { jump: true });
  assert.ok(game.state.player.y > 0);
  advance(game, 2);
  assert.equal(game.state.player.y, 0);
  assert.ok(Object.values(game.state.player).filter(v => typeof v === 'number').every(Number.isFinite));
});

test('pickups update resources and apply combo multipliers', () => {
  const game = running(); const p = game.state.player;
  p.hp = 40; p.nitro = 5; p.rockets = 0; p.bombs = 0;
  for (const kind of ['like', 'gold', 'health', 'shield', 'rocket', 'bomb', 'nitro']) {
    game.state.pickups.push({ id: kind, x: p.x, z: p.z, kind, age: 0, cell: 'loot' });
    game.update(1 / 60);
  }
  assert.equal(game.state.likes, 6);
  assert.equal(p.hp, 70);
  assert.ok(p.shield > 99);
  assert.equal(p.rockets, 5); assert.equal(p.bombs, 2);
  assert.ok(p.nitro > 55);
  assert.equal(game.state.pickups.length, 0);
  assert.equal(game.drainEvents().filter(e => e.type === 'collect').length, 7);
});

test('weapon ammunition and cooldowns prevent continuous free firing', () => {
  const game = running(); const p = game.state.player;
  advance(game, 0.1, { rocket: true, bomb: true });
  assert.equal(p.rockets, 7); assert.equal(p.bombs, 2);
  assert.equal(game.state.projectiles.filter(s => s.kind === 'rocket').length, 1);
  advance(game, 1.1);
  assert.equal(game.state.projectiles.filter(s => s.kind === 'bomb').length, 0);
  assert.ok(game.drainEvents().some(e => e.type === 'explosion' && e.size === 13));
});

test('rockets damage rivals, defeated cars drop loot and award combat score', () => {
  const game = running();
  game.state.rivals.push({ id: 'target', x: 0, z: 9, angle: Math.PI, vx: 0, vz: 0, y: 0, hp: 1, maxHp: 65, boss: false, speed: 0, fireTimer: 100, hitTimer: 100 });
  game.update(1 / 60, { rocket: true });
  advance(game, 0.2);
  assert.equal(game.state.defeats, 1);
  assert.equal(game.state.rivals.length, 0);
  assert.ok(game.state.score >= 7);
  assert.ok(game.state.pickups.length >= 3);
});

test('stage progression awards resources, spawns a boss and changes palette on schedule', () => {
  const game = running();
  game.state.score = 105;
  game.update(1 / 60);
  assert.equal(game.state.stage, 3);
  assert.equal(game.state.nextStageScore, 200);
  assert.ok(game.state.rivals.some(r => r.boss));
  assert.equal(game.state.paletteIndex, 6);
  game.state.elapsed = 19.99;
  game.update(1 / 60);
  assert.equal(game.state.paletteIndex, 7);
  assert.ok(game.drainEvents().some(e => e.type === 'stage' && e.value === 3));
});

test('shield absorbs damage and death produces exactly one game-over transition', () => {
  const game = running(); const p = game.state.player;
  p.shield = 15;
  game._hurtPlayer(10, 'HIT');
  assert.equal(p.hp, 100); assert.equal(p.shield, 5);
  game._timers.hurt = 0; game._hurtPlayer(200, 'HIT');
  game.update(1 / 60);
  assert.equal(game.state.mode, 'over');
  advance(game, 2);
  assert.equal(game.drainEvents().filter(e => e.type === 'over').length, 1);
});

test('streamed scenery stays bounded during long-distance travel', () => {
  const game = running();
  for (let i = 0; i < 40; i++) {
    game.state.player.x = i * 80;
    game._stream();
    assert.ok(game.state.obstacles.length <= 140);
    assert.ok(game.state.pickups.length <= 100);
  }
});

test('an already-smashed prop cannot farm repeated destruction rewards', () => {
  const game = running(), p = game.state.player;
  game.state.obstacles.push({ id: 'prop', x: 0, z: 1, kind: 'crate', size: 2, angle: 0, vx: 0, vz: 0, y: 0, vy: 0, hit: false });
  p.speed = 20; p.vz = 20;
  game._updateObjects(1 / 60);
  assert.equal(game.state.destruction, 1);
  const prop = game.state.obstacles[0];
  prop.x = p.x; prop.z = p.z + 1; prop.y = 0;
  game._updateObjects(1 / 60);
  assert.equal(game.state.destruction, 1);
});

test('car presets affect driving and armor and survive restarts', () => {
  const bruiser = running(), phantom = running();
  bruiser.setVehicle(1); phantom.setVehicle(2);
  advance(bruiser, 3, { throttle: 1 }); advance(phantom, 3, { throttle: 1 });
  assert.ok(phantom.state.player.speed > bruiser.state.player.speed);
  bruiser._hurtPlayer(10, 'HIT'); phantom._hurtPlayer(10, 'HIT');
  assert.ok(bruiser.state.player.hp > phantom.state.player.hp);
  bruiser.restart();
  assert.equal(bruiser.vehicle, 1);
});

test('final style bonus uses the four displayed weights exactly once', () => {
  const game = running(), s = game.state;
  Object.assign(s, { score: 200.9, destruction: 10, distance: 750, airTime: 5, driftTime: 10, defeats: 4 });
  s.player.hp = 0;
  game.update(1 / 60);
  assert.deepEqual(s.performance, [30, 50, 52, 48]);
  assert.equal(s.baseScore, 200);
  // (30*40% + 50*30% + 52*20% + 48*10%)/100 = 0.422.
  assert.equal(s.styleBonus, 84);
  assert.equal(s.score, 284);
  assert.equal(s.mode, 'over');
  const event = game.drainEvents().find(e => e.type === 'over');
  assert.equal(event.styleBonus, 84);
  assert.equal(event.score, 284);
  advance(game, 5);
  assert.equal(s.score, 284);
  assert.equal(s.styleBonus, 84);
  assert.equal(game.drainEvents().filter(e => e.type === 'over').length, 0);
});

test('performance gauges cap at100 and a new run clears the final bonus', () => {
  const game = running(), s = game.state;
  Object.assign(s, { score: 10, destruction: 100, distance: 2000, airTime: 20, driftTime: 100, defeats: 20 });
  s.player.hp = 0;
  game.update(1 / 60);
  assert.deepEqual(s.performance, [100, 100, 100, 100]);
  assert.equal(s.styleBonus, 10);
  assert.equal(s.score, 20);
  game.restart();
  assert.deepEqual(game.state.performance, [0, 0, 0, 0]);
  assert.equal(game.state.baseScore, null);
  assert.equal(game.state.styleBonus, 0);
});
