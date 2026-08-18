const stageMeta = { area: "根关卡", stageIndex: null };

function makeBlock(index, x, y, z, colorId, colorName) {
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
    shapeId: 0,
    shapeName: "方块",
    colorId,
    colorName,
    position: [x, y + 0.5, z],
    rotation: [0, 0, 0],
    size: [1, 1, 1],
  };
}

function buildCastleBlocks() {
  const layout = [
    ...[-2, -1, 0, 1, 2].map((x) => ({ x, y: 0, colorId: 5, colorName: "橙" })),
    { x: -2, y: 1, colorId: 2, colorName: "黄" },
    { x: 0, y: 1, colorId: 2, colorName: "黄" },
    { x: 2, y: 1, colorId: 2, colorName: "黄" },
    { x: -2, y: 2, colorId: 7, colorName: "紫" },
    { x: 0, y: 2, colorId: 7, colorName: "紫" },
    { x: 2, y: 2, colorId: 7, colorName: "紫" },
    { x: 0, y: 3, colorId: 7, colorName: "紫" },
    { x: 0, y: 4, colorId: 7, colorName: "紫" },
  ];
  return layout.map((item, index) => makeBlock(index + 1, item.x, item.y, -0.5, item.colorId, item.colorName));
}

const blocks = buildCastleBlocks();

export const FEATURED_LEVEL_INDEX = {
  key: "prod:30000",
  slug: "prod-30000",
  category: "prod",
  id: 30000,
  moveCount: 20,
  difficulty: "NORMAL",
  difficultyValue: 0,
  progressionCount: 1,
  firstProgressionLevel: 30000,
  ballCount: 20,
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
    size: [5.2, 1, 1],
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
