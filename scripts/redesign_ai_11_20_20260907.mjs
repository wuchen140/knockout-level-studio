import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { buildPaperLevel } from './ai_11_20_v2_paper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'public/data');
const catalog = JSON.parse(fs.readFileSync(path.join(data, 'catalog.json')));
const profiles = new Map(catalog.profiles.map(p => [p.catalogId, p]));
const identity = { x: 0, y: 0, z: 0, w: 1 };
const horizontal = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
const J = [4016, 4013, 4017, 4012, 4015, 4014];
const zPair = [-2.52, -1.48];
function table(sequence, x, width, depth = 2.3, z = -2, rotation = identity) {
  return { sequence, id: 'Table_Rect', shape: 'rect', position: { x, y: 2, z }, rotation: { ...rotation }, size: { width, depth }, movement: null, rotationMotion: null };
}
function level(id, moves, motif, lesson, weakPoint, platforms = [table(1, 0, 7.4)]) {
  return { levelId: id, category: 'ai', categoryName: 'AI关卡', name: `AI-${id}`, slug: `ai-${id}`,
    settings: { version: 1, moveCount: moves, difficulty: id === 20 ? 1 : 0, backgroundIndex: -1, stabilizeOnSpawn: false, physicsQuality: 0 },
    design: { revision: '2026-09-07-v2', referenceLevel: id, motif, lesson, weakPoint, approach: '依据原始主线材料、几何与物理数据独立搭建', intendedTargets: [], comparisonTargets: [] },
    statistics: {}, items: [], platforms, obstacles: { bouncers: [], blockers: [], hammers: [] } };
}
function add(l, id, x, y, z, platform = 1, beam = false, target = '', itemRotation = null) {
  const p = profiles.get(id);
  if (!p) throw new Error(`Unknown profile ${id}`);
  const sequence = l.items.length + 1;
  l.items.push({ sequence, catalogId: id, stage: 1, platform, materialId: p.materialId, shapeId: p.sourceShapeId,
    position: { x, y, z }, rotation: { ...(itemRotation || (beam ? horizontal : identity)) }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } });
  if (target === 'weak') l.design.intendedTargets.push(sequence);
  if (target === 'top') l.design.comparisonTargets.push(sequence);
}
function stack(l, id, x, z, n, base = 2, pi = 1, weak = true) {
  for (let k = 0; k < n; k++) add(l, id, x, base + k + 0.5, z, pi, false, k === 0 && weak ? 'weak' : k === n - 1 ? 'top' : '');
}
function onTable(l, id, x, y, z, pi, target = '') {
  const p = l.platforms.find(p => p.sequence === pi);
  const q = new THREE.Quaternion(p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w);
  const v = new THREE.Vector3(x, y, z).applyQuaternion(q).add(new THREE.Vector3(p.position.x, p.position.y, p.position.z));
  add(l, id, v.x, v.y, v.z, pi, false, target, p.rotation);
}
function build(id) {
  if (id === 11) {
    const l = level(id, 22, '果酱城垛', '纯果酱；六列齐底、顶部两处凸起，认识两层深堆积。', '前排高柱底部。', [table(1, 0, 6.5)]);
    [4,5,4,4,5,4].forEach((h, col) => zPair.forEach(z => stack(l, J[col], (col - 2.5) * 1.04, z, h)));
    return l;
  }
  if (id === 12) {
    const l = level(id, 25, '果酱斜峰', '纯果酱单层薄墙；偏心高峰与低阶对照。', '四至六格高的中部柱脚。', [table(1, 0, 7.5, 1.3)]);
    [1,2,4,6,5,3,2].forEach((h, col) => stack(l, J[col % J.length], (col - 3) * 1.04, -2, h));
    return l;
  }
  if (id === 13) {
    const l = level(id, 22, '果酱双层亭', '两格果酱立柱与三格罐头横梁组成两层亭架。', '先卸亭顶单位果酱，再处理长果酱立柱与横梁。', [table(1, 0, 6.6, 2.4)]);
    for (const center of [-1.6,1.6]) for (const z of [-2.55,-1.45]) {
      for (let tier = 0; tier < 2; tier++) {
        for (const dx of [-1,1]) add(l, tier ? 4019 : 4020, center + dx, 3 + tier * 3, z, 1, false, tier ? 'weak' : 'top');
        add(l, 4003, center, 4.5 + tier * 3, z, 1, true);
      }
      for (const dx of [-1,0,1]) stack(l, 4017, center + dx, z, dx === 0 ? 2 : 1, 8, 1, false);
    }
    l.design.intendedTargets = l.items.filter(item => item.position.y >= 8.5).map(item => item.sequence);
    l.design.comparisonTargets = l.items.filter(item => item.catalogId === 4019).map(item => item.sequence);
    return l;
  }
  if (id === 14) {
    const leftYaw = { x: 0, y: -0.2588190451, z: 0, w: 0.9659258263 };
    const rightYaw = { x: 0, y: 0.2588190451, z: 0, w: 0.9659258263 };
    const l = level(id, 23, '相向双台冠门', '左右平台与结构一起偏转30度；长果酱底柱、罐头分隔层和彩盒边框。', '每台上层中央果酱和外侧长柱形成两种入口，需分别清理。', [table(1, -2.8, 4.2, 2.3, 0.5, leftYaw),table(2, 2.8, 4.2, 2.3, 0.5, rightYaw)]);
    for (let pi = 1; pi <= 2; pi++) {
      for (const z of [-0.55,0.55]) for (let c = 0; c < 4; c++) {
        const x = c - 1.5;
        onTable(l, pi === 1 ? 4026 : 4024, x, 1.5, z, pi, 'top');
        onTable(l, 4001, x, 3.5, z, pi);
        for (let row = 0; row < [2,3,3,2][c]; row++) {
          const center = c === 1 || c === 2;
          onTable(l, center ? (pi === 1 ? 4017 : 4016) : (pi === 1 ? 4078 : 4080), x, 4.5 + row, z, pi, center && row === 0 ? 'weak' : '');
        }
      }
    }
    return l;
  }
  if (id === 15) {
    const l = level(id, 25, '果酱奖杯', '彩盒杯座与杯身夹住果酱细腰，上部果酱杯芯是另一条卸载路线。', '先击杯芯果酱，观察细腰在减载前后的响应。', [table(1, 0, 5.6)]);
    const rows = ['BBBBB','.BJB.','..J..','.....','BJJJB','BJJJB','.BBB.','..Y..'];
    const ids = { B: 4073, J: 4013, Y: 4080 };
    for (const z of zPair) {
      rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch !== '.') add(l, ids[ch], x - 2, 2.5 + y, z, 1, false, y === 4 && ch === 'J' ? 'weak' : y === 2 ? 'top' : '');
      }));
      add(l, 4109, 0, 5.5, z, 1, true);
    }
    return l;
  }
  if (id === 16) {
    const l = level(id, 26, '纸箱山门', '纯纸箱新材料教学；单层五列构成中高两低的缓坡。', '顶层边缘先卸载，再比较满载底部。', [table(1, 0, 5.5, 1.4)]);
    [3,4,5,4,3].forEach((height,col) => stack(l,4040,(col-2)*1.04,-2,height));
    return l;
  }
  if (id === 17) {
    return buildPaperLevel(id, { level, table, add });
  }
  if (id === 18) {
    const l = level(id, 23, '双台承重反转墙', '两座单层薄墙轮廓相同；左台长纸箱在底部，右台长纸箱在顶部。', '左台先卸彩盒上沿，右台比较底部彩盒与纸箱顶盖，逐台拆除。', [table(1, -2.75, 4.3, 1.25),table(2, 2.75, 4.3, 1.25)]);
    for (let pi = 1; pi <= 2; pi++) for (let c = 0; c < 4; c++) {
      const height = [6,7,7,6][c]; const cardHeight = (pi === 1 ? [1,2,3,2] : [2,3,2,1])[c];
      const colors = height - cardHeight; const x = c - 1.5;
      onTable(l, 4039 + cardHeight, x, pi === 1 ? cardHeight / 2 : colors + cardHeight / 2, 0, pi, pi === 1 ? 'top' : 'weak');
      for (let row = 0; row < colors; row++) onTable(l, row === colors - 1 ? 4080 : pi === 1 ? 4078 : 4073, x, 0.5 + row + (pi === 1 ? cardHeight : 0), 0, pi, row === colors - 1 && pi === 1 ? 'weak' : row === 0 && pi === 2 ? 'top' : '');
    }
    return l;
  }
  if (id === 19) {
    return buildPaperLevel(id, { level, table, add });
  }
  const l = level(id, 20, '三峰果酱堡', '困难综合；九列混材墙的薄弱层交错布置，上方三处城垛分散负载。', '两翼低层果酱与中央高层果酱分别开口，安排区域清理顺序。', [table(1, 0, 9.5)]);
  for (const z of zPair) {
    for (let x = -4; x <= 4; x++) {
      const height = [7,6,5,6,8,6,5,6,7][x + 4];
      for (let row = 0; row < height; row++) {
        const weakRow = Math.abs(x) <= 1 ? 3 : 1;
        const jam = row === weakRow || row === 4 || (Math.abs(x) <= 1 && row > 4);
        add(l, jam ? (Math.abs(x) <= 1 ? 4017 : x < 0 ? 4016 : 4012) : 4001, x, 2.5 + row, z, 1, false, row === weakRow ? 'weak' : row === height - 1 ? 'top' : '');
      }
    }
  }
  return l;
}

const indexPath = path.join(data, 'index.json');
const index = JSON.parse(fs.readFileSync(indexPath));
for (let id = 11; id <= 20; id++) {
  const l = build(id);
  if (id === 16) [l.design.intendedTargets, l.design.comparisonTargets] = [l.design.comparisonTargets, l.design.intendedTargets];
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
