import fs from "node:fs";
import path from "node:path";

const sourceRoot = process.argv[2] || "/Users/wuchen/Documents/ChatGPT/Royal Smash/outputs/用户格式_主线100关_循环100关_20260827";
const catalogSource = process.argv[3] || "/Users/wuchen/.codex/attachments/4e39c171-d899-4f73-9a3f-67056689fa8c/pasted-text.txt";
const repoRoot = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(repoRoot, "public", "data");
const levelOutput = path.join(outputRoot, "levels");

const colorIds = { "-1": 0, Red: 1, Yellow: 2, Blue: 3, Green: 4, Orange: 5, Pink: 6, Purple: 7, Black: 8, White: 9 };
const colorHex = {
  Red: "#e2473f", Yellow: "#f3c742", Blue: "#4386d8", Green: "#55a861",
  Orange: "#ee8c35", Pink: "#dd72a7", Purple: "#8663bd", Black: "#30343b", White: "#f2f0e8",
};
const materialHex = {
  1: "#aebbc2", 2: "#d86f86", 3: "#7f878c", 4: "#b67a45", 5: "#a9e3f2",
  7: "#d83f35", 8: "#9a6741", 9: "#d29b50", 10: "#d7b56d",
};
const normalizedShape = { 1: 0, 2: 1, 3: 2, 4: 1 };

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function difficultyName(value) {
  return ["NORMAL", "HARD", "SUPER_HARD"][Number(value)] || "NORMAL";
}

function parseCatalog() {
  const lines = fs.readFileSync(catalogSource, "utf8").trim().split(/\r?\n/);
  const headers = lines.shift().split("\t");
  const rows = lines.map((line) => Object.fromEntries(line.split("\t").map((value, index) => [headers[index], value])));
  const profiles = rows.map((row) => ({
    id: Number(row["图鉴ID"]),
    catalogId: Number(row["图鉴ID"]),
    material: row["材质"],
    materialId: Number(row["材质ID"]),
    shape: row["形状"],
    shapeId: normalizedShape[Number(row["形状ID"])] ?? 0,
    sourceShapeId: Number(row["形状ID"]),
    size: [Number(row["尺寸X"]), Number(row["尺寸Y"]), Number(row["尺寸Z"])],
    colorName: row["颜色名"],
    colorId: colorIds[row["颜色名"]] ?? 0,
    preload: row["预加载"] === "是",
    shatterParticles: Number(row["破碎粒子"]),
    baseMass: Number(row["基础质量"]),
    catalogMassMultiplier: Number(row["目录质量倍率"]),
    mass: Number(row["运行时质量"]),
    staticFriction: Number(row["静摩擦"]),
    dynamicFriction: Number(row["动摩擦"]),
    impactShatter: row["撞击粉碎"] === "是",
    shatterThreshold: Number(row["粉碎速度阈值"]),
    fragmentVelocityMultiplier: Number(row["撞击碎片速度倍率"]),
  }));

  const colors = [];
  const seen = new Set();
  for (const profile of profiles) {
    const key = `${profile.materialId}:${profile.colorName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push({
      material: profile.material,
      materialId: profile.materialId,
      name: profile.colorName === "-1" ? "材质原色" : profile.colorName,
      sourceName: profile.colorName,
      colorId: profile.colorId,
      hex: colorHex[profile.colorName] || materialHex[profile.materialId] || "#c4c7c9",
    });
  }
  return { schemaVersion: 2, family: "royal-smash", profiles, colors };
}

function levelIndex(level, slug) {
  const obstacleCount = Object.values(level.obstacles || {}).reduce((sum, values) => sum + values.length, 0);
  const difficultyValue = Number(level.settings?.difficulty) || 0;
  return {
    key: `${level.category}:${level.levelId}`,
    slug,
    category: level.category,
    categoryName: level.category === "mainline" ? "主线关卡" : "循环关卡",
    id: level.levelId,
    moveCount: level.settings?.moveCount ?? 0,
    difficulty: difficultyName(difficultyValue),
    difficultyValue,
    counts: {
      platforms: level.platforms?.length || 0,
      blocks: level.items?.length || 0,
      obstacles: obstacleCount,
      bouncers: level.obstacles?.bouncers?.length || 0,
      blockers: level.obstacles?.blockers?.length || 0,
      hammers: level.obstacles?.hammers?.length || 0,
      stages: new Set((level.items || []).map((item) => item.stage)).size,
    },
  };
}

fs.mkdirSync(levelOutput, { recursive: true });
for (const file of fs.readdirSync(levelOutput)) {
  if (file.endsWith(".json")) fs.unlinkSync(path.join(levelOutput, file));
}

const levels = [];
for (const category of ["mainline", "loop"]) {
  const sourceDir = path.join(sourceRoot, category);
  const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith(".json")).sort();
  if (files.length !== 100) throw new Error(`${category} 应有 100 关，实际为 ${files.length}`);
  for (const file of files) {
    const level = readJson(path.join(sourceDir, file));
    const slug = category === "mainline" ? `prod-${level.levelId}` : `loop-${level.levelId}`;
    fs.writeFileSync(path.join(levelOutput, `${slug}.json`), `${JSON.stringify(level, null, 2)}\n`);
    levels.push(levelIndex(level, slug));
  }
}

const catalog = parseCatalog();
fs.writeFileSync(path.join(outputRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
fs.writeFileSync(path.join(outputRoot, "index.json"), `${JSON.stringify({ schemaVersion: 2, family: "royal-smash", levels }, null, 2)}\n`);

const totals = levels.reduce((sum, level) => ({
  blocks: sum.blocks + level.counts.blocks,
  platforms: sum.platforms + level.counts.platforms,
  obstacles: sum.obstacles + level.counts.obstacles,
}), { blocks: 0, platforms: 0, obstacles: 0 });
console.log(JSON.stringify({ levels: levels.length, catalogProfiles: catalog.profiles.length, ...totals }, null, 2));
