const stageMeta = { area: "根关卡", stageIndex: null };

const shapeNames = { 0: "方块", 1: "圆柱", 2: "圆锥" };

function makeBlock(index, { x, y, colorId, colorName, shapeId = 0 }) {
  return {
    uid: `block-prod-30000-${index}`,
    type: "block",
    name: `城堡方块 ${index}`,
    ...stageMeta,
    platformIndex: null,
    waveIndex: null,
    shutterIndex: null,
    blockIndex: index,
    materialId: 6,
    materialName: "塑料",
    shapeId,
    shapeName: shapeNames[shapeId],
    colorId,
    colorName,
    position: [x, y + 0.5, -0.5],
    rotation: [0, 0, 0],
    size: [1, 1, 1],
  };
}

function buildCastleBlocks() {
  const orange = { colorId: 5, colorName: "橙" };
  const yellow = { colorId: 2, colorName: "黄" };
  const red = { colorId: 1, colorName: "红" };
  const purple = { colorId: 7, colorName: "紫" };
  const layout = [];
  const add = (x, y, color, shapeId = 0) => layout.push({ x, y, ...color, shapeId });

  // Broad plinth, two round side towers and a taller central keep reproduce
  // the reference silhouette while keeping every 1x1x1 piece supported.
  for (let x = -4; x <= 4; x += 1) add(x, 0, orange);
  for (const x of [-3, 3]) {
    for (let y = 1; y <= 3; y += 1) add(x, y, yellow, 1);
    add(x, 4, orange, 1);
    add(x, 5, purple, 2);
  }
  for (const x of [-2, 2]) {
    add(x, 1, yellow);
    add(x, 2, yellow);
    add(x, 3, orange);
  }
  for (const x of [-1, 0, 1]) {
    add(x, 1, x === 0 ? red : yellow);
    add(x, 2, x === 0 ? red : orange);
    add(x, 3, yellow);
    add(x, 4, x === 0 ? purple : yellow);
    add(x, 5, orange);
    add(x, 6, purple);
  }
  add(0, 7, purple);
  add(0, 8, purple, 2);

  return layout.map((item, index) => makeBlock(index + 1, item));
}

const blocks = buildCastleBlocks();

export const FEATURED_LEVEL_INDEX = {
  key: "prod:30000",
  slug: "prod-30000",
  category: "prod",
  id: 30000,
  moveCount: 24,
  difficulty: "NORMAL",
  difficultyValue: 0,
  progressionCount: 1,
  firstProgressionLevel: 30000,
  ballCount: 24,
  counts: { platforms: 1, blocks: blocks.length, barriers: 0, stages: 0, shutters: 0, waves: 0, generatedBlocks: 0, shutterBlocks: 0 },
};

export const FEATURED_LEVEL = {
  ...FEATURED_LEVEL_INDEX,
  schemaVersion: 1,
  source: { levels: "新建关卡", game: "游戏配置.xlsx" },
  objects: [{
    uid: "platform-prod-30000-1",
    type: "platform",
    name: "城堡平台",
    ...stageMeta,
    path: "platforms/1",
    platformIndex: 1,
    position: [0, 0, -0.5],
    rotation: [0, 0, 0],
    size: [9.4, 1, 1.2],
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
  }, ...blocks],
};
