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

  // AI-1: three orderly rows of independent columns, intentionally unlike prod-1's pyramid.
  {
    const level = makeLevel(1, 30, [platform(1, 0, -2, 11, 4)]);
    const heights = [1, 3, 2, 4, 1, 3, 2, 4, 1];
    for (const z of [-3.5, -2.5, -1.5]) {
      const offsetX = (z + 2.5) * 0.3;
      heights.forEach((height, index) => addUnitColumn(level, index - 4 + offsetX, z, height, ["C"]));
    }
    levels.push(finalize(level));
  }

  // AI-2: a regular five-by-four matrix with a controlled height rhythm.
  {
    const level = makeLevel(2, 29, [platform(1, 0, -2, 7, 5)]);
    const heights = [2, 4, 3, 4, 2];
    [-3.5, -2.5, -1.5, -0.5].forEach((z, row) => {
      const offsetX = (row - 1.5) * 0.2;
      heights.forEach((height, index) => addUnitColumn(level, index - 2 + offsetX, z, height, (index + row) % 2 ? ["C"] : ["S"]));
    });
    levels.push(finalize(level));
  }

  // AI-3: four ascending support ranks with repeated caps.
  {
    const level = makeLevel(3, 28, [platform(1, 0, -2, 10, 4)]);
    const heights = [2, 3, 4, 5];
    for (const z of [-3.5, -2.5, -1.5]) {
      const offsetX = (z + 2.5) * 0.3;
      heights.forEach((height, index) => {
        const x = -3 + index * 2 + offsetX;
        addUnitColumn(level, x, z, height, [index % 2 ? "S" : "C"]);
        addItem(level, 4011, x, 2.5 + height, z);
      });
    }
    levels.push(finalize(level));
  }

  // AI-4: a regular three-by-three cross field with a taller center.
  {
    const level = makeLevel(4, 27, [platform(1, 0, -2, 7, 7)]);
    for (const z of [-4, -2, 0]) {
      const offsetX = (z + 2) * 0.2;
      for (const x of [-2, 0, 2]) {
        const height = x === 0 && z === -2 ? 7 : 5;
        addUnitColumn(level, x + offsetX, z, height, [(x + z) % 4 ? "C" : "S"]);
        if (x === 0 || z === -2) addItem(level, 4011, x + offsetX, 2.5 + height, z);
      }
    }
    levels.push(finalize(level));
  }

  // AI-5: first colored-box lesson presented as a repeated meter rhythm.
  {
    const level = makeLevel(5, 26, [platform(1, 0, -2, 10, 4)]);
    const heights = [2, 4, 3, 5, 2, 4, 3, 5];
    const colors = ["R", "O", "Y", "G", "B", "U", "P", "R"];
    for (const z of [-2.5, -1.5]) {
      const offsetX = (z + 2) * 0.5;
      heights.forEach((height, index) => {
        const x = index - 3.5 + offsetX;
        for (let row = 0; row < height; row += 1) addItem(level, MATERIALS[colors[index]], x, 2.5 + row, z);
        addItem(level, MATERIALS[colors[(index + 3) % colors.length]], x, 2.5 + height, z);
      });
    }
    levels.push(finalize(level));
  }

  // AI-6: a low rectangular perimeter in plan view, leaving a clear central court.
  {
    const level = makeLevel(6, 25, [platform(1, 0, -2, 11, 8)]);
    const xs = [-4, -2, 0, 2, 4];
    const zs = [-5, -3, -1, 1];
    let perimeterIndex = 0;
    zs.forEach((z, row) => xs.forEach((x, column) => {
      if (row !== 0 && row !== zs.length - 1 && column !== 0 && column !== xs.length - 1) return;
      const height = 3 + (perimeterIndex % 2);
      const colors = [["B", "G"], ["R", "O"], ["Y", "U"]][perimeterIndex % 3];
      addUnitColumn(level, x, z, height, colors);
      addItem(level, MATERIALS[colors[1]], x, 2.5 + height, z);
      perimeterIndex += 1;
    }));
    levels.push(finalize(level));
  }

  // AI-7: two mirrored ramps point inward; neither island uses a tower or sign silhouette.
  {
    const level = makeLevel(7, 25, [platform(1, -3.5, -2, 5, 4), platform(2, 3.5, -2, 5, 4)]);
    for (const z of [-3.5, -2.5, -1.5]) {
      const offsetX = (z + 2.5) * 0.25;
      [1, 2, 3, 4].forEach((height, index) => addUnitColumn(level, -5 + index + offsetX, z, height, ["B", "Y"], 1));
      [4, 3, 2, 1].forEach((height, index) => addUnitColumn(level, 2 + index + offsetX, z, height, ["R", "U"], 2));
      addItem(level, 4011, -2 + offsetX, 6.5, z, 1);
      addItem(level, 4011, 2 + offsetX, 6.5, z, 2);
    }
    levels.push(finalize(level));
  }

  // AI-8: two complementary offset rows interlock without forming a solid wall.
  {
    const level = makeLevel(8, 23, [platform(1, 0, -2, 9, 4)]);
    const rows = [
      { z: -2.5, heights: [2, 4, 3, 5, 2, 4, 3], colors: ["B", "G"] },
      { z: -1.5, heights: [4, 2, 5, 3, 4, 2, 5], colors: ["O", "R"] },
    ];
    rows.forEach(({ z, heights, colors }) => heights.forEach((height, index) => {
      const x = index - 3 + (z + 2) * 0.5;
      addUnitColumn(level, x, z, height, colors);
      addItem(level, MATERIALS[colors[1]], x, 2.5 + height, z);
    }));
    levels.push(finalize(level));
  }

  // AI-9: a regular nine-point grid with a pronounced central core.
  {
    const level = makeLevel(9, 24, [platform(1, 0, -2, 7, 7)]);
    const heights = [[5, 7, 5], [7, 9, 7], [5, 7, 5]];
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const x = -2 + column * 2 + (row - 1) * 0.3;
        const z = -4 + row * 2;
        const colors = (row + column) % 2 ? ["B", "U"] : ["G", "Y"];
        addUnitColumn(level, x, z, heights[row][column], colors);
        addItem(level, 4079, x, 2.5 + heights[row][column], z);
      }
    }
    levels.push(finalize(level));
  }

  // AI-10: a genuinely three-dimensional circular arena of staggered columns.
  {
    const level = makeLevel(10, 22, [platform(1, 0, -2, 9, 9)]);
    const outer = [
      [3, 0, 4], [2.1, 2.1, 5], [0, 3, 6], [-2.1, 2.1, 4],
      [-3, 0, 5], [-2.1, -2.1, 6], [0, -3, 4], [2.1, -2.1, 5],
    ];
    const palette = [["R", "O"], ["Y", "G"], ["B", "U"], ["P", "R"]];
    outer.forEach(([x, zOffset, height], index) => {
      addUnitColumn(level, x, -2 + zOffset, height, palette[index % palette.length]);
      if (index % 2 === 0) addItem(level, 4011, x, 2.5 + height, -2 + zOffset);
    });
    const inner = [[1.5, 0], [0, 1.5], [-1.5, 0], [0, -1.5]];
    inner.forEach(([x, zOffset], index) => addUnitColumn(level, x, -2 + zOffset, 3, palette[(index + 1) % palette.length]));
    const innerDiagonals = [[1.1, 1.1], [-1.1, 1.1], [-1.1, -1.1], [1.1, -1.1]];
    innerDiagonals.forEach(([x, zOffset], index) => addUnitColumn(level, x, -2 + zOffset, 3, palette[(index + 2) % palette.length]));
    addUnitColumn(level, 0, -2, 7, ["C"]);
    addItem(level, 4011, 0, 9.5, -2);
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
