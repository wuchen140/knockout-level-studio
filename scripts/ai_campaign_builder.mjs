import fs from 'node:fs';
import * as THREE from 'three';

const catalog = JSON.parse(fs.readFileSync(new URL('../public/data/catalog.json', import.meta.url)));
export const profiles = new Map(catalog.profiles.map(p => [p.catalogId, p]));
export const revision = '2026-09-07-campaign-v3';
const q = value => new THREE.Quaternion(value.x, value.y, value.z, value.w).normalize();
const round = value => Number(value.toFixed(7));

export function createLevel(source, design) {
  return {
    levelId: source.levelId, category: 'ai', categoryName: 'AI关卡',
    name: `AI-${source.levelId}`, slug: `ai-${source.levelId}`,
    settings: { ...source.settings, moveCount: design.moves ?? source.settings.moveCount, stabilizeOnSpawn: false },
    design: { revision, referenceLevel: source.levelId, ...design, intendedTargets: [], comparisonTargets: [] },
    statistics: {}, items: [], platforms: structuredClone(source.platforms), obstacles: structuredClone(source.obstacles),
  };
}

// Coordinates are local to the platform top; both centers and model axes rotate together.
export function put(level, platformId, catalogId, x, y, z, options = {}) {
  const profile = profiles.get(catalogId);
  if (!profile) throw new Error(`Unknown catalog ${catalogId}`);
  const platform = level.platforms.find(p => p.sequence === platformId);
  if (!platform) throw new Error(`Unknown platform ${platformId}`);
  const base = q(platform.rotation);
  const itemRotation = base.clone();
  if (options.beam) itemRotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
  if (options.depthBeam) itemRotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  if (options.rotation) itemRotation.multiply(q(options.rotation));
  const position = new THREE.Vector3(x, y, z).applyQuaternion(base).add(new THREE.Vector3(platform.position.x, platform.position.y, platform.position.z));
  const sequence = level.items.length + 1;
  level.items.push({ sequence, catalogId, stage: 1, platform: platformId, materialId: profile.materialId,
    shapeId: profile.sourceShapeId, position: { x: round(position.x), y: round(position.y), z: round(position.z) },
    rotation: { x: round(itemRotation.x), y: round(itemRotation.y), z: round(itemRotation.z), w: round(itemRotation.w) },
    size: { x: profile.size[0], y: profile.size[1], z: profile.size[2] } });
  if (options.target === 'weak') level.design.intendedTargets.push(sequence);
  if (options.target === 'compare') level.design.comparisonTargets.push(sequence);
  return sequence;
}

export function column(level, platform, x, z, ids, base = 0, options = {}) {
  let top = base;
  ids.forEach((catalogId, index) => {
    const height = profiles.get(catalogId).modelSize[1];
    put(level, platform, catalogId, x, top + height / 2, z, { ...options,
      target: index === (options.weakIndex ?? ids.length - 1) ? 'weak' : index === (options.compareIndex ?? 0) ? 'compare' : '' });
    top += height;
  });
  return top;
}

// Explicit height maps retain independent vertical load paths. The material callback owns every cell.
export function heightMap(level, platform, rows, material, options = {}) {
  const depth = rows.length;
  for (let zi = 0; zi < depth; zi++) for (let xi = 0; xi < rows[zi].length; xi++) {
    const height = rows[zi][xi];
    const x = (xi - (rows[zi].length - 1) / 2) * (options.pitchX ?? 1) + (options.x ?? 0);
    const z = (zi - (depth - 1) / 2) * (options.pitchZ ?? 1) + (options.z ?? 0);
    for (let y = 0; y < height; y++) {
      put(level, platform, typeof material === 'function' ? material(xi, y, zi, height) : material,
        x, (options.base ?? 0) + y + 0.5, z,
        { target: y === (options.weakRow ?? height - 1) ? 'weak' : y === (options.compareRow ?? 0) ? 'compare' : '' });
    }
  }
}

export function finalize(level) {
  const obstacleCount = Object.values(level.obstacles).flat().length;
  const tnt = level.items.filter(i => i.materialId === 7).length;
  level.statistics = { entityCount: level.items.length + level.platforms.length + obstacleCount,
    entityTypeCount: new Set([...level.items.map(i => String(i.catalogId)), ...level.platforms.map(p => p.id), ...Object.values(level.obstacles).flat().map(o => o.id)]).size,
    platformCount: level.platforms.length, itemCount: level.items.length, destructibleItemCount: level.items.length - tnt,
    specialObstacleCount: tnt + obstacleCount, customEntityCount: level.platforms.length + obstacleCount };
  for (const platform of level.platforms) {
    const items = level.items.filter(i => i.platform === platform.sequence);
    if (!items.length) throw new Error(`AI-${level.levelId}: empty platform ${platform.sequence}`);
    for (const field of ['intendedTargets', 'comparisonTargets']) {
      if (!level.design[field].some(sequence => items.some(item => item.sequence === sequence))) {
        throw new Error(`AI-${level.levelId}: ${field} missing platform ${platform.sequence}`);
      }
    }
  }
  for (const field of ['intendedTargets', 'comparisonTargets']) {
    const unique = [...new Set(level.design[field])];
    level.design[field] = level.platforms.flatMap(platform => unique.filter(sequence =>
      level.items.some(item => item.sequence === sequence && item.platform === platform.sequence)).slice(0, 6));
  }
  return level;
}
