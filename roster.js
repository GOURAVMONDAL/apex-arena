// Shared by the garage, renderer and driving simulation; saved indices stay stable.
export const VEHICLE_ROSTER = [
  {name:'VELO',type:'HELMET RACER / PURPLE STRIPE',color:'#7650d6',stats:[72,88,64],speed:28,boost:44,acceleration:31,turn:1.9,damage:1},
  {name:'STELLA',type:'STAR RACER / GOLD RUSH',color:'#ffc329',stats:[55,63,98],speed:25,boost:40,acceleration:27,turn:1.65,damage:.65},
  {name:'EMBER',type:'HELMET RACER / AFTERBURN',color:'#ff743c',stats:[98,75,45],speed:31,boost:47,acceleration:34,turn:2.1,damage:1.18},
  {name:'DUNE',type:'TRAIL BUGGY / ROLL CAGE',color:'#91b84b',stats:[65,72,90],speed:26,boost:41,acceleration:32,turn:1.8,damage:.72},
  {name:'GLACIER',type:'WIDE BODY / PRECISION',color:'#54d9ed',stats:[82,96,58],speed:29,boost:45,acceleration:30,turn:2.35,damage:1.05},
  {name:'SPECTRE',type:'AERO RACER / NIGHT RUNNER',color:'#e759ac',stats:[100,68,40],speed:33,boost:50,acceleration:36,turn:1.7,damage:1.3},
];
export const vehicleIndex = value => Number.isFinite(Number(value)) ? Math.max(0,Math.min(VEHICLE_ROSTER.length-1,Math.round(Number(value)))) : 0;
