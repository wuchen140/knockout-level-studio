import * as THREE from "three";

const SHAPE_IDS = { 1: 0, 2: 1, 3: 2, 4: 1 };
const SHAPE_NAMES = { 0: "方块", 1: "圆柱", 2: "圆锥" };
const DIFFICULTIES = ["NORMAL", "HARD", "SUPER_HARD"];
const CATEGORY_NAMES = { mainline: "主线关卡", loop: "循环关卡", ai: "AI关卡" };
const SLUG_PREFIXES = { mainline: "prod", loop: "loop", ai: "ai" };

function vector(value, fallback = 0) {
  return [Number(value?.x ?? fallback), Number(value?.y ?? fallback), Number(value?.z ?? fallback)];
}

function eulerDegrees(value) {
  const quaternion = new THREE.Quaternion(
    Number(value?.x) || 0,
    Number(value?.y) || 0,
    Number(value?.z) || 0,
    Number(value?.w ?? 1),
  ).normalize();
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  return [euler.x, euler.y, euler.z].map((angle) => Number(THREE.MathUtils.radToDeg(angle).toFixed(4)));
}

function platformMotion(platform) {
  const movement = platform.movement;
  const axis = movement?.axis;
  return {
    rotating: Boolean(platform.rotationMotion),
    rotationSpeed: Number(platform.rotationMotion?.speed) || 0,
    rotationAxis: vector(platform.rotationMotion?.axis),
    horizontal: axis === "X" || axis === "Z",
    horizontalAxis: axis || "X",
    horizontalMin: Number(movement?.min) || 0,
    horizontalMax: Number(movement?.max) || 0,
    horizontalDirection: Number(movement?.initialDirection) < 0 ? "Negative" : "Positive",
    horizontalSpeed: Number(movement?.speed) || 0,
    vertical: axis === "Y",
    verticalMin: Number(movement?.min) || 0,
    verticalMax: Number(movement?.max) || 0,
    verticalDirection: Number(movement?.initialDirection) < 0 ? "Negative" : "Positive",
    verticalSpeed: Number(movement?.speed) || 0,
    easeTime: Number(movement?.easeTime) || 0,
    startupDelay: Number(movement?.startupDelay) || 0,
  };
}

function obstacleSize(type, obstacle) {
  if (type === "bouncer") {
    const variant = Number(obstacle.id?.match(/(\d+)$/)?.[1]) || 1;
    return [0.65 + variant * 0.18, 0.45, 0.65 + variant * 0.18];
  }
  if (type === "blocker") return [Math.max(1, Number(obstacle.parameters?.bladeScale) || 1.5) * 2, 0.3, 0.42];
  return [1.1, Math.max(1.5, Number(obstacle.parameters?.rodLength) || 2), 0.7];
}

export function normalizeRoyalSmashLevel(data, catalog) {
  if (Array.isArray(data?.objects)) return data;
  if (!Array.isArray(data?.items) || !Array.isArray(data?.platforms)) throw new Error("invalid level data");

  const profiles = new Map((catalog?.profiles || []).map((profile) => [profile.catalogId ?? profile.id, profile]));
  const categoryName = data.categoryName || CATEGORY_NAMES[data.category] || data.category;
  const objects = [];

  for (const platform of data.platforms) {
    objects.push({
      uid: `platform-${data.category}-${data.levelId}-${platform.sequence}`,
      type: "platform",
      name: `平台 ${platform.sequence}`,
      dataFamily: "royal-smash",
      sourceId: platform.id,
      platformShape: platform.shape,
      area: "根关卡",
      path: `platforms/${platform.sequence}`,
      stageIndex: null,
      platformIndex: platform.sequence,
      position: vector(platform.position),
      rotation: eulerDegrees(platform.rotation),
      size: [Number(platform.size?.width) || 1, 0.5, Number(platform.size?.depth) || 1],
      motion: platformMotion(platform),
    });
  }

  for (const item of data.items) {
    const profile = profiles.get(item.catalogId);
    const shapeId = SHAPE_IDS[item.shapeId] ?? 0;
    objects.push({
      uid: `block-${data.category}-${data.levelId}-${item.sequence}`,
      type: "block",
      name: `物品 ${item.sequence} · 图鉴 ${item.catalogId}`,
      dataFamily: "royal-smash",
      catalogId: item.catalogId,
      area: "根关卡",
      stageIndex: item.stage,
      platformIndex: item.platform,
      waveIndex: null,
      shutterIndex: null,
      blockIndex: item.sequence,
      materialId: item.materialId,
      materialName: profile?.material || `材质 ${item.materialId}`,
      sourceShapeId: item.shapeId,
      shapeId,
      shapeName: profile?.shape || SHAPE_NAMES[shapeId],
      colorId: profile?.colorId ?? 0,
      colorName: profile?.colorName === "-1" ? "材质原色" : profile?.colorName || "材质原色",
      modelPath: profile?.modelPath || null,
      modelSize: profile?.modelSize || vector(item.size, 1),
      sourceSize: vector(item.size, 1),
      position: vector(item.position),
      rotation: eulerDegrees(item.rotation),
      size: profile?.modelSize || vector(item.size, 1),
    });
  }

  const obstacleNames = { bouncer: "弹力柱", blocker: "旋转挡板", hammer: "摆锤" };
  for (const [sourceType, list] of Object.entries(data.obstacles || {})) {
    const type = sourceType.replace(/s$/, "");
    for (const obstacle of list) {
      objects.push({
        uid: `${type}-${data.category}-${data.levelId}-${obstacle.sequence}`,
        type,
        name: `${obstacleNames[type] || "障碍物"} ${obstacle.sequence}`,
        dataFamily: "royal-smash",
        sourceId: obstacle.id,
        area: "根关卡",
        position: vector(obstacle.position),
        rotation: eulerDegrees(obstacle.rotation),
        size: obstacleSize(type, obstacle),
        parameters: structuredClone(obstacle.parameters || {}),
      });
    }
  }

  const difficultyValue = Number(data.settings?.difficulty) || 0;
  const obstacleCount = objects.filter((item) => !["block", "platform"].includes(item.type)).length;
  return {
    schemaVersion: 2,
    dataFamily: "royal-smash",
    source: { format: "Royal Smash 标准关卡 JSON", categoryName: data.categoryName },
    key: `${data.category}:${data.levelId}`,
    slug: data.slug || `${SLUG_PREFIXES[data.category] || data.category}-${data.levelId}`,
    category: data.category,
    categoryName,
    name: data.name || (data.category === "ai" ? `AI-${data.levelId}` : `关卡 ${data.levelId}`),
    id: data.levelId,
    moveCount: Number(data.settings?.moveCount) || 0,
    difficulty: DIFFICULTIES[difficultyValue] || "NORMAL",
    difficultyValue,
    settings: structuredClone(data.settings || {}),
    statistics: structuredClone(data.statistics || {}),
    counts: {
      platforms: data.platforms.length,
      blocks: data.items.length,
      obstacles: obstacleCount,
      bouncers: data.obstacles?.bouncers?.length || 0,
      blockers: data.obstacles?.blockers?.length || 0,
      hammers: data.obstacles?.hammers?.length || 0,
      stages: new Set(data.items.map((item) => item.stage)).size,
    },
    objects,
  };
}
