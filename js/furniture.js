// js/furniture.js v20260925aa
// 家具/装饰 3D 微模型：床 / 桌子 / 椅子 / 沙发 / 箱子 / 半砖 / 栅栏 / 活板门 / 灯笼 / 蜡烛
// 这些方块不再渲染成"满格贴图立方体"，而是用小盒体拼出真实造型。
// 家具按朝向(dir 0..3)绕 Y 轴旋转，使靠背/床头/箱锁正面朝向放置玩家。
// 每个区块生成时调用 buildFurnitureGroup 扫描，产出挂到区块 group 的 InstancedMesh。

import { BlockType, CHUNK_SIZE, CHUNK_HEIGHT, World } from './voxel.js?v=20260925aa';

// ── 柔和配色（与手持方块 getBlockColor 协调） ──
const COLORS = {
  wood:       0xb48c50,
  woodDark:   0x8a5a2e,
  plank:      0xd9b98a,
  stone:      0x9a9a9a,
  mattress:   0xf3f3ee,
  bedRed:     0xd04a4a, bedBlue: 0x4a7ad6, bedGreen: 0x4aa85f, bedYellow: 0xe6c94a,
  sofaRed:    0xc9465a,
  sofaLight:  0xe27186,
  gold:       0xe8b83c,
  iron:       0xd8b05a,   // 灯笼框
  glow:       0xffe6a0,   // 灯光（灯笼/蜡烛火焰）
  candleP:    0xf49ac2, candleB: 0x8fc0f0, candleY: 0xf5df7a,
  candleWick: 0x4a3a2a,
};

const BED_COLOR = {
  [BlockType.BED_RED]: 'bedRed',
  [BlockType.BED_BLUE]: 'bedBlue',
  [BlockType.BED_GREEN]: 'bedGreen',
  [BlockType.BED_YELLOW]: 'bedYellow',
};
const CANDLE_COLOR = {
  [BlockType.CANDLE_PINK]: 'candleP',
  [BlockType.CANDLE_BLUE]: 'candleB',
  [BlockType.CANDLE_YELLOW]: 'candleY',
};

// 有朝向的家具：靠背/床头/正面需转向玩家
const DIRECTIONAL = new Set([
  BlockType.BED_RED, BlockType.BED_BLUE, BlockType.BED_GREEN, BlockType.BED_YELLOW,
  BlockType.SOFA_RED, BlockType.CHAIR_WOOD, BlockType.CHEST,
]);

// ── 各家具的盒体造型（单位方块 0~1，y 以方块底为 0） ──
// 约定：正面/靠背/床头默认建在 +z 面（dir=0 时正面朝南）。
function partsFor(bt) {
  const l = [];
  const add = (ax0, ax1, ay0, ay1, az0, az1, ck) =>
    l.push({ x0: ax0, x1: ax1, y0: ay0, y1: ay1, z0: az0, z1: az1, color: COLORS[ck] });

  const bed = (ck) => {
    add(0.05, 0.95, 0.05, 0.30, 0.05, 0.95, 'woodDark');  // 床架
    add(0.08, 0.92, 0.30, 0.55, 0.10, 0.92, 'mattress');  // 床垫
    add(0.08, 0.92, 0.44, 0.60, 0.08, 0.52, ck);          // 被子（靠床头半）
    add(0.12, 0.88, 0.46, 0.64, 0.62, 0.88, 'mattress');  // 枕头
    add(0.05, 0.95, 0.28, 0.92, 0.92, 1.00, 'wood');      // 床头板（+z 端=正面）
  };
  if (BED_COLOR[bt]) { bed(BED_COLOR[bt]); return l; }

  switch (bt) {
    case BlockType.SOFA_RED:
      add(0.08, 0.92, 0.22, 0.50, 0.08, 0.76, 'sofaRed');   // 底座
      add(0.08, 0.92, 0.50, 0.92, 0.80, 0.94, 'sofaRed');   // 靠背（+z）
      add(0.04, 0.18, 0.44, 0.74, 0.10, 0.92, 'sofaRed');   // 左扶手
      add(0.82, 0.96, 0.44, 0.74, 0.10, 0.92, 'sofaRed');   // 右扶手
      add(0.20, 0.80, 0.50, 0.64, 0.24, 0.68, 'sofaLight'); // 软坐垫
      break;
    case BlockType.TABLE_WOOD:
      add(0.10, 0.90, 0.66, 0.78, 0.10, 0.90, 'wood');      // 桌面
      for (const [lx, lz] of [[0.14,0.14],[0.86,0.14],[0.14,0.86],[0.86,0.86]])
        add(lx - 0.06, lx + 0.06, 0.00, 0.66, lz - 0.06, lz + 0.06, 'woodDark');
      break;
    case BlockType.CHAIR_WOOD:
      add(0.18, 0.82, 0.40, 0.52, 0.18, 0.82, 'wood');      // 座板
      for (const [lx, lz] of [[0.20,0.20],[0.80,0.20],[0.20,0.80],[0.80,0.80]])
        add(lx - 0.05, lx + 0.05, 0.00, 0.42, lz - 0.05, lz + 0.05, 'woodDark');
      add(0.18, 0.82, 0.52, 0.98, 0.82, 0.94, 'wood');      // 靠背板（+z）
      add(0.18, 0.82, 0.92, 1.02, 0.80, 0.96, 'woodDark');  // 靠背顶横梁
      break;
    case BlockType.CHEST:
      add(0.10, 0.90, 0.04, 0.60, 0.10, 0.90, 'wood');      // 箱身
      add(0.10, 0.90, 0.60, 0.76, 0.10, 0.90, 'woodDark');  // 箱盖
      add(0.44, 0.56, 0.36, 0.56, 0.90, 0.98, 'gold');      // 锁扣（+z 正面）
      add(0.10, 0.16, 0.10, 0.60, 0.86, 0.96, 'woodDark');  // 包角
      add(0.84, 0.90, 0.10, 0.60, 0.86, 0.96, 'woodDark');
      break;
    case BlockType.SLAB:  // 半砖台阶（下半块木板）
      add(0.00, 1.00, 0.00, 0.50, 0.00, 1.00, 'plank');
      break;
    case BlockType.FENCE:  // 栅栏：中柱
      add(0.40, 0.60, 0.00, 1.00, 0.40, 0.60, 'wood');
      add(0.36, 0.64, 0.58, 0.74, 0.36, 0.64, 'woodDark');  // 柱头
      break;
    case BlockType.TRAPDOOR:  // 活板门：贴地薄板
      add(0.04, 0.96, 0.00, 0.16, 0.04, 0.96, 'wood');
      break;
    case BlockType.LANTERN:  // 灯笼：小吊挂
      add(0.44, 0.56, 0.90, 1.00, 0.44, 0.56, 'iron');       // 顶挂钩
      add(0.26, 0.74, 0.30, 0.88, 0.26, 0.74, 'glow');       // 发光芯
      add(0.20, 0.28, 0.28, 0.88, 0.20, 0.28, 'iron');       // 框柱4
      add(0.72, 0.80, 0.28, 0.88, 0.20, 0.28, 'iron');
      add(0.20, 0.28, 0.28, 0.88, 0.72, 0.80, 'iron');
      add(0.72, 0.80, 0.28, 0.88, 0.72, 0.80, 'iron');
      add(0.20, 0.80, 0.20, 0.30, 0.20, 0.80, 'iron');       // 底框
      add(0.20, 0.80, 0.86, 0.94, 0.20, 0.80, 'iron');       // 顶框
      break;
    default:
      if (CANDLE_COLOR[bt]) {  // 蜡烛：细蜡 + 火焰
        const ck = CANDLE_COLOR[bt];
        add(0.40, 0.60, 0.00, 0.42, 0.40, 0.60, ck);
        add(0.46, 0.54, 0.42, 0.52, 0.46, 0.54, 'candleWick');
        add(0.42, 0.58, 0.52, 0.66, 0.42, 0.58, 'glow');
      }
      return l;
  }
  return l;
}

/**
 * 扫描区块内的家具/装饰方块，返回 THREE.Group（position 已偏移到区块世界原点）。
 */
export function buildFurnitureGroup(THREE, chunk, wx0, wz0) {
  const boxes = [];

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const bt = chunk.getBlock(x, y, z);
        const parts = partsFor(bt);
        if (!parts || parts.length === 0) continue;

        // 朝向旋转（绕方块中心）
        const dir = DIRECTIONAL.has(bt) ? chunk.getFurnDir(x, y, z) : 0;
        const rot = World.furnDirRotY(dir);
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const cx = x + 0.5, cz = z + 0.5;
        const rotXZ = (u, w) => {
          const dx = u - cx, dz = w - cz;
          return [cx + dx * cos - dz * sin, cz + dx * sin + dz * cos];
        };

        for (const p of parts) {
          const [rx0, rz0] = rotXZ(x + p.x0, z + p.z0);
          const [rx1, rz1] = rotXZ(x + p.x1, z + p.z1);
          boxes.push({
            x: (Math.min(rx0, rx1) + Math.max(rx0, rx1)) / 2,
            y: y + (p.y0 + p.y1) / 2,
            z: (Math.min(rz0, rz1) + Math.max(rz0, rz1)) / 2,
            sx: Math.abs(rx1 - rx0) || 0.02,
            sy: Math.max(p.y1 - p.y0, 0.02),
            sz: Math.abs(rz1 - rz0) || 0.02,
            color: p.color,
          });
        }
      }
    }
  }

  if (boxes.length === 0) return null;

  const byColor = new Map();
  for (const b of boxes) {
    if (!byColor.has(b.color)) byColor.set(b.color, []);
    byColor.get(b.color).push(b);
  }

  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const [color, list] of byColor) {
    const mat = new THREE.MeshLambertMaterial({ color });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const dummy = new THREE.Object3D();
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.set(b.sx, b.sy, b.sz);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    group.add(im);
  }
  group.position.set(wx0, 0, wz0);
  return group;
}
