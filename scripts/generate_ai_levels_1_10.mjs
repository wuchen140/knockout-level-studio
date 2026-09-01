import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const LEVEL_DIR = path.join(DATA_DIR, "levels");
const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "catalog.json"), "utf8"));
const profiles = new Map(catalog.profiles.map((profile) => [profile.catalogId ?? profile.id, profile]));

const Q_IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const MATERIALS = {
  S: 4001,
  C: 4006,
  T: 4011,
  K: 4072,
  B: 4073,
  G: 4074,
  O: 4075,
  P: 4076,
  U: 4077,
  R: 4078,
  W: 4079,
  Y: 4080,
};

function platform(sequence, x, z, width, depth) {
  return {
    sequence,
    id: "Table_Rect",
    shape: "rect",
    position: { x, y: 2, z },
    rotation: Q_IDENTITY,
    size: { width, depth },
    movement: null,
    rotationMotion: null,
  };
}

function makeLevel(id, moveCount, platforms) {
  return {
    levelId: id,
    category: "ai",
    categoryName: "AI关卡",
    name: `AI-${id}`,
    slug: `ai-${id}`,
    settings: {
      version: 1,
      moveCount,
      difficulty: 0,
      backgroundIndex: -1,
      stabilizeOnSpawn: false,
      physicsQuality: 0,
    },
    statistics: {},
    items: [],
    platforms,
    obstacles: { bouncers: [], blockers: [], hammers: [] },
  };
}

function addItem(level, catalogId, x, y, z, platformIndex = 1, rotation = Q_IDENTITY) {
  const profile = profiles.get(catalogId);
  if (!profile) throw new Error(`Unknown catalogId ${catalogId}`);
  const [sizeX, sizeY, sizeZ] = profile.size;
  level.items.push({
    sequence: level.items.length + 1,
    catalogId,
    stage: 1,
    platform: platformIndex,
    materialId: profile.materialId,
    shapeId: profile.shapeId + 1,
    position: { x, y, z },
    rotation,
    size: { x: sizeX, y: sizeY, z: sizeZ },
  });
}

function addPattern(level, rows, { originX = 0, z = -2, platformIndex = 1 } = {}) {
  const width = Math.max(...rows.map((row) => row.length));
  rows.forEach((rawRow, rowIndex) => {
    const row = rawRow.padEnd(width, " ");
    for (let column = 0; column < width; column += 1) {
      const catalogId = MATERIALS[row[column]];
      if (!catalogId) continue;
      addItem(level, catalogId, originX + column - (width - 1) / 2, 2.5 + rowIndex, z, platformIndex);
    }
  });
}

function addPatternDepth(level, rows, options = {}) {
  const zValues = options.zValues || [-2.5, -1.5];
  for (const z of zValues) addPattern(level, rows, { ...options, z });
}

function addUnitColumn(level, x, z, height, colors, platformIndex = 1) {
  for (let row = 0; row < height; row += 1) {
    const color = colors[row % colors.length];
    addItem(level, MATERIALS[color], x, 2.5 + row, z, platformIndex);
  }
}

function finalize(level) {
  const obstacleCount = Object.values(level.obstacles).reduce((sum, list) => sum + list.length, 0);
  level.statistics = {
    entityCount: level.items.length + level.platforms.length + obstacleCount,
    entityTypeCount: 2 + (obstacleCount ? 1 : 0),
    platformCount: level.platforms.length,
    itemCount: level.items.length,
    destructibleItemCount: level.items.length,
    specialObstacleCount: obstacleCount,
    customEntityCount: level.platforms.length,
  };
  return level;
}

function buildLevels() {
  const levels = [];

  // AI-1: a right-weighted terrace that borrows prod-1's step grammar without its centered pyramid.
  {
    const level = makeLevel(1, 30, [platform(1, 0, -2, 9, 3)]);
    addPattern(level, ["CCCCCCCC", " CCCCCCC", "  CCCCCC", "   CCCCC"], { z: -2 });
    addItem(level, MATERIALS.T, -0.5, 6.5, -2);
    addItem(level, MATERIALS.T, 3.5, 6.5, -2);
    levels.push(finalize(level));
  }

  // AI-2: a split-panel wall with two vertical windows instead of prod-2's centered target panel.
  {
    const level = makeLevel(2, 29, [platform(1, 0, -2, 10, 4)]);
    const panel = [
      "SSSSSSSSS",
      "SSS S SSS",
      "SSS S SSS",
      "SSSSSSSSS",
      " SS S SS ",
      " SSSSSSS ",
    ];
    addPatternDepth(level, panel, { zValues: [-2.7, -1.3] });
    [-4, 4].forEach((x, index) => addUnitColumn(level, x, -2, 5, [index ? "C" : "S"]));
    levels.push(finalize(level));
  }

  // AI-3: one broad ceremonial gate with rear buttresses, not prod-3's repeated small arches.
  {
    const level = makeLevel(3, 28, [platform(1, 0, -2, 10, 4)]);
    addPattern(level, [
      "SSSSSSSSS",
      "SSS   SSS",
      "SSS   SSS",
      "SSS   SSS",
      "SSSSSSSSS",
      " SSSSSSS ",
    ], { z: -2.7 });
    [-4, 0, 4].forEach((x, index) => {
      addUnitColumn(level, x, -1.3, 3, [index % 2 ? "C" : "S"]);
    });
    for (const x of [-4, 4]) addItem(level, MATERIALS.T, x, 5.5, -1.3);
    levels.push(finalize(level));
  }

  // AI-4: a four-corner courtyard fortress that turns prod-4's facade into a real depth layout.
  {
    const level = makeLevel(4, 27, [platform(1, 0, -2, 8, 7)]);
    const corners = [[-3, -4], [3, -4], [-3, 0], [3, 0]];
    corners.forEach(([x, z], index) => {
      addUnitColumn(level, x, z, 6, [index % 2 ? "C" : "S"]);
      addItem(level, MATERIALS.T, x, 8.5, z);
    });
    for (const z of [-4, 0]) {
      for (const x of [-2, -1, 0, 1, 2]) addUnitColumn(level, x, z, 3, ["S"]);
    }
    for (const x of [-3, 3]) {
      for (const z of [-3, -2, -1]) addUnitColumn(level, x, z, 3, ["C"]);
    }
    for (const [x, z] of [[-1, -3], [1, -3], [-1, -1], [1, -1]]) addUnitColumn(level, x, z, 2, ["S"]);
    levels.push(finalize(level));
  }

  // AI-5: open chevron color bands instead of prod-5's solid rainbow rectangle.
  {
    const level = makeLevel(5, 26, [platform(1, 0, -2, 10, 4)]);
    addPattern(level, [
      "RRRRRRRRR",
      " OOOOOOO ",
      "  YYYYY  ",
      "  GGGGG  ",
      "   BBB   ",
      "   UUU   ",
      "   PP    ",
      "   RR    ",
    ], { z: -2 });
    levels.push(finalize(level));
  }

  // AI-6: a twin-window facade that reuses prod-6's frame lesson without nesting one frame inside another.
  {
    const level = makeLevel(6, 25, [platform(1, 0, -2, 11, 4)]);
    addPattern(level, [
      "GGGGGGGGGG",
      "GG  GG  GG",
      "GG  GG  GG",
      "GG  GG  GG",
      "GGGGGGGGGG",
    ], { z: -2.7 });
    [-4.5, -1.5, 1.5, 4.5].forEach((x, index) => {
      addUnitColumn(level, x, -1.3, 4, [index % 2 ? "Y" : "B"]);
      addItem(level, MATERIALS[index % 2 ? "O" : "P"], x, 6.5, -1.3);
    });
    addUnitColumn(level, 0, -1.3, 3, ["R", "Y"]);
    levels.push(finalize(level));
  }

  // AI-7: unequal paired watchtowers, keeping prod-7's two-island lesson but changing the silhouettes.
  {
    const level = makeLevel(7, 25, [platform(1, -3.5, -2, 5, 4), platform(2, 3.5, -2, 5, 4)]);
    for (const z of [-2.7, -1.3]) {
      [3, 5, 3].forEach((height, index) => addUnitColumn(level, -4.5 + index, z, height, ["B", "Y"], 1));
      [4, 6, 4].forEach((height, index) => addUnitColumn(level, 2.5 + index, z, height, ["R", "U"], 2));
    }
    addItem(level, MATERIALS.T, -3.5, 7.5, -2, 1);
    for (const x of [2.5, 4.5]) addItem(level, MATERIALS.T, x, 6.5, -2, 2);
    levels.push(finalize(level));
  }

  // AI-8: a lintel gate that echoes prod-8's negative space without nesting multiple square frames.
  {
    const level = makeLevel(8, 23, [platform(1, 0, -2, 10, 4)]);
    addPatternDepth(level, [
      "SSSSSSSSS",
      "SS     SS",
      "SS     SS",
      "SS     SS",
    ], { zValues: [-2.7, -1.3] });
    for (const z of [-2.7, -1.3]) {
      addItem(level, MATERIALS.S, -2, 5.5, z);
      addItem(level, MATERIALS.S, 2, 5.5, z);
      addItem(level, 4005, 0, 6.5, z);
      for (const x of [-2, -1, 0, 1, 2]) addItem(level, MATERIALS.S, x, 7.5, z);
    }
    addPattern(level, ["SSSSSSSSS", "SS  S  SS", "    S    "], { z: -2 });
    levels.push(finalize(level));
  }

  // AI-9: a shield-like pixel crest, borrowing prod-9's readable face-scale mass without a robot face.
  {
    const level = makeLevel(9, 24, [platform(1, 0, -2, 10, 4)]);
    addPattern(level, [
      "  WWWWW  ",
      " WWWWWWW ",
      "WWBBPBBWW",
      "WWBPPPBWW",
      "WWBBPBBWW",
      " WWWWWWW ",
      "  WWWWW  ",
    ], { z: -2.7 });
    [-3, -1, 1, 3].forEach((x, index) => addUnitColumn(level, x, -1.3, 4, [index % 2 ? "U" : "B"]));
    [-2, 0, 2].forEach((x, index) => addUnitColumn(level, x, -2, 5, [index % 2 ? "P" : "B"]));
    levels.push(finalize(level));
  }

  // AI-10: a bridge fortress with twin arches, related to prod-10's finale grammar but no target center.
  {
    const level = makeLevel(10, 22, [platform(1, 0, -2, 12, 4)]);
    addPattern(level, [
      "RRRRRRRRRRR",
      "RR  Y Y  RR",
      "RR  Y Y  RR",
      "RR  Y Y  RR",
      "GGGGGGGGGGG",
    ], { z: -2.7 });
    [-5, -2, 2, 5].forEach((x, index) => {
      addUnitColumn(level, x, -1.3, 3, [index % 2 ? "P" : "U"]);
    });
    for (const x of [-5, 5]) addItem(level, MATERIALS.T, x, 7.5, -2.7);
    levels.push(finalize(level));
  }

  return levels;
}

function validate(levels) {
  if (levels.length !== 10) throw new Error(`Expected 10 levels, received ${levels.length}`);
  const ids = new Set();
  for (const level of levels) {
    if (ids.has(level.levelId)) throw new Error(`Duplicate AI level ${level.levelId}`);
    ids.add(level.levelId);
    if (level.category !== "ai" || level.name !== `AI-${level.levelId}` || level.slug !== `ai-${level.levelId}`) throw new Error(`Bad identity for AI-${level.levelId}`);
    if (level.settings.difficulty !== 0 || level.settings.stabilizeOnSpawn !== false) throw new Error(`Bad onboarding settings for AI-${level.levelId}`);
    if (Object.values(level.obstacles).some((list) => list.length)) throw new Error(`Early mechanic found in AI-${level.levelId}`);
    const platformIds = new Set(level.platforms.map((item) => item.sequence));
    const sequences = level.items.map((item) => item.sequence);
    if (new Set(sequences).size !== sequences.length || sequences.some((value, index) => value !== index + 1)) throw new Error(`Bad item sequence in AI-${level.levelId}`);
    for (const item of level.items) {
      if (!profiles.has(item.catalogId)) throw new Error(`Unknown catalog ${item.catalogId} in AI-${level.levelId}`);
      if (!platformIds.has(item.platform) || item.stage !== 1) throw new Error(`Bad placement reference in AI-${level.levelId}`);
      if (![item.position.x, item.position.y, item.position.z].every(Number.isFinite)) throw new Error(`Non-finite item position in AI-${level.levelId}`);
      const support = level.platforms.find((entry) => entry.sequence === item.platform);
      if (Math.abs(item.position.x - support.position.x) > support.size.width / 2 + 0.01 || Math.abs(item.position.z - support.position.z) > support.size.depth / 2 + 0.01) {
        throw new Error(`Item ${item.sequence} exceeds platform center bounds in AI-${level.levelId}`);
      }
      if (level.levelId <= 4 && item.materialId !== 1) throw new Error(`Colored material appears too early in AI-${level.levelId}`);
      if (level.levelId >= 5 && ![1, 9].includes(item.materialId)) throw new Error(`Late material appears in AI-${level.levelId}`);
    }
    if (level.levelId !== 7 && level.platforms.length !== 1) throw new Error(`Unexpected platform count in AI-${level.levelId}`);
    if (level.levelId === 7 && level.platforms.length !== 2) throw new Error("AI-7 must have two platforms");
    if (level.statistics.itemCount !== level.items.length || level.statistics.platformCount !== level.platforms.length) throw new Error(`Statistics mismatch in AI-${level.levelId}`);
  }
}

function indexRecord(level) {
  return {
    key: `ai:${level.levelId}`,
    slug: level.slug,
    category: "ai",
    categoryName: "AI关卡",
    name: level.name,
    id: level.levelId,
    moveCount: level.settings.moveCount,
    difficulty: "NORMAL",
    difficultyValue: 0,
    counts: {
      platforms: level.platforms.length,
      blocks: level.items.length,
      obstacles: 0,
      bouncers: 0,
      blockers: 0,
      hammers: 0,
      stages: 1,
    },
  };
}

const levels = buildLevels();
validate(levels);
for (const level of levels) {
  fs.writeFileSync(path.join(LEVEL_DIR, `${level.slug}.json`), `${JSON.stringify(level, null, 2)}\n`);
}

const indexPath = path.join(DATA_DIR, "index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
index.levels = [...index.levels.filter((level) => level.category !== "ai"), ...levels.map(indexRecord)];
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

console.log(`Generated ${levels.length} AI levels (${levels.reduce((sum, level) => sum + level.items.length, 0)} items).`);
for (const level of levels) console.log(`${level.name}: ${level.items.length} items, ${level.platforms.length} platform(s), ${level.settings.moveCount} moves`);
