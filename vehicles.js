import { VEHICLE_ROSTER, vehicleIndex } from './roster.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const boxGeometry = new RoundedBoxGeometry(1, 1, 1, 3, .10);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
function mat(color, metalness = 0, roughness = .6, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
}
function box(parent, material, size, pos, rotation) {
  const m = new THREE.Mesh(boxGeometry, material);
  m.scale.set(...size); m.position.set(...pos);
  if (rotation) m.rotation.set(...rotation);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function sphere(parent, material, size, pos) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), material);
  m.scale.set(...size); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function beam(parent, material, a, b, radius = .065) {
  const dir = v(...b).sub(v(...a));
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 12), material);
  mesh.position.copy(v(...a).add(v(...b)).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(v(0, 1, 0), dir.normalize());
  mesh.castShadow = true; parent.add(mesh); return mesh;
}
function tube(parent, material, points, radius=.05, closed=false) {
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>v(...p)),closed),Math.max(24,points.length*4),radius,8,closed),material);
  mesh.castShadow=true;parent.add(mesh);return mesh;
}
function plate(parent,material,shape,depth,pos,bevel=.03) {
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:3,steps:1,curveSegments:16});
  geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function starShape(radius=1, inner=.48) {
  const shape=new THREE.Shape();
  for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?radius*inner:radius;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?shape.lineTo(x,y):shape.moveTo(x,y);}
  shape.closePath();return shape;
}
// Combine only the static children of each animated group. The driver, steering
// and spinning wheel groups stay separate, while shared finishes draw together.
function batchStaticParts(group) {
  const byMaterial=new Map();
  for(const child of [...group.children]) {
    if(!child.isMesh||Array.isArray(child.material))continue;
    const parts=byMaterial.get(child.material)||[];parts.push(child);byMaterial.set(child.material,parts);
  }
  for(const [material,parts] of byMaterial) {
    if(parts.length<2)continue;
    const transformed=parts.map(part=>{part.updateMatrix();const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();geometry.applyMatrix4(part.matrix);return geometry;});
    const geometry=mergeGeometries(transformed,false);
    for(const part of transformed)part.dispose();
    if(!geometry)continue;
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const batch=new THREE.Mesh(geometry,material);batch.castShadow=true;batch.receiveShadow=true;group.add(batch);
    const retired=new Set();for(const part of parts){group.remove(part);if(part.geometry!==boxGeometry)retired.add(part.geometry);}
    for(const old of retired)old.dispose();
  }
}
function canvasTexture(draw,width=256,height=256){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;draw(canvas.getContext('2d'),width,height);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
function checkerTexture(){return canvasTexture((ctx,w,h)=>{ctx.fillStyle='#ede6df';ctx.fillRect(0,0,w,h);ctx.fillStyle='#201c32';for(let y=0;y<8;y++)for(let x=0;x<8;x++)if((x+y)%2===0)ctx.fillRect(x*w/8,y*h/8,w/8,h/8);});}
function liveryTexture(style) {
  const texture=canvasTexture((ctx,w,h)=>{
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
    if(style==='stripes'){ctx.fillStyle='#f8f0e8';ctx.fillRect(75,0,44,h);ctx.fillRect(141,0,44,h);ctx.fillStyle='#282039';ctx.fillRect(126,0,7,h);}
    if(style==='carbon'){ctx.fillStyle='#484550';ctx.fillRect(0,0,w,h);for(let y=0;y<h;y+=12)for(let x=0;x<w;x+=12){ctx.fillStyle=((x+y)/12)%2?'#90909c':'#34323e';ctx.fillRect(x,y,10,6);}}
    if(style==='camo'){const shades=['#455446','#8a9981','#d5dfc1'];for(let i=0;i<45;i++){ctx.fillStyle=shades[i%3];ctx.beginPath();ctx.ellipse((i*83)%256,(i*137)%256,32,19,i,.0,Math.PI*2);ctx.fill();}}
    if(style==='neon'){ctx.fillStyle='#25283a';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#d2fff7';ctx.lineWidth=4;for(let i=-2;i<5;i++){ctx.beginPath();ctx.moveTo(i*80,0);ctx.lineTo(i*80+100,120);ctx.lineTo(i*80+100,150);ctx.lineTo(i*80+200,256);ctx.stroke();}}
  });texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
}

/** Rounded racing karts and the reference's two expressive mascot silhouettes. */
export function createVehicle({ color, skin='#ff9466',headwear='none',mood='happy',magic=false,car=0,livery='factory',rival=false,boss=false }={}) {
  car=vehicleIndex(car);
  const factory=VEHICLE_ROSTER[car].color;
  // Earlier versions saved lime as their default paint. Upgrade that default to the new race palette.
  color=!color||color==='#d3fa5b'?factory:color;
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.name='reference-racing-kart';
  if(boss)root.scale.setScalar(1.3);
  const paint=new THREE.MeshPhysicalMaterial({color,metalness:.42,roughness:.23,clearcoat:1,clearcoatRoughness:.16});
  if(!['factory','stripes','carbon','neon','camo'].includes(livery))livery='factory';
  if(livery!=='factory')paint.map=liveryTexture(livery);
  const ivory=mat('#f8f0e4',.12,.35),black=mat('#0b0c15',.35,.3),carbon=mat('#22202d',.25,.55),steel=mat('#9c94b1',.85,.24);
  const rubber=mat('#24202e',.08,.56),trim=mat(car===1?'#a96710':'#352057',.6,.3);
  const light=mat('#fff6e5',.15,.2,{emissive:'#fff3dd',emissiveIntensity:4});
  const redLight=mat('#f03b4d',.1,.2,{emissive:'#ee2434',emissiveIntensity:2});
  const purple=mat(car===2?'#c9462c':'#5524b0',.3,.31),fabric=mat(car===1?'#d61a33':'#5934b3',0,.86);
  // Low open kart: rounded bodywork, exposed wheels, inset cockpit, and front light ribbon.
  sphere(body,black,[1.32,.27,2.1],[0,.55,0]);
  sphere(body,paint,[1.35,.42,1.18],[0,.91,1.18]);
  sphere(body,paint,[1.1,.34,.9],[0,.77,-1.17]);
  box(body,black,[2.52,.16,.38],[0,.57,2.10]);
  box(body,trim,[2.28,.2,.25],[0,.85,2.17]);
  box(body,light,[2.02,.075,.075],[0,.91,2.31]);
  for(const side of [-1,1]){
    sphere(body,paint,[.4,.33,1.17],[side*1.04,.82,-.24]);
    box(body,carbon,[.15,.2,2.2],[side*1.35,.52,-.15]);
    box(body,redLight,[.42,.09,.06],[side*.76,.98,-1.95]);
    for(const z of [-1.38,1.42]){
      beam(body,steel,[side*.62,.62,z],[side*1.60,.58,z],.06);
      beam(body,trim,[side*.75,.83,z-.13],[side*1.56,.61,z+.08],.065);
    }
    // Polished exhaust outlet just behind the driver.
    beam(body,steel,[side*.72,.67,-1.3],[side*.86,.86,-2.1],.12);
    sphere(body,black,[.13,.13,.04],[side*.86,.86,-2.13]);
  }
  sphere(body,black,[.80,.15,.88],[0,1.02,-.22]);
  box(body,carbon,[.95,.7,.32],[0,1.20,-.81],[-.17,0,0]);
  for(const side of [-1,1])beam(body,black,[side*.8,.87,-.85],[side*.8,1.8,-1.25],.075);
  tube(body,black,[[-.8,1.8,-1.25],[-.7,2.05,-1.29],[0,2.19,-1.3],[.7,2.05,-1.29],[.8,1.8,-1.25]],.075);
  // Double cream racing stripes flow across the nose, following its rounded surface.
  if(livery==='factory'||livery==='stripes')for(const x of [-.30,.30]){
    const points=[];for(let i=0;i<=18;i++){const a=.12+i/18*1.7;points.push([x,.91+Math.sin(a)*.405,1.18+Math.cos(a)*1.13]);}
    tube(body,car===1?paint:ivory,points,.095);
  }
  if(car===1){
    const hoodStar=plate(body,black,starShape(.38),.016,[0,1.316,1.20],.012);hoodStar.rotation.x=-Math.PI/2;
  }
  if(livery==='neon')for(const side of [-1,1])box(body,light,[.04,.05,2.2],[side*1.35,.62,-.15]);
  // Slick tires have rounded shoulders and fine circumferential grooves, not off-road treads.
  const wheelGroups=[];
  for(const side of [-1,1])for(const z of [-1.40,1.48]){
    const steering=new THREE.Group();steering.position.set(side*1.52,.70,z);body.add(steering);
    const wheel=new THREE.Group();steering.add(wheel);
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.69,.69,.65,40,1),rubber);tire.rotation.z=Math.PI/2;tire.castShadow=true;wheel.add(tire);
    for(const out of [-1,1]){
      const shoulder=new THREE.Mesh(new THREE.TorusGeometry(.58,.11,10,40),rubber);shoulder.rotation.y=Math.PI/2;shoulder.position.x=out*.30;wheel.add(shoulder);
      const rim=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.025,24),black);rim.rotation.z=Math.PI/2;rim.position.x=out*.342;wheel.add(rim);
      const rimRing=new THREE.Mesh(new THREE.TorusGeometry(.40,.025,8,32),steel);rimRing.rotation.y=Math.PI/2;rimRing.position.x=out*.36;wheel.add(rimRing);
      for(let i=0;i<5;i++){const spoke=box(wheel,trim,[.035,.08,.68],[out*.364,0,0]);spoke.rotation.x=i*Math.PI/5;}
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.05,16),steel);hub.rotation.z=Math.PI/2;hub.position.x=out*.38;wheel.add(hub);
    }
    for(const x of [-.18,-.06,.06,.18]){const groove=new THREE.Mesh(new THREE.TorusGeometry(.691,.008,4,40),carbon);groove.rotation.y=Math.PI/2;groove.position.x=x;wheel.add(groove);}
    wheelGroups.push({steering,wheel,front:z>0});
  }
  // Each additional chassis keeps its own silhouette even with custom paint.
  if(car===3){
    for(const side of [-1,1]){
      tube(body,steel,[[side*1.05,.8,1],[side*1.05,3.45,.3],[side*1.05,3.45,-1.45],[side*1.05,.8,-1.8]],.085);
      for(const {steering,wheel} of wheelGroups)if(Math.sign(steering.position.x)===side)wheel.scale.set(1.08,1.12,1.12);
      box(body,paint,[.6,.28,3.7],[side*1.27,1.22,0]);
    }
    beam(body,steel,[-1.05,3.45,-1.45],[1.05,3.45,-1.45],.085);
    box(body,black,[2.05,.17,.28],[0,3.48,.25]);
    for(const x of [-.65,0,.65])sphere(body,light,[.17,.17,.12],[x,3.5,.42]);
  }
  if(car===4){
    for(const side of [-1,1]){
      box(body,paint,[.74,.25,3.8],[side*1.35,1.08,0]);
      box(body,light,[.05,.07,2.7],[side*1.74,1.12,.2]);
    }
    box(body,ivory,[2.7,.12,.65],[0,1.35,-1.65]);
    box(body,paint,[2.4,.18,.4],[0,.65,2.35]);
  }
  if(car===5){
    for(const side of [-1,1]){
      beam(body,carbon,[side*.85,.8,-1.7],[side*.85,2.05,-1.9],.08);
      box(body,paint,[.12,.5,.8],[side*1.53,2.08,-1.9]);
      box(body,light,[.05,.06,2.2],[side*1.37,.62,0]);
    }
    box(body,carbon,[3.1,.14,.8],[0,2.15,-1.9]);
    box(body,paint,[.55,.2,1.3],[0,1.2,1.55]);
    box(body,carbon,[3.05,.12,.55],[0,.45,2.2]);
  }
  const driver=new THREE.Group();driver.position.set(0,1.76,-.38);body.add(driver);driver.name=car===1?'star-racer':'helmet-racer';
  if(car===1){
    const yellow=mat(skin==='#ff9466'?'#ffc72c':skin,.05,.58),red=mat('#d52235',0,.94),pink=mat('#f72983',.27,.22);
    // The mascot is an actual softly bevelled five-point star, with depth and rounded tips.
    const star=plate(driver,yellow,starShape(.98,.54),.38,[0,.60,-.26],.15);star.name='plush-star';
    for(const s of [-1,1]){
      sphere(driver,black,[.075,.18,.035],[s*.25,.61,.30]);
      box(driver,black,[.39,.085,.06],[s*.28,.86,.31],[0,0,s*.45]);
      const sleeve=sphere(driver,ivory,[.30,.25,.44],[s*.64,-.05,.16]);sleeve.rotation.x=-.6;
      for(let j=0;j<3;j++)box(driver,red,[.35,.07,.12],[s*.65,-.06+j*.10,.47]);
    }
    // Red knitted beanie: dome, rolled cuff and many individually raised ribs.
    sphere(driver,red,[.73,.42,.52],[0,1.29,-.04]);
    const cuff=new THREE.Mesh(new THREE.TorusGeometry(.59,.12,12,48),red);cuff.scale.set(1,.85,1);cuff.rotation.x=Math.PI/2;cuff.position.set(0,1.10,-.04);driver.add(cuff);
    const knit=mat('#ed3447',0,.95);
    for(let i=0;i<34;i++){const a=i/34*Math.PI*2;const pts=[];for(let j=0;j<=9;j++){const b=.1+j/9*1.45;pts.push([Math.cos(a)*.735*Math.cos(b),1.26+.43*Math.sin(b),-.04+Math.sin(a)*.53*Math.cos(b)]);}tube(driver,knit,pts,.015);}
    box(driver,ivory,[.27,.27,.04],[.37,1.30,.43],[0,0,-.12]);
    plate(driver,black,starShape(.085),.009,[.37,1.31,.469],.002);
    // Star-shaped pink sunglasses perched at the top of the face.
    for(const s of [-1,1]){
      const outer=starShape(.34,.5),hole=starShape(.25,.5);outer.holes.push(new THREE.Path(hole.getPoints().reverse()));
      const frame=plate(driver,pink,outer,.055,[s*.36,1.01,.41],.012);frame.rotation.z=s*.08;
      const lens=plate(driver,mat('#1e152b',.45,.14),starShape(.25),.018,[s*.36,1.01,.41],.01);lens.rotation.z=s*.08;
    }
    beam(driver,pink,[-.13,1.03,.47],[.13,1.03,.47],.03);
    box(driver,ivory,[.22,.09,.025],[.48,.42,.33],[0,0,.7]);box(driver,ivory,[.22,.09,.026],[.48,.42,.35],[0,0,-.7]);
  }else{
    // Oversized white helmet, purple crown stripes, visor gasket and digital angry eyes.
    sphere(driver,ivory,[.80,.88,.74],[0,.60,-.04]);
    for(const x of [-.23,.23]){const pts=[];for(let i=0;i<=22;i++){const a=-1.45+i/22*2.95;pts.push([x,.6+Math.cos(a)*.852,-.04+Math.sin(a)*.719]);}tube(driver,purple,pts,.085);}
    const visorRim=new THREE.Mesh(new RoundedBoxGeometry(1.47,.78,.28,4,.18),purple);visorRim.position.set(0,.52,.57);driver.add(visorRim);
    const visor=new THREE.Mesh(new RoundedBoxGeometry(1.30,.62,.23,4,.15),mat('#080b16',.6,.14));visor.position.set(0,.52,.69);driver.add(visor);
    const eyeMat=mat('#fff5ff',.05,.2,{emissive:'#fceaff',emissiveIntensity:1.9});
    for(const s of [-1,1]){
      const eye=new THREE.Shape();eye.moveTo(-.15,.11);eye.lineTo(.16,.04);eye.lineTo(.11,-.13);eye.quadraticCurveTo(-.04,-.23,-.12,-.09);eye.closePath();
      const e=plate(driver,eyeMat,eye,.01,[s*.31,.55,.825],.01);e.scale.x=s;
      beam(driver,eyeMat,[s*.16,.64,.84],[s*.46,.72,.84],.032);
      const ear=new THREE.Mesh(new THREE.CylinderGeometry(.30,.30,.20,32),purple);ear.rotation.z=Math.PI/2;ear.position.set(s*.79,.58,-.03);driver.add(ear);
      const disk=new THREE.Mesh(new THREE.CircleGeometry(.24,32),new THREE.MeshStandardMaterial({map:checkerTexture(),roughness:.48}));disk.rotation.y=s*Math.PI/2;disk.position.set(s*.90,.58,-.03);driver.add(disk);
    }
    sphere(driver,purple,[.61,.24,.52],[0,-.10,-.08]);
    // A long checkered scarf curls behind the helmet. It remains visible from chase view.
    const scarfGeo=new THREE.PlaneGeometry(.43,1.85,2,20),pa=scarfGeo.attributes.position;
    for(let i=0;i<pa.count;i++){const y=pa.getY(i);pa.setZ(i,Math.sin(y*3.4)*.11);}
    scarfGeo.computeVertexNormals();const scarf=new THREE.Mesh(scarfGeo,new THREE.MeshStandardMaterial({map:checkerTexture(),side:THREE.DoubleSide,roughness:.87}));
    scarf.position.set(-.61,.37,-.94);scarf.rotation.set(-1.13,0,-.4);driver.add(scarf);
  }
  // Visible gloves embrace a tilted black steering wheel in front of the character.
  const glove=skin!=='#ff9466'?mat(skin,.03,.55):car===1?mat('#ffc52a',.03,.55):purple;
  for(const s of [-1,1]){
    beam(driver,car===1?ivory:fabric,[s*.46,-.18,.05],[s*.50,-.20,.57],.16);
    sphere(driver,glove,[.22,.21,.23],[s*.43,-.16,.70]);
    for(let j=0;j<3;j++)sphere(driver,glove,[.065,.08,.11],[s*.43+(j-1)*.09,-.14,.87]);
  }
  const steeringWheel=new THREE.Mesh(new THREE.TorusGeometry(.52,.062,12,40),black);steeringWheel.rotation.x=-.5;steeringWheel.position.set(0,1.51,.45);body.add(steeringWheel);
  for(const s of [-1,1])beam(body,black,[0,1.51,.45],[s*.45,1.51,.45],.035);
  if(headwear==='crown'){
    const gold=mat('#ffd85f',.7,.25);const crown=new THREE.Mesh(new THREE.CylinderGeometry(.45,.47,.22,12,1,true),gold);crown.position.y=1.54;driver.add(crown);
    for(let i=0;i<5;i++){const a=i/5*Math.PI*2;const tip=new THREE.Mesh(new THREE.ConeGeometry(.12,.25,4),gold);tip.position.set(Math.sin(a)*.43,1.75,Math.cos(a)*.43);driver.add(tip);}
  }else if(headwear==='cap'&&car!==1){sphere(driver,fabric,[.78,.19,.66],[0,1.24,-.03]);box(driver,fabric,[.86,.06,.43],[0,1.16,.64]);}
  if(mood==='cool'&&car!==1)box(driver,black,[1.15,.17,.03],[0,.62,.84]);
  if(magic){const halo=new THREE.Mesh(new THREE.TorusGeometry(.64,.028,8,40),light);halo.rotation.x=Math.PI/2;halo.position.y=1.85;driver.add(halo);}
  const shield=new THREE.Mesh(new THREE.IcosahedronGeometry(2.7,2),new THREE.MeshBasicMaterial({color:'#a9eaff',transparent:true,opacity:.14,wireframe:true}));shield.scale.set(1,.75,1.1);shield.position.y=1.2;root.add(shield);shield.visible=false;
  const underglow=new THREE.Mesh(new THREE.PlaneGeometry(5,6),new THREE.MeshBasicMaterial({map:radialTexture(color),transparent:true,opacity:.25,depthWrite:false}));underglow.rotation.x=-Math.PI/2;underglow.position.y=.04;root.add(underglow);
  batchStaticParts(body);batchStaticParts(driver);for(const {wheel} of wheelGroups)batchStaticParts(wheel);
  root.userData={vehicle:car,body,driver,wheelGroups,paint,shield,underglow,livery,impact:0,shock:0,shockAge:0,previousSpeed:0};
  return root;
}

export function radialTexture(color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'); const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color); g.addColorStop(.3, color); g.addColorStop(1, '#00000000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

export function disposeVehicle(model) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  model.traverse(o => {
    if (o.geometry && o.geometry !== boxGeometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  for (const m of materials) { if (m.map) textures.add(m.map); m.dispose(); }
  for (const g of geometries) g.dispose();
  for (const t of textures) t.dispose();
}

export function animateVehicle(model, entity, time, dt, steer = 0, reduced = false) {
  model.position.set(entity.x, entity.y || 0, entity.z); model.rotation.y = entity.angle;
  const { body, driver, wheelGroups, shield } = model.userData;
  const speed = entity.speed ?? Math.hypot(entity.vx || 0, entity.vz || 0);
  const data=model.userData,step=THREE.MathUtils.clamp(dt,0,.1);
  const acceleration=step>0?THREE.MathUtils.clamp((speed-data.previousSpeed)/step,-45,45):0;
  data.previousSpeed=speed;
  if(reduced) {
    body.position.y=0;body.rotation.set(0,0,0);driver.position.y=1.76;driver.rotation.set(0,0,0);
    data.impact=0;data.shock=0;data.shockAge=0;
  } else {
    if(data.impact>0) {data.shock=Math.min(1.5,data.shock+Math.min(1.5,data.impact));data.shockAge=0;data.impact=0;}
    data.shockAge+=step;data.shock*=Math.exp(-step*6);
    const shock=Math.sin(data.shockAge*31)*data.shock;
    const motion=Math.min(1,Math.abs(speed)/30),boost=entity.boosting?1:0;
    const engine=Math.sin(time*(boost?52:36));
    const road=Math.sin(time*17)*Math.sin(time*9.7)*motion;
    body.position.y=engine*(.003+motion*.005+boost*.006)+road*.018+shock*.11;
    const roll=-steer*Math.min(Math.abs(speed)/35,.11)+road*.012+shock*.035;
    const pitch=-acceleration*.001+Math.sin(time*14)*motion*.012+engine*boost*.008+shock*.055;
    body.rotation.z=THREE.MathUtils.damp(body.rotation.z,roll,9,step);
    body.rotation.x=THREE.MathUtils.damp(body.rotation.x,pitch,10,step);
    driver.position.y=1.76+Math.sin(time*18+.6)*(.002+motion*.01)+shock*.045;
    driver.rotation.z=Math.sin(time*5)*(.012+motion*.025)+steer*.09+shock*.07;
    driver.rotation.x=-.06*motion+Math.sin(time*11)*(.009+motion*.02)+shock*.09;
  }
  for (const { steering, wheel, front } of wheelGroups) {
    if (front) steering.rotation.y = THREE.MathUtils.damp(steering.rotation.y, -steer * .4, 12, dt);
    wheel.rotation.x += speed * dt * 1.5;
  }
  shield.visible = entity.shield > 0;
  if (shield.visible) shield.rotation.y = time * .3;
}
