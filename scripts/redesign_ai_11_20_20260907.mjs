import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'public/data');
const catalog = JSON.parse(fs.readFileSync(path.join(data, 'catalog.json')));
const profiles = new Map(catalog.profiles.map(p => [p.catalogId, p]));
const identity = { x: 0, y: 0, z: 0, w: 1 };
const horizontal = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
const J = [4016, 4013, 4017, 4012, 4015, 4014];
const zPair = [-2.52, -1.48];
function table(sequence, x, width, depth = 2.3) {
  return { sequence, id: 'Table_Rect', shape: 'rect', position: { x, y: 2, z: -2 }, rotation: { ...identity }, size: { width, depth }, movement: null, rotationMotion: null };
}
function level(id, moves, motif, lesson, weakPoint, platforms = [table(1, 0, 7.4)]) {
  return { levelId: id, category: 'ai', categoryName: 'AI关卡', name: `AI-${id}`, slug: `ai-${id}`,
    settings: { version: 1, moveCount: moves, difficulty: id === 20 ? 1 : 0, backgroundIndex: -1, stabilizeOnSpawn: false, physicsQuality: 0 },
    design: { revision: '2026-09-07', referenceLevel: id, motif, lesson, weakPoint, approach: '依据原始主线材料、几何与物理数据独立搭建', intendedTargets: [], comparisonTargets: [] },
    statistics: {}, items: [], platforms, obstacles: { bouncers: [], blockers: [], hammers: [] } };
}
function add(l, id, x, y, z, platform = 1, beam = false, target = '') {
  const p = profiles.get(id);
  if (!p) throw new Error(`Unknown profile ${id}`);
  const sequence = l.items.length + 1;
  l.items.push({ sequence, catalogId: id, stage: 1, platform, materialId: p.materialId, shapeId: p.sourceShapeId,
    position: { x, y, z }, rotation: { ...(beam ? horizontal : identity) }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } });
  if (target === 'weak') l.design.intendedTargets.push(sequence);
  if (target === 'top') l.design.comparisonTargets.push(sequence);
}
function stack(l, id, x, z, n, base = 2, pi = 1, weak = true) {
  for (let k = 0; k < n; k++) add(l, id, x, base + k + 0.5, z, pi, false, k === 0 && weak ? 'weak' : k === n - 1 ? 'top' : '');
}
function build(id) {
  if (id === 11) {
    const l = level(id, 23, '六色果酱扇', '纯果酱；从齐平下缘观察击底后的整列倾倒。', '前排低层果酱，横向选择连续列。', [table(1, 0, 6.5)]);
    [3,4,5,5,4,3].forEach((h, col) => zPair.forEach(z => stack(l, J[col], (col - 2.5) * 1.04, z, h)));
    return l;
  }
  if (id === 12) {
    const l = level(id, 25, '果酱双峰', '继续纯果酱；单层薄结构、两处高峰，比较高低柱的连带收益。', '两座高峰脚下；中央矮柱只清掉局部。', [table(1, 0, 7.5, 1.3)]);
    [2,4,6,3,6,4,2].forEach((h, col) => stack(l, col < 3 ? 4016 : col > 3 ? 4017 : 4013, (col - 3) * 1.04, -2, h));
    return l;
  }
  if (id === 13) {
    const l = level(id, 22, '桥上果酱灯塔', '果酱与罐头组合；真实长梁承载上部塔群，前后两排留出倾倒空间。', '罐头桥梁下的四对果酱支点。', [table(1, 0, 6.6, 3)]);
    for (const z of [-2.9,-1.1]) {
      for (const x of [-2.5,-0.5,0.5,2.5]) add(l, 4013, x, 2.5, z, 1, false, 'weak');
      for (const x of [-1.5,1.5]) add(l, 4003, x, 3.5, z, 1, true);
      [2,3,4,4,3,2].forEach((h, col) => stack(l, col < 3 ? 4012 : 4015, col - 2.5, z, h, 4, 1, false));
    }
    return l;
  }
  if (id === 14) {
    const l = level(id, 23, '双台彩帆', '两组独立目标；罐头底座、果酱主体、彩盒帆尖各司其职。', '每张帆的高柱底部；需要分别处理左右平台。', [table(1, -2.1, 3.6),table(2, 2.1, 3.6)]);
    for (let pi = 1; pi <= 2; pi++) for (const z of zPair) for (let c = 0; c < 3; c++) {
      const x = (pi === 1 ? -2.1 : 2.1) + (c - 1) * 1.04;
      const h = (pi === 1 ? [4,3,1] : [1,3,4])[c];
      add(l, 4001, x, 2.5, z, pi, false, h === 4 ? 'weak' : '');
      stack(l, pi === 1 ? 4012 : 4014, x, z, h, 3, pi, false);
      add(l, pi === 1 ? 4080 : 4079, x, 3.5 + h, z, pi, false, 'top');
    }
    return l;
  }
  if (id === 15) {
    const l = level(id, 25, '果酱推进火箭', '单台像素造型；彩盒构成机身，果酱位于推进器和机身连接带。', '先打机身中部橙色连接带两侧，卸掉上部机舱，再处理底座和外侧支脚。', [table(1, 0, 7.5)]);
    const rows = ['B.JJJ.B','B.JJJ.B','BBJJJBB','.BBBBB.','.JJJJJ.','..BRB..','..BWB..','..YYY..','...Y...'];
    const ids = { B: 4073, J: 4013, R: 4078, W: 4079, Y: 4080 };
    for (const z of zPair) {
      rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (y !== 2 && ch !== '.') add(l, ids[ch], x - 3, 2.5 + y, z, 1, false, y === 0 && ch === 'J' ? 'weak' : y === 8 ? 'top' : '');
      }));
      for (const x of [-2,2]) add(l, 4091, x, 4.5, z, 1, true);
      add(l, 4013, 0, 4.5, z);
    }
    return l;
  }
  if (id === 16) {
    const l = level(id, 26, '纸箱登阶', '纯纸箱新材料教学；单层六级台阶，保持低物品量和清晰接触关系。', '高台阶底部；对照低阶可感知纸箱较重。', [table(1, 0, 6.7, 1.4)]);
    for (let col = 0; col < 6; col++) stack(l, 4040, (col - 2.5) * 1.04, -2, col + 1);
    return l;
  }
  if (id === 17) {
    const l = level(id, 25, '双拱纸箱货廊', '纸箱柱梁与罐头尖顶；重载底柱不易直接推动，需要先卸上层货物。', '先打屋顶台阶中的单格纸箱，连带罐头顶帽，再处理横梁与底柱。', [table(1, 0, 7.7)]);
    for (const z of zPair) {
      for (const x of [-3,-1,1,3]) add(l, 4041, x, 3, z, 1, false, 'weak');
      for (const x of [-2,2]) add(l, 4042, x, 4.5, z, 1, true);
      for (const center of [-2,2]) {
        for (const dx of [-1,0,1]) add(l, 4040, center + dx, 5.5, z);
        add(l, 4040, center, 6.5, z);
        for (const dx of [-1,1]) add(l, 4011, center + dx, 6.5, z, 1, false, 'top');
        add(l, 4011, center, 7.5, z, 1, false, 'top');
      }
    }
    return l;
  }
  if (id === 18) {
    const l = level(id, 25, '双台像素旗', '窄支柱承托宽旗面；分别卸掉两面旗帜的上层重量，再清理纸箱底座。', '从旗面上缘外角切入；满载时直接打纸箱底柱收益低。', [table(1, -2.3, 3.8),table(2, 2.3, 3.8)]);
    for (let pi = 1; pi <= 2; pi++) for (const z of zPair) {
      const cx = pi === 1 ? -2.3 : 2.3;
      add(l, 4041, cx, 3, z, pi, false, 'weak');
      add(l, 4042, cx, 4.5, z, pi, true);
      for (let row = 0; row < 3; row++) for (const dx of [-1,0,1]) add(l, row === 1 ? 4079 : pi === 1 ? 4074 : 4078, cx + dx, 5.5 + row, z, pi);
      add(l, 4080, cx, 8.5, z, pi, false, 'top');
    }
    return l;
  }
  if (id === 19) {
    const l = level(id, 22, '交错纸筒货架', '纸箱底座、长纸筒、罐头横梁和彩盒顶层；按上层货物、横梁、纸筒的顺序拆解。', '顶层边缘彩盒是切入点；减轻负载后再打纸筒与下层箱脚。', [table(1, 0, 6.8)]);
    for (const z of zPair) {
      for (const x of [-2.5,-0.5,0.5,2.5]) add(l, 4040, x, 2.5, z, 1, false, 'weak');
      for (const x of [-1.5,1.5]) add(l, 4003, x, 3.5, z, 1, true);
      for (const x of [-2,-1,1,2]) add(l, 4047, x, 5.5, z);
      for (const x of [-1.5,1.5]) add(l, 4003, x, 7.5, z, 1, true);
      for (let c = 0; c < 6; c++) add(l, c % 2 ? 4080 : 4078, c - 2.5, 8.5, z, 1, false, 'top');
    }
    return l;
  }
  const l = level(id, 20, '王室果酱城堡', '困难综合；左右塔承托中央门梁，分辨果酱薄弱层并安排拆塔顺序。', '左右塔第二层红果酱；先拆一翼打开中央屋顶，再清理另一翼。', [table(1, 0, 9.5)]);
  for (const z of zPair) {
    for (let row = 0; row < 3; row++) for (const x of [-4,-3,-2,2,3,4]) add(l, row === 1 ? 4016 : 4001, x, 2.5 + row, z, 1, false, row === 1 ? 'weak' : '');
    add(l, 4005, 0, 5.5, z, 1, true);
    for (const x of [-4,-3,3,4]) add(l, 4001, x, 5.5, z);
    for (let row = 0; row < 3; row++) for (let x = -4; x <= 4; x++) add(l, row === 1 ? 4013 : Math.abs(x) <= 1 ? 4017 : 4001, x, 6.5 + row, z);
    for (const x of [-4,-2,0,2,4]) add(l, x === 0 ? 4017 : 4001, x, 9.5, z, 1, false, 'top');
  }
  return l;
}

const indexPath = path.join(data, 'index.json');
const index = JSON.parse(fs.readFileSync(indexPath));
for (let id = 11; id <= 20; id++) {
  const l = build(id);
  // These first-shot choices were revised after testing the actual preview
  // physics: a loaded heavy column is not automatically an effective target.
  const firstShots = { 11: [15,25], 12: [7,16], 15: [19,17], 17: [7,9], 18: [9,11], 19: [13,14] };
  if (firstShots[id]) {
    const previous = l.design.intendedTargets;
    l.design.intendedTargets = firstShots[id];
    l.design.comparisonTargets = previous;
  }
  const types = new Set(l.items.map(i => i.catalogId));
  l.statistics = { entityCount: l.items.length + l.platforms.length, entityTypeCount: types.size + 1, platformCount: l.platforms.length, itemCount: l.items.length, destructibleItemCount: l.items.length, specialObstacleCount: 0, customEntityCount: l.platforms.length };
  fs.writeFileSync(path.join(data, `levels/ai-${id}.json`), JSON.stringify(l, null, 2) + '\n');
  const entry = index.levels.find(e => e.category === 'ai' && e.id === id);
  if (!entry) throw new Error(`Missing index AI-${id}`);
  Object.assign(entry, { moveCount: l.settings.moveCount, difficulty: id === 20 ? 'HARD' : 'NORMAL', difficultyValue: l.settings.difficulty,
    counts: { platforms: l.platforms.length, blocks: l.items.length, obstacles: 0, bouncers: 0, blockers: 0, hammers: 0, stages: 1 } });
  console.log(`AI-${id}: ${l.design.motif}; ${l.items.length} items, ${l.platforms.length} platforms, ${l.settings.moveCount} moves`);
}
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
