import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { Euler, MathUtils, Quaternion } from "three";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const LEVEL_DIR = path.join(DATA_DIR, "levels");
const inputPath = process.argv[2];

if (!inputPath) {
  throw new Error("Usage: node scripts/import_editor_levels_to_ai.mjs <editor-export.zip>");
}

const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "catalog.json"), "utf8"));

function quaternion(rotation = [0, 0, 0]) {
  const euler = new Euler(...rotation.map((value) => MathUtils.degToRad(Number(value) || 0)), "XYZ");
  const value = new Quaternion().setFromEuler(euler).normalize();
  return Object.fromEntries(["x", "y", "z", "w"].map((key) => [key, Number(value[key].toFixed(8))]));
}

function profileFor(item) {
  const exact = catalog.profiles.filter((profile) => (
    profile.materialId === item.materialId
    && profile.shapeId === item.shapeId
    && profile.colorId === item.colorId
  ));
  const candidates = exact.length ? exact : catalog.profiles.filter((profile) => (
    profile.materialId === item.materialId && profile.shapeId === item.shapeId
  ));
  const targetSize = item.size || [1, 1, 1];
  const profile = [...candidates].sort((a, b) => {
    const distance = (candidate) => (candidate.modelSize || [1, 1, 1])
      .reduce((sum, value, index) => sum + Math.abs(value - (targetSize[index] ?? 1)), 0);
    return distance(a) - distance(b);
  })[0];
  if (!profile) throw new Error(`No catalog profile for material=${item.materialId}, shape=${item.shapeId}, color=${item.colorId}`);
  return profile;
}

function movementFor(motion = {}) {
  if (motion.vertical) {
    return {
      axis: "Y",
      min: Number(motion.verticalMin) || 0,
      max: Number(motion.verticalMax) || 0,
      initialDirection: motion.verticalDirection === "Negative" ? -1 : 1,
      speed: Number(motion.verticalSpeed) || 0,
      easeTime: Number(motion.easeTime) || 0,
      startupDelay: Number(motion.startupDelay) || 0,
    };
  }
  if (motion.horizontal) {
    return {
      axis: motion.horizontalAxis === "Z" ? "Z" : "X",
      min: Number(motion.horizontalMin) || 0,
      max: Number(motion.horizontalMax) || 0,
      initialDirection: motion.horizontalDirection === "Negative" ? -1 : 1,
      speed: Number(motion.horizontalSpeed) || 0,
      easeTime: Number(motion.easeTime) || 0,
      startupDelay: Number(motion.startupDelay) || 0,
    };
  }
  return null;
}

function rotationMotionFor(motion = {}) {
  if (!motion.rotating) return null;
  return {
    axis: Object.fromEntries(["x", "y", "z"].map((key, index) => [key, Number(motion.rotationAxis?.[index]) || 0])),
    speed: Number(motion.rotationSpeed) || 0,
  };
}

function convertLevel(source) {
  const id = Number(source.id);
  if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid AI level id: ${source.id}`);
  const platforms = source.objects.filter((item) => item.type === "platform").map((item, index) => ({
    sequence: Number(item.platformIndex) || index + 1,
    id: item.platformShape === "circle" ? "Table_Circle" : "Table_Rect",
    shape: item.platformShape === "circle" ? "circle" : "rect",
    position: { x: Number(item.position[0]), y: Number(item.position[1]), z: Number(item.position[2]) },
    rotation: quaternion(item.rotation),
    size: { width: Number(item.size[0]), depth: Number(item.size[2]) },
    movement: movementFor(item.motion),
    rotationMotion: rotationMotionFor(item.motion),
  })).sort((a, b) => a.sequence - b.sequence);
  const platformIds = new Set(platforms.map((item) => item.sequence));
  const items = source.objects.filter((item) => item.type === "block").map((item, index) => {
    const profile = profileFor(item);
    const platform = Number(item.platformIndex) || 1;
    if (!platformIds.has(platform)) throw new Error(`AI-${id} block ${index + 1} references missing platform ${platform}`);
    return {
      sequence: index + 1,
      catalogId: profile.catalogId,
      stage: Number(item.stageIndex) || 1,
      platform,
      materialId: profile.materialId,
      shapeId: profile.sourceShapeId,
      position: { x: Number(item.position[0]), y: Number(item.position[1]), z: Number(item.position[2]) },
      rotation: quaternion(item.rotation),
      size: { x: profile.size[0], y: profile.size[1], z: profile.size[2] },
    };
  });
  const obstacleCount = 0;
  return {
    levelId: id,
    category: "ai",
    categoryName: "AI关卡",
    name: `AI-${id}`,
    slug: `ai-${id}`,
    settings: {
      version: 1,
      moveCount: Number(source.moveCount) || 0,
      difficulty: Number(source.difficultyValue) || 0,
      backgroundIndex: -1,
      stabilizeOnSpawn: false,
      physicsQuality: 0,
    },
    statistics: {
      entityCount: items.length + platforms.length + obstacleCount,
      entityTypeCount: 2,
      platformCount: platforms.length,
      itemCount: items.length,
      destructibleItemCount: items.length,
      specialObstacleCount: obstacleCount,
      customEntityCount: platforms.length,
    },
    items,
    platforms,
    obstacles: { bouncers: [], blockers: [], hammers: [] },
  };
}

const zip = await JSZip.loadAsync(fs.readFileSync(path.resolve(inputPath)));
const entries = Object.values(zip.files).filter((entry) => !entry.dir && /(?:^|\/)level-\d+\.json$/i.test(entry.name));
if (!entries.length) throw new Error("No level JSON files found in the ZIP");

const levels = [];
for (const entry of entries) {
  const source = JSON.parse(await entry.async("string"));
  if (!Array.isArray(source.objects)) throw new Error(`${entry.name} is not an editor-exported level`);
  levels.push(convertLevel(source));
}
levels.sort((a, b) => a.levelId - b.levelId);

const indexPath = path.join(DATA_DIR, "index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
for (const level of levels) {
  fs.writeFileSync(path.join(LEVEL_DIR, `${level.slug}.json`), `${JSON.stringify(level, null, 2)}\n`);
  const entry = index.levels.find((item) => item.category === "ai" && item.id === level.levelId);
  if (!entry) throw new Error(`Missing AI-${level.levelId} in index.json`);
  Object.assign(entry, {
    moveCount: level.settings.moveCount,
    difficulty: ["NORMAL", "HARD", "SUPER_HARD"][level.settings.difficulty] || "NORMAL",
    difficultyValue: level.settings.difficulty,
    counts: {
      platforms: level.platforms.length,
      blocks: level.items.length,
      obstacles: 0,
      bouncers: 0,
      blockers: 0,
      hammers: 0,
      stages: new Set(level.items.map((item) => item.stage)).size,
    },
  });
}
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Imported ${levels.map((level) => `AI-${level.levelId} (${level.items.length} blocks)`).join(", ")}`);
