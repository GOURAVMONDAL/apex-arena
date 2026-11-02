// Mission definitions are shared by the garage, HUD and renderer-independent game.
export const LEVELS = Object.freeze([
  {id:0,name:'Free roam',objective:'Drive until the arena takes you.',metric:null,target:0,difficulty:1,playground:'yard'},
  {id:1,name:'First contact',objective:'Collect 10 likes',metric:'likes',target:10,difficulty:1,playground:'yard'},
  {id:2,name:'Demolition',objective:'Smash 12 props',metric:'destruction',target:12,difficulty:1,playground:'yard'},
  {id:3,name:'Neon sprint',objective:'Drive 1,200 metres',metric:'distance',target:1200,difficulty:2,playground:'city'},
  {id:4,name:'Bounty',objective:'Defeat 5 rivals',metric:'defeats',target:5,difficulty:2,playground:'city'},
  {id:5,name:'Dune runner',objective:'Survive 90 seconds',metric:'elapsed',target:90,difficulty:2,playground:'desert'},
  {id:6,name:'Frost king',objective:'Earn 500 arena points',metric:'score',target:500,difficulty:3,playground:'ice'},
].map(Object.freeze));

export function getLevel(id) { return LEVELS.find(level=>level.id===Number(id)) || LEVELS[0]; }
