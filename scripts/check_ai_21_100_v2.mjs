import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { normalizeRoyalSmashLevel } from '../src/royalSmashLevel.js';
import { createLevelPhysics, stepLevelPhysics, applyDirectionalImpact, disposeLevelPhysics } from '../src/physics/levelPhysics.js';
import { GAME_TUNING } from '../src/gameTuning.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'public/data');
const output = path.join(root, 'outputs/ai-21-100-v2');
const revision = '2026-09-07-campaign-v3';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const round = value => Number(value.toFixed(4));
const vector = value => new THREE.Vector3(value.x, value.y, value.z);
const rotation = object => new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation.map(THREE.MathUtils.degToRad)));
const materials = items => [...new Set(items.map(item => item.materialId))].sort((a, b) => a - b);
const difficulty = id => id % 10 === 0 ? 2 : [4, 7].includes(id % 10) ? 1 : 0;
const boxJSON = box => ({ min: box.min.toArray().map(round), max: box.max.toArray().map(round) });
const obstacleArrays = level => ['bouncers', 'blockers', 'hammers'].map(key => level.obstacles?.[key] || []);

function options(argv) {
  const result = { from: 21, to: 100 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help') {
      console.log('Usage: node scripts/check_ai_21_100_v2.mjs [--from 21] [--to 100]');
      process.exit(0);
    }
    assert(['--from', '--to'].includes(argv[i]), `Unknown argument: ${argv[i]}`);
    result[argv[i].slice(2)] = Number(argv[++i]);
  }
  assert(Number.isInteger(result.from) && Number.isInteger(result.to) && result.from >= 21 && result.to <= 100 && result.from <= result.to,
    '--from/--to must describe an ascending range inside 21-100');
  return result;
}

function checkSequence(entities, label) {
  assert(entities.every(item => Number.isInteger(item.sequence) && item.sequence > 0), `${label}: invalid sequence`);
  assert.equal(new Set(entities.map(item => item.sequence)).size, entities.length, `${label}: duplicate sequence`);
}

function structuralChecks(level, original, catalog, index) {
  const id = level.levelId;
  const profiles = new Map(catalog.profiles.map(profile => [profile.catalogId, profile]));
  assert.equal(level.category, 'ai', 'category');
  assert.equal(level.design?.revision, revision, 'design.revision');
  assert.equal(level.settings?.difficulty, difficulty(id), 'difficulty cadence');
  assert(Number.isInteger(level.settings.moveCount) && level.settings.moveCount > 0, 'invalid move count');
  assert(Array.isArray(level.items) && level.items.length > 0, 'items must be nonempty');
  assert.deepEqual(level.platforms, original.platforms, 'platforms must exactly preserve mainline positions, sizes, rotations and motion parameters');
  assert.deepEqual(level.obstacles, original.obstacles, 'obstacles and their parameters must exactly preserve mainline');
  checkSequence(level.items, 'items');
  checkSequence(level.platforms, 'platforms');
  obstacleArrays(level).forEach((items, i) => checkSequence(items, ['bouncers', 'blockers', 'hammers'][i]));
  for (const platform of level.platforms) {
    assert(['rect', 'round'].includes(platform.shape), `platform ${platform.sequence}: unknown shape`);
    assert(platform.size.width > 0 && platform.size.depth > 0, `platform ${platform.sequence}: invalid footprint`);
    assert.deepEqual(materials(level.items.filter(item => item.platform === platform.sequence)),
      materials(original.items.filter(item => item.platform === platform.sequence)), `platform ${platform.sequence}: material set differs from mainline`);
    const motion = platform.movement;
    if (motion) {
      assert(['X', 'Y', 'Z'].includes(motion.axis), 'invalid movement axis');
      assert([motion.min, motion.max, motion.speed, motion.initialDirection, motion.easeTime, motion.startupDelay].every(Number.isFinite), 'invalid movement parameter');
      assert(motion.min <= motion.max && motion.speed >= 0, 'invalid movement range or speed');
    }
  }
  for (const item of level.items) {
    const profile = profiles.get(item.catalogId);
    assert(profile, `item ${item.sequence}: unknown catalog ${item.catalogId}`);
    assert.equal(item.materialId, profile.materialId, `item ${item.sequence}: catalog material`);
    assert.equal(item.shapeId, profile.sourceShapeId, `item ${item.sequence}: catalog shape`);
    assert.deepEqual([item.size.x, item.size.y, item.size.z], profile.size, `item ${item.sequence}: source size`);
    assert.equal(item.stage, 1, `item ${item.sequence}: stage`);
    assert(level.platforms.some(platform => platform.sequence === item.platform), `item ${item.sequence}: missing platform`);
    assert(['x', 'y', 'z'].every(axis => Number.isFinite(item.position[axis])), `item ${item.sequence}: invalid position`);
    assert(['x', 'y', 'z', 'w'].every(axis => Number.isFinite(item.rotation[axis])), `item ${item.sequence}: invalid rotation`);
    assert(Math.abs(Math.hypot(...['x', 'y', 'z', 'w'].map(axis => item.rotation[axis])) - 1) < 0.002, `item ${item.sequence}: non-unit quaternion`);
  }
  const obstacles = obstacleArrays(level).flat();
  const tnt = level.items.filter(item => item.materialId === 7).length;
  const expectedStats = {
    entityCount: level.items.length + level.platforms.length + obstacles.length,
    entityTypeCount: new Set(level.items.map(item => item.catalogId)).size + new Set([...level.platforms, ...obstacles].map(item => item.id)).size,
    platformCount: level.platforms.length,
    itemCount: level.items.length,
    destructibleItemCount: level.items.length - tnt,
    specialObstacleCount: obstacles.length + tnt,
    customEntityCount: level.platforms.length + obstacles.length,
  };
  for (const [key, value] of Object.entries(expectedStats)) assert.equal(level.statistics?.[key], value, `statistics.${key}`);
  const entries = index.levels.filter(entry => entry.slug === `ai-${id}`);
  assert.equal(entries.length, 1, 'index occurrences');
  const entry = entries[0];
  assert.equal(entry.id, id, 'index id');
  assert.equal(entry.category, 'ai', 'index category');
  assert.equal(entry.moveCount, level.settings.moveCount, 'index move count');
  assert.equal(entry.difficultyValue, level.settings.difficulty, 'index difficulty value');
  assert.equal(entry.difficulty, ['NORMAL', 'HARD', 'SUPER_HARD'][level.settings.difficulty], 'index difficulty label');
  assert.deepEqual(entry.counts, { platforms: level.platforms.length, blocks: level.items.length, obstacles: obstacles.length,
    bouncers: level.obstacles.bouncers.length, blockers: level.obstacles.blockers.length, hammers: level.obstacles.hammers.length, stages: 1 }, 'index counts');
  for (const field of ['intendedTargets', 'comparisonTargets']) {
    assert(Array.isArray(level.design[field]) && level.design[field].length, `${field} is empty`);
    assert(level.design[field].every(sequence => level.items.some(item => item.sequence === sequence)), `${field}: unknown sequence`);
    for (const platform of level.platforms) assert(level.design[field].some(sequence => level.items.find(item => item.sequence === sequence).platform === platform.sequence), `${field}: missing platform ${platform.sequence}`);
  }
}

function shapeFor(object) {
  const [width, height, depth] = object.size;
  let quaternion = rotation(object);
  if (object.shapeId === 1) {
    const axis = width > height && width >= depth ? 0 : depth > height && depth > width ? 2 : 1;
    const dimensions = [width, height, depth];
    if (axis === 0) quaternion.multiply(new THREE.Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2));
    if (axis === 2) quaternion.multiply(new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2));
    return { shape: new RAPIER.Cylinder(dimensions[axis] / 2, Math.max(...dimensions.filter((_, i) => i !== axis)) / 2), quaternion };
  }
  if (object.shapeId === 2) return { shape: new RAPIER.Cone(height / 2, Math.max(width, depth) / 2), quaternion };
  return { shape: new RAPIER.Cuboid(width / 2, height / 2, depth / 2), quaternion };
}

function geometryFor(object) {
  const position = new THREE.Vector3(...object.position);
  const quaternion = rotation(object);
  const corners = [];
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
    corners.push(new THREE.Vector3(x * object.size[0], y * object.size[1], z * object.size[2]).applyQuaternion(quaternion).add(position));
  }
  const collider = shapeFor(object);
  let surface = corners;
  if (object.shapeId === 1 || object.shapeId === 2) {
    const size = object.size;
    const axis = object.shapeId === 2 ? 1 : size[0] > size[1] && size[0] >= size[2] ? 0 : size[2] > size[1] && size[2] > size[0] ? 2 : 1;
    const halfHeight = size[axis] / 2;
    const radius = Math.max(...size.filter((_, i) => i !== axis)) / 2;
    surface = [];
    // Circumscribed rings conservatively include the curved collider between samples.
    for (let i = 0; i < 64; i++) for (const y of object.shapeId === 2 ? [-halfHeight] : [-halfHeight, halfHeight]) {
      const angle = i * Math.PI / 32;
      surface.push(new THREE.Vector3(Math.cos(angle) * radius / Math.cos(Math.PI / 64), y, Math.sin(angle) * radius / Math.cos(Math.PI / 64))
        .applyQuaternion(collider.quaternion).add(position));
    }
    if (object.shapeId === 2) surface.push(new THREE.Vector3(0, halfHeight, 0).applyQuaternion(collider.quaternion).add(position));
  }
  const matrix = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion));
  return { object, position, corners, surface, ...collider, box: new THREE.Box3().setFromPoints(corners),
    obb: new OBB(position, new THREE.Vector3(...object.size).multiplyScalar(0.5).addScalar(-0.008), matrix) };
}

function contact(a, b, prediction = 0.03) {
  return a.shape.contactShape(a.position, a.quaternion, b.shape, b.position, b.quaternion, prediction);
}

function geometryChecks(level, normal, errors, warnings) {
  const blocks = normal.objects.filter(object => object.type === 'block').map(geometryFor);
  const platformMap = new Map(normal.objects.filter(object => object.type === 'platform').map(object => [object.platformIndex, object]));
  const bases = new Map(level.platforms.map(platform => [platform.sequence, []]));
  const supported = new Set();
  const supportEdges = [];
  for (const block of [...blocks].sort((a, b) => a.box.min.y - b.box.min.y)) {
    const platform = platformMap.get(block.object.platformIndex);
    const inverse = rotation(platform).invert();
    const points = block.surface.map(point => point.clone().sub(new THREE.Vector3(...platform.position)).applyQuaternion(inverse));
    const localBox = new THREE.Box3().setFromPoints(points);
    if (localBox.min.y < -0.025) errors.push(`item ${block.object.blockIndex}: penetrates platform top`);
    if (Math.abs(localBox.min.y) <= 0.025) {
      const [width, , depth] = platform.size;
      const inside = platform.platformShape === 'round'
        ? points.every(point => (point.x / (width / 2 + 0.002)) ** 2 + (point.z / (depth / 2 + 0.002)) ** 2 <= 1.0001)
        : localBox.min.x >= -width / 2 - 0.002 && localBox.max.x <= width / 2 + 0.002 && localBox.min.z >= -depth / 2 - 0.002 && localBox.max.z <= depth / 2 + 0.002;
      if (!inside) errors.push(`item ${block.object.blockIndex}: base footprint outside ${platform.platformShape === 'round' ? 'ellipse' : 'rectangle'} of platform ${platform.platformIndex}`);
      bases.get(platform.platformIndex).push(block.object.blockIndex);
      supported.add(block.object.blockIndex);
    } else {
      const supports = blocks.filter(other => other !== block && other.object.platformIndex === block.object.platformIndex
        && supported.has(other.object.blockIndex) && Math.abs(other.box.max.y - block.box.min.y) <= 0.03
        && ['x', 'z'].every(axis => Math.min(other.box.max[axis], block.box.max[axis]) - Math.max(other.box.min[axis], block.box.min[axis]) > 0.015)
        && (contact(block, other)?.distance ?? Infinity) <= 0.03);
      if (!supports.length) errors.push(`item ${block.object.blockIndex}: no continuous touching support on platform ${block.object.platformIndex}`);
      else supported.add(block.object.blockIndex);
      supportEdges.push({ sequence: block.object.blockIndex, supportedBy: supports.map(other => other.object.blockIndex) });
    }
  }
  const confirmedOverlaps = [];
  let obbOnlyCandidates = 0;
  for (let a = 0; a < blocks.length; a++) for (let b = a + 1; b < blocks.length; b++) {
    if (!blocks[a].obb.intersectsOBB(blocks[b].obb, 1e-8)) continue;
    const overlap = contact(blocks[a], blocks[b], 0);
    if (overlap && overlap.distance < -0.016) {
      confirmedOverlaps.push({ items: [blocks[a].object.blockIndex, blocks[b].object.blockIndex], depth: round(-overlap.distance) });
      errors.push(`items ${blocks[a].object.blockIndex}/${blocks[b].object.blockIndex}: collider penetration ${round(-overlap.distance)}`);
    } else obbOnlyCandidates++;
  }
  for (const [platform, sequences] of bases) if (!sequences.length) errors.push(`platform ${platform}: no base supports`);
  if (obbOnlyCandidates) warnings.push(`${obbOnlyCandidates} OBB overlaps were rejected by collider shape checks; these are not confirmed intersections.`);
  return { blocks, report: { baseSupports: Object.fromEntries([...bases].map(([id, list]) => [id, list.length])), supportEdges,
    confirmedOverlaps, obbOnlyCandidates } };
}

function motionEnvelopes(level, normal, blocks, errors, warnings) {
  const envelopes = level.platforms.map(source => {
    const platform = normal.objects.find(object => object.type === 'platform' && object.platformIndex === source.sequence);
    const position = vector(source.position);
    const platformCorners = [];
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0]) for (const z of [-0.5, 0.5]) {
      platformCorners.push(new THREE.Vector3(x * source.size.width, y, z * source.size.depth).applyQuaternion(rotation(platform)).add(position));
    }
    const points = [...platformCorners, ...blocks.filter(block => block.object.platformIndex === source.sequence).flatMap(block => block.corners)];
    let box = new THREE.Box3().setFromPoints(points);
    const rotates = Math.abs(source.rotationMotion?.speed || 0) > 0.00001;
    if (rotates) {
      const axis = vector(source.rotationMotion.axis).normalize();
      if (Math.abs(axis.y) > 0.9999) {
        const radius = Math.max(...points.map(point => Math.hypot(point.x - position.x, point.z - position.z)));
        box.min.x = position.x - radius; box.max.x = position.x + radius;
        box.min.z = position.z - radius; box.max.z = position.z + radius;
      } else {
        const radius = Math.max(...points.map(point => point.distanceTo(position)));
        box = new THREE.Box3(position.clone().addScalar(-radius), position.clone().addScalar(radius));
        warnings.push(`platform ${source.sequence}: nonvertical rotation uses a conservative spherical motion envelope.`);
      }
    }
    const movement = source.movement;
    const moves = movement && movement.max - movement.min > 0.00001;
    if (movement) {
      const axis = movement.axis.toLowerCase();
      box.min[axis] += Math.min(0, movement.min, movement.max);
      box.max[axis] += Math.max(0, movement.min, movement.max);
      if (!moves) warnings.push(`platform ${source.sequence}: min equals max; preserved inert movement configuration.`);
    }
    if (box.min.x < -GAME_TUNING.physics.horizontalHalfBoundary || box.max.x > GAME_TUNING.physics.horizontalHalfBoundary
      || box.min.z < -GAME_TUNING.physics.depthHalfBoundary || box.max.z > GAME_TUNING.physics.depthHalfBoundary
      || box.min.y < GAME_TUNING.physics.fallHeight) errors.push(`platform ${source.sequence}: conservative movement envelope reaches a destruction boundary`);
    return { platform: source.sequence, rotates, moves: Boolean(moves), movement: source.movement, rotationMotion: source.rotationMotion, box };
  });
  const possibleOverlaps = [];
  for (let a = 0; a < envelopes.length; a++) for (let b = a + 1; b < envelopes.length; b++) {
    if (!envelopes[a].box.clone().expandByScalar(-0.015).intersectsBox(envelopes[b].box)) continue;
    possibleOverlaps.push({ platforms: [envelopes[a].platform, envelopes[b].platform], kind: 'conservative-envelope', confirmedCollision: false });
    warnings.push(`platforms ${envelopes[a].platform}/${envelopes[b].platform}: envelopes overlap; phase, speed and shape must be checked in the game before concluding a collision.`);
  }
  const blockerEnvelopes = normal.objects.filter(object => object.type === 'blocker').map(object => {
    const radius = Math.hypot(object.size[0], object.size[1]) / 2;
    const center = new THREE.Vector3(...object.position);
    const box = new THREE.Box3(center.clone().sub(new THREE.Vector3(radius, radius, object.size[2] / 2)), center.clone().add(new THREE.Vector3(radius, radius, object.size[2] / 2)));
    for (const group of envelopes) if (group.box.intersectsBox(box)) {
      possibleOverlaps.push({ platform: group.platform, blocker: object.uid, kind: 'approximate-blocker-envelope', confirmedCollision: false });
      warnings.push(`platform ${group.platform}/${object.uid}: approximate blocker sweep overlaps; preview has no blocker collider and cannot confirm contact.`);
    }
    return { uid: object.uid, approximate: true, bounds: boxJSON(box) };
  });
  return { platforms: envelopes.map(({ box, ...item }) => ({ ...item, bounds: boxJSON(box) })), possibleOverlaps, blockerEnvelopes,
    phaseAwareSimulation: false, completeMotionValidation: false };
}

function measure(simulation, objects) {
  const displacement = objects.map(object => new THREE.Vector3(...object.position).distanceTo(vector(simulation.bodies.get(object.uid).translation())));
  return { blocks: objects.length, shattered: objects.filter(object => simulation.shattered.has(object.uid)).length,
    moved: displacement.filter(value => value > 0.5).length, maxDisplacement: round(Math.max(0, ...displacement)) };
}

function observeCrossGroupContacts(simulation, groups, contacts) {
  if (groups.size < 2) return;
  const uidGroups = new Map([...groups].flatMap(([id, objects]) => objects.map(object => [object.uid, id])));
  for (const [uid, body] of simulation.bodies) {
    if (simulation.shattered.has(uid)) continue;
    const collider = body.collider(0);
    simulation.world.contactPairsWith(collider, other => {
      const otherUid = simulation.colliderUids.get(other.handle);
      if (!otherUid || uid >= otherUid || uidGroups.get(uid) === uidGroups.get(otherUid) || simulation.shattered.has(otherUid)) return;
      simulation.world.contactPair(collider, other, manifold => {
        if ([...Array(manifold.numContacts()).keys()].some(i => manifold.contactDist(i) <= 0.002)) {
          const key = [uid, otherUid].sort().join('|');
          contacts.set(key, { items: [uid, otherUid], platforms: [uidGroups.get(uid), uidGroups.get(otherUid)], observed: true });
        }
      });
    });
  }
}

function advance(simulation, seconds, groups, contacts) {
  for (let step = 0; step < Math.ceil(seconds / simulation.fixedStep); step++) {
    stepLevelPhysics(simulation, simulation.lastTime + simulation.fixedStep * 1000 + 0.000001);
    observeCrossGroupContacts(simulation, groups, contacts);
  }
}

function cameraPosition(normal) {
  const box = new THREE.Box3();
  const platforms = normal.objects.filter(object => object.type === 'platform');
  for (const object of normal.objects) box.union(geometryFor(object).box);
  const heading = platforms.reduce((sum, platform) => {
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation(platform));
    const weight = platform.size[0] * platform.size[2];
    sum.x += axis.x * weight; sum.z += axis.z * weight;
    return sum;
  }, { x: 0, z: 0 });
  return box.getCenter(new THREE.Vector3()).add(new THREE.Vector3(0, 0.25, -1)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(heading.x, heading.z)).normalize().multiplyScalar(Math.max(box.getSize(new THREE.Vector3()).length() * 1.6, 8)));
}

async function physicsChecks(level, normal, catalog, errors) {
  const objects = normal.objects.filter(object => object.type === 'block');
  const groups = new Map(level.platforms.map(platform => [platform.sequence, objects.filter(object => object.platformIndex === platform.sequence)]));
  const measurements = simulation => ({ ...measure(simulation, objects), groups: [...groups].map(([platform, blocks]) => ({ platform, ...measure(simulation, blocks) })) });
  const idleSimulation = await createLevelPhysics(normal, catalog);
  const idleContacts = new Map();
  let idle;
  try {
    advance(idleSimulation, 5, groups, idleContacts);
    idle = { ...measurements(idleSimulation), observedCrossGroupContacts: [...idleContacts.values()] };
  } finally { disposeLevelPhysics(idleSimulation); }
  for (const group of idle.groups) if (group.shattered > 0 || group.maxDisplacement >= 0.15) errors.push(`platform ${group.platform}: unstable five-second static idle (${group.shattered} shattered; displacement ${group.maxDisplacement})`);
  const camera = cameraPosition(normal);
  const shots = [];
  for (const [platform] of groups) for (const field of ['intendedTargets', 'comparisonTargets']) {
    const candidates = level.design[field].map(sequence => objects.find(object => object.blockIndex === sequence)).filter(object => object.platformIndex === platform);
    const target = candidates.reduce((nearest, object) => new THREE.Vector3(...object.position).distanceToSquared(camera) < new THREE.Vector3(...nearest.position).distanceToSquared(camera) ? object : nearest);
    const direction = new THREE.Vector3(...target.position).sub(camera).normalize();
    for (const strength of [10, 20]) {
      const simulation = await createLevelPhysics(normal, catalog);
      const contacts = new Map();
      try {
        advance(simulation, 5, groups, new Map());
        applyDirectionalImpact(simulation.bodies.get(target.uid), direction, strength);
        advance(simulation, 5, groups, contacts);
        shots.push({ platform, kind: field === 'intendedTargets' ? 'intended' : 'comparison', sequence: target.blockIndex,
          strength, direction: direction.toArray().map(round), ...measurements(simulation), observedCrossGroupContacts: [...contacts.values()] });
      } finally { disposeLevelPhysics(simulation); }
    }
  }
  return { idle, shots, camera: camera.toArray().map(round), targetSelection: 'Nearest authored target to the approximate default back camera for each platform and target type.' };
}

const range = options(process.argv.slice(2));
const catalog = read(path.join(data, 'catalog.json'));
const index = read(path.join(data, 'index.json'));
await RAPIER.init();
const report = {
  revision, range, generatedAt: new Date().toISOString(),
  method: 'Validate source contracts and continuous supports, confirm OBB candidates against collider shapes, check conservative motion envelopes, then run five-second static idle and intended/comparison impulses at strengths 10 and 20 on every platform, followed by five seconds of settling.',
  limitations: [
    'Platforms are fixed in the preview engine: no movement, rotation, timing, startup delay or motion easing is simulated.',
    'Blockers and other obstacles have no preview colliders; their trajectories, occlusion and collision timing require game testing.',
    'Round platforms use rectangular preview colliders. Separate ellipse containment checks validate authored base footprints; edge falls still need game testing.',
    'Motion envelopes ignore phase and use conservative bounds. Envelope overlap is a warning, not evidence that objects collide.',
    'Observed cross-group contacts are actual static-preview contacts, not tests of platform movement.',
    'Impacts directly apply impulses, include an upward component, and do not test launched-ball travel or unobstructed access to the target.',
    'The engine retains rigid-body colliders for shattered blocks and does not implement TNT blast propagation. Shatter counts do not certify a level clear or move budget.',
  ],
  levels: [], failures: [], warningCount: 0,
};
for (let id = range.from; id <= range.to; id++) {
  const row = { id, errors: [], warnings: [] };
  try {
    const level = read(path.join(data, `levels/ai-${id}.json`));
    const original = read(path.join(data, `levels/prod-${id}.json`));
    assert.equal(level.levelId, id, 'levelId');
    structuralChecks(level, original, catalog, index);
    Object.assign(row, { motif: level.design.motif, blocks: level.items.length, platforms: level.platforms.length,
      moves: level.settings.moveCount, materials: materials(level.items) });
    const normal = normalizeRoyalSmashLevel(level, catalog);
    const geometry = geometryChecks(level, normal, row.errors, row.warnings);
    row.geometry = geometry.report;
    row.motion = motionEnvelopes(level, normal, geometry.blocks, row.errors, row.warnings);
    Object.assign(row, await physicsChecks(level, normal, catalog, row.errors));
    row.status = row.errors.length ? 'failed' : 'static-checks-passed';
  } catch (error) {
    row.status = 'failed';
    row.errors.push(error.message);
  }
  report.levels.push(row);
  if (row.errors.length) report.failures.push({ id, errors: row.errors });
  report.warningCount += row.warnings.length;
  console.log(JSON.stringify({ id, status: row.status, blocks: row.blocks, idle: row.idle && { shattered: row.idle.shattered, maxDisplacement: row.idle.maxDisplacement },
    shotCount: row.shots?.length || 0, errors: row.errors, warnings: row.warnings }));
}
report.staticChecksPassed = report.failures.length === 0;
report.completeGameValidation = false;
fs.mkdirSync(output, { recursive: true });
const reportFile = path.join(output, `physics-${range.from}-${range.to}.json`);
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(`${report.staticChecksPassed ? 'PASS' : 'FAIL'} static checks: ${report.levels.length} levels; ${report.failures.length} failed; ${report.warningCount} warnings. Report: ${reportFile}`);
console.log('Platform motion, blockers, round-platform edge falls, TNT propagation and complete clears remain unverified.');
process.exitCode = report.staticChecksPassed ? 0 : 1;
