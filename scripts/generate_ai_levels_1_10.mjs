import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const LEVEL_DIR = path.join(DATA_DIR, "levels");
const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "catalog.json"), "utf8"));
const profiles = new Map(catalog.profiles.map((profile) => [profile.catalogId ?? profile.id, profile]));

const Q_IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const Q_Z_90 = { x: 0, y: 0, z: 0.7071068, w: 0.7071068 };
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

  // AI-1: a compact stepped crown with two-block depth.
  {
    const level = makeLevel(1, 30, [platform(1, 0, -2, 7, 3)]);
    addPatternDepth(level, ["CCCCC", "CCCCC", " CCC ", "  C  "]);
    levels.push(finalize(level));
  }

  // AI-2: two load-bearing doorposts and one continuous top beam.
  {
    const level = makeLevel(2, 29, [platform(1, 0, -2, 8, 3)]);
    for (const z of [-2.5, -1.5]) {
      addItem(level, 4003, -2.5, 3.5, z);
      addItem(level, 4003, 2.5, 3.5, z);
      addItem(level, 4005, 0, 5.5, z, 1, Q_Z_90);
      for (const x of [-2, 0, 2]) addItem(level, 4001, x, 6.5, z);
      for (const x of [-3, -2, 2, 3]) addItem(level, 4001, x, 2.5, z);
    }
    levels.push(finalize(level));
  }

  // AI-3: twin towers, a smaller gate, and readable tower caps.
  {
    const level = makeLevel(3, 28, [platform(1, 0, -2, 9, 3)]);
    for (const z of [-2.5, -1.5]) {
      for (const x of [-3, 3]) {
        addItem(level, 4008, x, 3.5, z);
        addItem(level, 4001, x, 5.5, z);
        addItem(level, 4011, x, 6.5, z);
      }
      for (const x of [-1.5, 1.5]) addItem(level, 4002, x, 3, z);
      addItem(level, 4003, 0, 4.5, z, 1, Q_Z_90);
      for (const x of [-4, -2, 2, 4]) addItem(level, 4001, x, 2.5, z);
    }
    levels.push(finalize(level));
  }

  // AI-4: the pure-can finale, a broad shield tapering to a central crest.
  {
    const level = makeLevel(4, 27, [platform(1, 0, -2, 9, 3)]);
    addPattern(level, ["SSSSSSS", "SCCSCCS", "SSSSSSS", " SSSSS ", " SCCCS ", "  SSS  ", "   C   "], { z: -2 });
    levels.push(finalize(level));
  }

  // AI-5: first colored-box lesson; each color describes one support layer.
  {
    const level = makeLevel(5, 26, [platform(1, 0, -2, 9, 3)]);
    addPatternDepth(level, ["RRRRRRR", " YYYYY ", "  GGG  ", "   B   "]);
    levels.push(finalize(level));
  }

  // AI-6: rocket silhouette with a narrow engine band and can cone nose.
  {
    const level = makeLevel(6, 25, [platform(1, 0, -2, 7, 3)]);
    addPatternDepth(level, ["OOROO", " ORR ", " YRY ", " GRG ", " BBB ", "  W  ", "  P  "]);
    for (const z of [-2.5, -1.5]) addItem(level, 4011, 0, 9.5, z);
    levels.push(finalize(level));
  }

  // AI-7: two independent static islands teach target-order allocation.
  {
    const level = makeLevel(7, 25, [platform(1, -3, -2, 4, 3), platform(2, 3, -2, 4, 3)]);
    addPatternDepth(level, ["BBB", "YYY", " B ", " B "], { originX: -3, platformIndex: 1 });
    addPatternDepth(level, ["RRR", "UUU", " R ", " R "], { originX: 3, platformIndex: 2 });
    for (const [x, platformIndex] of [[-3, 1], [3, 2]]) {
      for (const z of [-2.5, -1.5]) addItem(level, 4011, x, 6.5, z, platformIndex);
    }
    levels.push(finalize(level));
  }

  // AI-8: a heart-topped gate with a genuine open center and supported lintel.
  {
    const level = makeLevel(8, 23, [platform(1, 0, -2, 9, 3)]);
    for (const z of [-2.5, -1.5]) {
      for (let row = 0; row < 4; row += 1) {
        const y = 2.5 + row;
        for (const x of [-3, -2]) addItem(level, row % 2 ? 4077 : 4073, x, y, z);
        for (const x of [2, 3]) addItem(level, row % 2 ? 4073 : 4077, x, y, z);
      }
      addItem(level, 4005, 0, 6.5, z, 1, Q_Z_90);
      addPattern(level, ["RRRRR", " RRR ", "  P  "], { originX: 0, z, platformIndex: 1 });
      const added = level.items.slice(-9);
      for (const item of added) item.position.y += 5;
    }
    levels.push(finalize(level));
  }

  // AI-9: a readable robot face on a solid wall, with a can antenna spine.
  {
    const level = makeLevel(9, 24, [platform(1, 0, -2, 9, 3)]);
    addPattern(level, ["BBBBBBB", "BWWBWWB", "BRRBRRB", "BBBBBBB", "BYBYBYB", "BKKKKKB", "BBBBBBB"], { z: -1.5 });
    for (const x of [-3, 0, 3]) {
      addItem(level, 4010, x, 4.5, -2.5);
      addItem(level, 4007, x, 8, -2.5);
      addItem(level, 4011, x, 9.5, -2.5);
    }
    levels.push(finalize(level));
  }

  // AI-10: full-width AI badge with three rear can towers as chapter finale.
  {
    const level = makeLevel(10, 22, [platform(1, 0, -2, 11, 3)]);
    addPattern(level, [
      "RRRRRRRRR",
      "YBBBYBYYY",
      "YBBBYBBYB",
      "YYYYYBBYB",
      "YBBBYBBYB",
      "YBBBYBBYB",
      "YBBBYBBYB",
      "BYYYBBYYY",
    ], { z: -1.5 });
    for (const x of [-4, 0, 4]) {
      addItem(level, 4010, x, 4.5, -2.5);
      addItem(level, 4008, x, 8.5, -2.5);
      addItem(level, 4011, x, 10.5, -2.5);
    }
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
