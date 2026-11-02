import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PLAYGROUNDS, PlaygroundScenery } from './playgrounds.js';
import { createVehicle, animateVehicle, radialTexture, disposeVehicle } from './vehicles.js';

export const PALETTES = [
  ['#202822', '#d3fa5b'], ['#23182d', '#c69aff'], ['#192c34', '#78deed'],
  ['#361e29', '#ff6c97'], ['#142d28', '#6ce7b6'], ['#30291b', '#f2c86d'],
  ['#232640', '#9da8ff'], ['#302020', '#ff997a'], ['#182b33', '#77c4ff'],
  ['#29203d', '#ed8bff'], ['#173530', '#b2ffb1'], ['#332a28', '#ffe0ad'],
  ['#242137', '#b3b0ff'], ['#301b28', '#ff7cba'], ['#18302d', '#cefa72'],
];
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const sphereGeo = new THREE.SphereGeometry(1, 12, 8);
const dummy = new THREE.Object3D();
export function resolveStageView(settings, stage = 1, garage = false) {
  const oddStage = Math.max(1, Math.floor(stage)) % 2 === 1;
  return {
    camera: settings.camera === 'auto' ? (oddStage ? 'chase' : 'overhead') : settings.camera,
    night: settings.dayNight === 'auto' ? (!garage && oddStage) : settings.dayNight === 'night',
  };
}
function material(color, metalness = .05, roughness = .65, extra = {}) { return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra }); }
function mesh(parent, geo, mat, position = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...position); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function makeLabel(text, color = '#d3fa5b', bg = '#1b211d') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = color; ctx.font = 'italic 900 130px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 140, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class ArenaWorld {
  constructor(canvas, settings, profile) {
    this.settings = settings; this.profile = profile; this.time = 0; this.mode = 'garage'; this.shake = 0;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#080d17'); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.16;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#080d17'); this.scene.fog = new THREE.FogExp2('#080d17', .011);
    this.camera = new THREE.PerspectiveCamera(36, 1, .1, 330); this.target = new THREE.Vector3(); this.cameraPosition = new THREE.Vector3(12, 8, 14);
    this.scene.add(new THREE.HemisphereLight('#c6d9ff', '#131322', .8));
    this.sun = new THREE.DirectionalLight('#fff5dc', 3.1); this.sun.position.set(12, 22, 9); this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: .1, far: 100 });
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -.0004; this.sun.shadow.normalBias = .045;
    this.scene.add(this.sun, this.sun.target);
    this.rim = new THREE.DirectionalLight('#b1a6ff', 3.2); this.rim.position.set(-12, 6, -8); this.scene.add(this.rim);
    const pmrem = new THREE.PMREMGenerator(this.renderer); const room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, .04); this.scene.environment = this.env.texture; this.scene.environmentIntensity = .65; room.dispose(); pmrem.dispose();
    this.setupGround(); this.setupGarage(); this.setupParticles();
    this.scenery = new PlaygroundScenery(this.scene);
    this.player = createVehicle(profile); this.scene.add(this.player);
    this.objectModels = new Map(); this.rivalModels = new Map(); this.pickupModels = new Map(); this.projectileModels = new Map();
    this.propMaterials = {
      paint: material('#d3fa5b', .12, .55), dark: material('#242b25', .32, .55), black: material('#101612', .1, .8),
      ivory: material('#dde6d0', .05, .7), steel: material('#727f73', .7, .3), orange: material('#ff8e55', .1, .5),
    };
    this.propLabels = ['Aa', 'PX', '//', 'Be', '01', '+'].map(t => new THREE.MeshStandardMaterial({ map: makeLabel(t), roughness: .6 }));
    this.pickupMaterials = {
      like: material('#d3fa5b', .55, .3, { emissive: '#9abf32', emissiveIntensity: .35 }),
      gold: material('#ffd169', .65, .2, { emissive: '#f0a92e', emissiveIntensity: .45 }),
      health: material('#79efbb', .35, .25, { emissive: '#36c39b', emissiveIntensity: .45 }),
      shield: material('#94d5ff', .6, .25, { emissive: '#3da4ff', emissiveIntensity: .6 }),
      rocket: material('#f7a175', .45, .3, { emissive: '#f77d43', emissiveIntensity: .4 }),
      bomb: material('#e0a7ff', .5, .25, { emissive: '#b356d9', emissiveIntensity: .4 }),
      nitro: material('#b4eefa', .5, .25, { emissive: '#3ab9d6', emissiveIntensity: .5 }),
    };
    this.sharedMaterials = new Set([...Object.values(this.propMaterials), ...this.propLabels, ...Object.values(this.pickupMaterials)]);
    this.currentPalette = 0; this.paletteProgress = 1;
    this.resize(); this.applySettings(settings);
    window.addEventListener('resize', () => this.resize());
    this.pointer = { x: 0, y: 0 };
    window.addEventListener('pointermove', e => { this.pointer.x = e.clientX / innerWidth - .5; this.pointer.y = e.clientY / innerHeight - .5; });
  }

  setupGround() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d'); const image = ctx.createImageData(256, 256);
    let rand = 927;
    for (let i = 0; i < image.data.length; i += 4) { rand = (rand * 16807) % 2147483647; const n = 180 + rand % 65; image.data[i] = image.data[i + 1] = image.data[i + 2] = n; image.data[i + 3] = 255; }
    ctx.putImageData(image, 0, 0); const texture = new THREE.CanvasTexture(c); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(160, 160);
    this.floorMat = material('#202822', .16, .88, { map: texture });
    this.floor = mesh(this.scene, new THREE.PlaneGeometry(1800, 1800), this.floorMat); this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; this.floor.castShadow = false;
    this.gridUniforms = {
      uColor: { value: new THREE.Color('#d3fa5b') }, uOld: { value: new THREE.Color('#d3fa5b') },
      uOrigin: { value: new THREE.Vector2() }, uRadius: { value: 10000 }, uOpacity: { value: .16 },
    };
    const gridMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.gridUniforms,
      vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vWorld; uniform vec3 uColor; uniform vec3 uOld; uniform vec2 uOrigin; uniform float uRadius; uniform float uOpacity;
        vec2 hash(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
        void main(){ vec2 p=vWorld.xz*.14; vec2 n=floor(p); vec2 f=fract(p); float a=10.;float b=10.;
          for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));vec2 o=hash(n+g)*.75+.125;float d=length(g+o-f);if(d<a){b=a;a=d;}else if(d<b){b=d;}}
          float w=max(fwidth(b-a),.006);float edge=1.-smoothstep(.011-w,.011+w,b-a);float reveal=1.-smoothstep(uRadius-4.,uRadius+4.,distance(vWorld.xz,uOrigin));
          float fog=exp(-distance(cameraPosition,vWorld)*.024);vec3 color=mix(uOld,uColor,reveal);gl_FragColor=vec4(color,edge*uOpacity*fog); }`,
    });
    this.grid = mesh(this.scene, new THREE.PlaneGeometry(1800, 1800), gridMat, [0, .018, 0]); this.grid.rotation.x = -Math.PI / 2; this.grid.castShadow = false;
  }

  setupGarage() {
    this.garageGroup = new THREE.Group(); this.scene.add(this.garageGroup);
    const asphalt = material('#101521', .22, .56);
    const gold = material('#ffbf35', .45, .25, {emissive:'#ff9e24',emissiveIntensity:.35});
    const violet = material('#8b5dff', .45, .25, {emissive:'#6940e8',emissiveIntensity:.65});
    // A low, open starting grid keeps the rounded kart silhouette unobstructed.
    mesh(this.garageGroup, new THREE.BoxGeometry(30,.12,26), asphalt, [0,-.08,0]);
    const checker = document.createElement('canvas'); checker.width=512;checker.height=128;
    const ctx=checker.getContext('2d');
    for(let y=0;y<4;y++)for(let x=0;x<16;x++){
      ctx.fillStyle=(x+y)%2?'#18202d':'#d7d2c6';ctx.fillRect(x*32,y*32,32,32);
    }
    // Fine road wear is baked once rather than animated as geometry.
    let seed=19;
    for(let i=0;i<1200;i++){
      seed=(seed*16807)%2147483647;const x=seed%512;
      seed=(seed*16807)%2147483647;const y=seed%128;
      ctx.fillStyle=i%3?'#070b1416':'#e7dacc14';ctx.fillRect(x,y,1+(i%5),1);
    }
    const map=new THREE.CanvasTexture(checker);map.colorSpace=THREE.SRGBColorSpace;
    const stripe=mesh(this.garageGroup,new THREE.PlaneGeometry(18,4.5),material('#ffffff',.1,.66,{map}),[0,.015,3.9]);
    stripe.rotation.x=-Math.PI/2;stripe.castShadow=false;
    for(const side of[-1,1]){
      mesh(this.garageGroup,unitBox,side<0?violet:gold,[side*7,.018,-1],[.035,.018,16]);
      mesh(this.garageGroup,unitBox,asphalt,[side*8,.23,-5],[.6,.45,8]);
      mesh(this.garageGroup,unitBox,side<0?violet:gold,[side*8,.47,-5],[.62,.025,8]);
    }
    this.garagePurple = new THREE.PointLight('#9868ff',30,16,2);this.garagePurple.position.set(-4,2.7,-2);
    this.garageGold = new THREE.PointLight('#ffc35c',24,16,2);this.garageGold.position.set(4,3,2);
    this.garageGroup.add(this.garagePurple,this.garageGold);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(7,8),new THREE.MeshBasicMaterial({map:radialTexture('#000000'),transparent:true,opacity:.55,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;this.garageGroup.add(shadow);
    this.garageSmokeTimer=0;
  }

  setupParticles() {
    this.particles = []; this.particleMax = 230;
    const particleMat = new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.9});
    this.particleMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.12,0),particleMat,this.particleMax);this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.particleMesh.frustumCulled=false;this.scene.add(this.particleMesh);this.particleMesh.count=0;
    this.smokes = [];
    this.shockwaves = [];
    this.shockwaveGeometry = new THREE.RingGeometry(.88, 1, 48);
    this.smokeTexture = this.makeSmokeTexture();
    this.trails = []; this.trailCursor = 0;
    this.trailMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.25,.7),new THREE.MeshBasicMaterial({color:'#070b08',transparent:true,opacity:.35,depthWrite:false}),700);
    this.trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.trailMesh.frustumCulled=false;this.trailMesh.count=0;this.scene.add(this.trailMesh);
  }

  applySettings(settings) {
    this.settings = {...settings};
    const ratio = settings.quality === 'low' ? .85 : settings.quality === 'medium' ? 1.1 : Math.min(devicePixelRatio,1.8);
    this.renderer.setPixelRatio(ratio);this.renderer.shadowMap.enabled=settings.quality!=='low';
    const shadowSize=settings.quality==='high'?2048:1024;
    if(this.sun.shadow.mapSize.x!==shadowSize){this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.sun.shadow.mapSize.set(shadowSize,shadowSize);}
    if(settings.reducedFX){this.shake=0;this.clearShockwaves();this.clearSmoke();}
    this.resize();
  }
  customize(profile) {
    this.profile = {...profile}; const old=this.player; this.scene.remove(old);this.player=createVehicle(profile);this.scene.add(this.player);
    // Only the small editable hero is rebuilt; streamed world resources stay shared.
    disposeVehicle(old);
  }
  resize() {const w=innerWidth,h=innerHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}

  makeProp(o) {
    const g=new THREE.Group();const m=this.propMaterials;
    if(o.kind==='crate'||o.kind==='pillar') {
      mesh(g,unitBox,m.paint,[0,.8,0],[1.6,1.6,1.6]);
      mesh(g,unitBox,m.dark,[0,.83,.815],[1.4,1.38,.04]);
      const label=new THREE.Mesh(new THREE.PlaneGeometry(1.3,.7),this.propLabels[o.id%this.propLabels.length]);label.position.set(0,.85,.845);g.add(label);
      for(const x of [-.69,.69])mesh(g,unitBox,m.steel,[x,.8,0],[.045,1.63,1.63]);
      if(o.kind==='pillar')g.scale.y=1.8;
    }else if(o.kind==='rock'||o.kind==='ice'){
      mesh(g,new THREE.IcosahedronGeometry(1,0),o.kind==='ice'?m.ivory:m.dark,[0,.9,0],[1.2,1.5,1]);
    }else if(o.kind==='cone'){
      mesh(g,unitBox,m.black,[0,.1,0],[1.2,.2,1.2]);mesh(g,new THREE.ConeGeometry(.45,1.4,12),m.orange,[0,.85,0]);mesh(g,new THREE.CylinderGeometry(.24,.31,.25,12),m.ivory,[0,.9,0]);
    }else if(o.kind==='barrel'){
      mesh(g,new THREE.CylinderGeometry(.64,.64,1.7,16),m.dark,[0,.85,0]);
      for(const y of [.2,1.5])mesh(g,new THREE.CylinderGeometry(.67,.67,.1,16),m.paint,[0,y,0]);
      mesh(g,unitBox,m.paint,[0,.85,.65],[.8,.35,.02]);
    }else{
      mesh(g,new THREE.CylinderGeometry(.55,.4,1.2,16),m.ivory,[0,.7,0]);mesh(g,new THREE.CylinderGeometry(.59,.59,.14,16),m.black,[0,1.35,0]);mesh(g,new THREE.CylinderGeometry(.49,.45,.4,16),m.paint,[0,.75,0]);
    }
    return g;
  }

  makeRival(car) {
    const g=createVehicle({car:car.id%3,color:car.boss?'#ef523e':undefined,rival:true,boss:car.boss,livery:'factory'});
    let bossAura;
    if(car.boss){
      bossAura=new THREE.Mesh(new THREE.RingGeometry(2.6,2.68,48),new THREE.MeshBasicMaterial({color:'#ff785c',transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));
      bossAura.rotation.x=-Math.PI/2;bossAura.position.y=.035;g.add(bossAura);
    }
    const health=new THREE.Group();health.position.set(0,4.2,0);g.add(health);
    const healthBack=new THREE.Mesh(new THREE.PlaneGeometry(2.55,.2),new THREE.MeshBasicMaterial({color:'#101714',transparent:true,opacity:.9,depthWrite:false}));health.add(healthBack);
    const healthFill=new THREE.Mesh(new THREE.PlaneGeometry(2.4,.105),new THREE.MeshBasicMaterial({color:car.boss?'#ff785c':'#ffd34d',depthWrite:false}));healthFill.position.z=.01;health.add(healthFill);
    health.visible=car.boss;
    Object.assign(g.userData,{health,healthFill,bossAura,isKart:true});
    return g;
  }

  makePickup(o) {
    const g=new THREE.Group();const m=this.pickupMaterials[o.kind]||this.pickupMaterials.like;
    const ring=mesh(g,new THREE.TorusGeometry(.72,.025,6,24),m,[0,-.5,0]);ring.rotation.x=Math.PI/2;
    if(o.kind==='like'||o.kind==='gold'){
      const coin=mesh(g,new THREE.CylinderGeometry(.55,.55,.16,12),m);coin.rotation.x=Math.PI/2;
      mesh(g,unitBox,this.propMaterials.dark,[0,0,.1],[.13,.6,.03]);mesh(g,unitBox,this.propMaterials.dark,[0,0,.1],[.55,.13,.03]);
    }else if(o.kind==='health'){
      mesh(g,unitBox,m,[0,0,0],[.3,1.1,.3]);mesh(g,unitBox,m,[0,0,0],[1.1,.3,.3]);
    }else if(o.kind==='shield'){
      mesh(g,new THREE.IcosahedronGeometry(.63,0),m);
    }else if(o.kind==='rocket'){
      const rocket=mesh(g,new THREE.ConeGeometry(.35,1.15,8),m);rocket.rotation.z=-.4;
    }else if(o.kind==='bomb'){
      mesh(g,sphereGeo,m,[0,0,0],[.5,.5,.5]);mesh(g,unitBox,this.propMaterials.ivory,[0,.57,0],[.12,.25,.12]);
    }else{mesh(g,new THREE.CylinderGeometry(.32,.32,1.1,8),m);mesh(g,unitBox,this.propMaterials.ivory,[0,0,.33],[.12,.6,.03]);}
    return g;
  }

  syncModels(array,map,factory,update){
    const seen=new Set();for(const o of array){seen.add(o.id);let model=map.get(o.id);if(!model){model=factory(o);this.scene.add(model);map.set(o.id,model);}update(model,o);}
    for(const[id,model]of map){if(!seen.has(id)){this.scene.remove(model);this.disposeModel(model);map.delete(id);}}
  }
  disposeModel(model){if(model.userData.isKart){disposeVehicle(model);return;}const geometries=new Set(),materials=new Set();model.traverse(o=>{if(o.isMesh){if(o.geometry!==unitBox&&o.geometry!==sphereGeo)geometries.add(o.geometry);if(!this.sharedMaterials.has(o.material))materials.add(o.material);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
  event(event) {
    if(event.type==='explosion'||event.type==='hit'||event.type==='damage'||event.type==='smash'){
      if(event.type==='damage')this.player.userData.impact=1;
      const big=event.type==='explosion';this.shake=Math.max(this.shake,big?.48:.15);
      const count=this.settings.reducedFX?5:big?38:12;
      for(let i=0;i<count;i++)this.particles.push({x:event.x,y:.8,z:event.z,vx:(Math.random()-.5)*(big?24:10),vy:3+Math.random()*11,vz:(Math.random()-.5)*(big?24:10),life:.5+Math.random()*.9,max:1.4,color:big?'#ffba66':'#d3fa5b'});
      if(big){
        this.shockwave(event.x,event.z,event.size||8);
        for(let i=0;i<6;i++)this.smoke(event.x+(Math.random()-.5)*3,.8,event.z+(Math.random()-.5)*3,2.5);
      }
    }
    if(event.type==='collect'){
      const color=this.pickupMaterials[event.kind]?.color.getStyle()||'#d3fa5b';
      for(let i=0;i<(this.settings.reducedFX?2:8);i++)this.particles.push({x:event.x,y:1,z:event.z,vx:(Math.random()-.5)*5,vy:2+Math.random()*4,vz:(Math.random()-.5)*5,life:.6,max:.6,color});
    }
  }
  shockwave(x,z,radius){
    if(this.settings.reducedFX)return;
    if(this.shockwaves.length>=12){const oldest=this.shockwaves.shift();this.scene.remove(oldest.mesh);oldest.mesh.material.dispose();}
    const ring=new THREE.Mesh(this.shockwaveGeometry,new THREE.MeshBasicMaterial({color:'#ffd39a',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    ring.rotation.x=-Math.PI/2;ring.position.set(x,.07,z);this.scene.add(ring);this.shockwaves.push({mesh:ring,age:0,radius:Math.max(3,radius)});
  }
  clearShockwaves(){for(const wave of this.shockwaves){this.scene.remove(wave.mesh);wave.mesh.material.dispose();}this.shockwaves.length=0;}
  repaint(index,x=0,z=0){
    const ix=((index%15)+15)%15;this.gridUniforms.uOld.value.copy(this.gridUniforms.uColor.value);this.gridUniforms.uColor.value.set(PALETTES[ix][1]);this.gridUniforms.uOrigin.value.set(x,z);this.gridUniforms.uRadius.value=0;this.paletteProgress=0;this.currentPalette=ix;
  }
  makeSmokeTexture(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d');
    for(let i=0;i<24;i++){
      const angle=i*2.39996,radius=9+Math.sqrt(i/24)*49;
      const x=128+Math.cos(angle)*radius,y=128+Math.sin(angle)*radius;
      const gradient=ctx.createRadialGradient(x,y,0,x,y,35+(i%5)*5);
      gradient.addColorStop(0,'rgba(223,230,246,.11)');gradient.addColorStop(.45,'rgba(201,212,230,.055)');gradient.addColorStop(1,'rgba(201,212,230,0)');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  }
  clearSmoke(){
    for(const puff of this.smokes){this.scene.remove(puff.sprite);puff.sprite.material.dispose();}
    this.smokes.length=0;
  }
  smoke(x,y,z,size=.7,showroom=false){
    const max=this.settings.quality==='low'?24:56;
    if(this.smokes.length>=max||this.settings.reducedFX)return;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.smokeTexture,transparent:true,opacity:0,depthWrite:false,color:showroom?'#bbc7e3':'#dbe2f0',rotation:Math.random()*Math.PI*2}));
    sprite.position.set(x,y,z);sprite.scale.setScalar(size);this.scene.add(sprite);
    this.smokes.push({sprite,life:1,size,maxLife:showroom?4:1.2,drift:(Math.random()-.5)*.7,showroom});
  }
  update(state,dt,input = {}) {
    this.time+=dt;const t=this.time,p=state.player;const garage=state.mode==='garage';const mobile=innerWidth<760;
    const reduced=!!this.settings.reducedFX;
    const venue = garage ? this.settings.playground : state.playground;
    this.scenery.set(venue);
    this.scenery.update(p.x,p.z,garage,t,reduced);
    this.scenery.group.visible=!garage;
    const view=resolveStageView(this.settings,state.stage,garage);
    this.garageGroup.visible=garage;
    if(this.mode!==state.mode){
      if(state.mode==='countdown') {this.cameraPosition.set(p.x+11,12,p.z-14);this.trailMesh.count=0;this.trailCursor=0;this.clearShockwaves();}
      if(garage){this.clearShockwaves();this.particles.length=0;this.shake=0;this.trailMesh.count=0;}
      this.clearSmoke();
      this.mode=state.mode;
    }
    if(garage){
      const a=.35+(reduced?0:Math.sin(t*.12)*.07);
      animateVehicle(this.player,{x:0,z:0,y:.08,angle:a,speed:0,shield:0},t,dt,0,reduced);
      const cameraGoal=mobile?new THREE.Vector3(16,11,20):new THREE.Vector3(10.6+(reduced?0:this.pointer.x*.4),5.7+(reduced?0:this.pointer.y*.22),13.1);
      this.cameraPosition.lerp(cameraGoal,1-Math.exp(-dt*3));
      this.target.lerp(mobile?new THREE.Vector3(.3,4,.3):new THREE.Vector3(-2.4,1.0,1.75),1-Math.exp(-dt*3));
      this.camera.fov=mobile?45:35;this.gridUniforms.uOpacity.value=.015;
      if(!reduced){this.garageSmokeTimer+=dt;if(this.garageSmokeTimer>.25){this.garageSmokeTimer=0;for(const side of[-1,1])this.smoke(side*(2.8+Math.random()*2),.12,-1.5-Math.random()*4,2.4,true);}}
      this.sun.position.set(12,22,9);this.sun.target.position.set(0,0,0);
      this.floor.position.set(0,0,0);this.grid.position.set(0,.018,0);
      for(const map of[this.objectModels,this.rivalModels,this.pickupModels,this.projectileModels])for(const model of map.values())model.visible=false;
    }else{
      animateVehicle(this.player,venue==='offroad'&&!reduced?{...p,y:p.y+Math.abs(Math.sin(p.x*1.8)+Math.sin(p.z*1.4))*.06*Math.min(1,p.speed/12)}:p,t,dt,input.steer||0,reduced);
      const chase=view.camera!=='overhead';
      const fx=Math.sin(p.angle),fz=Math.cos(p.angle);
      const desired=chase?new THREE.Vector3(p.x-fx*16,p.y+11.5,p.z-fz*16):new THREE.Vector3(p.x+9,30,p.z-18);
      this.cameraPosition.lerp(desired,1-Math.exp(-dt*(chase?3.3:5)));
      const look=chase?new THREE.Vector3(p.x+fx*6,1.1,p.z+fz*6):new THREE.Vector3(p.x,0,p.z+4);
      this.target.lerp(look,1-Math.exp(-dt*6));this.camera.fov=THREE.MathUtils.damp(this.camera.fov,mobile?58:52+(p.boosting&&!reduced?5:0),4,dt);this.gridUniforms.uOpacity.value=['road','offroad'].includes(venue)?0:.33;
      this.sun.position.set(p.x+12,27,p.z+12);this.sun.target.position.set(p.x,0,p.z);
      this.floor.position.set(p.x,0,p.z);this.grid.position.set(p.x,.018,p.z);
      this.syncModels(state.obstacles,this.objectModels,o=>this.makeProp(o),(m,o)=>{m.visible=true;m.position.set(o.x,o.y||0,o.z);m.rotation.set((o.y||0)*.5,o.angle||0,(o.y||0)*.3);const size=o.size||1;m.scale.setScalar(size);});
      this.syncModels(state.rivals,this.rivalModels,o=>this.makeRival(o),(m,o)=>{
        m.visible=true;animateVehicle(m,o,t,dt,0,reduced);
        const {health,healthFill,bossAura}=m.userData;
        const hp=THREE.MathUtils.clamp(o.hp/(o.maxHp||(o.boss?210:65)),0,1);
        health.visible=o.boss||hp<.99;
        health.quaternion.copy(m.quaternion).invert().multiply(this.camera.quaternion);
        healthFill.scale.x=hp;healthFill.position.x=-(1-hp)*1.2;
        if(bossAura)bossAura.material.opacity=reduced?.35:.4+Math.sin(t*2)*.08;
      });
      this.syncModels(state.pickups,this.pickupModels,o=>this.makePickup(o),(m,o)=>{m.visible=true;m.position.set(o.x,1.25+(reduced?0:Math.sin(t*3+o.id)*.18),o.z);m.rotation.y=(reduced?0:t*1.4)+o.id;});
      this.syncModels(state.projectiles,this.projectileModels,o=>{
        const g=new THREE.Group();mesh(g,o.kind==='bomb'?sphereGeo:new THREE.ConeGeometry(.18,.9,8),o.owner==='player'?this.pickupMaterials.gold:this.pickupMaterials.rocket,[0,0,0],o.kind==='bomb'?[.4,.4,.4]:[1,1,1]);if(o.kind!=='bomb')g.children[0].rotation.x=Math.PI/2;return g;
      },(m,o)=>{m.visible=true;m.position.set(o.x,o.y||.8,o.z);m.rotation.y=o.angle;});
      if(state.mode==='playing'&&(p.drifting||p.boosting)&&Math.random()<.7){
        for(const side of[-1,1]){
          const x=p.x+Math.cos(p.angle)*side*1.5-fx*1.5,z=p.z-Math.sin(p.angle)*side*1.5-fz*1.5;
          this.smoke(x,.35,z,p.boosting?.85:.65);
          if(p.y<.1){dummy.position.set(x,.035,z);dummy.rotation.set(-Math.PI/2,0,-p.angle);dummy.scale.set(1,1,1);dummy.updateMatrix();this.trailMesh.setMatrixAt(this.trailCursor%700,dummy.matrix);this.trailCursor++;this.trailMesh.count=Math.min(this.trailCursor,700);this.trailMesh.instanceMatrix.needsUpdate=true;}
        }
      }
      if(state.mode==='playing'&&this.profile.magic&&!reduced&&Math.random()<.4){this.particles.push({x:p.x-fx*2,y:1.2,z:p.z-fz*2,vx:(Math.random()-.5)*2,vy:1+Math.random(),vz:(Math.random()-.5)*2,life:.7,max:.7,color:'#d6a8ff'});}
    }
    const night=view.night;
    const environment=PLAYGROUNDS[venue]||PLAYGROUNDS.yard;
    const themeColors={electric:'#b99aff',sunset:'#ffaf76',arctic:'#a9edff'};
    const accent=themeColors[this.settings.theme]||environment.accent;
    const background=new THREE.Color(garage?'#080d17':environment.sky);if(night&&!garage)background.multiplyScalar(.45);
    this.scene.background.lerp(background,dt*.8);this.scene.fog.color.copy(this.scene.background);this.scene.fog.density=garage?.018:environment.fog;
    this.floorMat.color.lerp(new THREE.Color(garage?'#101622':environment.ground).multiplyScalar(night && !garage ? .45 : 1),dt*2);
    this.gridUniforms.uColor.value.set(accent);this.propMaterials.paint.color.lerp(new THREE.Color(accent),dt*3);
    this.sun.color.lerp(new THREE.Color(garage?'#ffdaaa':'#fff5dc'),dt*3);
    this.sun.intensity=THREE.MathUtils.damp(this.sun.intensity,garage?3.5:night?.8:3.1,3,dt);
    if(this.currentPalette!==state.paletteIndex&&!garage)this.repaint(state.paletteIndex,p.x,p.z);
    if(this.paletteProgress<1){this.paletteProgress+=dt/1.5;this.gridUniforms.uRadius.value=this.paletteProgress*155;this.propMaterials.paint.color.lerp(new THREE.Color(PALETTES[this.currentPalette][1]),dt*3);}
    if(garage&&this.currentPalette!==0)this.repaint(0,0,0);
    this.updateEffects(dt);
    this.camera.position.copy(this.cameraPosition);
    if(this.shake>.01&&!reduced){this.camera.position.x+=(Math.random()-.5)*this.shake;this.camera.position.y+=(Math.random()-.5)*this.shake;}
    this.shake*=Math.exp(-dt*7);
    this.camera.lookAt(this.target);this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);
  }
  updateEffects(dt){
    this.shockwaves=this.shockwaves.filter(w=>{w.age+=dt;const progress=w.age/.65;if(progress>=1){this.scene.remove(w.mesh);w.mesh.material.dispose();return false;}const scale=.4+w.radius*(1-(1-progress)**2);w.mesh.scale.setScalar(scale);w.mesh.material.opacity=(1-progress)*.65;return true;});
    this.particles=this.particles.filter(p=>(p.life-=dt)>0).slice(-this.particleMax);
    this.particles.forEach((p,i)=>{p.vy-=15*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.y<.1){p.y=.1;p.vy*=-.35;}dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.life*3,p.life*7,0);dummy.scale.setScalar(Math.max(.1,p.life/p.max));dummy.updateMatrix();this.particleMesh.setMatrixAt(i,dummy.matrix);this.particleMesh.setColorAt(i,new THREE.Color(p.color));});
    this.particleMesh.count=this.particles.length;this.particleMesh.instanceMatrix.needsUpdate=true;if(this.particleMesh.instanceColor)this.particleMesh.instanceColor.needsUpdate=true;
    this.smokes=this.smokes.filter(s=>{s.life-=dt/s.maxLife;if(s.life<=0){this.scene.remove(s.sprite);s.sprite.material.dispose();return false;}const age=1-s.life;s.sprite.position.y+=dt*(s.showroom?.14:.6);s.sprite.position.x+=dt*s.drift;s.sprite.position.z+=dt*.18;s.sprite.scale.set(s.size+age*3,s.size*(s.showroom?.55:1)+age*2,1);s.sprite.material.rotation+=dt*.08;s.sprite.material.opacity=Math.sin(age*Math.PI)*(s.showroom?.33:.5);return true;});
  }
}
