import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'public/data');
const read = name => JSON.parse(fs.readFileSync(path.join(data, name), 'utf8'));
const profiles = new Map(read('catalog.json').profiles.map(p => [p.catalogId, p]));
const colors = { R: 4078, O: 4075, Y: 4080, G: 4074, B: 4073, U: 4077, W: 4079, K: 4072 };
const motifs = ['偏峰罐头阶台', '双窗罐头墙', '三联小亭', '双塔冠门', '彩虹山徽', '双窗彩盒楼', '相向双色旗塔', '三联叠层框架', '展翼猫头鹰', '王冠桥堡'];
const lessons = ['圆柱阶台，前后两排；比较高柱底部与低阶的击倒效果。', '方罐头双层厚墙，横梁跨过双窗，中央圆柱带承重。', '三个并排亭架，圆柱承托横梁，锥帽标记独立屋顶。', '两翼高塔与中央横梁形成门洞，顶部阶冠连接高度层。', '首次引入纯彩盒；六列阶峰由暖到冷形成色带。', '纯彩盒双窗楼，三根立柱支撑两条横梁，顶部收窄。', '保持主线相向双平台，结构随平台旋转，左右旗塔独立承重。', '单层薄框架，罐头骨架和彩盒屋顶构成三组两层门架。', '双层猫头鹰，彩盒绘制眼睛与胸腹，罐头翼尖形成材料对照。', '单层桥堡；彩盒双塔包围罐头桥墩与横梁，中央阶冠成为焦点。'];
const weakPoints = ['偏峰前排底部', '双窗之间的中央圆柱底部', '每座亭子的外侧底柱', '门洞两侧内柱', '中间高峰底部', '中间承重柱', '每台高柱底部', '每组下层门架外柱', '眼睛下方前排底柱', '中央门洞左右桥墩'];
const horizontal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
function make(id) {
  const original = read(`levels/prod-${id}.json`);
  return { levelId: id, category: 'ai', categoryName: 'AI关卡', name: `AI-${id}`, slug: `ai-${id}`,
    settings: { ...original.settings }, statistics: {}, items: [], platforms: structuredClone(original.platforms),
    obstacles: { bouncers: [], blockers: [], hammers: [] },
    design: { revision: '2026-09-09-platform-locked', referenceLevel: id, motif: motifs[id - 1], lesson: lessons[id - 1], weakPoint: weakPoints[id - 1],
      platformPolicy: '完整复制对应主线平台；位置、尺寸、旋转与运动配置均不变', intendedTargets: [], comparisonTargets: [] } };
}
// Author in platform-local coordinates. Preserve the source platform quaternion
// verbatim, while using its normalized rotation for the block transforms.
function add(l, catalogId, x, y, z = 0, pi = 1, beam = false, target = '') {
  const profile = profiles.get(catalogId);
  if (!profile) throw new Error(`Unknown catalog ${catalogId}`);
  const p = l.platforms.find(p => p.sequence === pi);
  const q = new THREE.Quaternion(p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w).normalize();
  const v = new THREE.Vector3(x, y, z).applyQuaternion(q).add(new THREE.Vector3(p.position.x, p.position.y, p.position.z));
  const r = q.clone(); if (beam) r.multiply(horizontal);
  const sequence = l.items.length + 1;
  l.items.push({ sequence, catalogId, stage: 1, platform: pi, materialId: profile.materialId, shapeId: profile.sourceShapeId,
    position: { x: v.x, y: v.y, z: v.z }, rotation: { x: r.x, y: r.y, z: r.z, w: r.w }, size: { x: profile.size[0], y: profile.size[1], z: profile.size[2] } });
  if (target) l.design[target === 'weak' ? 'intendedTargets' : 'comparisonTargets'].push(sequence);
}
function column(l, id, x, height, z = 0, pi = 1, base = 0, weak = true) {
  for (let row = 0; row < height; row++) add(l, typeof id === 'function' ? id(row) : id, x, base + row + 0.5, z, pi, false,
    row === 0 && weak ? 'weak' : row === height - 1 ? 'top' : '');
}
function build(id) {
  const l = make(id);
  if (id === 1) {
    for (const z of [-0.5, 0.5]) [1, 2, 4, 5, 2].forEach((h, c) => column(l, 4006, c - 2, h, z));
  } else if (id === 2) {
    for (const z of [-0.5, 0.5]) {
      for (let x = -3; x <= 3; x++) column(l, x === 0 ? 4006 : 4001, x, Math.abs(x) === 2 ? 1 : 4, z);
      for (const x of [-2, 2]) add(l, 4003, x, 4.5, z, 1, true);
      add(l, 4006, 0, 4.5, z);
      for (let x = -3; x <= 3; x++) column(l, x === 0 ? 4006 : 4001, x, x === 0 ? 3 : 2, z, 1, 5, false);
    }
  } else if (id === 3) {
    for (const z of [-0.5, 0.5]) for (const center of [-3, 0, 3]) {
      for (const dx of [-1, 1]) column(l, 4006, center + dx, 2, z);
      add(l, 4003, center, 2.5, z, 1, true);
      for (const dx of [-1, 0, 1]) add(l, 4001, center + dx, 3.5, z, 1, false, 'top');
      add(l, 4011, center, 4.5, z);
    }
  } else if (id === 4) {
    for (const z of [-0.5, 0.5]) {
      for (const x of [-4, -3, 3, 4]) column(l, 4001, x, 6, z);
      for (const x of [-3.5, 3.5]) add(l, 4011, x, 6.5, z, 1, false, 'top');
      for (const x of [-2, 2]) column(l, 4006, x, 3, z);
      add(l, 4005, 0, 3.5, z, 1, true);
      for (let x = -2; x <= 2; x++) add(l, 4001, x, 4.5, z);
      for (const x of [-1, 0, 1]) add(l, 4001, x, 5.5, z, 1, false, 'top');
      add(l, 4011, 0, 6.5, z);
    }
  } else if (id === 5) {
    const bands = ['R', 'R', 'O', 'Y', 'G', 'B', 'U', 'W'];
    [4, 5, 7, 8, 7, 5].forEach((h, c) => column(l, row => colors[bands[row]], c - 2.5, h));
  } else if (id === 6) {
    for (const z of [-0.5, 0.5]) {
      for (const x of [-3, 0, 3]) column(l, x === 0 ? colors.Y : colors.B, x, 4, z);
      for (const x of [-1.5, 1.5]) add(l, 4092, x, 4.5, z, 1, true);
      for (const x of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) add(l, colors.G, x, 5.5, z);
      for (const x of [-1.5, -0.5, 0.5, 1.5]) add(l, colors.Y, x, 6.5, z, 1, false, 'top');
      for (const x of [-0.5, 0.5]) add(l, colors.O, x, 7.5, z);
    }
  } else if (id === 7) {
    for (const pi of [1, 2]) (pi === 1 ? [6, 7, 8, 6] : [5, 7, 8, 6]).forEach((h, c) => {
      column(l, row => row === h - 1 ? colors.Y : (c === 1 || c === 2) && row >= 3 ? colors.W : pi === 1 ? colors.B : colors.R, c - 1.5, h, 0, pi);
    });
  } else if (id === 8) {
    for (const center of [-3, 0, 3]) {
      for (let tier = 0; tier < 2; tier++) {
        for (const dx of [-1, 1]) column(l, 4001, center + dx, 2, 0, 1, tier === 0 ? 0 : 3);
        add(l, 4003, center, tier === 0 ? 2.5 : 5.5, 0, 1, true);
      }
      for (const dx of [-1, 0, 1]) column(l, center === 0 ? colors.Y : colors.B, center + dx, 2, 0, 1, 6, false);
    }
  } else if (id === 9) {
    for (const z of [-0.5, 0.5]) [5, 4, 4, 5, 5, 5, 4, 4, 5].forEach((h, c) => {
      const x = c - 4;
      column(l, row => {
        if (Math.abs(x) === 4 && row === 4) return 4006;
        if (row === 3 && Math.abs(x) === 2) return colors.K;
        if (row >= 2 && Math.abs(x) >= 1 && Math.abs(x) <= 3) return colors.W;
        if (x === 0 && row === 2) return colors.O;
        return row < 2 ? colors.U : colors.Y;
      }, x, h, z);
    });
  } else if (id === 10) {
    for (const x of [-3.5, -2.5, 2.5, 3.5]) column(l, row => row < 2 ? colors.B : row === 6 ? colors.Y : colors.R, x, 7);
    for (const x of [-3.5, -2.5, 2.5, 3.5]) add(l, 4011, x, 7.5, 0, 1, false, 'top');
    for (const x of [-1.5, 1.5]) column(l, 4006, x, 3);
    add(l, 4004, 0, 3.5, 0, 1, true);
    for (const x of [-1.5, -0.5, 0.5, 1.5]) column(l, row => row === 1 ? colors.W : colors.Y, x, 3, 0, 1, 4, false);
    for (const x of [-0.5, 0.5]) add(l, colors.Y, x, 7.5);
    add(l, 4011, 0, 8.5);
  }
  l.design.intendedTargets = [];
  l.design.comparisonTargets = [];
  for (const p of l.platforms) {
    const group = l.items.filter(i => i.platform === p.sequence);
    const maxY = Math.max(...group.map(i => i.position.y));
    const minY = Math.min(...group.map(i => i.position.y));
    l.design.intendedTargets.push(...group.filter(i => Math.abs(i.position.y - maxY) < 0.01).map(i => i.sequence));
    l.design.comparisonTargets.push(...group.filter(i => Math.abs(i.position.y - minY) < 0.01).map(i => i.sequence));
  }
  if (id === 9) l.design.intendedTargets = l.items.filter(i => i.catalogId === 4006).map(i => i.sequence);
  l.design.weakPoint = '先击露出的顶部单位块卸载，再逐层处理承重；对照击打满载底柱。';
  l.statistics = { entityCount: l.items.length + l.platforms.length, entityTypeCount: 2, platformCount: l.platforms.length,
    itemCount: l.items.length, destructibleItemCount: l.items.length, specialObstacleCount: 0, customEntityCount: l.platforms.length };
  return l;
}
const index = read('index.json');
for (let id = 1; id <= 10; id++) {
  const l = build(id);
  fs.writeFileSync(path.join(data, `levels/ai-${id}.json`), JSON.stringify(l, null, 2) + '\n');
  const entries = index.levels.filter(e => e.category === 'ai' && e.id === id);
  if (entries.length !== 1) throw new Error(`AI-${id}: expected exactly one index record`);
  Object.assign(entries[0], { moveCount: l.settings.moveCount, difficulty: 'NORMAL', difficultyValue: 0,
    counts: { platforms: l.platforms.length, blocks: l.items.length, obstacles: 0, bouncers: 0, blockers: 0, hammers: 0, stages: 1 } });
  console.log(`AI-${id}: ${l.design.motif}; ${l.items.length} items; source platforms preserved`);
}
fs.writeFileSync(path.join(data, 'index.json'), JSON.stringify(index, null, 2) + '\n');
