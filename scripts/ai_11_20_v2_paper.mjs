export function buildPaperLevel(id, { level, table, add }) {
  if (id === 17) {
    const result = level(id, 25, '纸筒阶冠城',
      '长短纸筒组成前低后高的三维阶冠；两侧中排连接前后轮廓，罐头锥帽标出各柱顶端。',
      '先击前排高柱的罐头锥帽，借助纵深牵动后排，再卸纸箱顶块；直接撞满载长纸筒作为对照。',
      [table(1, 0, 7.6, 4.6)]);
    const rows = [
      { z: -3.5, columns: [[-3, 2], [-1.5, 3], [0, 4], [1.5, 3], [3, 2]] },
      { z: -2, columns: [[-3, 3], [3, 3]] },
      { z: -0.5, columns: [[-3, 3], [-1.5, 4], [0, 5], [1.5, 4], [3, 3]] },
    ];
    for (const row of rows) for (const [x, height] of row.columns) {
      add(result, 4044 + height, x, 2 + height / 2, row.z, 1, false, row.z === -3.5 && height >= 3 ? 'top' : '');
      add(result, 4040, x, 2.5 + height, row.z, 1, false);
      add(result, 4011, x, 3.5 + height, row.z, 1, false, row.z === -3.5 && height >= 3 ? 'weak' : '');
    }
    return result;
  }
  if (id === 19) {
    const result = level(id, 22, '双层纸筒货架',
      '三格竖纸筒承托罐头楼板，彩盒货物支起第二层平顶，三格横纸筒单独放在平顶上。',
      '先推动屋顶横纸筒，再击上层外侧彩盒卸掉罐头横梁，最后拆下层竖纸筒。',
      [table(1, 0, 7.4, 2.7)]);
    for (const z of [-2.6, -1.4]) for (const center of [-1.7, 1.7]) {
      for (const dx of [-1, 1]) {
        add(result, 4040, center + dx, 2.5, z, 1, false);
        add(result, 4047, center + dx, 4.5, z, 1, false);
      }
      add(result, 4003, center, 6.5, z, 1, true);
      for (const dx of [-1, 0, 1]) add(result, dx === 0 ? 4080 : center < 0 ? 4078 : 4074, center + dx, 7.5, z, 1, false, dx * center > 0 ? 'top' : '');
      add(result, 4003, center, 8.5, z, 1, true);
      add(result, 4047, center, 9.5, z, 1, true, 'weak');
    }
    return result;
  }
  throw new Error(`Unsupported paper chapter level: ${id}`);
}
