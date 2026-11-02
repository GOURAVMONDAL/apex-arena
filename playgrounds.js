import * as THREE from 'three';

export const PLAYGROUNDS = Object.freeze({
  yard: { name: 'Foundry Yard', ground: '#242b23', accent: '#d3fa5b', sky: '#30392e', fog: .009, grip: 1, propKinds: ['crate', 'barrel', 'cone', 'pillar', 'cup'], count: 5 },
  city: { name: 'Neon Plaza', ground: '#14252f', accent: '#69e7ff', sky: '#172138', fog: .0075, grip: 1.1, propKinds: ['crate', 'cone', 'barrel', 'pillar'], count: 4 },
  desert: { name: 'Sunken Ruins', ground: '#9c7047', accent: '#ffe3a0', sky: '#bd9673', fog: .008, grip: .78, propKinds: ['rock', 'pillar', 'barrel'], count: 4 },
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
    this.group.position.x = garage ? 0 : Math.round(playerX / 60) * 60;
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
