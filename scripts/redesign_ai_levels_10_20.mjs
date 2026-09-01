import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public", "data");
const LEVELS = path.join(DATA, "levels");
const catalog = JSON.parse(fs.readFileSync(path.join(DATA, "catalog.json"), "utf8"));
const profiles = new Map(catalog.profiles.map((profile) => [profile.catalogId ?? profile.id, profile]));
const Q = { x: 0, y: 0, z: 0, w: 1 };
const M = { box: [4072, 4073, 4074, 4075, 4076, 4077, 4078, 4079, 4080], jam: [4012, 4013, 4014, 4015, 4016, 4017], cardboard: [4040, 4041, 4042, 4045, 4046], can: [4001, 4006, 4011] };

function platform(sequence, x, z, width, depth) {
  return { sequence, id: "Table_Rect", shape: "rect", position: { x, y: 2, z }, rotation: Q, size: { width, depth }, movement: null, rotationMotion: null };
}
function makeLevel(id, moveCount, platforms, motif) {
  return { levelId: id, category: "ai", categoryName: "AI关卡", name: `AI-${id}`, slug: `ai-${id}`, settings: { version: 1, moveCount, difficulty: id === 20 ? 1 : 0, backgroundIndex: -1, stabilizeOnSpawn: false, physicsQuality: 0 }, design: { derivedFrom: `prod-${id}`, referenceLevel: id, motif, variation: "独立重排：连续支撑柱列+局部空洞+主线材料语言" }, statistics: {}, items: [], platforms, obstacles: { bouncers: [], blockers: [], hammers: [] } };
}
function add(level, catalogId, x, y, z, platformIndex = 1) {
  const p = profiles.get(catalogId);
  if (!p) throw new Error(`Unknown catalog ${catalogId}`);
  level.items.push({ sequence: level.items.length + 1, catalogId, stage: 1, platform: platformIndex, materialId: p.materialId, shapeId: p.sourceShapeId, position: { x, y, z }, rotation: Q, size: { x: p.size[0], y: p.size[1], z: p.size[2] } });
}
function col(level, x, z, height, ids, platformIndex = 1) {
  for (let row = 0; row < height; row += 1) add(level, ids[row % ids.length], x, 2.5 + row, z, platformIndex);
}
function band(level, x0, x1, y, z, catalogId, platformIndex = 1) {
  for (let x = x0; x <= x1; x += 1) add(level, catalogId, x, y, z, platformIndex);
}
function finish(level) {
  const obstacleCount = Object.values(level.obstacles).flat().length;
  level.statistics = { entityCount: level.items.length + level.platforms.length + obstacleCount, entityTypeCount: obstacleCount ? 3 : 2, platformCount: level.platforms.length, itemCount: level.items.length, destructibleItemCount: level.items.length, specialObstacleCount: obstacleCount, customEntityCount: level.platforms.length };
  return level;
}
function build(id) {
  if (id === 10) {
    const l = makeLevel(id, 19, [platform(1, 0, -2, 9, 3)], "彩色门廊");
    for (const [x, h] of [[-3, 4], [-2, 5], [-1, 4], [0, 6], [1, 4], [2, 5], [3, 4]]) col(l, x, -2, h, M.box);
    band(l, -2, 2, 8.5, -2, 4075); return finish(l);
  }
  if (id === 11) {
    const l = makeLevel(id, 21, [platform(1, 0, -2, 7, 3)], "果酱拱桥");
    for (const x of [-3, -2, 2, 3]) col(l, x, -2, 4, [4078]);
    band(l, -3, 3, 6.5, -2, 4040); band(l, -2, 2, 7.5, -2, 4078); return finish(l);
  }
  if (id === 12) {
    const l = makeLevel(id, 25, [platform(1, 0, -2, 8, 3)], "阶梯纸箱塔");
    for (const [x, h] of [[-3, 2], [-2, 3], [-1, 4], [0, 5], [1, 4], [2, 3], [3, 2]]) col(l, x, -2, h, [4040]); return finish(l);
  }
  if (id === 13) {
    const l = makeLevel(id, 20, [platform(1, -2.6, -2, 4, 3), platform(2, 2.6, -2, 4, 3)], "双塔缺口");
    col(l, -3.2, -2, 5, [4078], 1); col(l, -2.2, -2, 4, M.box, 1); col(l, 2.2, -2, 4, M.box, 2); col(l, 3.2, -2, 5, [4078], 2); band(l, -3.2, -2.2, 7.5, -2, 4078, 1); band(l, 2.2, 3.2, 7.5, -2, 4076, 2); return finish(l);
  }
  if (id === 14) {
    const l = makeLevel(id, 22, [platform(1, 0, -2, 9, 4)], "中央窗框");
    for (const x of [-3, -2, 2, 3]) col(l, x, -2.5, 5, [4073]);
    band(l, -3, 3, 7.5, -2.5, 4030); band(l, -1, 1, 6.5, -2.5, 4073); return finish(l);
  }
  if (id === 15) {
    const l = makeLevel(id, 26, [platform(1, 0, -2, 9, 3)], "交错彩柱");
    for (const [x, h] of [[-3, 3], [-2, 5], [-1, 4], [0, 6], [1, 4], [2, 5], [3, 3]]) col(l, x, -2, h, M.box.concat(M.jam)); return finish(l);
  }
  if (id === 16) {
    const l = makeLevel(id, 26, [platform(1, 0, -2, 6, 2)], "纸箱短桥");
    for (const x of [-2, -1, 0, 1, 2]) col(l, x, -2, 4, [4040]); band(l, -2, 2, 6.5, -2, 4040); return finish(l);
  }
  if (id === 17) {
    const l = makeLevel(id, 25, [platform(1, -2.6, -2, 4, 3), platform(2, 2.6, -2, 4, 3)], "高低双塔");
    col(l, -3.2, -2, 6, [4040], 1); col(l, -2.2, -2, 4, M.box, 1); col(l, 2.2, -2, 5, M.box, 2); col(l, 3.2, -2, 3, [4040], 2); band(l, -3.2, -2.2, 8.5, -2, 4078, 1); band(l, 2.2, 3.2, 7.5, -2, 4076, 2); return finish(l);
  }
  if (id === 18) {
    const l = makeLevel(id, 22, [platform(1, 0, -2, 9, 4)], "双层果酱墙");
    for (const z of [-2.5, -1.5]) for (const [x, h] of [[-3, 4], [-2, 5], [-1, 3], [0, 5], [1, 3], [2, 5], [3, 4]]) col(l, x, z, h, z < -2 ? [4076] : [4040]); return finish(l);
  }
  if (id === 19) {
    const l = makeLevel(id, 18, [platform(1, 0, -2, 9, 3)], "王冠阶梯");
    for (const [x, h] of [[-3, 3], [-2, 4], [-1, 5], [0, 6], [1, 5], [2, 4], [3, 3]]) col(l, x, -2, h, [4040, 4078]);
    add(l, 4076, -1, 7.5, -2); add(l, 4076, 1, 7.5, -2); return finish(l);
  }
  const l = makeLevel(id, 18, [platform(1, 0, -2, 10, 4)], "大型双翼城门");
  for (const x of [-4, -3, -2, 2, 3, 4]) col(l, x, -2.5, 6, M.box, 1);
  col(l, -1, -2.5, 4, [4078], 1); col(l, 0, -2.5, 3, [4040], 1); col(l, 1, -2.5, 4, [4078], 1);
  band(l, -4, 4, 8.5, -2.5, 4030); return finish(l);
}

for (let id = 10; id <= 20; id += 1) fs.writeFileSync(path.join(LEVELS, `ai-${id}.json`), `${JSON.stringify(build(id), null, 2)}\n`);
const indexPath = path.join(DATA, "index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const records = [];
for (let id = 10; id <= 20; id += 1) {
  const level = JSON.parse(fs.readFileSync(path.join(LEVELS, `ai-${id}.json`), "utf8"));
  records.push({ key: `ai:${id}`, slug: `ai-${id}`, category: "ai", categoryName: "AI关卡", name: `AI-${id}`, id, moveCount: level.settings.moveCount, difficulty: ["NORMAL", "HARD", "SUPER_HARD"][level.settings.difficulty], difficultyValue: level.settings.difficulty, counts: { platforms: level.platforms.length, blocks: level.items.length, obstacles: 0, bouncers: 0, blockers: 0, hammers: 0, stages: 1 } });
}
index.levels = [...index.levels.filter((entry) => !(entry.category === "ai" && entry.id >= 10 && entry.id <= 20)), ...records].sort((a, b) => a.category.localeCompare(b.category) || a.id - b.id);
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log("Redesigned AI-10 to AI-20 with independently supported structures.");
