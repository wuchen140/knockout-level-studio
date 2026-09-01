import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const LEVEL_DIR = path.join(DATA_DIR, "levels");
const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "catalog.json"), "utf8"));
const profiles = new Map(catalog.profiles.map((profile) => [profile.catalogId ?? profile.id, profile]));
const Q = { x: 0, y: 0, z: 0, w: 1 };

const IDS = {
  can: [4001, 4006, 4011],
  jam: [4012, 4013, 4014, 4015, 4016, 4017],
  cardboard: [4040, 4041, 4042, 4045, 4046],
  stone: [4030, 4031, 4032, 4035, 4036],
  ice: [4050, 4051, 4052, 4055, 4056],
  colored: [4072, 4073, 4074, 4075, 4076, 4077, 4078, 4079, 4080],
  tnt: [4060, 4061],
  pillar: [4117, 4118, 4119, 4122, 4123],
};
const PALETTES = {
  jam: { J: 4012, C: 4078, K: 4040, S: 4030, T: 4011, I: 4050, P: 4117 },
  stone: { S: 4030, J: 4012, C: 4079, K: 4040, T: 4011, I: 4050, P: 4117 },
  ice: { I: 4050, C: 4073, J: 4017, S: 4030, K: 4040, T: 4011, P: 4117 },
  tnt: { T: 4060, C: 4078, J: 4016, S: 4030, I: 4050, P: 4117, K: 4040 },
  pillar: { P: 4117, C: 4073, J: 4012, S: 4030, I: 4050, T: 4060, K: 4040 },
};

function difficulty(id) {
  if (id <= 19) return 0;
  if (id === 20 || id % 10 === 4 || id % 10 === 7) return 1;
  if (id % 10 === 0) return 2;
  return 0;
}

function platform(sequence, x, z, width, depth, motion = null, rotationMotion = null, shape = "rect") {
  return { sequence, id: shape === "round" ? "Table_Round" : "Table_Rect", shape, position: { x, y: 2, z }, rotation: Q, size: { width, depth }, movement: motion, rotationMotion };
}

function move(axis, min, max, speed, direction = 1) {
  return { axis, min, max, speed, initialDirection: direction, easeTime: 0.2, startupDelay: 0 };
}

function rotate(speed = 20) {
  return { axis: { x: 0, y: 1, z: 0 }, speed };
}

function makeLevel(id, moveCount, platforms, design) {
  return {
    levelId: id, category: "ai", categoryName: "AI关卡", name: `AI-${id}`, slug: `ai-${id}`,
    settings: { version: 1, moveCount, difficulty: difficulty(id), backgroundIndex: -1, stabilizeOnSpawn: false, physicsQuality: 0 },
    design, statistics: {}, items: [], platforms, obstacles: { bouncers: [], blockers: [], hammers: [] },
  };
}

function addItem(level, catalogId, x, y, z, platformIndex = 1, rotation = Q) {
  const profile = profiles.get(catalogId);
  if (!profile) throw new Error(`Unknown catalog ${catalogId}`);
  level.items.push({
    sequence: level.items.length + 1, catalogId, stage: 1, platform: platformIndex,
    materialId: profile.materialId, shapeId: profile.sourceShapeId,
    position: { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)), z: Number(z.toFixed(3)) },
    rotation, size: { x: profile.size[0], y: profile.size[1], z: profile.size[2] },
  });
}

function addPattern(level, rows, { x = 0, z = -2, platformIndex = 1, palette = PALETTES.stone, depth = 0 } = {}) {
  const width = Math.max(...rows.map((row) => row.length));
  for (let layer = 0; layer <= depth; layer += 1) {
    const layerZ = z + layer * 1.15;
    rows.forEach((raw, rowIndex) => {
      const row = raw.padEnd(width, " ");
      for (let column = 0; column < width; column += 1) {
        const catalogId = palette[row[column]];
        if (!catalogId) continue;
        addItem(level, catalogId, x + column - (width - 1) / 2, 2.5 + rowIndex, layerZ, platformIndex);
      }
    });
  }
}

function addColumn(level, x, z, height, catalogId, platformIndex = 1) {
  for (let row = 0; row < height; row += 1) addItem(level, catalogId, x, 2.5 + row, z, platformIndex);
}

function addTowerPair(level, { left = -3, right = 3, z = -2, height = 5, platformIndex = 1, body = 4030, accent = 4012 }) {
  for (const x of [left, right]) {
    addColumn(level, x, z, height, body, platformIndex);
    addItem(level, accent, x, 2.5 + height, z, platformIndex);
  }
  for (let x = left; x <= right; x += 1) addItem(level, body, x, 2.5 + height - 1, z, platformIndex);
}

function addMotif(level, variant, palette, options = {}) {
  const motifs = [
    ["  C C  ", " CJJJC ", "CJJJJJC", " CJJJC ", "  C C  "],
    ["CCCCCCC", "C     C", "C J J C", "C  J  C", "CCCCCCC"],
    ["   C   ", "  CCC  ", " CJJJC ", "CJJJJJC", "CCCCCCC"],
    ["C   C", "CC CC", "C J C", "CCCCC", " C C "],
    ["CCCCCCC", " CCCCC ", "  CJC  ", " CCCCC ", "CCCCCCC"],
    ["C C C C", " C J C ", "C C C C", "  C C  ", "CCCCCCC"],
    ["CCCCCCC", "C C C C", "CCCCCCC", "C J J C", "CCCCCCC"],
    ["  CCC  ", " CJJJC ", "CJJJJJC", " CJJJC ", "  CCC  "],
  ];
  addPattern(level, motifs[variant % motifs.length], { ...options, palette });
}

function chapterLevel(id) {
  const chapter = Math.floor(id / 10);
  const slot = id % 10;
  const variant = id % 8;
  const hard = difficulty(id) > 0;
  const finale = difficulty(id) === 2;
  const moves = chapter === 1 ? 24 - (slot % 4) : chapter === 2 ? 25 - (slot % 5) : chapter === 3 ? 29 - (slot % 4) : chapter === 4 ? 27 - (slot % 5) : chapter === 5 ? 25 - (slot % 4) : chapter === 6 ? 23 - (slot % 4) : chapter === 7 ? 26 - (slot % 5) : chapter === 8 ? 25 - (slot % 4) : 27 - (slot % 5);
  let platforms = [platform(1, 0, -2, finale ? 12 : hard ? 10 : 9, finale ? 7 : 4)];
  let palette = PALETTES.stone;
  let motif = "structured facade";
  const design = { chapter: `${chapter * 10 - 9}-${chapter * 10}`, slot, role: finale ? "chapter finale" : hard ? "hard exam" : slot === 1 ? "chapter intro" : "practice", weakPoint: "central connector", groups: finale ? 3 : 1 };

  if (chapter === 1) {
    palette = PALETTES.jam; motif = ["jam crown", "paper bridge", "twin jar towers", "open jar gate"][variant % 4];
    const level = makeLevel(id, moves, platforms, { ...design, motif, focus: "jam jar and cardboard" });
    addMotif(level, variant, palette, { depth: slot >= 8 ? 1 : 0 });
    if (slot === 1) addPattern(level, ["KKKKK", "K   K", "K J K", "K   K", "KKKKK"], { z: -3.2, palette });
    if (slot === 7) addTowerPair(level, { height: 5, body: 4040, accent: 4016 });
    return level;
  }

  if (chapter === 2) {
    palette = PALETTES.stone; motif = ["stone gate", "heavy stair", "split bastion", "stone arch"][variant % 4];
    if (slot === 7 || finale) platforms = [platform(1, -3.4, -2, 5, 5), platform(2, 3.4, -2, 5, 5)];
    const level = makeLevel(id, moves, platforms, { ...design, motif, focus: "stone anchors" });
    if (platforms.length === 1) addMotif(level, variant, palette, { depth: slot >= 8 ? 1 : 0 });
    else { addTowerPair(level, { left: -4.3, right: -2.5, z: -2, height: 5, platformIndex: 1, body: 4030, accent: 4012 }); addTowerPair(level, { left: 2.5, right: 4.3, z: -2, height: 6, platformIndex: 2, body: 4031, accent: 4017 }); }
    if (finale) addPattern(level, ["SSSSSSS", "S     S", "S J J S", "S  J  S", "SSSSSSS"], { x: 0, z: -2, palette, depth: 1 });
    return level;
  }

  if (chapter === 3) {
    palette = PALETTES.stone; motif = ["rotating ring", "turning gate", "orbit towers", "carousel bridge"][variant % 4];
    const rotationSpeed = slot === 1 ? 12 : finale ? 30 : 20 + (slot % 3) * 4;
    platforms = [platform(1, 0, -2, finale ? 11 : 9, finale ? 6 : 4, null, rotate(rotationSpeed), slot === 6 || slot === 9 ? "round" : "rect")];
    if (slot === 7) platforms.push(platform(2, 4, -2, 4, 4, null, rotate(-18), "round"));
    const level = makeLevel(id, moves, platforms, { ...design, motif, focus: "rotating platforms" });
    addMotif(level, variant + 2, palette, { depth: slot >= 8 ? 1 : 0, z: -2, platformIndex: 1 });
    if (slot === 7) addTowerPair(level, { left: 3.3, right: 4.7, z: -2, height: 4, platformIndex: 2, body: 4030, accent: 4012 });
    return level;
  }

  if (chapter === 4) {
    palette = PALETTES.ice; motif = ["ice diamond", "frozen arch", "sliding crystal", "ice crown"][variant % 4];
    const level = makeLevel(id, moves, platforms, { ...design, motif, focus: "ice low-friction supports" });
    addMotif(level, variant + 1, palette, { depth: slot >= 8 ? 1 : 0 });
    if (slot === 4 || slot === 7) addColumn(level, slot === 4 ? -3 : 3, -2, 5, 4030);
    return level;
  }

  if (chapter === 5) {
    palette = PALETTES.ice; motif = ["moving dock", "crossing bridge", "drifting twin towers", "pendulum gate"][variant % 4];
    const motion = move("X", -(slot % 3 + 1) * 0.7, (slot % 3 + 1) * 0.7, 0.5 + (slot % 3) * 0.25, slot % 2 ? -1 : 1);
    platforms = [platform(1, 0, -2, finale ? 10 : 8, 4, motion, slot === 8 ? rotate(14) : null, slot === 6 || slot === 9 ? "round" : "rect")];
    if (slot === 7) platforms.push(platform(2, 3.6, -2, 4, 4, move("X", -1.2, 1.2, 0.75, -1), null, "round"));
    const level = makeLevel(id, moves, platforms, { ...design, motif, focus: "horizontal platform movement" });
    addMotif(level, variant + 3, palette, { depth: slot >= 8 ? 1 : 0, platformIndex: 1 });
    if (slot === 7) addTowerPair(level, { left: 3, right: 4.5, z: -2, height: 5, platformIndex: 2, body: 4050, accent: 4078 });
    return level;
  }

  if (chapter === 6) {
    palette = PALETTES.tnt; motif = ["TNT core", "fuse tower", "red vault", "demolition crown"][variant % 4];
    const level = makeLevel(id, moves, finale ? [platform(1, -3.4, -2, 7, 5), platform(2, 3.4, -2, 7, 5)] : platforms, { ...design, motif, focus: "rare TNT focal weak point" });
    addMotif(level, variant + 4, palette, { depth: slot >= 8 ? 1 : 0, x: level.platforms[0].position.x, platformIndex: 1 });
    const tntCount = finale ? 5 : hard ? 3 : slot === 1 ? 1 : 2;
    for (let index = 0; index < tntCount; index += 1) addItem(level, index % 2 ? 4061 : 4060, level.platforms[0].position.x + (index - (tntCount - 1) / 2) * 0.8, 6.5 + (index % 2) * 1.1, -2, 1);
    if (finale) addTowerPair(level, { left: 2.6, right: 4.2, z: -2, height: 5, platformIndex: 2, body: 4030, accent: 4017 });
    return level;
  }

  if (chapter === 7) {
    palette = PALETTES.tnt; motif = ["blocker gate", "blade corridor", "red watchtower", "rotor vault"][variant % 4];
    const level = makeLevel(id, moves, platforms, { ...design, motif, focus: "rotating blockers" });
    addMotif(level, variant + 5, palette, { depth: slot >= 8 ? 1 : 0 });
    const blockerCount = finale ? 2 : slot === 1 ? 1 : hard ? 2 : 1;
    for (let index = 0; index < blockerCount; index += 1) level.obstacles.blockers.push({ sequence: index + 1, id: "Blocker_L", position: { x: (index - (blockerCount - 1) / 2) * 3, y: 6.5, z: -5.5 }, rotation: Q, parameters: { rotSpeed: finale ? 100 : 55 + slot * 4, bladeScale: finale ? 1.9 : 1.45 } });
    return level;
  }

  if (chapter === 8) {
    palette = PALETTES.ice; motif = ["lifted crown", "vertical gate", "rising bridge", "elevator towers"][variant % 4];
    const motion = move("Y", 0, slot === 1 ? 1 : finale ? 3 : 1 + (slot % 3) * 0.5, 0.55 + (slot % 3) * 0.2, slot % 2 ? -1 : 1);
    platforms = [platform(1, 0, -2, finale ? 9 : 8, 4, motion, slot === 7 ? rotate(18) : null, slot === 6 || slot === 9 ? "round" : "rect")];
    if (slot === 7 || finale) platforms.push(platform(2, 3.6, -2, 4, 4, move("Y", 0, 2, 0.7, -1), null, "round"));
    const level = makeLevel(id, moves, platforms, { ...design, motif, focus: "vertical platform movement" });
    addMotif(level, variant + 6, palette, { depth: slot >= 8 ? 1 : 0 });
    if (platforms.length > 1) addTowerPair(level, { left: 2.6, right: 4.2, z: -2, height: finale ? 6 : 4, platformIndex: 2, body: 4050, accent: 4073 });
    return level;
  }

  palette = PALETTES.pillar; motif = ["pillar colonnade", "obelisk crown", "pillar bridge", "royal frame"][variant % 4];
  if (slot === 7 || finale) platforms = [platform(1, -3.8, -2, 4.5, 5), platform(2, 0, -2, 7, 5), platform(3, 3.8, -2, 4.5, 5)];
  const level = makeLevel(id, moves, platforms, { ...design, motif, focus: "heavy pillars and synthesis" });
  if (platforms.length === 1) addMotif(level, variant + 7, palette, { depth: slot >= 8 ? 1 : 0 });
  else platforms.forEach((entry, index) => addColumn(level, entry.position.x, -2, 5 + index, index % 2 ? 4118 : 4117, entry.sequence));
  if (finale) {
    addPattern(level, ["PPP", "P T P", "PPP"], { x: 0, z: -2, palette, platformIndex: 2 });
    const target = level.items.find((item) => item.platform === 2 && Math.abs(item.position.x) < 0.01);
    if (target) {
      const profile = profiles.get(4060);
      Object.assign(target, { catalogId: 4060, materialId: profile.materialId, shapeId: profile.sourceShapeId, size: { x: profile.size[0], y: profile.size[1], z: profile.size[2] } });
    }
  }
  return level;
}

function finalize(level) {
  const obstacles = Object.values(level.obstacles).flat();
  level.statistics = { entityCount: level.items.length + level.platforms.length + obstacles.length, entityTypeCount: obstacles.length ? 3 : 2, platformCount: level.platforms.length, itemCount: level.items.length, destructibleItemCount: level.items.length, specialObstacleCount: obstacles.length, customEntityCount: level.platforms.length };
  return level;
}

function padDensity(level) {
  const target = difficulty(level.levelId) === 2 ? 42 : difficulty(level.levelId) === 1 ? 32 : 24;
  if (level.items.length >= target) return level;
  const chapter = Math.floor(level.levelId / 10);
  const filler = chapter === 1 ? 4012 : chapter === 2 || chapter === 3 ? 4030 : chapter === 4 || chapter === 5 || chapter === 8 ? 4050 : chapter === 9 ? 4117 : 4078;
  const support = level.platforms[0];
  const width = Math.max(1, Math.floor(support.size.width - 1));
  while (level.items.length < target) {
    const index = level.items.length;
    const x = support.position.x + (index % width) - (width - 1) / 2;
    const z = support.position.z + (Math.floor(index / width) % 2) * 1.1;
    const y = 2.5 + Math.floor(index / width) * 1.02;
    addItem(level, filler, x, y, z, support.sequence);
  }
  return level;
}

function validate(level) {
  const platforms = new Set(level.platforms.map((item) => item.sequence));
  if (level.items.length < 18) throw new Error(`AI-${level.levelId} has too few items`);
  for (const item of level.items) {
    const profile = profiles.get(item.catalogId);
    if (!profile || item.platform < 1 || !platforms.has(item.platform) || item.stage !== 1) throw new Error(`Invalid item in AI-${level.levelId}`);
    if (item.materialId !== profile.materialId || item.shapeId !== profile.sourceShapeId) throw new Error(`Profile mismatch in AI-${level.levelId}`);
    const support = level.platforms.find((entry) => entry.sequence === item.platform);
    if (!support) throw new Error(`Missing support in AI-${level.levelId}: item ${item.sequence} platform ${item.platform}`);
    if (Math.abs(item.position.x - support.position.x) > support.size.width / 2 + 0.01 || Math.abs(item.position.z - support.position.z) > support.size.depth / 2 + 0.01) throw new Error(`Bounds error in AI-${level.levelId}: item ${item.sequence} platform ${item.platform} at ${item.position.x},${item.position.z} on ${support.position.x},${support.position.z} size ${support.size.width}x${support.size.depth}`);
  }
  if (level.statistics.itemCount !== level.items.length || level.statistics.platformCount !== level.platforms.length) throw new Error(`Stats mismatch in AI-${level.levelId}`);
}

const levels = [];
for (let id = 11; id <= 100; id += 1) {
  const level = finalize(padDensity(chapterLevel(id)));
  validate(level);
  fs.writeFileSync(path.join(LEVEL_DIR, `${level.slug}.json`), `${JSON.stringify(level, null, 2)}\n`);
  levels.push(level);
}

const indexPath = path.join(DATA_DIR, "index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const records = levels.map((level) => ({ key: `ai:${level.levelId}`, slug: level.slug, category: "ai", categoryName: "AI关卡", name: level.name, id: level.levelId, moveCount: level.settings.moveCount, difficulty: ["NORMAL", "HARD", "SUPER_HARD"][level.settings.difficulty], difficultyValue: level.settings.difficulty, counts: { platforms: level.platforms.length, blocks: level.items.length, obstacles: Object.values(level.obstacles).flat().length, bouncers: level.obstacles.bouncers.length, blockers: level.obstacles.blockers.length, hammers: level.obstacles.hammers.length, stages: 1 } }));
index.levels = [...index.levels.filter((level) => level.category !== "ai" || level.id <= 10), ...records].sort((a, b) => a.category.localeCompare(b.category) || a.id - b.id);
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Generated AI-${levels[0].levelId} to AI-${levels.at(-1).levelId}: ${levels.reduce((sum, level) => sum + level.items.length, 0)} items.`);
