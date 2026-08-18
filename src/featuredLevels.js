const stageMeta = { area: "根关卡", stageIndex: null };
const shapeNames = { 0: "方块", 1: "圆柱", 2: "圆锥" };
const colors = {
  red: { colorId: 1, colorName: "红" },
  yellow: { colorId: 2, colorName: "黄" },
  orange: { colorId: 5, colorName: "橙" },
  purple: { colorId: 7, colorName: "紫" },
};

function makeBlock(levelId, index, { x, y, z = -0.5, color, shapeId = 0 }) {
  return {
    uid: `block-prod-${levelId}-${index}`,
    type: "block",
    name: `${levelId === 30000 ? "城堡方块" : "高塔方块"} ${index}`,
    ...stageMeta,
    platformIndex: null,
    waveIndex: null,
    shutterIndex: null,
    blockIndex: index,
    materialId: 6,
    materialName: "塑料",
    shapeId,
    shapeName: shapeNames[shapeId],
    colorId: color.colorId,
    colorName: color.colorName,
    position: [x, y + 0.5, z],
    rotation: [0, 0, 0],
    size: [1, 1, 1],
  };
}

function makePlatform(levelId, name, size) {
  return {
    uid: `platform-prod-${levelId}-1`,
    type: "platform",
    name,
    ...stageMeta,
    path: "platforms/1",
    platformIndex: 1,
    position: [0, 0, -0.5],
    rotation: [0, 0, 0],
    size,
    motion: {
      rotating: false,
      rotationSpeed: 0,
      horizontal: false,
      horizontalMin: 0,
      horizontalMax: 0,
      horizontalDirection: "Positive",
      horizontalSpeed: 0,
      vertical: false,
      verticalMin: 0,
      verticalMax: 0,
      verticalDirection: "Positive",
      verticalSpeed: 0,
    },
  };
}

function makeLevel({ id, blocks, platform, moveCount, sourceLevels }) {
  const index = {
    key: `prod:${id}`,
    slug: `prod-${id}`,
    category: "prod",
    id,
    moveCount,
    difficulty: "NORMAL",
    difficultyValue: 0,
    progressionCount: 1,
    firstProgressionLevel: id,
    ballCount: moveCount,
    counts: { platforms: 1, blocks: blocks.length, barriers: 0, stages: 0, shutters: 0, waves: 0, generatedBlocks: 0, shutterBlocks: 0 },
  };
  return {
    index,
    level: {
      ...index,
      schemaVersion: 1,
      source: { levels: sourceLevels, game: "游戏配置.xlsx" },
      objects: [platform, ...blocks],
    },
  };
}

function buildCastleBlocks() {
  const layout = [];
  const add = (x, y, color, shapeId = 0) => layout.push({ x, y, color, shapeId });

  for (let x = -4; x <= 4; x += 1) add(x, 0, colors.orange);
  for (const x of [-3, 3]) {
    for (let y = 1; y <= 3; y += 1) add(x, y, colors.yellow, 1);
    add(x, 4, colors.orange, 1);
    add(x, 5, colors.purple, 2);
  }
  for (const x of [-2, 2]) {
    add(x, 1, colors.yellow);
    add(x, 2, colors.yellow);
    add(x, 3, colors.orange);
  }
  for (const x of [-1, 0, 1]) {
    add(x, 1, x === 0 ? colors.red : colors.yellow);
    add(x, 2, x === 0 ? colors.red : colors.orange);
    add(x, 3, colors.yellow);
    add(x, 4, x === 0 ? colors.purple : colors.yellow);
    add(x, 5, colors.orange);
    add(x, 6, colors.purple);
  }
  add(0, 7, colors.purple);
  add(0, 8, colors.purple, 2);

  return layout.map((item, index) => makeBlock(30000, index + 1, item));
}

function buildTowerBlocks() {
  const layout = [];
  const add = (x, y, z, color, shapeId = 0) => layout.push({ x, y, z, color, shapeId });
  const centerZ = -0.5;
  const bodyRing = [
    [-1, -2], [0, -2], [1, -2],
    [-2, -1], [2, -1],
    [-2, 0], [2, 0],
    [-2, 1], [2, 1],
    [-1, 2], [0, 2], [1, 2],
  ];
  const addRing = (ring, y, colorFor, shapeFor = () => 0) => {
    for (const [x, relativeZ] of ring) add(x, y, centerZ + relativeZ, colorFor(x, relativeZ), shapeFor(x, relativeZ));
  };
  // Every body layer is a 5x5 rounded ring with an empty 3x3 interior.
  for (let y = 0; y <= 8; y += 1) {
    addRing(bodyRing, y, (x, relativeZ) => {
      const frontDoor = y === 1 && relativeZ === 2 && x === 0;
      const backDoor = y === 1 && relativeZ === -2 && x === 0;
      const frontWindow = (y === 3 || y === 5) && relativeZ === 2 && x === 0;
      const rightWindow = (y === 3 || y === 5) && x === 2 && relativeZ === 0;
      const backWindow = y === 5 && relativeZ === -2 && x === 0;
      if (frontDoor || backDoor) return colors.red;
      if (frontWindow || rightWindow || backWindow) return colors.purple;
      if (y === 0 || y === 2 || y === 4 || y === 6 || y === 8) return colors.orange;
      if (y === 7 && (x === 0 || relativeZ === 0)) return colors.purple;
      return colors.yellow;
    });
  }

  // The roof uses the same ring footprint, so every piece has direct vertical
  // support and the center remains empty. Cones on the top row provide the
  // pointed purple silhouette without a suspended center cap.
  addRing(bodyRing, 9, () => colors.purple);
  addRing(bodyRing, 10, () => colors.purple, () => 2);

  return layout.map((item, index) => makeBlock(30001, index + 1, item));
}

const castleBlocks = buildCastleBlocks();
const towerBlocks = buildTowerBlocks();

const castle = makeLevel({
  id: 30000,
  blocks: castleBlocks,
  platform: makePlatform(30000, "城堡平台", [9.4, 1, 1.2]),
  moveCount: 24,
  sourceLevels: "新建关卡",
});
const tower = makeLevel({
  id: 30001,
  blocks: towerBlocks,
  platform: makePlatform(30001, "高塔平台", [6, 1, 6]),
  moveCount: 20,
  sourceLevels: "图片参考关卡",
});

export const FEATURED_LEVELS = [castle.level, tower.level];
export const FEATURED_LEVEL_INDEXES = [castle.index, tower.index];
export const FEATURED_LEVEL_BY_SLUG = new Map(FEATURED_LEVELS.map((level) => [level.slug, level]));
