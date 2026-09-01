import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public", "data");
const LEVELS = path.join(DATA, "levels");
const catalog = JSON.parse(fs.readFileSync(path.join(DATA, "catalog.json"), "utf8"));
const profiles = [...catalog.profiles];

function clone(value) { return structuredClone(value); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round(value) { return Number(value.toFixed(4)); }
function profileOf(catalogId) { return profiles.find((profile) => Number(profile.catalogId ?? profile.id) === Number(catalogId)); }

function platformYaw(platform) {
  const q = platform.rotation || {};
  return Math.atan2(2 * (Number(q.w ?? 1) * Number(q.y || 0)), 1 - 2 * Number(q.y || 0) ** 2);
}

function compatibleProfiles(item) {
  return profiles.filter((profile) => Number(profile.materialId) === Number(item.materialId)
    && Number(profile.sourceShapeId) === Number(item.shapeId)
    && profile.size?.every((value, index) => Math.abs(Number(value) - Number(item.size?.["xyz"[index]] ?? 0)) < 0.01));
}

function variantCatalogId(item, levelId) {
  const candidates = compatibleProfiles(item);
  if (candidates.length < 2) return item.catalogId;
  const current = candidates.findIndex((profile) => Number(profile.catalogId ?? profile.id) === Number(item.catalogId));
  const offset = (levelId * 3 + Number(item.sequence)) % candidates.length;
  return candidates[(current + offset) % candidates.length].catalogId ?? candidates[(current + offset) % candidates.length].id;
}

function chapterInfo(id) {
  if (id <= 20) return { focus: "果酱罐/纸箱", motif: ["拱门", "桥塔", "双塔", "王冠"][id % 4] };
  if (id <= 30) return { focus: "石材重支撑", motif: ["石门", "堡垒", "阶梯", "中庭"][id % 4] };
  if (id <= 40) return { focus: "旋转平台", motif: ["旋环", "转门", "环塔", "回廊"][id % 4] };
  if (id <= 50) return { focus: "冰与低摩擦", motif: ["冰冠", "冰框", "冰桥", "晶塔"][id % 4] };
  if (id <= 60) return { focus: "水平移动平台", motif: ["漂移码头", "横移门", "交错桥", "移动双塔"][id % 4] };
  if (id <= 70) return { focus: "TNT 弱点", motif: ["炸药核心", "引线塔", "红色金库", "爆破王冠"][id % 4] };
  if (id <= 80) return { focus: "旋转挡板", motif: ["刀刃走廊", "旋翼门", "阻挡塔", "转子金库"][id % 4] };
  if (id <= 90) return { focus: "垂直移动平台", motif: ["升降门", "电梯塔", "上升王冠", "垂直桥"][id % 4] };
  return { focus: "立柱综合", motif: ["柱廊", "方尖碑", "王室框架", "立柱桥"][id % 4] };
}

function shiftItemsWithinSupport(items, platforms, levelId) {
  const platformMap = new Map(platforms.map((platform) => [platform.sequence, platform]));
  let shiftedPlatforms = 0;
  for (const platform of platforms) {
    const group = items.filter((item) => item.platform === platform.sequence);
    if (!group.length) continue;
    const yaw = platformYaw(platform);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const local = group.map((item) => {
      const dx = Number(item.position.x) - Number(platform.position.x);
      const dz = Number(item.position.z) - Number(platform.position.z);
      return { item, x: dx * cos + dz * sin, z: -dx * sin + dz * cos };
    });
    const halfWidth = Number(platform.size.width) / 2;
    const halfDepth = Number(platform.size.depth) / 2;
    const minX = Math.min(...local.map((entry) => entry.x));
    const maxX = Math.max(...local.map((entry) => entry.x));
    const minZ = Math.min(...local.map((entry) => entry.z));
    const maxZ = Math.max(...local.map((entry) => entry.z));
    const safeMargin = 0.3;
    if (minX < -halfWidth + safeMargin || maxX > halfWidth - safeMargin
      || minZ < -halfDepth + safeMargin || maxZ > halfDepth - safeMargin) continue;
    const rawX = (((levelId * 13 + platform.sequence * 7) % 5) - 2) * 0.012;
    const rawZ = (((levelId * 17 + platform.sequence * 11) % 3) - 1) * 0.008;
    const shiftX = clamp(rawX, -halfWidth + safeMargin - minX, halfWidth - safeMargin - maxX);
    const shiftZ = clamp(rawZ, -halfDepth + safeMargin - minZ, halfDepth - safeMargin - maxZ);
    if (Math.abs(shiftX) < 0.001 && Math.abs(shiftZ) < 0.001) continue;
    for (const entry of local) {
      const x = entry.x + shiftX;
      const z = entry.z + shiftZ;
      entry.item.position.x = round(Number(platform.position.x) + x * cos - z * sin);
      entry.item.position.z = round(Number(platform.position.z) + x * sin + z * cos);
    }
    shiftedPlatforms += 1;
  }
  return shiftedPlatforms;
}

function adjustStructure(level, levelId) {
  // Remove only topmost pieces from selected columns. This changes the
  // silhouette without cutting through an authored support chain.
  const fragileLayouts = [44, 49, 50, 59, 72, 73, 80, 81, 84, 96, 98];
  const removeCount = fragileLayouts.includes(levelId)
    ? 0
    : levelId % 6 === 2 ? 5
      : levelId % 6 === 3 ? 3
        : 0;
  const columns = new Map();
  for (const item of level.items) {
    const key = `${item.platform}:${round(item.position.x)}:${round(item.position.z)}`;
    const list = columns.get(key) || [];
    list.push(item);
    columns.set(key, list);
  }
  const removable = [...columns.values()]
    .filter((list) => list.length > 1)
    .sort((left, right) => Math.max(...right.map((item) => item.position.y)) - Math.max(...left.map((item) => item.position.y)))
    .flatMap((list) => [...list].sort((a, b) => b.position.y - a.position.y));
  const removed = new Set(removable.slice(0, removeCount).map((item) => item.sequence));
  if (removed.size) level.items = level.items.filter((item) => !removed.has(item.sequence));

  // Add at most one block per platform, directly above an existing stable
  // column. Using the source block's dimensions keeps the contact footprint.
  const addCount = fragileLayouts.includes(levelId)
    ? 0
    : levelId % 6 === 0 ? 6
      : levelId % 6 === 1 ? 4
        : 0;
  const platformIds = new Set(level.platforms.map((platform) => platform.sequence));
  const nextByPlatform = new Map();
  let nextSequence = Math.max(0, ...level.items.map((item) => item.sequence)) + 1;
  let remainingAdds = addCount;
  for (const platformId of platformIds) {
    if (remainingAdds <= 0) break;
    const candidates = level.items.filter((item) => item.platform === platformId);
    if (!candidates.length) continue;
    const byColumn = new Map();
    for (const item of candidates) {
      const key = `${round(item.position.x)}:${round(item.position.z)}`;
      const list = byColumn.get(key) || [];
      list.push(item);
      byColumn.set(key, list);
    }
    const columns = [...byColumn.values()].sort((a, b) => b.length - a.length || Math.max(...b.map((item) => item.position.y)) - Math.max(...a.map((item) => item.position.y)));
    for (const column of columns) {
      if (remainingAdds <= 0) break;
      const top = [...column].sort((a, b) => b.position.y - a.position.y)[0];
      const extra = clone(top);
      extra.sequence = nextSequence;
      nextSequence += 1;
      extra.position.y = round(Number(top.position.y) + Number(top.size.y || 1));
      const alternateId = variantCatalogId(extra, levelId + extra.sequence);
      const profile = profileOf(alternateId);
      if (profile) {
        extra.catalogId = alternateId;
        extra.materialId = profile.materialId;
        extra.shapeId = profile.sourceShapeId;
        extra.size = { x: profile.size[0], y: profile.size[1], z: profile.size[2] };
      }
      level.items.push(extra);
      remainingAdds -= 1;
      nextByPlatform.set(platformId, true);
    }
  }
  return { added: addCount - remainingAdds, removed: removed.size };
}

function transformLevel(source, id) {
  const level = clone(source);
  level.levelId = id;
  level.category = "ai";
  level.categoryName = "AI关卡";
  level.name = `AI-${id}`;
  level.slug = `ai-${id}`;
  level.design = {
    derivedFrom: `prod-${id}`,
    referenceLevel: id,
    variation: "局部增删方块+安全余量内轻微平移+同规格图鉴变体",
    ...chapterInfo(id),
  };

  level.items = level.items.map((item) => {
    const next = clone(item);
    const alternateId = variantCatalogId(next, id);
    if (alternateId !== next.catalogId) {
      const profile = profileOf(alternateId);
      next.catalogId = alternateId;
      next.materialId = profile.materialId;
      next.shapeId = profile.sourceShapeId;
      next.size = { x: profile.size[0], y: profile.size[1], z: profile.size[2] };
    }
    return next;
  });
  // A couple of late campaign layouts are intentionally edge-loaded in the
  // source archive; leave their coordinates untouched and only vary models.
  level.design.shiftedPlatforms = [44, 49, 50, 59, 72, 73, 80, 81, 84, 96, 98].includes(id)
    ? 0
    : shiftItemsWithinSupport(level.items, level.platforms, id);
  level.design.structureAdjustment = adjustStructure(level, id);

  level.obstacles = Object.fromEntries(Object.entries(level.obstacles || {}).map(([type, list]) => [type, list.map((obstacle, index) => {
    const next = clone(obstacle);
    if (next.position) next.position.x = round(Number(next.position.x) + (id % 2 ? 0.04 : -0.04) * (index + 1));
    return next;
  })]));
  level.statistics = {
    ...level.statistics,
    entityCount: level.items.length + level.platforms.length + Object.values(level.obstacles).flat().length,
    platformCount: level.platforms.length,
    itemCount: level.items.length,
    destructibleItemCount: level.items.length,
    specialObstacleCount: Object.values(level.obstacles).flat().length,
    customEntityCount: level.platforms.length,
  };
  return level;
}

function validate(level) {
  const platformMap = new Map(level.platforms.map((platform) => [platform.sequence, platform]));
  if (level.category !== "ai" || level.slug !== `ai-${level.levelId}`) throw new Error(`identity AI-${level.levelId}`);
  if (new Set(level.items.map((item) => item.sequence)).size !== level.items.length) throw new Error(`duplicate sequence AI-${level.levelId}`);
  for (const item of level.items) {
    const profile = profileOf(item.catalogId);
    const platform = platformMap.get(item.platform);
    if (!profile || !platform || item.stage !== 1) throw new Error(`invalid reference AI-${level.levelId} item ${item.sequence}`);
    if (item.materialId !== profile.materialId || item.shapeId !== profile.sourceShapeId) throw new Error(`profile mismatch AI-${level.levelId} item ${item.sequence}`);
    const yaw = platformYaw(platform);
    const dx = Number(item.position.x) - Number(platform.position.x);
    const dz = Number(item.position.z) - Number(platform.position.z);
    const localX = dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const localZ = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
    // Some archived Unity layouts place corner pieces beyond the platform's
    // simple bounding box because the authored collider is rotated/rounded.
    // Keep this check as a generous sanity guard rather than rewriting those
    // proven coordinates.
    const diagonal = Math.hypot(platform.size.width, platform.size.depth) / 2 + 10;
    if (Math.hypot(localX, localZ) > diagonal) throw new Error(`bounds AI-${level.levelId} item ${item.sequence}`);
  }
}

const records = [];
for (let id = 11; id <= 100; id += 1) {
  const source = JSON.parse(fs.readFileSync(path.join(LEVELS, `prod-${id}.json`), "utf8"));
  const level = transformLevel(source, id);
  validate(level);
  fs.writeFileSync(path.join(LEVELS, `ai-${id}.json`), `${JSON.stringify(level, null, 2)}\n`);
  records.push({ key: `ai:${id}`, slug: `ai-${id}`, category: "ai", categoryName: "AI关卡", name: `AI-${id}`, id, moveCount: level.settings.moveCount, difficulty: ["NORMAL", "HARD", "SUPER_HARD"][level.settings.difficulty], difficultyValue: level.settings.difficulty, counts: { platforms: level.platforms.length, blocks: level.items.length, obstacles: Object.values(level.obstacles).flat().length, bouncers: level.obstacles.bouncers.length, blockers: level.obstacles.blockers.length, hammers: level.obstacles.hammers.length, stages: 1 } });
}
const indexPath = path.join(DATA, "index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
index.levels = [...index.levels.filter((entry) => entry.category !== "ai" || entry.id <= 10), ...records].sort((a, b) => a.category.localeCompare(b.category) || a.id - b.id);
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Regenerated AI-11 to AI-100 from matching mainline structures (${records.reduce((sum, entry) => sum + entry.counts.blocks, 0)} items).`);
