import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const boxGeometry = new RoundedBoxGeometry(1, 1, 1, 2, .055);
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
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), material);
  m.scale.set(...size); m.position.set(...pos); m.castShadow = true; parent.add(m); return m;
}
function beam(parent, material, a, b, radius = .065) {
  const dir = v(...b).sub(v(...a));
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 10), material);
  mesh.position.copy(v(...a).add(v(...b)).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(v(0, 1, 0), dir.normalize());
  mesh.castShadow = true; parent.add(mesh); return mesh;
}
function textTexture(text, bg = '#d3fa5b', fg = '#171c1a', width = 512, height = 256) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = fg; ctx.font = `italic 900 ${height * .67}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height * .53, width * .87);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function badge(parent, text, width, height, pos, rotation, color) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: textTexture(text, color), roughness: .6, side: THREE.DoubleSide }));
  mesh.position.set(...pos); mesh.rotation.set(...rotation); parent.add(mesh); return mesh;
}

// Original tiling wraps; multiplying these neutral patterns by paint preserves
// the selected garage color on every body panel and every chassis preset.
function liveryTexture(style) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,256,256);
  if (style === 'stripes') {
    ctx.fillStyle = '#151b18';
    for (const x of [70,146]) ctx.fillRect(x,0,40,256);
    ctx.fillStyle = '#e4e8de'; for (const x of [61,191]) ctx.fillRect(x,0,5,256);
  } else if (style === 'carbon') {
    ctx.fillStyle = '#444b47'; ctx.fillRect(0,0,256,256);
    for (let y=0;y<256;y+=16) for(let x=0;x<256;x+=16) {
      ctx.fillStyle = ((x+y)/16)%2 ? '#89918a' : '#515a53'; ctx.fillRect(x,y,16,16);
      ctx.fillStyle = '#b7bdb4';
      for(let line=2;line<16;line+=4) ((x+y)/16)%2 ? ctx.fillRect(x+line,y,1,14) : ctx.fillRect(x,y+line,14,1);
    }
  } else if (style === 'camo') {
    ctx.fillStyle = '#e8ebdf'; ctx.fillRect(0,0,256,256);
    const shades=['#6e7c69','#adb8a0','#37483c'];
    for(let i=0;i<30;i++) {
      const x=(i*83)%256,y=(i*137)%256;
      ctx.fillStyle=shades[i%3]; ctx.beginPath();
      ctx.moveTo(x-28,y-10);ctx.lineTo(x+2,y-29);ctx.lineTo(x+42,y-16);ctx.lineTo(x+30,y+9);ctx.lineTo(x+12,y+13);ctx.lineTo(x-9,y+35);ctx.lineTo(x-37,y+22);ctx.closePath();ctx.fill();
    }
  } else if (style === 'neon') {
    ctx.fillStyle = '#26372e';ctx.fillRect(0,0,256,256);
    ctx.strokeStyle='#d6ffdf';ctx.lineWidth=4;
    for(let i=-2;i<5;i++) {ctx.beginPath();ctx.moveTo(i*80,0);ctx.lineTo(i*80+105,105);ctx.lineTo(i*80+105,150);ctx.lineTo(i*80+211,256);ctx.stroke();}
  }
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=4;
  return texture;
}

export function createVehicle({ color = '#d3fa5b', skin = '#ff9466', headwear = 'none', mood = 'happy', magic = false, car = 0, livery = 'factory', rival = false, boss = false } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const paint = mat(color, .38, .31);
  if (!['factory','stripes','carbon','neon','camo'].includes(livery)) livery='factory';
  if (livery !== 'factory') { paint.map=liveryTexture(livery);paint.roughness=livery==='carbon'?.42:.31; }
  const ivory = mat('#e9ecdf', .25, .4);
  const black = mat('#101513', .48, .44);
  const carbon = mat('#242a28', .35, .65);
  const steel = mat('#87938c', .85, .25);
  const rubber = mat('#151817', .02, .87);
  const glass = mat('#253d3b', .7, .17);
  const light = mat('#edf8cb', .2, .3, { emissive: '#dcff9a', emissiveIntensity: 2.1 });
  const redLight = mat('#ff4935', .1, .3, { emissive: '#ff3928', emissiveIntensity: 2 });
  const scale = boss ? 1.38 : 1;
  root.scale.setScalar(scale);
  // A low, wide, armored chassis, with exposed suspension and a rear-mounted power unit.
  box(body, black, [2.55, .36, 4.25], [0, .69, -.05]);
  box(body, paint, [2.38, .48, 3.5], [0, 1.03, .05]);
  box(body, livery==='factory'?ivory:paint, [2.26, .42, 1.46], [0, 1.32, 1.18], [-.11, 0, 0]);
  box(body, paint, [2.46, .32, .9], [0, 1.1, 1.99], [-.08, 0, 0]);
  box(body, black, [2.7, .24, .42], [0, .76, 2.22]);
  box(body, black, [2.48, .28, .18], [0, 1.17, 2.44]);
  box(body, carbon, [1.45, .34, .12], [0, 1.15, 2.54]);
  for (let i = -4; i <= 4; i++) box(body, steel, [.035, .23, .025], [i * .14, 1.16, 2.61]);
  for (const side of [-1, 1]) {
    box(body, light, [.52, .16, .13], [side * .92, 1.35, 2.49]);
    box(body, black, [.62, .27, .1], [side * .92, 1.35, 2.4]);
    box(body, paint, [.2, .75, 2.6], [side * 1.27, 1.01, -.24]);
    box(body, carbon, [.22, .2, 3.2], [side * 1.3, .68, .06]);
    box(body, ivory, [.13, .4, .85], [side * 1.38, 1.22, .1]);
    box(body, redLight, [.48, .18, .12], [side * .9, 1.28, -2.04]);
    for (let i = 0; i < 3; i++) box(body, carbon, [.08, .1, .36], [side * 1.21, 1.46, -.9 + i * .2], [0, 0, side * .2]);
    // Contrasting wheel arches and floating fenders.
    for (const z of [-1.39, 1.49]) {
      box(body, carbon, [.57, .15, 1.3], [side * 1.43, 1.32, z]);
      box(body, paint, [.55, .08, .82], [side * 1.43, 1.42, z]);
      beam(body, steel, [side * .8, .67, z], [side * 1.6, .6, z], .08);
      beam(body, paint, [side * .9, .9, z], [side * 1.5, .53, z], .06);
    }
  }
  if (livery==='neon') {
    const neon=mat('#c7fff2',.2,.25,{emissive:'#50ffc9',emissiveIntensity:2.5});
    for(const side of [-1,1]) {
      box(body,neon,[.035,.065,3.45],[side*1.416,.88,-.02]);
      box(body,neon,[.045,.05,1.2],[side*.98,1.575,1.25],[-.11,0,0]);
      for(const z of [-1.39,1.49]) box(body,neon,[.56,.025,.82],[side*1.43,1.468,z]);
    }
  }
  // Cabin, roll cage, inset seat, and windscreen.
  box(body, black, [1.7, .44, 1.55], [0, 1.42, -.29]);
  box(body, carbon, [.9, .82, .35], [0, 1.75, -.78], [-.12, 0, 0]);
  box(body, glass, [1.86, .46, .08], [0, 1.75, .51], [-.3, 0, 0]);
  for (const side of [-1, 1]) {
    beam(body, black, [side * .93, 1.1, .56], [side * .87, 2.49, -.15], .075);
    beam(body, black, [side * .87, 2.49, -.15], [side * .86, 2.49, -1.16], .075);
    beam(body, black, [side * .86, 2.49, -1.16], [side * 1.05, 1.12, -1.68], .075);
    beam(body, steel, [side * .86, 1.2, -1.65], [side * .86, 2.49, -.15], .04);
  }
  beam(body, black, [-.87, 2.49, -.15], [.87, 2.49, -.15], .075);
  beam(body, black, [-.86, 2.49, -1.16], [.86, 2.49, -1.16], .075);
  // Mechanical detail behind the pilot.
  box(body, black, [1.48, .51, .86], [0, 1.44, -1.45]);
  for (let i = 0; i < 6; i++) box(body, steel, [1.12, .035, .045], [0, 1.72, -1.71 + i * .1]);
  for (const side of [-1, 1]) {
    beam(body, steel, [side * .8, 1.25, -1.65], [side * .86, 1.65, -2.25], .13);
    box(body, black, [.32, .31, .12], [side * .86, 1.68, -2.29]);
  }
  if (car !== 2) {
    box(body, black, [2.9, .14, .58], [0, 2.05, -2.0], [.12, 0, 0]);
    for (const side of [-1, 1]) {
      box(body, paint, [.12, .48, .64], [side * 1.4, 2.07, -2.0]);
      beam(body, black, [side * .84, 1.3, -1.78], [side * .84, 2.05, -2], .05);
    }
  }
  const wheelGroups = [];
  for (const side of [-1, 1]) for (const z of [-1.39, 1.49]) {
    const steering = new THREE.Group(); steering.position.set(side * 1.56, .66, z); body.add(steering);
    const wheel = new THREE.Group(); steering.add(wheel);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(.67, .67, .6, 28), rubber);
    tire.rotation.z = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
    for (const out of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .035, 12), black);
      rim.rotation.z = Math.PI / 2; rim.position.x = out * .31; wheel.add(rim);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .07, 12), paint);
      hub.rotation.z = Math.PI / 2; hub.position.x = out * .34; wheel.add(hub);
      for (let j = 0; j < 6; j++) {
        const spoke = new THREE.Mesh(boxGeometry, steel); spoke.scale.set(.04, .065, .62);
        spoke.position.x = out * .335; spoke.rotation.x = j * Math.PI / 3; wheel.add(spoke);
      }
    }
    // Deep transverse tread blocks catch light as the wheels turn.
    for (let j = 0; j < 18; j++) {
      const a = j * Math.PI / 9;
      const tread = new THREE.Mesh(boxGeometry, carbon);
      tread.scale.set(.62, .07, .12); tread.position.set(0, Math.sin(a) * .65, Math.cos(a) * .65); tread.rotation.x = -a;
      wheel.add(tread);
    }
    wheelGroups.push({ steering, wheel, front: z > 0 });
  }
  // Stripes, race number and tiny high-contrast sponsor details.
  if(livery==='factory') for (const x of [-.27, .27]) box(body, black, [.16, .025, 1.4], [x, 1.585, 1.34], [-.11, 0, 0]);
  badge(body, rival ? 'X' : '01', .72, .57, [0, 1.614, 1.36], [-Math.PI / 2 - .11, 0, Math.PI], color);
  badge(body, 'APEX', .94, .32, [-1.464, 1.3, .06], [0, -Math.PI / 2, 0], '#e9ecdf');
  badge(body, 'APEX', .94, .32, [1.464, 1.3, .06], [0, Math.PI / 2, 0], '#e9ecdf');
  const driver = new THREE.Group(); driver.position.set(0, 1.76, -.31); body.add(driver);
  const skinMat = mat(skin, .02, .75);
  sphere(driver, skinMat, [.44, .53, .39], [0, .27, 0]);
  const face = mat('#17221d', .05, .55);
  for (const s of [-1, 1]) {
    sphere(driver, ivory, [.105, .13, .055], [s * .17, .38, .35]);
    sphere(driver, face, [.045, .07, .025], [s * .17, .36, .395]);
    sphere(driver, skinMat, [.13, .13, .13], [s * .43, .3, 0]);
  }
  if (mood === 'cool') {
    for (const s of [-1, 1]) box(driver, black, [.29, .18, .065], [s * .18, .39, .415], [0, 0, s * .08]);
    box(driver, black, [.14, .045, .05], [0, .4, .43]);
  }
  sphere(driver, face, mood === 'angry' ? [.16, .045, .022] : [.19, .105, .033], [0, .1, .375]);
  box(driver, ivory, [.14, .055, .03], [0, .145, .403]);
  if (headwear === 'cap' || headwear === 'helmet') {
    sphere(driver, black, [.46, .26, .4], [0, .7, -.025]);
    box(driver, paint, [.69, .07, .32], [0, .64, .35]);
  } else if (headwear === 'crown') {
    const crownMat = mat('#f6c350', .8, .25);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(.34, .36, .22, 8, 1, true), crownMat); crown.position.y = .81; driver.add(crown);
    for (let j = 0; j < 5; j++) {
      const a = j / 5 * Math.PI * 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(.095, .23, 4), crownMat); tip.position.set(Math.sin(a) * .32, 1, Math.cos(a) * .32); driver.add(tip);
    }
  } else if (headwear === 'horns') {
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(.12, .39, 8), ivory); horn.position.set(s * .3, .79, 0); horn.rotation.z = -s * .4; driver.add(horn);
    }
  }
  if (magic) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.53, .025, 8, 32), light); halo.rotation.x = Math.PI / 2; halo.position.y = 1.02; driver.add(halo);
  }
  if (car === 1) { body.scale.set(1.1, 1.1, .98); }
  if (car === 2) { body.scale.set(.93, .85, 1.13); }
  const shieldMat = new THREE.MeshBasicMaterial({ color: '#a9eaff', transparent: true, opacity: .14, wireframe: true });
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 2), shieldMat); shield.scale.set(1, .65, 1.17); shield.position.y = 1.1; root.add(shield); shield.visible = false;
  const underglow = new THREE.Mesh(new THREE.PlaneGeometry(5, 6), new THREE.MeshBasicMaterial({ map: radialTexture(color), transparent: true, opacity: .3, depthWrite: false }));
  underglow.rotation.x = -Math.PI / 2; underglow.position.y = .04; root.add(underglow);
  root.userData = { body, driver, wheelGroups, paint, shield, underglow, livery, impact:0, shock:0, shockAge:0, previousSpeed:0 };
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
