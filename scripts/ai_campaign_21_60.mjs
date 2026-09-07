import { createLevel, put, column, heightMap, finalize, profiles } from './ai_campaign_builder.mjs';

const jam = [4016, 4013, 4017, 4012, 4015, 4014];
const colors = [4078, 4073, 4076, 4074, 4077, 4080];
const repeat = (id, count) => Array.from({ length: count }, () => id);
const meta = {
  21: ['石阶王座', '纯石材低阶教学：中央靠背与低扶手比较承重。', '先卸靠背上缘，再比较侧脚与满载中柱。', 29],
  22: ['三孔石拱廊', '二格石柱与横石梁构成两层三孔门。', '先卸上层石梁，再由外柱向中间逐孔拆除。', 34],
  23: ['尖顶石钟楼', '五格石筒承托彩盒门楣；中央彩盒塔和两侧尖顶。', '先卸彩盒塔顶，再处理石筒上的门楣与锥帽。', 22],
  24: ['石柱粮仓', '三排果酱粮仓由长石筒分隔承重。', '先开侧仓果酱中窗，再卸顶重与石筒。', 26],
  25: ['彩窗石廊', '低石脚、竖纸筒与彩盒窗柱组成静态恢复关。', '卸彩盒窗柱，再比较竖纸筒与石脚。', 25],
  26: ['圆庭凉亭', '静止椭圆台上主亭与四角低塔，保留长果酱柱与罐头梁。', '卸主亭上果酱，再分区拆四角罐头塔。', 23],
  27: ['三座仓门', '前门仓、左后阶梯仓、右后双尖仓具有独立支撑和材料位置。', '先拆前门露出后台，再分别卸左后腰带与右后峰顶。', 27],
  28: ['镶边果酱盾', '双层果酱盾面，彩盒边框和少量石脚。', '两翼框内果酱为低入口，中盾顶为卸载入口。', 22],
  29: ['斜台阶金字塔', '沿原偏转平台搭建六排深阶台与偏心主峰。', '从最低前角逐阶卸载，再转向后侧阶面。', 27],
  30: ['石环王冠堡', '石圆柱框与三窗果酱冠堡，三条区域承重路线。', '先开左低窗，再卸中冠，最后拆右侧石框。', 23],
  31: ['彩带八角亭', '圆台环形果酱柱与彩盒方位带教学旋转瞄准。', '等果酱柱正对后卸上沿，再打同面低层。', 37],
  32: ['转台四角城', '长果酱塔与重石角柱构成四面开口。', '先卸长果酱上段，再转向拆相邻石柱。', 30],
  33: ['双转台果酱棋子', '反转双圆台上分别搭冠塔与阶塔。', '右台先卸冠齿，左台由低阶向峰顶拆。', 28],
  34: ['转台三尖炮楼', '石脚、纸箱柱与罐头炮楼构成困难旋转关。', '卸锥帽与上层罐头，再处理纸箱柱和石脚。', 23],
  35: ['三台尖顶街屋', '两座偏转前楼与一座后牌楼形成静态恢复。', '依次卸右阁、左阶楼和后牌楼上沿。', 25],
  36: ['双塔吊桥门', '石材和纸箱长件形成有明确落点的双塔门。', '先卸纸梁上的锥帽，再拆梁端和石柱。', 24],
  37: ['重梁果酱闸门', '旋转深台上石柱分隔三排果酱闸门。', '侧向卸果酱顶重，再拆长果酱柱。', 22],
  38: ['双窗纸石车站', '椭圆台上的低石墩和竖纸箱组成恢复关。', '先卸纸箱站牌，再比较纸柱和石墩。', 24],
  39: ['双色石框城门', '旋转薄台的石柱和彩盒三窗结构。', '卸彩窗上沿，再从侧面拆石柱。', 24],
  40: ['旋转四面王冠', '偏转旋转台上的四面果酱堡和彩盒角框。', '从低窗、上冠、侧窗依次拆除。', 24],
  41: ['低冰门', '纯冰低门用长冰柱和横梁单独教学滑移。', '先击冰梁端，再比较满载冰柱。', 30],
  42: ['冰罐保龄球阵', '深台上前罐头阵与后冰筒阶阵形成滚动对照。', '先开前阵通道，再击后阵低冰筒。', 22],
  43: ['冰梁彩窗宫', '冰承重和彩盒上层组成宽幅三窗结构。', '卸彩盒窗沿，再拆冰柱低层。', 23],
  44: ['冰桥双层钟架', '冰长梁、彩盒框和纸筒支柱形成困难组合。', '先卸后框，再从侧面拆前冰梁。', 21],
  45: ['果酱三峰山门', '石脚、罐头腰带与果酱三峰提供静态恢复。', '先卸两翼果酱，再处理中峰。', 24],
  46: ['前牌楼后城堡', '前薄牌楼与后厚城堡各有独立彩盒支撑。', '先拆前台打开视线，再分区击后台两肩。', 23],
  47: ['冰筒阶塔', '偏转旋转台上冰柱与果酱阶冠组合。', '卸高层果酱，转到侧面后击冰柱。', 22],
  48: ['折线三堡', '三张偏转台分别为中央门堡和左右阶堡。', '先拆中央低堡，再从不同方向拆两翼。', 23],
  49: ['前冰门后果酱殿', '反转双台分别教学冰框和纸箱支撑果酱。', '前台先拆冰门，后台分拆三座果酱峰。', 22],
  50: ['冰面皇家盾', '冰盾面和彩盒中脊构成低摩擦超难收束。', '先卸皇冠，再开侧冰面，最后拆中脊。', 21],
  51: ['移动尖顶车厢', '彩盒车厢随宽幅横移，保留清楚上沿入口。', '在行程中点卸一端，再在端点处理另一端。', 27],
  52: ['双台货仓', '相向移动双台分别搭高阶仓和低门仓。', '先卸高仓顶，再打低仓上层冰块。', 21],
  53: ['移动前哨与后殿', '前薄哨门与后厚三跨殿反相横移。', '前哨移开时拆后殿外翼，再处理前门。', 20],
  54: ['双台梁栈门', '偏转同向横移台分别为石彩梁门和纯彩梁栈。', '左台先卸彩梁，右台比较上梁端和底脚。', 19],
  55: ['冰筒双窗桥', '石脚、竖纸筒和冰筒形成静态低压窗桥。', '先卸冰柱上段，再比较纸筒和石脚。', 23],
  56: ['斜台石门牌坊', '沿原偏转台局部方向搭建石柱和彩盒牌坊。', '卸牌坊顶重，再击彩盒梁端和石柱。', 22],
  57: ['石骨果酱方尖塔', '四角石骨分担果酱方尖塔的前后载荷。', '从凹槽卸果酱上层，再绕侧拆另一面。', 21],
  58: ['三跨彩色栈桥', '罐头和彩盒形成三个有独立端点的静态桥跨。', '先卸侧跨彩盒，再拆罐头梁端。', 22],
  59: ['左冰亭右彩堡', '双静台用纸筒顶重和冰腰彩堡作材料对照。', '左卸纸筒顶，右卸彩堡一翼后击冰腰。', 20],
  60: ['双转台冠堡', '相向移动反转双圆台分别搭彩石堡与冰石塔。', '右卸彩冠后拆石框，左卸冰芯后击滑移层。', 21],
};

function start(source) {
  const entry = meta[source.levelId];
  if (!entry) throw new Error(`AI-${source.levelId} is not implemented in 21–60 module yet`);
  return createLevel(source, { motif: entry[0], lesson: entry[1], weakPoint: entry[2], moves: entry[3],
    approach: '按对应主线材料及平台分组独立搭建，逐组建立支撑链' });
}

function stack(l, pi, x, z, ids, base = 0, opts = {}) {
  return column(l, pi, x, z, ids, base, opts);
}

function arch(l, pi, cx, z, pillarIds, beamId, capHeights, capId, options = {}) {
  const beamWidth = profiles.get(beamId).modelSize[1];
  const offset = options.legOffset ?? (beamWidth - 1) / 2;
  const h = pillarIds.reduce((sum, id) => sum + profiles.get(id).modelSize[1], 0);
  for (const sign of [-1, 1]) stack(l, pi, cx + sign * offset, z, pillarIds, 0, { weakIndex: pillarIds.length - 1, compareIndex: 0 });
  put(l, pi, beamId, cx, h + 0.5, z, { beam: true, target: 'weak' });
  for (let xi = 0; xi < capHeights.length; xi++) {
    const x = cx + xi - (capHeights.length - 1) / 2;
    const ids = repeat(typeof capId === 'function' ? capId(xi) : capId, capHeights[xi]);
    stack(l, pi, x, z, ids, h + 1);
    if (options.cones && capHeights[xi]) put(l, pi, 4011, x, h + 1 + capHeights[xi] + 0.5, z, { target: 'weak' });
  }
}

function stoneChapter(l) {
  const id = l.levelId;
  if (id === 21) {
    heightMap(l, 1, [[2,1,1,2],[2,3,3,2],[2,4,4,2]], 4030);
  } else if (id === 22) {
    for (const z of [-0.5, 0.5]) for (let tier = 0; tier < 2; tier++) {
      for (const x of [-3, -1, 1, 3]) stack(l, 1, x, z, [4031], tier * 3, { weakIndex: -1, compareIndex: 0 });
      for (const x of [-2, 0, 2]) put(l, 1, 4031, x, tier * 3 + 2.5, z, { beam: true, target: 'weak' });
    }
  } else if (id === 23) {
    for (const z of [-0.5, 0.5]) {
      for (const cx of [-2, 2]) arch(l, 1, cx, z, [4039], 4094, [1,2,1], 4075, { cones: true });
      stack(l, 1, 0, z, repeat(4074, 6));
      put(l, 1, 4011, 0, 6.5, z, { target: 'weak' });
    }
  } else if (id === 24) {
    for (let zi = 0; zi < 3; zi++) for (let xi = 0; xi < 9; xi++) {
      const height = [6,7,6,8,9,8,6,7,6][xi];
      const ids = [];
      if ((xi + zi) % 2 === 0) ids.push(4037);
      const baseHeight = ids.length ? 3 : 0;
      ids.push(...repeat(4017, height - baseHeight));
      stack(l, 1, xi - 4, zi - 1, ids, 0, { weakIndex: Math.max(1, ids.length - 3), compareIndex: 0 });
    }
  } else if (id === 25) {
    for (const z of [-1, 1]) {
      for (const x of [-3, -1, 1, 3]) stack(l, 1, x, z,
        [4030, 4030, 4047, x < 0 ? 4076 : 4079, x < 0 ? 4076 : 4079]);
      stack(l, 1, 0, z, [4040, 4040, 4040]);
    }
  } else if (id === 26) {
    for (const z of [-1, 1]) arch(l, 1, 0, z, [4025], 4003, [2,3,2], 4017);
    for (const x of [-2, 2]) for (const z of [-2, 2]) {
      const top = stack(l, 1, x, z, [...repeat(4001, 5), 4080, 4080]);
      put(l, 1, 4011, x, top + 0.5, z, { target: 'weak' });
    }
  } else if (id === 27) {
    for (const pi of [1, 2]) for (let zi = 0; zi < 3; zi++) for (let xi = 0; xi < 4; xi++) {
      const h = (pi === 1 ? [4,5,6,7] : [7,5,5,7])[xi];
      const ids = [4040, 4040, pi === 1 ? 4018 : 4019];
      ids.push(...Array.from({ length: h - 4 }, (_, y) => (y + xi) % 2 ? 4040 : jam[(xi + pi) % jam.length]));
      stack(l, pi, xi - 1.5, zi - 1, ids);
    }
    for (const z of [-1, 0, 1]) arch(l, 3, 0, z, [4040,4040], 4043, [2,3,3,2], xi => jam[xi]);
  } else if (id === 28) {
    heightMap(l, 1, [[6,7,8,8,9,8,8,7,6],[6,7,8,8,9,8,8,7,6]], (x,y,z) => {
      if (y === 0 && [0,4,8].includes(x)) return 4030;
      if (x === 0 || x === 8 || y === 3 && (x < 3 || x > 5)) return x < 4 ? 4074 : 4073;
      return x < 4 ? 4013 : 4012;
    }, { weakRow: 2 });
  } else if (id === 29) {
    const rows = [[2,3,4,4,3,2],[3,4,5,5,4,3],[4,5,7,6,5,4],[4,5,6,6,5,4],[3,4,5,5,4,3],[2,3,4,4,3,2]];
    heightMap(l, 1, rows, (x,y,z) => y === 0 && (x + z) % 4 === 0 ? 4035 : jam[(x + z) % jam.length]);
  } else if (id === 30) {
    heightMap(l, 1, [repeat(0,9).map((_,x) => [8,9,8,8,9,8,8,9,8][x]), [8,9,8,8,9,8,8,9,8]], (x,y) =>
      x === 0 || x === 8 || y === 0 || y === 3 && (x < 3 || x > 5) || x === 4 && y % 3 === 0 ? 4035 : 4016,
    { weakRow: 4 });
  }
}

function rotationChapter(l) {
  const id = l.levelId;
  if (id === 31) {
    const positions = [[-2,0],[-1,0],[0,0],[1,0],[2,0],[-1,-2],[0,-2],[1,-2],[-1,2],[0,2],[1,2]];
    positions.forEach(([x,z], i) => stack(l, 1, x, z,
      Array.from({ length: i % 3 === 0 ? 9 : 8 }, (_, y) => y === 3 || y === 6 ? colors[i % colors.length] : 4017)));
  } else if (id === 32) {
    const positions = [[-2,-2],[0,-2],[2,-2],[-2,0],[2,0],[-2,2],[0,2],[2,2]];
    positions.forEach(([x,z], i) => stack(l, 1, x, z,
      [4037, i % 2 ? 4022 : 4029, ...repeat(4016, 5)]));
    for (const [x,z] of [[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]])
      stack(l, 1, x, z, [4029, ...repeat(4016, 6)]);
  } else if (id === 33) {
    const positions = [[-0.75,-0.75],[0.75,-0.75],[-0.75,0.75],[0.75,0.75]];
    for (const pi of [1,2]) positions.forEach(([x,z], i) => {
      const h = pi === 1 ? [10,11,10,11][i] : [11,10,11,10][i];
      stack(l, pi, x, z, Array.from({ length: h }, (_, y) => jam[(i + y + pi) % jam.length]));
    });
  } else if (id === 34) {
    for (const z of [-1,0,1]) for (const x of [-2,-1,0,1,2]) {
      if ((x + z + 6) % 3 === 0) stack(l, 1, x, z, [4035,4035,4041,4042]);
      else {
        const h = 4 + ((x - z + 6) % 3);
        const top = stack(l, 1, x, z, repeat(4006, h), 0, { weakIndex: h - 2, compareIndex: 0 });
        put(l, 1, 4011, x, top + 0.5, z, { target: 'weak' });
      }
    }
    stack(l, 1, 0, 2, [4035,4047]);
  } else if (id === 35) {
    for (const [pi, heights] of [[1,[4,6,7]],[2,[7,6,4]],[3,[4,6,4]]]) {
      const zs = pi === 3 ? [-0.5,0.5] : [-1,0,1];
      for (const z of zs) for (let x = -1; x <= 1; x++) {
        const h = heights[x + 1] - (z === 0 ? 0 : 1);
        const ids = [4008, ...repeat(colors[(x + pi + 6) % colors.length], Math.max(1, h - 3))];
        stack(l, pi, x, z, ids);
      }
    }
  } else if (id === 36) {
    for (const z of [-1,0,1]) {
      for (const x of [-4,0,4]) stack(l, 1, x, z, [4034], 0, { compareIndex: 0, weakIndex: -1 });
      for (const cx of [-2,2]) put(l, 1, 4043, cx, 5.5, z, { beam: true, target: 'weak' });
      for (const x of [-3,-1,1,3]) {
        stack(l, 1, x, z, [4041], 6, { compareIndex: 0, weakIndex: -1 });
        put(l, 1, 4011, x, 8.5, z, { target: 'weak' });
      }
    }
  } else if (id === 37) {
    for (const z of [-1.5,-0.5,0.5,1.5]) for (const x of [-3,-2,-1,0,1,2,3]) {
      const ids = x % 3 === 0 ? [4033,4029,4016,4017] : [4029,4029,4016,4017,4016];
      stack(l, 1, x, z, ids, 0, { weakIndex: ids.length - 2, compareIndex: 0 });
    }
  } else if (id === 38) {
    for (const z of [-0.5,0.5]) for (const x of [-2,0,2]) {
      const ids = x === 0 ? [4030,4030,4040,4040,4040,4040,4040] : [4030,4042,4040,4030];
      stack(l, 1, x, z, ids);
    }
    for (const x of [-3,3]) stack(l, 1, x, 0, [4030,4030,4043,4040]);
  } else if (id === 39) {
    for (const z of [-0.5,0.5]) for (const x of [-3.5,-2.5,-1.5,-0.5,0.5,1.5,2.5,3.5]) {
      const ids = (x + 3.5) % 3 === 0 ? [4031,4031,4080,4080] : repeat(x < 0 ? 4080 : 4077, 7);
      stack(l, 1, x, z, ids);
    }
  } else if (id === 40) {
    const rows = [[6,7,7,7,6],[7,7,8,7,7],[7,8,8,8,7],[7,7,8,7,7],[6,7,7,7,6]];
    heightMap(l, 1, rows, (x,y,z) => (x === 0 || x === 4 || z === 0 || z === 4) && y % 3 === 0
      ? (x + z) % 2 ? 4078 : 4080 : 4016, { weakRow: 5 });
  }
}

function iceChapter(l) {
  const id = l.levelId;
  if (id === 41) {
    for (const z of [-1,1]) {
      for (const x of [-2,2]) stack(l, 1, x, z, [4052], 0, { compareIndex: 0, weakIndex: -1 });
      put(l, 1, 4054, 0, 3.5, z, { beam: true, target: 'weak' });
      for (let x = -2; x <= 2; x++) put(l, 1, 4050, x, 4.5, z, { target: x === 0 ? 'weak' : '' });
    }
  } else if (id === 42) {
    for (const [z,width] of [[-3,3],[-2,5],[-1,7]]) for (let x = -(width - 1) / 2; x <= (width - 1) / 2; x++)
      stack(l, 1, x, z, [4006], 0, { weakIndex: 0, compareIndex: -1 });
    for (const [z,width,h] of [[1,7,1],[2,5,2],[3,3,3]]) for (let x = -(width - 1) / 2; x <= (width - 1) / 2; x++)
      stack(l, 1, x, z, repeat(4055, h), 0, { weakIndex: 0, compareIndex: h - 1 });
  } else if (id === 43) {
    heightMap(l, 1, [[6,7,8,8,9,8,8,7,6],[6,7,8,8,9,8,8,7,6]], (x,y) =>
      y < 3 || x % 4 === 0 ? 4050 : x < 4 ? 4076 : 4080, { weakRow: 2 });
  } else if (id === 44) {
    for (const z of [-1.5,0,1.5]) for (const x of [-3,-2,-1,0,1,2,3]) {
      const h = z < 0 ? 2 + (Math.abs(x) < 2 ? 1 : 0) : z > 0 ? 2 + (Math.abs(x) > 1 ? 1 : 0) : 2;
      const ids = [];
      for (let y = 0; y < h; y++) {
        if (z === 0 && (x === -2 || x === 2)) ids.push(4046);
        else if (z < 0 || y === 0) ids.push(4050);
        else ids.push(x < 0 ? 4074 : 4076);
      }
      stack(l, 1, x, z, ids);
    }
    put(l, 1, 4054, 0, 3.5, -1.5, { beam: true, target: 'weak' });
    put(l, 1, 4116, 0, 3.5, 1.5, { beam: true, target: 'weak' });
  } else if (id === 45) {
    heightMap(l, 1, [[5,6,7,8,7,6,5],[5,6,7,8,7,6,5]], (x,y) =>
      y === 0 && x % 3 === 0 ? 4030 : y === 3 && x % 2 === 0 ? 4001 : jam[x % jam.length], { weakRow: 2 });
  } else if (id === 46) {
    heightMap(l, 1, [[6,7,7,7,7,7,6],[6,7,7,7,7,7,6]], (x,y,z,h) => y === h - 1 && x % 3 === 0 ? 4011 : colors[x % colors.length], { weakRow: 4 });
    heightMap(l, 2, [[5,6,7,6,5]], (x,y,z,h) => y === h - 1 && x % 2 === 0 ? 4011 : colors[(x + 2) % colors.length], { weakRow: 3 });
  } else if (id === 47) {
    for (const z of [-1,0,1]) for (let x = -3; x <= 3; x++) {
      const ids = x % 3 === 0 ? [4051,4052,4014,4014] : [4055,4056,4017,4017];
      if (z === 0 && Math.abs(x) < 2) ids.push(4016);
      stack(l, 1, x, z, ids, 0, { weakIndex: ids.length - 2, compareIndex: 0 });
    }
  } else if (id === 48) {
    for (const pi of [1,3]) for (const z of [-1.5,-0.5,0.5,1.5]) for (const x of [-0.5,0.5])
      stack(l, pi, x, z, [4035,4013,4006,4016,4017]);
    for (const z of [-0.5,0.5]) for (const x of [-0.5,0.5]) stack(l, 2, x, z, [4035,4035,4006,4013,4016]);
  } else if (id === 49) {
    for (const z of [-1,1]) for (const x of [-1.5,-0.5,0.5,1.5]) {
      const ids = [4052, x < 0 ? 4012 : 4016, x < 0 ? 4012 : 4016];
      stack(l, 1, x, z, ids);
    }
    for (const z of [-1,0,1]) for (let x = -3; x <= 3; x++) {
      const h = [4,5,6,7,6,5,4][x + 3] - (z === 0 ? 0 : 1);
      const ids = [x % 2 ? 4040 : 4023, ...Array.from({ length: h - 1 }, (_, y) => jam[(x + y + 12) % jam.length])];
      stack(l, 2, x, z, ids);
    }
  } else if (id === 50) {
    heightMap(l, 1, [[5,6,7,8,7,6,5],[5,6,7,8,7,6,5]], (x,y) =>
      x === 0 || x === 6 || x === 3 && y % 2 === 0 ? (x < 3 ? 4078 : 4075) : 4050, { pitchZ: 1.1, weakRow: 3 });
  }
}

function movementChapter(l) {
  const id = l.levelId;
  if (id === 51) {
    heightMap(l, 1, [[5,6,6,6,5],[5,6,6,6,5]], (x,y,z,h) => y === h - 1 && (x === 0 || x === 4) ? 4011 : colors[(x + y) % colors.length], { weakRow: 3 });
  } else if (id === 52) {
    for (const [pi, heights] of [[1,[5,6,7]],[2,[7,5,5]]]) for (const z of [-0.5,0.5]) for (let x = -1; x <= 1; x++) {
      const h = heights[x + 1];
      const iceRow = pi === 1 ? 2 : h - 1;
      const ids = Array.from({ length: h }, (_, y) => y === iceRow ? 4050 : 4040);
      stack(l, pi, x, z, ids, 0, { weakIndex: iceRow, compareIndex: 0 });
    }
  } else if (id === 53) {
    for (const x of [-1.5,-0.5,0.5,1.5]) {
      const ids = x < 0 ? [4007,4021,4012] : [4007,4019,4012];
      stack(l, 1, x, 0, ids);
    }
    for (const z of [-1,0,1]) for (let x = -4; x <= 4; x++) {
      const h = [3,4,5,6,7,6,5,4,3][x + 4] - (z === 0 ? 0 : 1);
      const ids = [x % 2 ? 4003 : 4020, ...repeat(jam[(x + 12) % jam.length], Math.max(1, h - 3))];
      stack(l, 2, x, z, ids);
    }
  } else if (id === 54) {
    for (const x of [-1,0,1]) for (const z of [-1,1]) stack(l, 1, x, z,
      [4032, x < 0 ? 4091 : x > 0 ? 4098 : 4094], 0, { weakIndex: 1, compareIndex: 0 });
    for (const x of [-1,0,1]) for (const z of [-1,1]) {
      const ids = x === 0 ? [4092,4093,4094] : [4096,4097];
      stack(l, 2, x, z, ids, 0, { weakIndex: ids.length - 1, compareIndex: 0 });
    }
  } else if (id === 55) {
    for (const z of [-0.5,0.5]) for (const x of [-3,-2,-1,0,1,2,3]) {
      const ids = x % 3 === 0 ? [4031,4047,4057] : [4031,4057];
      stack(l, 1, x, z, ids);
    }
  } else if (id === 56) {
    for (const z of [-2,-1,0,1,2]) for (const x of [-1,0,1]) {
      const ids = x === 0 ? [4037,4092,4082] : [4035,4035,4116];
      stack(l, 1, x, z, ids);
    }
  } else if (id === 57) {
    const rows = [[6,7,7,6],[7,8,8,7],[7,8,8,7],[6,7,7,6]];
    heightMap(l, 1, rows, (x,y,z,h) => (x === 0 || x === 3) && y < 3 || (z === 0 || z === 3) && y === 0 ? 4030 : jam[(x + z) % jam.length], { weakRow: 5 });
  } else if (id === 58) {
    for (const z of [-0.9,0.9]) for (const x of [-3.5,-2.5,-1.5,-0.5,0.5,1.5,2.5,3.5]) {
      const h = Math.abs(x) < 1 ? 4 : 3;
      const ids = Array.from({ length: h }, (_, y) => y === 0 || y === 2 ? 4001 : x < 0 ? 4077 : 4075);
      stack(l, 1, x, z, ids);
    }
  } else if (id === 59) {
    for (const z of [-1,0,1]) for (const x of [-1,0,1]) {
      const ids = [4055,4055, x === 0 ? 4047 : 4056, 4045];
      stack(l, 1, x, z, ids);
    }
    for (const z of [-1,0,1]) for (const x of [-1.5,-0.5,0.5,1.5]) {
      const h = Math.abs(x) < 1 ? 7 : 6;
      const ids = Array.from({ length: h }, (_, y) => y === 2 ? 4055 : colors[(x < 0 ? 0 : 3) + y % 3]);
      stack(l, 2, x, z, ids);
    }
  } else if (id === 60) {
    const positions = [[-0.75,-0.75],[0.75,-0.75],[-0.75,0.75],[0.75,0.75]];
    positions.forEach(([x,z], i) => {
      const rightLength = 10 + (i % 2), leftLength = 10 + ((i + 1) % 2);
      const right = Array.from({ length: rightLength }, (_, y) => y < 2 ? 4035 : y === rightLength - 1 && i % 3 === 0 ? 4011 : 4073);
      const left = Array.from({ length: leftLength }, (_, y) => y < 2 ? 4035 : y === leftLength - 1 && i % 3 === 0 ? 4011 : 4050);
      stack(l, 1, x, z, right, 0, { weakIndex: 5, compareIndex: 0 });
      stack(l, 2, x, z, left, 0, { weakIndex: 5, compareIndex: 0 });
    });
  }
}

export function buildLevel(source) {
  const l = start(source);
  if (l.levelId >= 21 && l.levelId <= 30) stoneChapter(l);
  else if (l.levelId <= 40) rotationChapter(l);
  else if (l.levelId <= 50) iceChapter(l);
  else if (l.levelId <= 60) movementChapter(l);
  else throw new Error(`AI-${l.levelId} is not implemented yet`);
  return finalize(l);
}
