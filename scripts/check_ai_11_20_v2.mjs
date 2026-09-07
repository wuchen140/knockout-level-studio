import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import { normalizeRoyalSmashLevel } from '../src/royalSmashLevel.js';
import { createLevelPhysics, stepLevelPhysics, applyDirectionalImpact, disposeLevelPhysics } from '../src/physics/levelPhysics.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'public/data');
const output = path.join(root, 'outputs/ai-11-20-v2');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const catalog = read(path.join(data, 'catalog.json'));
const index = read(path.join(data, 'index.json'));
const profiles = new Map(catalog.profiles.map(profile => [profile.catalogId, profile]));
const vector = object => new THREE.Vector3(object.x, object.y, object.z);
const rotation = object => new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation.map(THREE.MathUtils.degToRad)));
const round = value => Number(value.toFixed(4));
const materialSet = level => [...new Set(level.items.map(item => item.materialId))].sort((a, b) => a - b);

function advance(simulation, seconds) {
  for (let step = 0; step < Math.ceil(seconds / simulation.fixedStep); step++) {
    stepLevelPhysics(simulation, simulation.lastTime + simulation.fixedStep * 1000 + 0.000001);
  }
}

function measure(simulation, objects) {
  const displacement = objects.map(object => {
    const position = simulation.bodies.get(object.uid).translation();
    return Math.hypot(position.x - object.position[0], position.y - object.position[1], position.z - object.position[2]);
  });
  return {
    blocks: objects.length,
    shattered: objects.filter(object => simulation.shattered.has(object.uid)).length,
    moved: displacement.filter(value => value > 0.5).length,
    maxDisplacement: round(Math.max(0, ...displacement)),
  };
}

function convexHull(points) {
  const sorted = points.map(point => [point.x, point.z]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower = [], upper = [];
  for (const point of sorted) {
    while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), point) <= 1e-9) lower.pop();
    lower.push(point);
  }
  for (const point of [...sorted].reverse()) {
    while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), point) <= 1e-9) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function overlapArea(subject, clip) {
  let polygon = subject;
  for (let edge = 0; edge < clip.length && polygon.length; edge++) {
    const start = clip[edge], end = clip[(edge + 1) % clip.length];
    const side = point => (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]);
    const input = polygon;
    polygon = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length];
      const da = side(a), db = side(b);
      if (da >= -1e-9) polygon.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        polygon.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
  }
  return Math.abs(polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0)) / 2;
}

function geometryChecks(level, normal) {
  const platforms = new Map(normal.objects.filter(object => object.type === 'platform').map(object => [object.platformIndex, object]));
  const blocks = normal.objects.filter(object => object.type === 'block');
  const bounds = blocks.map(object => {
    const quaternion = rotation(object);
    const platform = platforms.get(object.platformIndex);
    assert(platform, `${object.uid}: missing platform ${object.platformIndex}`);
    const inversePlatform = rotation(platform).invert();
    const position = new THREE.Vector3(...object.position);
    const corners = [];
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
      corners.push(new THREE.Vector3(x * object.size[0], y * object.size[1], z * object.size[2]).applyQuaternion(quaternion).add(position));
    }
    const localCorners = corners.map(corner => corner.clone().sub(new THREE.Vector3(...platform.position)).applyQuaternion(inversePlatform));
    const box = new THREE.Box3().setFromPoints(corners);
    const localBox = new THREE.Box3().setFromPoints(localCorners);
    const matrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
    const halfSize = new THREE.Vector3(...object.size).multiplyScalar(0.5).addScalar(-0.008);
    return { object, platform, box, localBox, footprint: convexHull(corners), obb: new OBB(position, halfSize, new THREE.Matrix3().setFromMatrix4(matrix)) };
  });
  const supportEdges = [];
  const baseCounts = new Map(level.platforms.map(platform => [platform.sequence, 0]));
  for (const block of bounds) {
    const { object, platform, localBox, box } = block;
    assert(localBox.min.y >= -0.02, `${object.uid}: intersects its platform top`);
    if (Math.abs(localBox.min.y) < 0.02) {
      assert(localBox.min.x >= -platform.size[0] / 2 - 0.002 && localBox.max.x <= platform.size[0] / 2 + 0.002, `${object.uid}: base outside rotated platform X`);
      assert(localBox.min.z >= -platform.size[2] / 2 - 0.002 && localBox.max.z <= platform.size[2] / 2 + 0.002, `${object.uid}: base outside rotated platform Z`);
      baseCounts.set(object.platformIndex, baseCounts.get(object.platformIndex) + 1);
    } else {
      const supports = bounds.filter(other => other !== block && other.object.platformIndex === object.platformIndex
        && Math.abs(other.box.max.y - box.min.y) < 0.02
        && overlapArea(block.footprint, other.footprint) > 0.05);
      assert(supports.length, `${object.uid}: no touching support in platform ${object.platformIndex}`);
      supportEdges.push({ sequence: object.blockIndex, supportedBy: supports.map(other => other.object.blockIndex) });
    }
  }
  for (let a = 0; a < bounds.length; a++) for (let b = a + 1; b < bounds.length; b++) {
    assert(!bounds[a].obb.intersectsOBB(bounds[b].obb, 1e-8), `${bounds[a].object.uid}: overlaps ${bounds[b].object.uid}`);
  }
  for (const [platform, count] of baseCounts) assert(count > 0, `AI-${level.levelId}: platform ${platform} has no base supports`);
  return { baseSupports: Object.fromEntries(baseCounts), supportedBlocks: supportEdges.length };
}

function cameraPosition(normal) {
  const box = new THREE.Box3();
  const platforms = normal.objects.filter(object => object.type === 'platform');
  for (const object of normal.objects) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...object.position), rotation(object), new THREE.Vector3(1, 1, 1));
    box.union(new THREE.Box3(new THREE.Vector3(...object.size).multiplyScalar(-0.5), new THREE.Vector3(...object.size).multiplyScalar(0.5)).applyMatrix4(matrix));
  }
  const heading = platforms.reduce((result, platform) => {
    const angle = new THREE.Euler().setFromQuaternion(rotation(platform)).y;
    const weight = platform.size[0] * platform.size[2];
    result.sin += Math.sin(angle) * weight;
    result.cos += Math.cos(angle) * weight;
    return result;
  }, { sin: 0, cos: 0 });
  const distance = Math.max(box.getSize(new THREE.Vector3()).length() * 1.6, 8);
  return box.getCenter(new THREE.Vector3()).add(new THREE.Vector3(0, 0.25, -1)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(heading.sin, heading.cos)).normalize().multiplyScalar(distance));
}

function structuralChecks(level, original) {
  const label = `AI-${level.levelId}`;
  assert.equal(level.category, 'ai', label);
  assert.equal(level.design.revision, '2026-09-07-v2', label);
  assert.equal(level.settings.difficulty, level.levelId === 20 ? 1 : 0, label);
  assert(Number.isInteger(level.settings.moveCount) && level.settings.moveCount > 0, `${label}: invalid move count`);
  assert.deepEqual(materialSet(level), materialSet(original), `${label}: materials differ from same mainline level`);
  assert.equal(level.platforms.length, original.platforms.length, `${label}: platform count differs from mainline`);
  assert.equal(level.statistics.itemCount, level.items.length, label);
  assert.equal(level.statistics.destructibleItemCount, level.items.length, label);
  assert.equal(level.statistics.platformCount, level.platforms.length, label);
  assert.equal(level.statistics.entityCount, level.items.length + level.platforms.length, label);
  for (const [name, entities] of [['item', level.items], ['platform', level.platforms]]) {
    const sequences = entities.map(entity => entity.sequence);
    assert(sequences.every(sequence => Number.isInteger(sequence) && sequence > 0), `${label}: invalid ${name} sequence`);
    assert.equal(new Set(sequences).size, entities.length, `${label}: duplicate ${name} sequences`);
  }
  for (const platform of level.platforms) {
    assert.equal(platform.shape, 'rect', `${label}: early platform shape`);
    assert.equal(platform.movement, null, `${label}: early platform movement`);
    assert.equal(platform.rotationMotion, null, `${label}: early platform rotation motion`);
    assert(Object.values(platform.position).every(Number.isFinite), `${label}: invalid platform position`);
    assert(platform.size.width > 0 && platform.size.depth > 0, `${label}: invalid platform footprint`);
  }
  for (const item of level.items) {
    const profile = profiles.get(item.catalogId);
    assert(profile, `${label}: unknown catalog ${item.catalogId}`);
    assert.equal(item.materialId, profile.materialId, `${label}: catalog material`);
    assert.equal(item.shapeId, profile.sourceShapeId, `${label}: catalog shape`);
    assert.deepEqual([item.size.x, item.size.y, item.size.z], profile.size, `${label}: catalog source size`);
    assert.equal(item.stage, 1, `${label}: stage`);
    assert(Object.values(item.position).every(Number.isFinite), `${label}: invalid block position`);
    assert(Object.values(item.rotation).every(Number.isFinite), `${label}: invalid block quaternion`);
  }
  assert.equal(Object.values(level.obstacles).flat().length, 0, `${label}: early obstacles`);
  const entries = index.levels.filter(entry => entry.slug === `ai-${level.levelId}`);
  assert.equal(entries.length, 1, `${label}: index occurrences`);
  const entry = entries[0];
  assert.equal(entry.id, level.levelId, label);
  assert.equal(entry.category, 'ai', label);
  assert.equal(entry.counts.blocks, level.items.length, label);
  assert.equal(entry.counts.platforms, level.platforms.length, label);
  assert.equal(entry.moveCount, level.settings.moveCount, label);
  assert.equal(entry.difficultyValue, level.settings.difficulty, label);
  for (const field of ['intendedTargets', 'comparisonTargets']) {
    assert(Array.isArray(level.design[field]) && level.design[field].length, `${label}: ${field} empty`);
    for (const sequence of level.design[field]) assert(level.items.some(item => item.sequence === sequence), `${label}: unknown ${field} ${sequence}`);
    for (const platform of level.platforms) assert(level.design[field].some(sequence => level.items.find(item => item.sequence === sequence).platform === platform.sequence), `${label}: ${field} missing platform ${platform.sequence}`);
  }
}

const report = [];
const failures = [];
for (let id = 11; id <= 20; id++) {
  const level = read(path.join(data, `levels/ai-${id}.json`));
  const original = read(path.join(data, `levels/prod-${id}.json`));
  assert.equal(level.levelId, id);
  structuralChecks(level, original);
  const normal = normalizeRoyalSmashLevel(level, catalog);
  const geometry = geometryChecks(level, normal);
  const blocks = normal.objects.filter(object => object.type === 'block');
  const platformGroups = level.platforms.map(platform => ({ sequence: platform.sequence, blocks: blocks.filter(object => object.platformIndex === platform.sequence) }));
  const idleSimulation = await createLevelPhysics(normal, catalog);
  let idle;
  try {
    advance(idleSimulation, 5);
    idle = { ...measure(idleSimulation, blocks), groups: platformGroups.map(group => ({ platform: group.sequence, ...measure(idleSimulation, group.blocks) })) };
  } finally { disposeLevelPhysics(idleSimulation); }
  if (idle.shattered !== 0 || idle.maxDisplacement >= 0.15) failures.push(`${id}: unstable idle (${JSON.stringify(idle)})`);
  const camera = cameraPosition(normal);
  const shots = [];
  for (const group of platformGroups) for (const field of ['intendedTargets', 'comparisonTargets']) {
    const candidates = level.design[field].map(sequence => blocks.find(object => object.blockIndex === sequence)).filter(object => object.platformIndex === group.sequence);
    const target = candidates.reduce((nearest, object) => new THREE.Vector3(...object.position).distanceToSquared(camera) < new THREE.Vector3(...nearest.position).distanceToSquared(camera) ? object : nearest);
    const direction = new THREE.Vector3(...target.position).sub(camera).normalize();
    for (const strength of [10, 20]) {
      const simulation = await createLevelPhysics(normal, catalog);
      try {
        advance(simulation, 5);
        applyDirectionalImpact(simulation.bodies.get(target.uid), direction, strength);
        advance(simulation, 5);
        shots.push({ platform: group.sequence, kind: field === 'intendedTargets' ? 'intended' : 'comparison', sequence: target.blockIndex,
          strength, direction: direction.toArray().map(round), ...measure(simulation, blocks),
          groups: platformGroups.map(other => ({ platform: other.sequence, ...measure(simulation, other.blocks) })) });
      } finally { disposeLevelPhysics(simulation); }
    }
  }
  const row = { id, motif: level.design.motif, blocks: blocks.length, platforms: level.platforms.length, moves: level.settings.moveCount, materials: materialSet(level), geometry, idle, shots };
  report.push(row);
  console.log(JSON.stringify(row));
}
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'physics-report.json'), JSON.stringify({
  revision: '2026-09-07-v2',
  method: 'Five-second idle, then a single default-back-camera directional impact and five seconds of settling; both target types at forces 10 and 20 on each platform.',
  limitations: ['Preview impacts are impulses rather than launched balls.', 'The existing engine marks shattered blocks but retains their rigid-body colliders; counts measure preview response, not a complete game clear.'],
  levels: report,
  failures,
}, null, 2) + '\n');
assert.equal(failures.length, 0, failures.join('\n'));
console.log('PASS: AI11-20 materials, catalog, index, rotated platform bounds, oriented overlap, group supports and five-second idle. Both impact targets tested on every platform.');
