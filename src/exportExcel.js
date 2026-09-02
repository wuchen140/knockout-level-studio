import { Euler, MathUtils, Quaternion } from "three";
import JSZip from "jszip";
import { utils, writeFile } from "xlsx";

function quaternion(rotation) {
  const euler = new Euler(...rotation.map(MathUtils.degToRad), "XYZ");
  const value = new Quaternion().setFromEuler(euler);
  return [value.x, value.y, value.z, value.w];
}

function rowsForLevel(level) {
  const objects = level.objects || [];
  const platforms = objects.filter((item) => item.type === "platform");
  const blocks = objects.filter((item) => item.type === "block");
  const config = {
    关卡分类: level.category, 关卡ID: level.id, 移动次数: level.moveCount,
    难度值: level.difficultyValue, 难度名称: level.difficulty,
    进度引用次数: level.progressionCount, 首次出现进度关卡: level.firstProgressionLevel,
    球数: level.ballCount, 平台数: platforms.length, 基础方块数: blocks.length,
    障碍数: level.counts?.barriers || 0, 阶段数: level.counts?.stages || 0,
    闸门数: level.counts?.shutters || 0, 生成波次数: level.counts?.waves || 0,
    生成方块数: level.counts?.generatedBlocks || 0, 闸门方块数: level.counts?.shutterBlocks || 0,
  };
  const platformRows = platforms.map((item, index) => {
    const q = quaternion(item.rotation);
    return {
      关卡分类: level.category, 关卡ID: level.id, 所在区域: item.area,
      物品路径: item.path || `platforms/${index + 1}`, 阶段序号: item.stageIndex,
      平台序号: item.platformIndex || index + 1, 位置X: item.position[0], 位置Y: item.position[1], 位置Z: item.position[2],
      旋转X: q[0], 旋转Y: q[1], 旋转Z: q[2], 旋转W: q[3], 尺寸X: item.size[0], 尺寸Y: item.size[1], 尺寸Z: item.size[2],
      是否旋转: Boolean(item.motion?.rotating), 旋转速度: item.motion?.rotationSpeed || 0,
      是否水平移动: Boolean(item.motion?.horizontal), 水平最小位置: item.motion?.horizontalMin || 0,
      水平最大位置: item.motion?.horizontalMax || 0, 水平方向值: item.motion?.horizontalDirection === "Negative" ? 1 : 0,
      水平方向原名: item.motion?.horizontalDirection || "Positive", 水平速度: item.motion?.horizontalSpeed || 0,
      是否垂直移动: Boolean(item.motion?.vertical), 垂直最小位置: item.motion?.verticalMin || 0,
      垂直最大位置: item.motion?.verticalMax || 0, 垂直方向值: item.motion?.verticalDirection === "Negative" ? 1 : 0,
      垂直方向原名: item.motion?.verticalDirection || "Positive", 垂直速度: item.motion?.verticalSpeed || 0, 生成波次数: 0,
    };
  });
  const blockRows = blocks.map((item, index) => {
    const q = quaternion(item.rotation);
    return {
      关卡分类: level.category, 关卡ID: level.id, 所在区域: item.area,
      阶段序号: item.stageIndex, 平台序号: item.platformIndex, 生成波次序号: item.waveIndex,
      闸门序号: item.shutterIndex, 方块序号: item.blockIndex || index + 1,
      材质值: item.materialId, 形状值: item.shapeId, 颜色值: item.colorId, 颜色原名: item.colorName,
      位置X: item.position[0], 位置Y: item.position[1], 位置Z: item.position[2],
      旋转X: q[0], 旋转Y: q[1], 旋转Z: q[2], 旋转W: q[3], 尺寸X: item.size[0], 尺寸Y: item.size[1], 尺寸Z: item.size[2],
    };
  });
  return { config, platformRows, blockRows };
}

export function exportLevelsExcel(levels) {
  const list = (Array.isArray(levels) ? levels : [levels]).filter(Boolean);
  if (!list.length) return;
  const rows = list.map(rowsForLevel);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.json_to_sheet(rows.map((item) => item.config)), "关卡配置");
  utils.book_append_sheet(workbook, utils.json_to_sheet(rows.flatMap((item) => item.platformRows)), "关卡平台明细");
  utils.book_append_sheet(workbook, utils.json_to_sheet(rows.flatMap((item) => item.blockRows)), "关卡方块明细");
  const first = list[0];
  const suffix = list.length === 1 ? `${first.category}_${first.id}` : `批量_${list.length}关`;
  writeFile(workbook, `${suffix}_关卡配置.xlsx`);
}

export function exportLevelExcel(level) {
  exportLevelsExcel([level]);
}

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function vectorObject(value, fallback = 0) {
  return { x: number(value?.[0] ?? value?.x, fallback), y: number(value?.[1] ?? value?.y, fallback), z: number(value?.[2] ?? value?.z, fallback) };
}

function quaternionFromEuler(rotation = [0, 0, 0]) {
  const euler = new Euler(
    number(rotation?.[0] ?? rotation?.x) * MathUtils.DEG2RAD,
    number(rotation?.[1] ?? rotation?.y) * MathUtils.DEG2RAD,
    number(rotation?.[2] ?? rotation?.z) * MathUtils.DEG2RAD,
    "XYZ",
  );
  const value = new Quaternion().setFromEuler(euler).normalize();
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function sourceShapeId(item) {
  if (item.sourceShapeId !== undefined && item.sourceShapeId !== null) return number(item.sourceShapeId, 1);
  return number(item.shapeId, 0) + 1;
}

function sourceSize(item) {
  const current = [number(item.size?.[0] ?? item.size?.x, 1), number(item.size?.[1] ?? item.size?.y, 1), number(item.size?.[2] ?? item.size?.z, 1)];
  const model = item.modelSize || current;
  const source = item.sourceSize || current;
  return {
    x: number(source[0], 1) * number(model[0], 1) / Math.max(number(model[0], 1), 0.0001),
    y: number(source[1], 1) * number(current[1], 1) / Math.max(number(model[1], 1), 0.0001),
    z: number(source[2], 1) * number(current[2], 1) / Math.max(number(model[2], 1), 0.0001),
  };
}

function movementForEditor(motion) {
  if (!motion) return null;
  if (motion.vertical) return {
    axis: "Y", min: number(motion.verticalMin), max: number(motion.verticalMax), initialDirection: motion.verticalDirection === "Negative" ? -1 : 1,
    speed: number(motion.verticalSpeed), easeTime: number(motion.easeTime), startupDelay: number(motion.startupDelay),
  };
  if (motion.horizontal) return {
    axis: motion.horizontalAxis === "Z" ? "Z" : "X", min: number(motion.horizontalMin), max: number(motion.horizontalMax), initialDirection: motion.horizontalDirection === "Negative" ? -1 : 1,
    speed: number(motion.horizontalSpeed), easeTime: number(motion.easeTime), startupDelay: number(motion.startupDelay),
  };
  return null;
}

function rotationMotionForEditor(motion) {
  if (!motion?.rotating) return null;
  return { axis: vectorObject(motion.rotationAxis), speed: number(motion.rotationSpeed) };
}

function omitEmpty(value) {
  if (Array.isArray(value)) return value.map(omitEmpty);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, omitEmpty(item)]));
}

export function formatLevelJson(level) {
  const objects = (level.objects || []).filter((item) => item.type !== "cannon" && item.type !== "attackBall");
  const platformObjects = objects.filter((item) => item.type === "platform");
  const blockObjects = objects.filter((item) => item.type === "block");
  const obstacleObjects = objects.filter((item) => ["bouncer", "blocker", "hammer"].includes(item.type));
  const obstacles = { bouncers: [], blockers: [], hammers: [] };
  for (const item of obstacleObjects) {
    const key = `${item.type}s`;
    obstacles[key].push(omitEmpty({
      sequence: obstacles[key].length + 1,
      id: item.sourceId,
      position: vectorObject(item.position),
      rotation: quaternionFromEuler(item.rotation),
      parameters: item.parameters || {},
    }));
  }
  return omitEmpty({
    levelId: level.id,
    category: level.category,
    categoryName: level.categoryName,
    settings: {
      version: number(level.settings?.version, 1),
      moveCount: number(level.moveCount ?? level.settings?.moveCount),
      difficulty: number(level.difficultyValue ?? level.settings?.difficulty),
      backgroundIndex: number(level.settings?.backgroundIndex, -1),
      stabilizeOnSpawn: Boolean(level.settings?.stabilizeOnSpawn),
      physicsQuality: number(level.settings?.physicsQuality),
    },
    statistics: {
      entityCount: objects.length,
      entityTypeCount: new Set(objects.map((item) => item.type)).size,
      platformCount: platformObjects.length,
      itemCount: blockObjects.length,
      destructibleItemCount: blockObjects.length,
      specialObstacleCount: obstacleObjects.length,
      customEntityCount: platformObjects.length,
    },
    items: blockObjects.map((item, index) => omitEmpty({
      sequence: index + 1,
      catalogId: item.catalogId,
      stage: item.stageIndex ?? 1,
      platform: item.platformIndex ?? 1,
      materialId: item.materialId,
      shapeId: sourceShapeId(item),
      position: vectorObject(item.position),
      rotation: quaternionFromEuler(item.rotation),
      size: sourceSize(item),
    })),
    platforms: platformObjects.map((item, index) => omitEmpty({
      sequence: item.platformIndex ?? index + 1,
      id: item.sourceId || (item.platformShape === "circle" ? "Table_Circle" : "Table_Rect"),
      shape: item.platformShape || "rect",
      position: vectorObject(item.position),
      rotation: quaternionFromEuler(item.rotation),
      size: { width: number(item.size?.[0], 1), depth: number(item.size?.[2], 1) },
      movement: movementForEditor(item.motion),
      rotationMotion: rotationMotionForEditor(item.motion),
    })),
    obstacles,
  });
}

export function exportLevelJson(level) {
  const blob = new Blob([JSON.stringify(formatLevelJson(level), null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${level.category}_${level.id}_关卡.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportLevelsJson(levels) {
  const list = (Array.isArray(levels) ? levels : [levels]).filter(Boolean);
  if (!list.length) return;
  if (list.length === 1) {
    exportLevelJson(list[0]);
    return;
  }
  const zip = new JSZip();
  for (const level of list) {
    const category = level.category || "custom";
    const id = level.id ?? "unknown";
    zip.file(`${category}/level-${id}.json`, JSON.stringify(formatLevelJson(level), null, 2));
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `KnockOut_批量关卡_${list.length}关.zip`;
  link.click();
  URL.revokeObjectURL(url);
}
