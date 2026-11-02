import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaGame } from '../game.js';
import { LEVELS,getLevel } from '../levels.js';
import { PLAYGROUNDS } from '../playgrounds.js';
function running(level=0) {
  const game=new ArenaGame({seed:42});game.setLevel(level);game.start();
  for(let i=0;i<190;i++) game.update(1/60);
  game.state.obstacles=[];game.state.pickups=[];game.state.rivals=[];
  game._timers.stream=999;game._timers.rivals=999;game.drainEvents();return game;
}
test('six missions have distinct objectives and valid world assignments',()=>{
  assert.deepEqual(LEVELS.map(l=>l.id),[0,1,2,3,4,5,6]);
  assert.equal(new Set(LEVELS.slice(1).map(l=>l.metric)).size,6);
  assert.equal(getLevel('3').name,'Neon sprint');assert.equal(getLevel(999).id,0);
  for(const level of LEVELS.slice(1)) {assert.ok(level.target>0);assert.ok(['yard','city','desert','ice'].includes(level.playground));}
});
test('each mission ends successfully at its goal and freezes the style bonus once',()=>{
  for(const level of LEVELS.slice(1)) {
    const game=running(level.id),s=game.state;
    assert.equal(s.level,level.id);assert.equal(s.objective.metric,level.metric);
    assert.ok(s.stage>=level.difficulty);
    s[level.metric]=level.target-1;
    game.update(1/60);assert.equal(s.mode,'playing',level.name);
    s[level.metric]=level.target;
    game.update(1/60);assert.equal(s.mode,'over',level.name);assert.equal(s.won,true);
    assert.equal(s.objective.value,level.target);assert.ok(s.player.hp>0);
    const score=s.score,bonus=s.styleBonus;
    for(let i=0;i<120;i++) game.update(1/60);
    game._finish(true);assert.equal(s.score,score);assert.equal(s.styleBonus,bonus);
    assert.equal(game.drainEvents().filter(e=>e.type==='over').length,1);
    game.restart();assert.equal(game.state.level,level.id);assert.equal(game.state.won,false);assert.equal(game.state.objective.value,0);
  }
});
test('free roam stays endless and changing the mission only affects the next run',()=>{
  const game=running(),s=game.state;
  Object.assign(s,{likes:50,destruction:50,distance:2000,defeats:10,elapsed:100,score:1000});
  game.update(1/60);assert.equal(s.mode,'playing');assert.equal(s.objective,null);
  game.setLevel(2);assert.equal(s.level,0);assert.equal(s.objective,null);
  game.restart();assert.equal(game.state.level,2);assert.equal(game.state.objective.metric,'destruction');
});
test('wrecking at the target is a loss and paused missions make no progress',()=>{
  const game=running(5),s=game.state;s.elapsed=89;
  game.pause();game.update(.1);assert.equal(s.elapsed,89);game.resume();
  s.elapsed=90;s.player.hp=0;game.update(1/60);
  assert.equal(s.mode,'over');assert.equal(s.won,false);
});
test('playground selection snapshots on reset and missions choose their own venue',()=>{
  const game=running();game.setPlayground('ice');assert.equal(game.state.playground,'yard');
  game.restart();assert.equal(game.state.playground,'ice');
  game.setLevel(3);game.restart();assert.equal(game.state.playground,'city');
  game.setLevel(0);game.restart();assert.equal(game.state.playground,'ice');
  game.setPlayground('missing');game.restart();assert.equal(game.state.playground,'yard');
});
test('playgrounds stream distinct prop families within bounded cells',()=>{
  for(const id of Object.keys(PLAYGROUNDS)) {
    const game=new ArenaGame({seed:42});game.setPlayground(id);game.start();
    assert.ok(game.state.obstacles.length>0);
    assert.ok(game.state.obstacles.every(o=>PLAYGROUNDS[id].propKinds.includes(o.kind)));
    assert.ok(game.state.obstacles.length<=25*PLAYGROUNDS[id].count);
  }
});
test('ice retains more lateral momentum than the city surface',()=>{
  function lateral(id) {
    const game=running();game.setPlayground(id);game.start();for(let i=0;i<190;i++) game.update(1/60);
    game.state.obstacles=[];game.state.rivals=[];game.state.pickups=[];
    game._timers.stream=999;game._timers.rivals=999;
    game.state.player.vx=10;game.state.player.vz=20;
    game.update(.1,{throttle:1});return game.state.player.vx;
  }
  assert.ok(lateral('ice')>lateral('city'));
});
