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
    variation: id % 2 ? "镜像+浅层深度偏移" : "反向镜像+横向压缩",
    ...chapterInfo(id),
  };

  const platformMap = new Map(level.platforms.map((platform) => [platform.sequence, platform]));
  const mirror = id % 2 === 1 ? -1 : 1;
  const xScale = id % 3 === 0 ? 0.92 : id % 3 === 1 ? 1.04 : 1;
  const zOffset = ((id * 7) % 5 - 2) * 0.14;
  level.items = level.items.map((item) => {
    const next = clone(item);
    const platform = platformMap.get(item.platform);
    if (platform) {
      const relX = Number(item.position.x) - Number(platform.position.x);
      const relZ = Number(item.position.z) - Number(platform.position.z);
      const halfWidth = Number(platform.size.width) / 2 - 0.12;
      const halfDepth = Number(platform.size.depth) / 2 - 0.12;
      next.position.x = round(Number(platform.position.x) + clamp(relX * xScale * mirror, -halfWidth, halfWidth));
      next.position.z = round(Number(platform.position.z) + clamp(relZ + zOffset, -halfDepth, halfDepth));
    }
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

  level.obstacles = Object.fromEntries(Object.entries(level.obstacles || {}).map(([type, list]) => [type, list.map((obstacle, index) => {
    const next = clone(obstacle);
    if (next.position) next.position.x = round(Number(next.position.x) + (id % 2 ? 0.18 : -0.18) * (index + 1));
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
    if (Math.abs(item.position.x - platform.position.x) > platform.size.width / 2 + 0.01 || Math.abs(item.position.z - platform.position.z) > platform.size.depth / 2 + 0.01) throw new Error(`bounds AI-${level.levelId} item ${item.sequence}`);
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
