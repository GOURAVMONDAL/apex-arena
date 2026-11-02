import * as THREE from 'three';

export const PLAYGROUNDS = Object.freeze({
  yard: { name: 'Foundry Yard', ground: '#242b23', accent: '#d3fa5b', sky: '#30392e', fog: .009, grip: 1, propKinds: ['crate', 'barrel', 'cone', 'pillar', 'cup'], count: 5 },
  city: { name: 'Neon Plaza', ground: '#14252f', accent: '#69e7ff', sky: '#172138', fog: .0075, grip: 1.1, propKinds: ['crate', 'cone', 'barrel', 'pillar'], count: 4 },
  desert: { name: 'Sunken Ruins', ground: '#9c7047', accent: '#ffe3a0', sky: '#bd9673', fog: .008, grip: .78, propKinds: ['rock', 'pillar', 'barrel'], count: 4 },
  road: { name: 'Open Road', ground: '#4e6745', accent: '#fff1a8', sky: '#91b9d0', fog: .004, grip: 1.2, propKinds: ['cone', 'barrel'], count: 2 },
  offroad: { name: 'Wild Trails', ground: '#69553a', accent: '#dfb877', sky: '#9bab91', fog: .007, grip: .65, propKinds: ['rock', 'barrel'], count: 6 },
  ice: { name: 'Frost Circuit', ground: '#668a96', accent: '#c7faff', sky: '#a0bfca', fog: .0065, grip: .5, propKinds: ['ice', 'cone', 'pillar'], count: 4 },
});

/** Bounded decorative horizon. All foreground colliders belong to the simulation. */
export class PlaygroundScenery {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'playground-landmarks'; scene.add(this.group);
    this.geometries = new Set(); this.materials = new Set(); this.flags = []; this.glows = [];
    this.id = null; this.set('yard');
  }

  set(id) {
    id = PLAYGROUNDS[id] ? id : 'yard';
    if (this.id === id) return;
    this.clear(); this.id = id;
    const p = PLAYGROUNDS[id];
    const geometry = value => { this.geometries.add(value); return value; };
    const box = geometry(new THREE.BoxGeometry(1, 1, 1));
    const cone = geometry(new THREE.ConeGeometry(1, 1, 5));
    const column = geometry(new THREE.CylinderGeometry(1, 1.1, 1, 8));
    const plane = geometry(new THREE.PlaneGeometry(1, 1));
    const mat = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .8, metalness: .08, ...extra }); this.materials.add(m); return m; };
    const accent = mat(p.accent, { emissive: p.accent, emissiveIntensity: id === 'city' ? 1.1 : .08 });
    const dark = mat(id === 'desert' ? '#715139' : id === 'ice' ? '#456f83' : '#202c2b');
    const pale = mat(id === 'desert' ? '#d4ab77' : id === 'ice' ? '#d3eef0' : '#586860');
    const add = (geo, material, x, y, z, sx, sy, sz, ry = 0, parent = this.group) => {
      const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry;
      m.castShadow = false; m.receiveShadow = true; parent.add(m); return m;
    };
    const ring = (i, n, radius = 145) => {
      const a = i / n * Math.PI * 2 + .24;
      return [Math.sin(a) * radius, Math.cos(a) * radius, a];
    };

    if (id === 'yard') {
      const rust = mat('#6c4937'), steel = mat('#526259');
      // Cargo stacks and four gantry cranes form the industrial skyline.
      for (let i = 0; i < 12; i++) {
        const [x, z, a] = ring(i, 12, 139 + (i % 3) * 9); const h = 7 + (i % 3) * 5;
        add(box, i % 2 ? rust : pale, x, h / 2, z, 17, h, 9, a);
        add(box, dark, x, h + 2.5, z, 13, 5, 7, a + .05);
        add(box, accent, x, h * .65, z + Math.cos(a) * -4.6, 12, .45, .16, a);
      }
      for (let i = 0; i < 4; i++) {
        const [x, z, a] = ring(i, 4, 158);
        const crane = new THREE.Group(); crane.position.set(x, 0, z); crane.rotation.y = a; this.group.add(crane);
        for (const side of [-1, 1]) add(box, steel, side * 17, 19, 0, 2, 38, 3, 0, crane);
        add(box, accent, 0, 38, 0, 41, 3, 4, 0, crane);
        add(box, dark, 4, 30, 0, .2, 14, .2, 0, crane);
        add(box, accent, 4, 23, 0, 4, 1.5, 3, 0, crane);
      }
      for (let i = 0; i < 8; i++) {
        const [x, z, a] = ring(i, 8, 120);
        add(box, dark, x, 1, z, 18, 2, 2, a);
      }
    } else if (id === 'city') {
      const glass = mat('#263c55', { metalness: .45, roughness: .32 });
      const violet = mat('#946aff', { emissive: '#946aff', emissiveIntensity: .9 });
      this.glows.push(accent, violet);
      for (let i = 0; i < 16; i++) {
        const [x, z, a] = ring(i, 16, 150 + (i % 3) * 10), h = 16 + ((i * 13) % 31);
        add(box, glass, x, h / 2, z, 12 + (i % 3) * 4, h, 10, a);
        const offset = new THREE.Vector3(0, 0, -5.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        add(box, i % 3 ? accent : violet, x + offset.x, h * .55, z + offset.z, .65, h * .7, .15, a);
        add(box, pale, x, h + .2, z, 13 + (i % 3) * 4, .4, 11, a);
      }
      for (let i = 0; i < 4; i++) {
        const [x, z, a] = ring(i, 4, 117);
        const arch = new THREE.Group(); arch.position.set(x, 0, z); arch.rotation.y = a; this.group.add(arch);
        for (const side of [-1, 1]) add(box, accent, side * 13, 9, 0, .7, 18, .7, 0, arch);
        add(box, i % 2 ? violet : accent, 0, 18, 0, 26.7, .7, .7, 0, arch);
      }
      for (let i = -3; i <= 3; i++) {
        const stripe = add(plane, pale, i * 30, .026, 0, .3, 180, 1); stripe.rotation.x = -Math.PI / 2;
      }
      for (let i = -2; i <= 2; i++) {
        const stripe = add(plane, dark, 0, .028, i * 36, 180, 1.5, 1); stripe.rotation.x = -Math.PI / 2;
      }
    } else if (id === 'desert') {
      const rock = mat('#8b5738'), sand = mat('#c29a64');
      const mesa = geometry(new THREE.CylinderGeometry(.8, 1.2, 1, 6));
      for (let i = 0; i < 10; i++) {
        const [x, z, a] = ring(i, 10, 153 + (i % 3) * 10), h = 15 + (i % 4) * 6;
        add(mesa, rock, x, h / 2 - 1, z, 13 + (i % 2) * 5, h, 11, a);
        add(mesa, sand, x, h - 1, z, 11 + (i % 2) * 4, 3, 9, a);
      }
      for (let i = 0; i < 12; i++) {
        const [x, z, a] = ring(i, 12, 117 + (i % 2) * 9), h = 4 + (i % 4) * 3;
        const pillar = add(column, pale, x, h / 2, z, 2, h, 2, a); pillar.rotation.z = i % 3 === 0 ? .13 : 0;
        if (i % 2 === 0) add(box, sand, x, h + .5, z, 6, 1, 4, a);
      }
      for (let i = 0; i < 4; i++) {
        const [x, z, a] = ring(i, 4, 178);
        add(cone, pale, x, 18, z, 27, 36, 27, a);
      }
      for (let i = -2; i <= 2; i++) {
        const path = add(plane, sand, i * 45, .026, 0, 10, 180, 1, .3); path.rotation.x = -Math.PI / 2;
      }
    } else if (id === 'road') {
      const asphalt=mat('#30363b'), white=mat('#f5f1dd'), rail=mat('#a1a9ad',{metalness:.6}), grass=mat('#526c45');
      const strip=(m,x,z,w,h)=>{const road=add(plane,m,x,.045,z,w,h,1);road.rotation.x=-Math.PI/2;return road;};
      strip(asphalt,0,0,24,660);
      for(const side of [-1,1]){
        strip(white,side*10.5,0,.22,660);strip(grass,side*20,0,12,660);
        for(let z=-300;z<=300;z+=30){
          add(box,rail,side*14,.9,z,.18,.3,28);
          add(column,rail,side*14,.5,z,.13,1,.13);
          add(column,dark,side*24,4,z,.2,8,.2);
          add(box,accent,side*22.8,8,z,3,.18,.35);
        }
      }
      for(let z=-330;z<330;z+=12)strip(white,0,z,.25,5);
      const hill=geometry(new THREE.SphereGeometry(1,10,6));
      for(let i=0;i<18;i++) {const side=i%2?1:-1;add(hill,grass,side*(65+i%3*20),-4,-300+i*36,35,15+i%4*4,34);}
      for(const side of [-1,1]) {add(box,dark,side*15,7,90,.4,14,.4);}
      add(box,dark,0,14,90,30,.4,.5);add(box,accent,0,12.5,90,12,2.3,.3);
    } else if (id === 'offroad') {
      const bark=mat('#433627'), foliage=mat('#36573b'), dirt=mat('#8b7048'), stone=mat('#777365');
      const boulder=geometry(new THREE.IcosahedronGeometry(1,0));
      const hill=geometry(new THREE.SphereGeometry(1,10,6));
      for(let i=0;i<40;i++){
        const [x,z,a]=ring(i,40,65+(i%5)*18),h=7+i%4*2;
        add(column,bark,x,h*.35,z,.5,h*.7,.5);
        add(cone,foliage,x,h*.8,z,3.5,h,3.5,a);
        add(boulder,stone,x+6,1.5,z-5,2+i%3,2,3,a);
      }
      for(let i=0;i<12;i++){const [x,z,a]=ring(i,12,155);add(hill,foliage,x,-4,z,34,20+i%3*7,30,a);}
      for(let i=-3;i<=3;i++){
        const trail=add(plane,dirt,i*42,.03,0,11,300,1);trail.rotation.x=-Math.PI/2;
        for(let j=-4;j<=4;j++){add(boulder,dirt,i*42+12,-.2,j*32,5,.65,9,j*.2);}
      }
    } else {
      const blue = mat('#81cbdc', { metalness: .25, roughness: .28 });
      const ice = mat('#a9e4ee', { metalness: .3, roughness: .21, emissive: '#23798c', emissiveIntensity: .15 });
      const mountain = geometry(new THREE.ConeGeometry(1, 1, 5));
      for (let i = 0; i < 12; i++) {
        const [x, z, a] = ring(i, 12, 157 + (i % 3) * 8), h = 20 + (i % 4) * 8;
        add(mountain, dark, x, h / 2 - 3, z, 25, h, 22, a);
        add(mountain, pale, x, h * .79 - 3, z, 10.5, h * .42, 9.2, a);
      }
      for (let i = 0; i < 14; i++) {
        const [x, z, a] = ring(i, 14, 116 + (i % 3) * 6), h = 5 + (i % 4) * 3;
        const shard = add(cone, i % 2 ? ice : blue, x, h / 2, z, 2 + (i % 2), h, 3, a); shard.rotation.z = .15 * (i % 2 ? 1 : -1);
      }
      for (let i = 0; i < 6; i++) {
        const [x, z, a] = ring(i, 6, 110);
        add(column, pale, x, 4, z, .13, 8, .13);
        const flag = add(plane, accent, x + Math.cos(a) * 2.5, 6.5, z - Math.sin(a) * 2.5, 5, 2, 1, a);
        flag.material.side = THREE.DoubleSide; this.flags.push({ mesh: flag, angle: a, phase: i });
      }
      for (let i = -3; i <= 3; i++) {
        const stripe = add(plane, blue, i * 30, .027, 0, .35, 180, 1); stripe.rotation.x = -Math.PI / 2;
      }
    }
    this.group.position.set(0, 0, 0);
  }

  update(playerX = 0, playerZ = 0, garage = false, time = 0, reduced = false) {
    // Snapping keeps the decorative patch bounded without sliding against the ground.
    this.group.position.x = garage || this.id === 'road' ? 0 : Math.round(playerX / 60) * 60;
    this.group.position.z = garage ? 0 : Math.round(playerZ / 60) * 60;
    for (const flag of this.flags) flag.mesh.rotation.y = flag.angle + (reduced ? 0 : Math.sin(time * 1.5 + flag.phase) * .035);
    for (const m of this.glows) m.emissiveIntensity = reduced ? .9 : .95 + Math.sin(time * .7) * .12;
  }

  clear() {
    this.group.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.clear(); this.materials.clear(); this.flags.length = 0; this.glows.length = 0;
  }

  dispose() { this.clear(); this.scene.remove(this.group); this.id = null; }
}
