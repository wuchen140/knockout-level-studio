import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { normalizeRoyalSmashLevel } from '../src/royalSmashLevel.js';
import { createLevelPhysics, stepLevelPhysics, applyDirectionalImpact, disposeLevelPhysics } from '../src/physics/levelPhysics.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'public/data');
const catalog = JSON.parse(fs.readFileSync(path.join(data, 'catalog.json')));
const index = JSON.parse(fs.readFileSync(path.join(data, 'index.json')));
const profiles = new Map(catalog.profiles.map(p => [p.catalogId, p]));
const output = path.join(root, 'outputs/ai-11-20-20260907');
fs.mkdirSync(output, { recursive: true });
function advance(sim, seconds) {
  for (let n = 0; n < Math.ceil(seconds / sim.fixedStep); n++) stepLevelPhysics(sim, sim.lastTime + sim.fixedStep * 1000 + 0.000001);
}
function measure(sim, normal) {
  const items = normal.objects.filter(o => o.type === 'block');
  const shifts = items.map(o => {
    const p = sim.bodies.get(o.uid).translation();
    return Math.hypot(p.x-o.position[0], p.y-o.position[1], p.z-o.position[2]);
  });
  return { shattered: sim.shattered.size, moved: shifts.filter(v => v > 0.5).length, maxDisplacement: +Math.max(...shifts).toFixed(3) };
}
function geometryChecks(l, normal) {
  const blocks = normal.objects.filter(o => o.type === 'block');
  const bounds = blocks.map(o => {
    const box = new THREE.Box3(new THREE.Vector3(...o.size).multiplyScalar(-0.5), new THREE.Vector3(...o.size).multiplyScalar(0.5));
    box.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...o.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation.map(THREE.MathUtils.degToRad))), new THREE.Vector3(1,1,1)));
    return { o, box };
  });
  for (const a of bounds) {
    const platform = l.platforms.find(p => p.sequence === a.o.platformIndex);
    assert(platform, `AI-${l.levelId} missing platform`);
    if (Math.abs(a.box.min.y - 2) < 0.01) {
      assert(a.box.min.x >= platform.position.x-platform.size.width/2-0.001 && a.box.max.x <= platform.position.x+platform.size.width/2+0.001, `${a.o.uid} outside platform X`);
      assert(a.box.min.z >= platform.position.z-platform.size.depth/2-0.001 && a.box.max.z <= platform.position.z+platform.size.depth/2+0.001, `${a.o.uid} outside platform Z`);
    } else {
      assert(bounds.some(b => b !== a && Math.abs(b.box.max.y-a.box.min.y)<0.015 && Math.min(a.box.max.x,b.box.max.x)-Math.max(a.box.min.x,b.box.min.x)>0.1 && Math.min(a.box.max.z,b.box.max.z)-Math.max(a.box.min.z,b.box.min.z)>0.1), `${a.o.uid} has no touching support`);
    }
    for (const b of bounds) if (a.o.blockIndex < b.o.blockIndex) {
      const overlap = ['x','y','z'].map(k => Math.min(a.box.max[k],b.box.max[k])-Math.max(a.box.min[k],b.box.min[k]));
      assert(!overlap.every(v => v > 0.015), `${a.o.uid} intersects ${b.o.uid}`);
    }
  }
}
const report = [];
for (let id = 11; id <= 20; id++) {
  const l = JSON.parse(fs.readFileSync(path.join(data, `levels/ai-${id}.json`)));
  assert.equal(l.levelId, id); assert.equal(l.category, 'ai');
  assert.equal(l.statistics.itemCount, l.items.length);
  assert.equal(new Set(l.items.map(i => i.sequence)).size, l.items.length);
  assert.equal(l.settings.difficulty, id === 20 ? 1 : 0);
  for (const item of l.items) {
    const p = profiles.get(item.catalogId); assert(p);
    assert.equal(item.materialId, p.materialId); assert.equal(item.shapeId, p.sourceShapeId);
    assert.deepEqual(Object.values(item.size), p.size); assert.equal(item.stage, 1);
    assert([1,2,9,...(id>=16?[4]:[])].includes(item.materialId));
  }
  if ([11,12,16].includes(id)) assert.deepEqual([...new Set(l.items.map(i => i.materialId))], [id === 16 ? 4 : 2]);
  const entry = index.levels.find(e => e.slug === `ai-${id}`);
  assert.equal(entry.counts.blocks, l.items.length); assert.equal(entry.moveCount, l.settings.moveCount);
  const normal = normalizeRoyalSmashLevel(l, catalog);
  geometryChecks(l, normal);
  const idleSim = await createLevelPhysics(normal, catalog);
  advance(idleSim, 5);
  const idle = measure(idleSim, normal);
  disposeLevelPhysics(idleSim);
  const shots = {};
  for (const [name, seqs, strength] of [['intended10', l.design.intendedTargets, 10], ['intended20', l.design.intendedTargets, 20], ['comparison20', l.design.comparisonTargets, 20]]) {
    const sequence = seqs.find(seq => l.items.find(i => i.sequence === seq).position.z <= -2) ?? seqs[0];
    const sim = await createLevelPhysics(normal, catalog); advance(sim, 5);
    const uid = `block-ai-${id}-${sequence}`;
    applyDirectionalImpact(sim.bodies.get(uid), { x: 0, y: 0, z: 1 }, strength);
    advance(sim, 5);
    shots[name] = { sequence, strength, ...measure(sim, normal) };
    disposeLevelPhysics(sim);
  }
  const row = { id, motif: l.design.motif, blocks: l.items.length, moves: l.settings.moveCount, idle, shots };
  report.push(row); console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(output, 'physics-report.json'), JSON.stringify(report, null, 2)+'\n');
assert(report.every(r => r.idle.shattered === 0 && r.idle.maxDisplacement < 0.15), 'Unstable idle structure');
console.log('PASS: catalog, support, overlap, bounds, index, progression, and five-second idle checks.');
