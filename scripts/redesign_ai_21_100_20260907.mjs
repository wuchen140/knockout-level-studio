import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLevel, finalize, heightMap, put, column, profiles, revision } from './ai_campaign_builder.mjs';
import { plans as latePlans } from './ai_61_100_plan.mjs';
import { buildLevel as buildEarlyLevel } from './ai_campaign_21_60.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'public/data');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const idsByMaterial = new Map();
for (const profile of profiles.values()) {
  const key = `${profile.materialId}:${profile.modelSize.join('x')}:${profile.sourceShapeId}`;
  if (!idsByMaterial.has(key)) idsByMaterial.set(key, []);
  idsByMaterial.get(key).push(profile.catalogId);
}
const colors = new Map();
for (const [key, ids] of idsByMaterial) colors.set(key, ids.sort((a, b) => a - b));
const cube = material => colors.get(`${material}:1x1x1:1`)?.[0] ?? colors.get(`${material}:1x1x1:2`)?.[0];
const anyUnit = material => [...colors.entries()].find(([key]) => key.startsWith(`${material}:1x1x1:`))?.[1]?.[0];
const long = (material, length, shape = 1) => colors.get(`${material}:1x${length}x1:${shape}`)?.[0]
  ?? [...colors.entries()].find(([key]) => key.startsWith(`${material}:1x${length}x1:`))?.[1]?.[0] ?? anyUnit(material);
const pick = (material, x, y, z, length = 1, shape = 1) => {
  const ids = colors.get(`${material}:1x${length}x1:${shape}`)
    || colors.get(`${material}:1x1x1:2`) || colors.get(`${material}:1x1x1:1`) || [anyUnit(material)];
  return ids[Math.abs(x * 13 + y * 7 + z * 3) % ids.length | 0];
};
const materialNames = { 1: '罐头', 2: '果酱罐', 3: '石材', 4: '纸箱', 5: '冰', 7: 'TNT', 9: '彩色箱', 10: '立柱' };
const nameToMaterial = Object.fromEntries(Object.entries(materialNames).map(([id, name]) => [name, Number(id)]));
const role = id => id % 10 === 0 ? '章节综合·超难' : [4, 7].includes(id % 10) ? '组合考试·困难' : id % 10 === 1 ? '机制隔离教学' : [2, 3].includes(id % 10) ? '机制练习' : [5, 6].includes(id % 10) ? '恢复与变体' : '规模与纵深递进';
const difficulty = id => id % 10 === 0 ? 2 : [4, 7].includes(id % 10) ? 1 : 0;

const earlyMotifs = [
  '石阶王座','三孔石拱廊','尖顶石钟楼','石柱粮仓','彩窗石桥','圆庭凉亭','三座仓门','镶边果酱盾','斜台阶金字塔','石环王冠堡',
  '彩带八角亭','转台四角城','双转台果酱棋子','转台三尖炮楼','三台尖顶街屋','双塔吊桥门','重梁果酱闸门','双窗纸石车站','双色石框城门','旋转四面王冠',
  '低冰门','冰罐保龄球阵','冰梁彩窗宫','冰桥双层钟架','果酱三峰山门','前牌楼后城堡','冰筒阶塔','折线三堡','前冰门后果酱殿','冰面皇家盾',
  '移动尖顶车厢','双台货仓','移动前哨与后殿','双台梁栈门','冰筒双窗桥','斜台石门牌坊','石骨果酱方尖塔','三跨彩色栈桥','左冰亭右彩堡','双转台冠堡',
];

function sourceMaterialSets(source) {
  return new Map(source.platforms.map(platform => [platform.sequence,
    [...new Set(source.items.filter(item => item.platform === platform.sequence).map(item => item.materialId))]]));
}

function defaultPlan(source) {
  const id = source.levelId;
  const motif = earlyMotifs[id - 21];
  return { id, name: motif, motif, role: role(id), moves: source.settings.moveCount,
    weakPoint: '分区上沿与中腰连接点。', collapseRoute: '先卸顶部负载，再逐个处理独立承重组。',
    targetBand: [Math.max(16, Math.round(source.items.length * .7)), Math.max(22, Math.round(source.items.length * .98))],
    groups: source.platforms.map(platform => ({ platform: platform.sequence, sourceMaterials: Object.fromEntries(
      [...sourceMaterialSets(source).get(platform.sequence)].map(material => [materialNames[material], 1])) })) };
}

function planFor(source) { return latePlans.find(plan => plan.id === source.levelId) || defaultPlan(source); }

function compactRecipe(level, platform, materials, variant, targetCount = 0) {
  const p = level.platforms.find(value => value.sequence === platform);
  const width = Math.max(1, Math.floor(p.size.width - .2));
  const depth = Math.max(1, Math.min(3, Math.floor(p.shape === 'round' ? p.size.depth - .15 : p.size.depth + .001)));
  const narrow = Math.min(width, p.shape === 'round' ? Math.max(3, Math.floor(width * .7)) : width);
  const columns = Math.max(1, narrow);
  const center = (columns - 1) / 2;
  const mode = variant % 8;
  const rows = Array.from({ length: depth }, (_, z) => Array.from({ length: columns }, (_, x) => {
    const distance = Math.abs(x - center);
    if (mode === 0) return 3 + Math.max(0, 3 - Math.ceil(distance));
    if (mode === 1) return 3 + (x === 1 || x === columns - 2 ? 3 : (x + z) % 2);
    if (mode === 2) return 3 + (x === 0 || x === columns - 1 || x === Math.floor(center) ? 2 : 0);
    if (mode === 3) return 2 + ((x + z) % 4);
    if (mode === 4) return z === 0 && Math.abs(x - center) < .6 ? 0 : 3 + (x % 3 === 0 ? 2 : 0);
    if (mode === 5) return 2 + Math.min(4, x);
    if (mode === 6) return 2 + z * 2 + ((x + variant) % 2);
    return 3 + ((x * 2 + z + variant) % 3);
  }));
  const occupied = rows.flat().filter(Boolean).length;
  const current = rows.flat().reduce((sum, value) => sum + value, 0);
  const extra = occupied ? Math.max(0, Math.min(5, Math.ceil((targetCount - current) / occupied))) : 0;
  for (const row of rows) for (let x = 0; x < row.length; x++) if (row[x]) row[x] += extra;
  heightMap(level, platform, rows, (x, y, z, height) => {
    const material = materials[(x * 5 + y * 3 + z + variant) % materials.length];
    return pick(material, x, y, z);
  }, { pitchX: 1, pitchZ: 1, weakRow: Math.min(2, Math.max(...rows.flat()) - 1), compareRow: 0 });
}

function sparseTeaching(level, platform, materials, variant) {
  const p = level.platforms.find(value => value.sequence === platform);
  const width = Math.max(3, Math.min(7, Math.floor(p.size.width - .2)));
  const primary = materials[0];
  const secondary = materials[1] ?? primary;
  for (let x = -Math.floor(width / 2); x <= Math.floor(width / 2); x += 2) {
    column(level, platform, x, 0, [long(primary, 2)], 0, { weakIndex: 0, compareIndex: 0 });
  }
  const beamLength = width >= 5 ? 3 : 2;
  put(level, platform, long(secondary, beamLength), -1.5, 2.5, 0, { beam: true, target: 'weak' });
  put(level, platform, long(primary, beamLength), 1.5, 2.5, 0, { beam: true, target: 'compare' });
  if (p.size.depth >= 2.5) {
    put(level, platform, pick(primary, variant, 3, 1), 0, .5, 1, { target: 'compare' });
    put(level, platform, pick(secondary, variant, 4, 1), 0, 1.5, 1, { target: 'weak' });
  }
}

function addTnt(level, platform, count, materials) {
  if (!count) return;
  const candidates = level.items.filter(i => i.platform === platform && i.position.y < 6);
  const chosen = candidates.filter((_, index) => index % Math.max(1, Math.floor(candidates.length / count)) === 0).slice(0, count);
  for (const item of chosen) {
    const profile = profiles.get(item.catalogId);
    if (profile.modelSize.some(value => value !== 1)) continue;
    const tnt = pick(7, item.sequence, count, platform);
    const tntProfile = profiles.get(tnt);
    Object.assign(item, { catalogId: tnt, materialId: 7, shapeId: tntProfile.sourceShapeId,
      size: { x: tntProfile.size[0], y: tntProfile.size[1], z: tntProfile.size[2] } });
    if (!level.design.intendedTargets.includes(item.sequence)) level.design.intendedTargets.push(item.sequence);
  }
  // If a group is very small, append supported TNT directly on the platform.
  while (level.items.filter(i => i.platform === platform && i.materialId === 7).length < count) {
    const index = level.items.filter(i => i.platform === platform && i.materialId === 7).length;
    put(level, platform, pick(7, index, count, platform), index - (count - 1) / 2, .5, 0, { target: 'weak' });
  }
}

function build(source) {
  const plan = planFor(source);
  const level = createLevel(source, { motif: plan.name || plan.motif,
    lesson: `${plan.role}；${plan.motif || ''}；参考同编号主线的平台、材料和机关语法重新搭建。`,
    weakPoint: plan.weakPoint, collapseRoute: plan.collapseRoute, targetBand: plan.targetBand, moves: plan.moves });
  level.settings.difficulty = difficulty(source.levelId);
  const sourceSets = sourceMaterialSets(source);
  for (const [groupIndex, group] of plan.groups.entries()) {
    const materials = Object.keys(group.sourceMaterials).map(name => nameToMaterial[name] ?? Number(name)).filter(Number.isFinite);
    const sourceMaterials = sourceSets.get(group.platform);
    const allowed = materials.length ? materials : sourceMaterials;
    const nonTnt = allowed.filter(material => material !== 7);
    const tiny = level.platforms.find(p => p.sequence === group.platform).size.depth <= 1.05;
    const intro = source.levelId < 61 && (source.items.filter(i => i.platform === group.platform).length <= 30 || source.levelId === 41);
    if (intro && !tiny) sparseTeaching(level, group.platform, nonTnt, source.levelId + groupIndex);
    else {
      const groupSourceCount = source.items.filter(item => item.platform === group.platform).length;
      const target = Math.round(plan.targetBand[0] * groupSourceCount / source.items.length);
      compactRecipe(level, group.platform, nonTnt, source.levelId + groupIndex, target);
    }
    const sourceTnt = source.items.filter(i => i.platform === group.platform && i.materialId === 7).length;
    addTnt(level, group.platform, sourceTnt, nonTnt);
    // Guarantee every source material appears on its original platform without introducing foreign materials.
    for (const material of sourceMaterials) if (!level.items.some(i => i.platform === group.platform && i.materialId === material)) {
      const replacement = level.items.find(i => i.platform === group.platform && profiles.get(i.catalogId).modelSize.every(value => value === 1));
      if (!replacement) put(level, group.platform, pick(material, source.levelId, groupIndex, material), 0, .5, 0, { target: material === 7 ? 'weak' : 'compare' });
      else {
        const catalogId = pick(material, source.levelId, groupIndex, material); const profile = profiles.get(catalogId);
        Object.assign(replacement, { catalogId, materialId: material, shapeId: profile.sourceShapeId,
          size: { x: profile.size[0], y: profile.size[1], z: profile.size[2] } });
      }
    }
  }
  return finalize(level);
}

const indexPath = path.join(data, 'index.json');
const index = read(indexPath);
for (let id = 21; id <= 100; id++) {
  const source = read(path.join(data, `levels/prod-${id}.json`));
  let level;
  if (id <= 60) {
    try { level = buildEarlyLevel(source); }
    catch (error) {
      if (!String(error.message).includes('not implemented')) throw error;
      level = build(source);
    }
  } else level = build(source);
  fs.writeFileSync(path.join(data, `levels/ai-${id}.json`), `${JSON.stringify(level, null, 2)}\n`);
  const entry = index.levels.find(value => value.category === 'ai' && value.id === id);
  if (!entry) throw new Error(`Missing AI index ${id}`);
  const obstacles = Object.values(level.obstacles).flat().length;
  Object.assign(entry, { moveCount: level.settings.moveCount,
    difficulty: ['NORMAL', 'HARD', 'SUPER_HARD'][level.settings.difficulty], difficultyValue: level.settings.difficulty,
    counts: { platforms: level.platforms.length, blocks: level.items.length, obstacles,
      bouncers: level.obstacles.bouncers.length, blockers: level.obstacles.blockers.length,
      hammers: level.obstacles.hammers.length, stages: 1 } });
  console.log(`AI-${id} ${level.design.motif}: ${level.items.length} items, ${level.platforms.length} platforms`);
}
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Generated AI21-100 revision ${revision}`);
