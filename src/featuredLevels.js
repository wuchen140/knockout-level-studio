const stageMeta = { area: "根关卡", stageIndex: null };

function makeBlock(index, x, y, z, colorId, colorName) {
  return {
    uid: `block-custom-1001-${index}`,
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
  const blocks = [];
  let index = 0;
  const addColumn = (x, z, height, roofStart, detailRows = []) => {
    for (let y = 0; y < height; y += 1) {
      const detail = detailRows.includes(y);
      const colorId = detail ? 1 : y === 0 || y === roofStart - 1 ? 5 : y >= roofStart ? 7 : 2;
      const colorName = detail ? "红" : colorId === 5 ? "橙" : colorId === 7 ? "紫" : "黄";
      blocks.push(makeBlock(++index, x, y, z, colorId, colorName));
    }
  };

  // Two blocks of depth make the back view and right-side view readable. Every
  // column starts on the platform, so there are no unsupported roof pieces.
  for (const z of [-1, 0]) {
    addColumn(-4, z, 1, 1);
    addColumn(-3, z, 6, 4, z === 0 ? [2] : []);
    addColumn(-2, z, 5, 4);
    addColumn(-1, z, 7, 4);
    addColumn(0, z, 9, 4, z === 0 ? [1, 2] : []);
    addColumn(1, z, 7, 4);
    addColumn(2, z, 5, 4);
    addColumn(3, z, 6, 4, z === 0 ? [2] : []);
    addColumn(4, z, 1, 1);
  }
  return blocks;
}

const blocks = buildCastleBlocks();

export const FEATURED_LEVEL_INDEX = {
  key: "custom:1001",
  slug: "custom-1001",
  category: "custom",
  id: 1001,
  moveCount: 20,
  difficulty: "NORMAL",
  difficultyValue: 0,
  progressionCount: 1,
  firstProgressionLevel: 1001,
  ballCount: 20,
  counts: { platforms: 1, blocks: blocks.length, barriers: 0, stages: 0, shutters: 0, waves: 0, generatedBlocks: 0, shutterBlocks: 0 },
};

export const FEATURED_LEVEL = {
  ...FEATURED_LEVEL_INDEX,
  schemaVersion: 1,
  source: { levels: "新建关卡", game: "游戏配置.xlsx" },
  objects: [{
    uid: "platform-custom-1001-1",
    type: "platform",
    name: "城堡平台",
    ...stageMeta,
    path: "platforms/1",
    platformIndex: 1,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    size: [10, 1, 4],
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
