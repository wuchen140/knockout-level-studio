import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

const workbookPath = process.argv[2];
const repoRoot = path.resolve(import.meta.dirname, "..");
const currentDataRoot = path.join(repoRoot, "public", "data");
const outputRoot = path.resolve(process.argv[3] || currentDataRoot);
const levelsRoot = path.join(outputRoot, "levels");

if (!workbookPath || !fs.existsSync(workbookPath)) {
  throw new Error("用法: node scripts/import_royal_smash_workbook.mjs <关卡配置.xlsx> [输出目录]");
}

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const vector = (row, prefix) => ({ x: number(row[`${prefix}X`]), y: number(row[`${prefix}Y`]), z: number(row[`${prefix}Z`]) });
const rotation = (row) => ({ ...vector(row, "旋转"), w: number(row["旋转W"], 1) });
const categoryFor = (label) => String(label).includes("循环") ? "loop" : "mainline";
const slugFor = (category, id) => `${category === "mainline" ? "prod" : "loop"}-${id}`;
const keyFor = (category, id) => `${category}:${id}`;
const difficultyName = (value) => ["NORMAL", "HARD", "SUPER_HARD"][number(value)] || "NORMAL";
const schema = {
  level: ["levelId", "category", "categoryName", "settings", "statistics", "items", "platforms", "obstacles"],
  settings: ["version", "moveCount", "difficulty", "backgroundIndex", "stabilizeOnSpawn", "physicsQuality"],
  statistics: ["entityCount", "entityTypeCount", "platformCount", "itemCount", "destructibleItemCount", "specialObstacleCount", "customEntityCount"],
  item: ["sequence", "catalogId", "stage", "platform", "materialId", "shapeId", "position", "rotation", "size"],
  platform: ["sequence", "id", "shape", "position", "rotation", "size", "movement", "rotationMotion"],
  obstacles: ["bouncers", "blockers", "hammers"],
  obstacle: ["sequence", "id", "position", "rotation", "parameters"],
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function rows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`缺少工作表: ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { raw: true, defval: null });
}

function requireKeys(value, expected, label) {
  if (JSON.stringify(Object.keys(value)) !== JSON.stringify(expected)) {
    throw new Error(`${label} JSON 格式变化: ${JSON.stringify(Object.keys(value))}`);
  }
}

function validateLevel(level) {
  requireKeys(level, schema.level, `${level.category}:${level.levelId}`);
  requireKeys(level.settings, schema.settings, `${level.category}:${level.levelId} settings`);
  requireKeys(level.statistics, schema.statistics, `${level.category}:${level.levelId} statistics`);
  requireKeys(level.obstacles, schema.obstacles, `${level.category}:${level.levelId} obstacles`);
  for (const item of level.items) requireKeys(item, schema.item, `${level.category}:${level.levelId} item`);
  for (const platform of level.platforms) requireKeys(platform, schema.platform, `${level.category}:${level.levelId} platform`);
  for (const item of Object.values(level.obstacles).flat()) requireKeys(item, schema.obstacle, `${level.category}:${level.levelId} obstacle`);
}

function add(grouped, row) {
  const key = keyFor(categoryFor(row["关卡分类"]), number(row["关卡ID"]));
  const values = grouped.get(key) || [];
  values.push(row);
  grouped.set(key, values);
}

function customParameters(row) {
  let value = {};
  try { value = JSON.parse(row["Custom原文"] || "{}"); } catch { value = {}; }
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "randomYaw" && !key.startsWith("physics")));
}

function fallbackProfile(catalog, unityName) {
  const base = catalog.profiles.find((profile) => profile.unityName === "BoxSquare_1");
  if (!base) throw new Error(`图鉴缺少 BoxSquare_1，无法映射 ${unityName}`);
  const nextId = Math.max(...catalog.profiles.map((profile) => number(profile.catalogId ?? profile.id))) + 1;
  return {
    ...base,
    id: nextId,
    catalogId: nextId,
    modelPath: null,
    unityName,
    preload: false,
  };
}

function levelIndex(level, slug) {
  const obstacleCount = Object.values(level.obstacles).reduce((sum, values) => sum + values.length, 0);
  return {
    key: `${level.category}:${level.levelId}`,
    slug,
    category: level.category,
    categoryName: level.category === "mainline" ? "主线关卡" : "循环关卡",
    id: level.levelId,
    moveCount: level.settings.moveCount,
    difficulty: difficultyName(level.settings.difficulty),
    difficultyValue: level.settings.difficulty,
    counts: {
      platforms: level.platforms.length,
      blocks: level.items.length,
      obstacles: obstacleCount,
      bouncers: level.obstacles.bouncers.length,
      blockers: level.obstacles.blockers.length,
      hammers: level.obstacles.hammers.length,
      stages: new Set(level.items.map((item) => item.stage)).size,
    },
  };
}

const workbook = XLSX.readFile(workbookPath, { dense: true });
const catalog = readJson(path.join(currentDataRoot, "catalog.json"));
if (!catalog.profiles.some((profile) => profile.unityName === "PiggyBox_1")) {
  catalog.profiles.push(fallbackProfile(catalog, "PiggyBox_1"));
}
if (!catalog.profiles.some((profile) => profile.unityName === "Pinata")) catalog.profiles.push(fallbackProfile(catalog, "Pinata"));
catalog.modelCount = catalog.profiles.length;
const profileByName = new Map(catalog.profiles.map((profile) => [profile.unityName, profile]));

const blocks = new Map();
for (const sheetName of ["主线关卡方块明细", "循环关卡方块明细"]) {
  for (const row of rows(workbook, sheetName)) add(blocks, row);
}
const platforms = new Map();
for (const row of rows(workbook, "关卡平台明细")) add(platforms, row);
const pinatas = new Map();
for (const row of rows(workbook, "皮纳塔明细")) add(pinatas, row);
const obstacleSheets = [
  ["弹跳器明细", "bouncers"],
  ["挡板明细", "blockers"],
  ["锤子明细", "hammers"],
];
const obstacles = Object.fromEntries(obstacleSheets.map(([, key]) => [key, new Map()]));
for (const [sheetName, type] of obstacleSheets) {
  for (const row of rows(workbook, sheetName)) add(obstacles[type], row);
}

const levels = [];
for (const row of rows(workbook, "关卡配置")) {
  const category = categoryFor(row["关卡分类"]);
  const id = number(row["关卡ID"]);
  const key = keyFor(category, id);
  const levelItems = (blocks.get(key) || []).map((item) => {
    const profile = profileByName.get(item["原始实体ID"]);
    if (!profile) throw new Error(`${key} 缺少图鉴映射: ${item["原始实体ID"]}`);
    return {
      sequence: number(item["方块序号"]),
      catalogId: number(profile.catalogId ?? profile.id),
      stage: number(item["阶段序号"], 1),
      platform: number(item["平台序号"], 1),
      materialId: number(item["材质值"]),
      shapeId: number(item["形状值"], 1),
      position: vector(item, "位置"),
      rotation: rotation(item),
      size: vector(item, "尺寸"),
    };
  });
  const pinataProfile = profileByName.get("Pinata");
  for (const pinata of pinatas.get(key) || []) {
    const scale = number(pinata.pinataScale, 1);
    levelItems.push({
      sequence: levelItems.length + 1,
      catalogId: number(pinataProfile.catalogId ?? pinataProfile.id),
      stage: 1,
      platform: 1,
      materialId: number(pinataProfile.materialId),
      shapeId: number(pinataProfile.sourceShapeId, 1),
      position: vector(pinata, "位置"),
      rotation: rotation(pinata),
      size: { x: scale, y: scale, z: scale },
    });
  }
  const levelPlatforms = (platforms.get(key) || []).map((platform) => {
    const moves = platform["是否移动"] === "是";
    const rotates = platform["是否旋转"] === "是";
    return {
      sequence: number(platform["平台序号"]),
      id: platform["原始实体ID"],
      shape: String(platform["平台形状"]).includes("圆") ? "round" : "rect",
      position: vector(platform, "位置"),
      rotation: rotation(platform),
      size: { width: number(platform["宽度W"], 1), depth: number(platform["深度D"], 1) },
      movement: moves ? {
        axis: platform["移动轴"],
        min: number(platform["移动最小值"]),
        max: number(platform["移动最大值"]),
        speed: number(platform["移动速度"]),
        initialDirection: number(platform["初始方向"], 1),
        easeTime: number(platform["缓动时间"]),
        startupDelay: number(platform["启动延迟"]),
      } : null,
      rotationMotion: rotates ? {
        axis: vector(platform, "旋转轴"),
        speed: number(platform["旋转速度"]),
      } : null,
    };
  });
  const levelObstacles = Object.fromEntries(obstacleSheets.map(([, type]) => [type, (obstacles[type].get(key) || []).map((item) => ({
    sequence: number(item["障碍序号"]),
    id: item["原始实体ID"],
    position: vector(item, "位置"),
    rotation: rotation(item),
    parameters: customParameters(item),
  }))]));
  const level = {
    levelId: id,
    category,
    categoryName: row["关卡分类"],
    settings: {
      version: number(row.Version, 1),
      moveCount: number(row["移动次数"]),
      difficulty: number(row["难度"]),
      backgroundIndex: number(row.BackgroundIndex, -1),
      stabilizeOnSpawn: Boolean(row.StabilizeOnSpawn),
      physicsQuality: number(row.PhysicsQuality),
    },
    statistics: {
      entityCount: number(row["总数量"]),
      entityTypeCount: number(row["实体类型数"]),
      platformCount: number(row["平台数"]),
      itemCount: levelItems.length,
      destructibleItemCount: number(row["可破坏方块数"]),
      specialObstacleCount: number(row["特殊障碍数"]),
      customEntityCount: number(row["自定义实体数"]),
    },
    items: levelItems,
    platforms: levelPlatforms,
    obstacles: levelObstacles,
  };
  validateLevel(level);
  levels.push(level);
}

const counts = levels.reduce((value, level) => ({ ...value, [level.category]: (value[level.category] || 0) + 1 }), {});
if (levels.length !== 1560 || counts.mainline !== 700 || counts.loop !== 860) {
  throw new Error(`关卡数量不符: ${JSON.stringify({ total: levels.length, ...counts })}`);
}

const currentIndex = readJson(path.join(currentDataRoot, "index.json"));
const aiLevels = currentIndex.levels.filter((level) => level.category === "ai");
const aiFiles = new Map(aiLevels.map((level) => [level.slug, fs.readFileSync(path.join(currentDataRoot, "levels", `${level.slug}.json`))]));

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(levelsRoot, { recursive: true });

for (const level of aiLevels) {
  fs.writeFileSync(path.join(levelsRoot, `${level.slug}.json`), aiFiles.get(level.slug));
}

const generatedIndex = [];
for (const level of levels) {
  const slug = slugFor(level.category, level.levelId);
  fs.writeFileSync(path.join(levelsRoot, `${slug}.json`), `${JSON.stringify(level, null, 2)}\n`);
  generatedIndex.push(levelIndex(level, slug));
}
const loopIndex = generatedIndex.filter((level) => level.category === "loop");
const mainlineIndex = generatedIndex.filter((level) => level.category === "mainline");
fs.writeFileSync(path.join(outputRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
fs.writeFileSync(path.join(outputRoot, "index.json"), `${JSON.stringify({ ...currentIndex, levels: [...aiLevels, ...loopIndex, ...mainlineIndex] }, null, 2)}\n`);

console.log(JSON.stringify({
  outputRoot,
  levels: levels.length,
  mainline: counts.mainline,
  loop: counts.loop,
  aiPreserved: aiLevels.length,
  items: levels.reduce((sum, level) => sum + level.items.length, 0),
  platforms: levels.reduce((sum, level) => sum + level.platforms.length, 0),
  obstacles: levels.reduce((sum, level) => sum + Object.values(level.obstacles).flat().length, 0),
  catalogProfiles: catalog.profiles.length,
}, null, 2));
