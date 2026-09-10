// js/structures.js
// 新手出生世界（固定手工布局，适合儿童玩家）：
// - 出生大平地：平整草地、无坑无水，安全
// - 新手之家：小木屋（门、床、箱子、工作台、窗户、火把）
// - 小牧场：围栏 + 友好动物（羊/兔/猪/鸡，由 game.js 生成）
// - 彩色花田、樱花树
// - 池塘 + 木拱桥 + 中式凉亭
// - WELCOME 欢迎拱门（回家入口）
// - 通往外部世界的小路 + 围栏
// 所有方块用 world.setBlockGen 写入（属于世界生成，不计入玩家改动存档）。
import { BlockType, CHUNK_HEIGHT, SEA_LEVEL } from './voxel.js?v=20260917b';

// 家园坐标中心（世界原点），出生点在家园南侧空地
export const HOME_CX = 0;
export const HOME_CZ = 0;
export const HOME_GROUND_Y = 26;      // 平整后的草地高度
export const PLAYER_SPAWN = { x: 0.5, y: HOME_GROUND_Y + 2, z: 16.5 };

export class StructureGenerator {
  constructor(world) {
    this.world = world;
  }

  /** 出生点完整家园（固定布局）。返回 {spawnX, spawnZ, penCenter:{x,z}} */
  decorateSpawn() {
    const w = this.world;
    const cx = HOME_CX, cz = HOME_CZ;
    const Y = HOME_GROUND_Y;

    // ---------- 1. 平整出生大平地（半径 30）：填坑/削坡成统一草地 ----------
    const R = 30;
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > R) continue;
        const x = cx + dx, z = cz + dz;
        const surf = w.getSurfaceHeight(x, z);
        if (surf < Y) {
          // 低洼：从 surf+1 填到 Y
          for (let y = surf + 1; y <= Y; y++) {
            w.setBlockGen(x, y, z, y === Y ? BlockType.GRASS : BlockType.DIRT);
          }
          // 清除 Y 以上悬空（水面、树叶等）
          for (let y = Y + 1; y <= Y + 6; y++) w.setBlockGen(x, y, z, BlockType.AIR);
        } else if (surf > Y) {
          // 高处：削到 Y
          for (let y = Y + 1; y <= surf + 2; y++) w.setBlockGen(x, y, z, BlockType.AIR);
          w.setBlockGen(x, Y, z, BlockType.GRASS);
        } else {
          // 正好 Y：清掉头顶水/植物以外的阻挡，确保草地
          for (let y = Y + 1; y <= Y + 4; y++) {
            const b = w.getBlock(x, y, z);
            if (b === BlockType.WATER || b === BlockType.STONE) w.setBlockGen(x, y, z, BlockType.AIR);
          }
        }
      }
    }

    // ---------- 2. 新手之家（小木屋，位于 -z 方向） ----------
    this._buildHouse(cx - 2, cz - 18, Y);

    // ---------- 3. 小牧场（围栏围合，动物由 game.js 生成），位于 +x ----------
    const pen = { x: cx + 17, z: cz - 2 };
    this._buildPen(pen.x, pen.z, Y, 9, 7);

    // ---------- 4. 池塘 + 小桥 + 凉亭（-x 方向） ----------
    this._buildPond(cx - 18, cz + 6, Y, 7);
    this._buildPavilion(cx - 18, cz - 10, Y);

    // ---------- 5. 彩色花田（出生点周围，建筑区以外） ----------
    this._plantFlowers(cx, cz, Y);

    // ---------- 6. 樱花树（家园边缘点缀） ----------
    this._plantCherryTrees(cx, cz, Y);

    // ---------- 7. WELCOME 欢迎拱门（家园南侧入口，出生点背后） ----------
    this._buildWelcomeArch(cx, cz + 24, Y);

    // ---------- 8. 通往外部的小路 + 边围栏 ----------
    this._buildPath(cx, cz, Y);

    // ---------- 9. 出生点清场（确保站在空气里） ----------
    const sx = PLAYER_SPAWN.x, sz = PLAYER_SPAWN.z;
    w.clearSpawnArea(sx, sz);
    // 向导兔子位置标记（由 game.js 生成动物）
    this.guideSpot = { x: cx + 2.5, y: Y, z: cz + 12 };
    this.penCenter = { x: pen.x, z: pen.z };
    return { spawnX: sx, spawnZ: sz, penCenter: this.penCenter, guideSpot: this.guideSpot };
  }

  // 小木屋：木板墙 + 玻璃窗 + 木门 + 砖屋顶 + 红床 + 箱子 + 工作台 + 火把
  _buildHouse(hx, hz, Y) {
    const w = this.world;
    const W = 7, D = 7;          // 外墙尺寸
    const baseY = Y;             // 地面层
    const wallH = 4;
    const x0 = hx, x1 = hx + W - 1;
    const z0 = hz, z1 = hz + D - 1;
    // 圆石地基 + 木地板
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        w.setBlockGen(x, baseY, z, BlockType.COBBLESTONE);
        w.setBlockGen(x, baseY + 1, z, BlockType.PLANKS);
      }
    }
    const floorY = baseY + 1;
    // 四面墙（木板），留门窗
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const edge = (x === x0 || x === x1 || z === z0 || z === z1);
        if (!edge) continue;
        for (let h = 1; h <= wallH; h++) {
          const yy = floorY + h;
          // 门：南墙中央
          const isDoor = (z === z1) && (x === hx + 3) && (h <= 2);
          // 窗：墙中层
          const isWindow = !isDoor &&
            ((x === x0 || x === x1) ? (z === hz + 2 || z === hz + 4) :
             (z === z0 || z === z1) ? (x === hx + 1 || x === hx + 5) : false)
            && h === 2;
          if (isDoor) continue;
          if (isWindow) { w.setBlockGen(x, yy, z, BlockType.GLASS); continue; }
          w.setBlockGen(x, yy, z, BlockType.PLANKS);
        }
      }
    }
    // 砖屋顶（双坡：中间高两侧低）
    const mid = Math.floor((x0 + x1) / 2);
    for (let i = 0; i <= Math.ceil(W / 2); i++) {
      const yy = floorY + wallH + 1 + (Math.ceil(W / 2) - i);
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        const xa = mid - i, xb = mid + i;
        if (xa >= x0 - 1) w.setBlockGen(xa, yy, z, BlockType.BRICK);
        if (xb <= x1 + 1 && xb !== xa) w.setBlockGen(xb, yy, z, BlockType.BRICK);
      }
    }
    // 室内家具：红床、箱子、工作台
    const fy = floorY + 1;
    w.setBlockGen(hx + 1, fy, hz + 1, BlockType.BED_RED);
    w.setBlockGen(hx + 2, fy, hz + 1, BlockType.BED_RED);
    w.setBlockGen(hx + W - 2, fy, hz + 1, BlockType.CHEST);
    w.setBlockGen(hx + 1, fy, hz + D - 2, BlockType.CRAFTING_TABLE);
    w.setBlockGen(hx + W - 2, fy, hz + D - 2, BlockType.FURNACE);
    // 门口与屋内火把照明
    w.setBlockGen(x0, floorY + 3, z1 + 1, BlockType.TORCH);
    w.setBlockGen(x1, floorY + 3, z1 + 1, BlockType.TORCH);
    w.setBlockGen(hx + 3, floorY + 3, hz + 3, BlockType.TORCH);
    // 门两侧灯笼
    w.setBlockGen(hx + 2, floorY + 3, z1, BlockType.LANTERN);
    w.setBlockGen(hx + 4, floorY + 3, z1, BlockType.LANTERN);
  }

  // 围栏牧场（橡木围栏围合 + 栅栏门缺口 + 草地基底）
  _buildPen(px, pz, Y, wdt, dep) {
    const w = this.world;
    const x0 = px - (wdt >> 1), x1 = px + (wdt >> 1);
    const z0 = pz - (dep >> 1), z1 = pz + (dep >> 1);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const edge = (x === x0 || x === x1 || z === z0 || z === z1);
        // 保证草地
        w.setBlockGen(x, Y, z, BlockType.GRASS);
        for (let y = Y + 1; y <= Y + 4; y++) w.setBlockGen(x, y, z, BlockType.AIR);
        if (!edge) continue;
        // 南侧中央留 2 格栅栏门
        const gate = (z === z1) && (x === px || x === px + 1);
        if (gate) continue;
        w.setBlockGen(x, Y + 1, z, BlockType.FENCE);
        w.setBlockGen(x, Y + 2, z, BlockType.FENCE);
      }
    }
    // 牧场内放一只灯笼柱照明
    w.setBlockGen(x0 + 1, Y + 1, z0 + 1, BlockType.FENCE);
    w.setBlockGen(x0 + 1, Y + 2, z0 + 1, BlockType.FENCE);
    w.setBlockGen(x0 + 1, Y + 3, z0 + 1, BlockType.LANTERN);
    // 牧场内撒几朵花
    for (let i = 0; i < 6; i++) {
      const fx = x0 + 2 + ((Math.random() * (wdt - 3)) | 0);
      const fz = z0 + 2 + ((Math.random() * (dep - 3)) | 0);
      if (w.getBlock(fx, Y + 1, fz) === BlockType.AIR)
        w.setBlockGen(fx, Y + 1, fz, [BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.FLOWER_WHITE][i % 3]);
    }
  }

  // 池塘：中心向下挖浅水池（水面严格低于岸）
  _buildPond(px, pz, Y, radius) {
    const w = this.world;
    const W = Y - 1;               // 水位
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > radius) continue;
        const x = px + dx, z = pz + dz;
        // 池床
        w.setBlockGen(x, Y, z, d < radius - 1 ? BlockType.WATER : BlockType.SAND);
        if (d < radius - 2) w.setBlockGen(x, Y - 1, z, BlockType.DIRT);
        else w.setBlockGen(x, Y - 1, z, BlockType.SAND);
        for (let y = Y + 1; y <= Y + 3; y++) w.setBlockGen(x, y, z, BlockType.AIR);
      }
    }
  }

  // 中式凉亭（复用旧样式但固定在平整地上）
  _buildPavilion(px, pz, Y) {
    const w = this.world;
    const size = 6, half = size >> 1;
    // 圆石地基
    for (let dx = -half; dx <= half; dx++)
      for (let dz = -half; dz <= half; dz++) {
        w.setBlockGen(px + dx, Y, pz + dz, BlockType.COBBLESTONE);
        for (let y = Y + 1; y <= Y + 8; y++) w.setBlockGen(px + dx, y, pz + dz, BlockType.AIR);
      }
    const postH = 4;
    const corners = [[-half + 1, -half + 1], [half - 1, -half + 1], [-half + 1, half - 1], [half - 1, half - 1]];
    for (const [ox, oz] of corners) {
      for (let h = 1; h <= postH; h++) w.setBlockGen(px + ox, Y + h, pz + oz, BlockType.SPRUCE_WOOD);
      w.setBlockGen(px + ox, Y + postH, pz + oz + (oz < 0 ? -1 : 1), BlockType.LANTERN);
    }
    // 围栏（留缺口）
    for (let dx = -half + 1; dx <= half - 1; dx++) {
      for (let dz of [-half + 1, half - 1]) {
        if (Math.abs(dx) <= 1 && dz === half - 1) continue;
        if (corners.some(c => c[0] === dx && c[1] === dz)) continue;
        w.setBlockGen(px + dx, Y + 1, pz + dz, BlockType.FENCE);
      }
    }
    // 双层翘角屋顶
    for (let layer = 0; layer < 3; layer++) {
      const ext = half + 2 - layer;
      const ry = Y + postH + 1 + layer;
      for (let dx = -ext; dx <= ext; dx++)
        for (let dz = -ext; dz <= ext; dz++) {
          const edge = Math.abs(dx) === ext || Math.abs(dz) === ext;
          if (layer === 2 && Math.abs(dx) < ext - 1 && Math.abs(dz) < ext - 1) continue;
          if (layer < 2 || edge) w.setBlockGen(px + dx, ry, pz + dz, BlockType.BRICK);
        }
    }
    // 亭内桌椅
    w.setBlockGen(px, Y + 1, pz, BlockType.TABLE_WOOD);
    w.setBlockGen(px - 2, Y + 1, pz, BlockType.CHAIR_WOOD);
    w.setBlockGen(px + 2, Y + 1, pz, BlockType.CHAIR_WOOD);
  }

  // 彩色花田
  _plantFlowers(cx, cz, Y) {
    const w = this.world;
    const flowers = [BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.FLOWER_WHITE];
    for (let i = 0; i < 140; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 4 + Math.random() * 24;
      const x = Math.round(cx + Math.cos(ang) * rad);
      const z = Math.round(cz + Math.sin(ang) * rad);
      // 避开建筑区（家、牧场、池塘、凉亭、出生空地）
      if (this._inBuilding(x, z)) continue;
      if (w.getBlock(x, Y, z) !== BlockType.GRASS) continue;
      if (w.getBlock(x, Y + 1, z) !== BlockType.AIR) continue;
      const r = Math.random();
      if (r < 0.5) w.setBlockGen(x, Y + 1, z, flowers[(Math.random() * 3) | 0]);
      else if (r < 0.7) w.setBlockGen(x, Y + 1, z, BlockType.TALL_GRASS);
    }
  }

  _inBuilding(x, z) {
    // 小屋
    if (x >= -9 && x <= 2 && z >= -25 && z <= -11) return true;
    // 牧场
    if (x >= 8 && x <= 26 && z >= -10 && z <= 6) return true;
    // 池塘+凉亭
    if (x >= -32 && x <= -10 && z >= -17 && z <= 13) return true;
    // 出生空地
    if (Math.abs(x - HOME_CX) < 4 && Math.abs(z - HOME_CZ - 12) < 5) return true;
    return false;
  }

  _plantCherryTrees(cx, cz, Y) {
    const w = this.world;
    const spots = [[-8, 18], [10, 20], [-24, -18], [24, -16], [4, -28], [-14, 26]];
    for (const [dx, dz] of spots) {
      const x = cx + dx, z = cz + dz;
      if (w.getBlock(x, Y, z) !== BlockType.GRASS) continue;
      this._cherryTree(x, z, Y);
    }
  }

  _cherryTree(x, z, Y) {
    const w = this.world;
    const trunk = 4 + ((Math.random() * 2) | 0);
    for (let h = 1; h <= trunk; h++) w.setBlockGen(x, Y + h, z, BlockType.CHERRY_WOOD);
    const ty = Y + trunk;
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = 0; dy <= 2; dy++)
        for (let dz = -2; dz <= 2; dz++) {
          const d = Math.abs(dx) + Math.abs(dz) + dy;
          if (d > 3) continue;
          const lx = x + dx, ly = ty + dy, lz = z + dz;
          if (w.getBlock(lx, ly, lz) === BlockType.AIR) w.setBlockGen(lx, ly, lz, BlockType.CHERRY_LEAVES);
        }
  }

  // WELCOME 欢迎拱门（粉色羊毛立柱 + 横梁 + 灯笼）
  _buildWelcomeArch(ax, az, Y) {
    const w = this.world;
    const H = 6;
    for (const ox of [-2, 2]) {
      for (let h = 0; h <= H; h++) w.setBlockGen(ax + ox, Y + h, az, BlockType.CHERRY_WOOD);
      w.setBlockGen(ax + ox, Y + 3, az + 1, BlockType.LANTERN);
    }
    for (let x = ax - 2; x <= ax + 2; x++) w.setBlockGen(x, Y + H, az, BlockType.CHERRY_WOOD);
    for (let x = ax - 1; x <= ax + 1; x++) w.setBlockGen(x, Y + H + 1, az, BlockType.CHERRY_LEAVES);
  }

  // 从出生点向北的小路（通往外面世界），两侧矮围栏
  _buildPath(cx, cz, Y) {
    const w = this.world;
    const pathZ = -12;      // 通往小屋方向
    for (let z = pathZ; z >= cz - 8 && z >= -40; z--) {
      // 暂不覆盖建筑
    }
    // 出生点到小屋之间铺一条沙砾小路
    for (let z = cz - 8; z >= -12; z--) {
      for (let dx of [-1, 0, 1]) {
        const x = cx + dx;
        if (w.getBlock(x, Y, z) === BlockType.GRASS) w.setBlockGen(x, Y, z, BlockType.GRAVEL);
      }
    }
    // 出生空地外圈矮围栏（北侧留路、南侧留拱门）
    for (let a = 0; a < Math.PI * 2; a += 0.25) {
      const r = 22;
      const x = Math.round(cx + Math.cos(a) * r);
      const z = Math.round(cz + 12 + Math.sin(a) * r * 0.8);
      if (z > cz + 22) continue;            // 拱门方向留口
      if (x > cx - 4 && x < cx + 4 && z < cz + 4) continue; // 小路方向留口
      if (w.getBlock(x, Y, z) === BlockType.GRASS && w.getBlock(x, Y + 1, z) === BlockType.AIR) {
        w.setBlockGen(x, Y + 1, z, BlockType.FENCE);
      }
    }
  }
}
