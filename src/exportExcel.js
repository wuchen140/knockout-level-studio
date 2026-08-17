import { Euler, MathUtils, Quaternion } from "three";
import { utils, writeFile } from "xlsx";

function quaternion(rotation) {
  const euler = new Euler(...rotation.map(MathUtils.degToRad), "XYZ");
  const value = new Quaternion().setFromEuler(euler);
  return [value.x, value.y, value.z, value.w];
}

export function exportLevelExcel(level) {
  const objects = level.objects || [];
  const platforms = objects.filter((item) => item.type === "platform");
  const blocks = objects.filter((item) => item.type === "block");
  const config = [{
    关卡分类: level.category,
    关卡ID: level.id,
    移动次数: level.moveCount,
    难度值: level.difficultyValue,
    难度名称: level.difficulty,
    进度引用次数: level.progressionCount,
    首次出现进度关卡: level.firstProgressionLevel,
    球数: level.ballCount,
    平台数: platforms.length,
    基础方块数: blocks.length,
    障碍数: level.counts?.barriers || 0,
    阶段数: level.counts?.stages || 0,
    闸门数: level.counts?.shutters || 0,
    生成波次数: level.counts?.waves || 0,
    生成方块数: level.counts?.generatedBlocks || 0,
    闸门方块数: level.counts?.shutterBlocks || 0,
  }];
  const platformRows = platforms.map((item, index) => {
    const q = quaternion(item.rotation);
    return {
      关卡分类: level.category, 关卡ID: level.id, 所在区域: item.area,
      物品路径: item.path || `platforms/${index + 1}`, 阶段序号: item.stageIndex,
      平台序号: item.platformIndex || index + 1, 位置X: item.position[0], 位置Y: item.position[1], 位置Z: item.position[2],
      旋转X: q[0], 旋转Y: q[1], 旋转Z: q[2], 旋转W: q[3],
      尺寸X: item.size[0], 尺寸Y: item.size[1], 尺寸Z: item.size[2],
      是否旋转: Boolean(item.motion?.rotating), 旋转速度: item.motion?.rotationSpeed || 0,
      是否水平移动: Boolean(item.motion?.horizontal), 水平最小位置: item.motion?.horizontalMin || 0,
      水平最大位置: item.motion?.horizontalMax || 0, 水平方向值: item.motion?.horizontalDirection === "Negative" ? 1 : 0,
      水平方向原名: item.motion?.horizontalDirection || "Positive", 水平速度: item.motion?.horizontalSpeed || 0,
      是否垂直移动: Boolean(item.motion?.vertical), 垂直最小位置: item.motion?.verticalMin || 0,
      垂直最大位置: item.motion?.verticalMax || 0, 垂直方向值: item.motion?.verticalDirection === "Negative" ? 1 : 0,
      垂直方向原名: item.motion?.verticalDirection || "Positive", 垂直速度: item.motion?.verticalSpeed || 0,
      生成波次数: 0,
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
      旋转X: q[0], 旋转Y: q[1], 旋转Z: q[2], 旋转W: q[3],
      尺寸X: item.size[0], 尺寸Y: item.size[1], 尺寸Z: item.size[2],
    };
  });

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.json_to_sheet(config), "关卡配置");
  utils.book_append_sheet(workbook, utils.json_to_sheet(platformRows), "关卡平台明细");
  utils.book_append_sheet(workbook, utils.json_to_sheet(blockRows), "关卡方块明细");
  writeFile(workbook, `${level.category}_${level.id}_关卡配置.xlsx`);
}

function pick(source, fields) {
  return Object.fromEntries(fields.filter((field) => source?.[field] !== undefined).map((field) => [field, source[field]]));
}

function omitNulls(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined).map(omitNulls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== null && item !== undefined)
      .map(([key, item]) => [key, omitNulls(item)]),
  );
}

export function formatLevelJson(level) {
  const root = pick(level, [
    "id", "moveCount", "difficultyValue", "progressionCount", "firstProgressionLevel", "counts",
  ]);
  root.objects = (level.objects || [])
    .filter((item) => item.type !== "cannon" && item.type !== "attackBall")
    .map((item) => item.type === "platform"
    ? pick(item, ["type", "name", "area", "stageIndex", "platformIndex", "position", "rotation", "size", "motion"])
    : pick(item, [
      "type", "name", "area", "stageIndex", "platformIndex", "waveIndex", "shutterIndex", "blockIndex",
      "materialId", "shapeId", "colorId", "position", "rotation", "size",
    ]));
  return omitNulls(root);
}

export function exportLevelJson(level) {
  const blob = new Blob([JSON.stringify(formatLevelJson(level), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${level.category}_${level.id}_关卡.json`;
  link.click();
  URL.revokeObjectURL(url);
}
