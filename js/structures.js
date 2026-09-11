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
import { BlockType, CHUNK_HEIGHT, SEA_LEVEL } from './voxel.js?v=20260925l';

// 家园坐标中心（世界原点），出生点在家园南侧空地
export const HOME_CX = 0;
export const HOME_CZ = 0;
export const HOME_GROUND_Y = 26;      // 平整后的草地高度
export const PLAYER_SPAWN = { x: 0.5, y: HOME_GROUND_Y + 2, z: 27.5 };

// 出生点核心地标坐标：WELCOME 粉色拱门与樱花风车房都在出生点正前方（南侧广场）。
// 玩家出生在拱门以南、面朝北（yaw=π），穿过拱门正对樱花风车房。
export const SPAWN_ARCH_Z = HOME_CZ + 24;   // 粉色 WELCOME 拱门所在行
export const SPAWN_WINDMILL_Z = HOME_CZ + 13; // 樱花风车房（拱门内、正对玩家）

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

    // ---------- 2. 新手之家（小木屋，移到东侧侧翼，把正前方让给樱花风车房主景观） ----------
    this._buildHouse(cx + 12, cz - 16, Y);

    // ---------- 3. 小牧场（围栏围合，动物由 game.js 生成），位于 +x 更外侧 ----------
    const pen = { x: cx + 20, z: cz - 2 };
    this._buildPen(pen.x, pen.z, Y, 9, 7);

    // ---------- 4. 池塘 + 小桥 + 凉亭（-x 方向） ----------
    this._buildPond(cx - 20, cz + 8, Y, 7);
    this._buildPavilion(cx - 21, cz - 12, Y);

    // ---------- 5. 彩色花田（出生点周围，建筑区以外） ----------
    this._plantFlowers(cx, cz, Y);

    // ---------- 6. 樱花树（家园边缘点缀） ----------
    this._plantCherryTrees(cx, cz, Y);

    // ---------- 7. WELCOME 欢迎拱门（出生点正前方广场入口） ----------
    this._buildWelcomeArch(cx, SPAWN_ARCH_Z, Y);

    // ---------- 8. 通往外部的小路 + 边围栏 ----------
    this._buildPath(cx, cz, Y);

    // ---------- 8.5 樱花风车房（核心主景观）：拱门内正前方，玩家一进世界穿过拱门即面对 ----------
    this.windmillSpot = this._buildWindmill(cx, SPAWN_WINDMILL_Z, Y);
    // 迎宾碎石大道：从出生点穿过拱门直通樱花风车房大门
    this._buildWindmillPath(cx, 28, SPAWN_WINDMILL_Z + 3, Y);

    // ---------- 9. 出生点清场（确保站在空气里） ----------
    const sx = PLAYER_SPAWN.x, sz = PLAYER_SPAWN.z;
    w.clearSpawnArea(sx, sz);
    // 向导兔子位置标记（由 game.js 生成动物），放在出生点旁边
    this.guideSpot = { x: cx + 3.5, y: Y, z: PLAYER_SPAWN.z - 3 };
    this.penCenter = { x: pen.x, z: pen.z };
    return { spawnX: sx, spawnZ: sz, penCenter: this.penCenter, guideSpot: this.guideSpot, windmillSpot: this.windmillSpot };
  }

  /**
   * 幂等地标补建：无论新世界还是旧存档，进入时都确保出生家园核心区有
   * 「樱花风车房 + 迎宾大道」这一主景观。已有（检测到塔身）则跳过，不会重复搭建。
   * 这样旧世界的玩家也能看到新地标。返回 windmillSpot（叶片轴坐标）或 null。
   */
  ensureWindmillLandmark() {
    const w = this.world;
    const cx = HOME_CX, cz = HOME_CZ, Y = HOME_GROUND_Y;
    // 风车核心位（与 decorateSpawn 一致：出生点正前方拱门内 z+13）
    const wx = cx, wz = SPAWN_WINDMILL_Z;
    // 检测：风车轴附近（塔身上部）是否已有樱木/木板墙体，有则视为已建
    let towerHits = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const b = w.getBlock(wx + dx, Y + 6, wz + dz);
        if (b === BlockType.CHERRY_WOOD || b === BlockType.PLANKS) towerHits++;
      }
    }
    if (towerHits >= 2) {
      // 已存在，直接返回轴坐标供叶片使用
      const R = 2, H = 11, axisY = Y + H - 3;
      return { x: wx + 0.5, y: axisY + 0.5, z: wz + R + 1.2, facing: '+z' };
    }
    // 不存在 → 补建风车房 + 迎宾大道 + 周围樱花
    const spot = this._buildWindmill(wx, wz, Y);
    this._buildWindmillPath(cx, 28, wz + 3, Y);
    return spot;
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
    // 数量加密，让一进出生区就是缤纷花田（建筑区/中央搭建空地仍然避开）
    for (let i = 0; i < 300; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 5 + Math.random() * 25;
      const x = Math.round(cx + Math.cos(ang) * rad);
      const z = Math.round(cz + Math.sin(ang) * rad);
      // 避开建筑区（家、牧场、池塘、凉亭、出生空地）与中央搭建区
      if (this._inBuilding(x, z)) continue;
      // 中央平整草地留空给小朋友搭建（半径 ~10 的核心区不撒花）
      if (Math.abs(x - HOME_CX) < 11 && Math.abs(z - HOME_CZ - 8) < 11) continue;
      if (w.getBlock(x, Y, z) !== BlockType.GRASS) continue;
      if (w.getBlock(x, Y + 1, z) !== BlockType.AIR) continue;
      const r = Math.random();
      if (r < 0.62) w.setBlockGen(x, Y + 1, z, flowers[(Math.random() * 3) | 0]);
      else if (r < 0.9) w.setBlockGen(x, Y + 1, z, BlockType.TALL_GRASS);
    }
  }

  _inBuilding(x, z) {
    // 樱花风车房（核心主景观，正前方）
    if (x >= -10 && x <= 10 && z >= -22 && z <= -6) return true;
    // 新手之家（东侧侧翼）
    if (x >= 6 && x <= 20 && z >= -24 && z <= -10) return true;
    // 牧场（东侧外缘）
    if (x >= 12 && x <= 30 && z >= -10 && z <= 6) return true;
    // 池塘+凉亭（西侧）
    if (x >= -34 && x <= -12 && z >= -18 && z <= 14) return true;
    // 出生空地
    if (Math.abs(x - HOME_CX) < 4 && Math.abs(z - HOME_CZ - 12) < 5) return true;
    return false;
  }

  _plantCherryTrees(cx, cz, Y) {
    const w = this.world;
    const spots = [[-8, 20], [12, 22], [-26, -20], [26, -22], [-20, -26], [-12, 26]];
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
    // 圆润蓬松的多层粉色花团树冠
    const setLeaf = (lx, ly, lz) => {
      if (w.getBlock(lx, ly, lz) === BlockType.AIR) w.setBlockGen(lx, ly, lz, BlockType.CHERRY_LEAVES);
    };
    const layers = [{ dy: -1, r: 3 }, { dy: 0, r: 3 }, { dy: 1, r: 2 }];
    for (const L of layers) {
      const R = L.r;
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          if (dx * dx + dz * dz > R * R) continue;
          setLeaf(x + dx, ty + L.dy, z + dz);
        }
      }
    }
    setLeaf(x, ty + 2, z);
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

  // 出生广场外圈矮围栏（南侧留拱门+出生点入口，北侧留探索出口）
  _buildPath(cx, cz, Y) {
    const w = this.world;
    // 出生广场外围一圈矮围栏（南侧拱门方向与正中央留出生点/通路开口）
    for (let a = 0; a < Math.PI * 2; a += 0.25) {
      const r = 22;
      const x = Math.round(cx + Math.cos(a) * r);
      const z = Math.round(cz + 12 + Math.sin(a) * r * 0.8);
      if (z > cz + 22) continue;            // 拱门方向留口
      if (x > cx - 4 && x < cx + 4 && z < cz + 4) continue; // 北侧探索方向留口
      // 风车所在区域不立围栏（风车 + 樱花林）
      if (x > cx - 9 && x < cx + 9 && z > cz + 5 && z < cz + 18) continue;
      if (w.getBlock(x, Y, z) === BlockType.GRASS && w.getBlock(x, Y + 1, z) === BlockType.AIR) {
        w.setBlockGen(x, Y + 1, z, BlockType.FENCE);
      }
    }
  }

  /**
   * 从家北门铺一条 3 宽碎石路，一路向北直通樱花风车房（沿途草地替换为 GRAVEL）。
   */
  _buildWindmillPath(cx, zFrom, zTo, Y) {
    const w = this.world;
    const zA = Math.min(zFrom, zTo), zB = Math.max(zFrom, zTo);
    for (let z = zA; z <= zB; z++) {
      for (let dx of [-1, 0, 1]) {
        const x = cx + dx;
        // 找到这一列的地表高度，路贴着地面铺（适应轻微起伏）
        let gy = Y;
        for (let y = Y + 6; y > Y - 6; y--) {
          const b = w.getBlock(x, y, z);
          if (b !== BlockType.AIR && b !== BlockType.TALL_GRASS && b !== BlockType.FLOWER_RED && b !== BlockType.FLOWER_YELLOW && b !== BlockType.FLOWER_WHITE && b !== BlockType.WATER) { gy = y; break; }
        }
        const top = w.getBlock(x, gy, z);
        if (top === BlockType.GRASS || top === BlockType.DIRT) {
          w.setBlockGen(x, gy, z, BlockType.GRAVEL);
        }
      }
    }
  }

  /**
   * 粉色风车磨坊地标（出生区北侧）。
   * 用樱木 + 粉色羊毛感方块（PLANKS/BRICK/CHERRY_WOOD）搭一座高塔楼 + 陡坡屋顶，
   * 正面留一个窗洞作为"风车轴"位置；转动的叶片由 game.js 的 WindmillBlades 动态渲染。
   * 返回叶片轴的世界坐标 {x,y,z}（轴在塔楼正面、朝 +z 面向出生点）。
   */
  _buildWindmill(ox, oz, Y) {
    const w = this.world;
    // 塔身为 5x5 截面、高 11 层的圆柱形（去角）
    const R = 2;            // 半径（5x5）
    const H = 11;           // 塔身高度
    const baseY = Y;
    const set = (x, y, z, b) => w.setBlockGen(ox + x, y, oz + z, b);

    // 清出建塔空地
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (let y = baseY + 1; y <= baseY + H + 8; y++) w.setBlockGen(ox + dx, y, oz + dz, BlockType.AIR);
        const surf = w.getSurfaceHeight(ox + dx, oz + dz);
        for (let y = Math.min(surf, baseY) + 1; y <= baseY; y++) {
          if (y <= baseY) w.setBlockGen(ox + dx, y, oz + dz, y === baseY ? BlockType.GRASS : BlockType.DIRT);
        }
      }
    }

    // 塔身：圆石地基 + 樱木墙，去角呈圆柱
    for (let h = 0; h < H; h++) {
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const corner = Math.abs(dx) === R && Math.abs(dz) === R;
          if (corner) continue;                       // 去角，圆润
          const isFloor = (dx === 0 && dz === 0);
          // 地基两层圆石
          let wall = h < 2 ? BlockType.COBBLESTONE : BlockType.CHERRY_WOOD;
          // 粉色横带装饰（每隔几层夹一圈 PLANKS 暖色）
          if (h === 4 || h === 8) wall = BlockType.PLANKS;
          set(dx, baseY + h, dz, wall);
        }
      }
      // 内部掏空（留墙厚 1 格），形成可进入的磨坊小屋
      for (let dx = -R + 1; dx <= R - 1; dx++) {
        for (let dz = -R + 1; dz <= R - 1; dz++) {
          if (Math.abs(dx) === R - 1 && Math.abs(dz) === R - 1) continue;
          if (h > 0) set(dx, baseY + h, dz, BlockType.AIR);
        }
      }
    }

    // 塔内地板 + 小梯子感（用 PLANKS 铺一层）
    for (let dx = -R + 1; dx <= R - 1; dx++)
      for (let dz = -R + 1; dz <= R - 1; dz++)
        if (!(Math.abs(dx) === R - 1 && Math.abs(dz) === R - 1)) set(dx, baseY + 1, dz, BlockType.PLANKS);

    // 陡坡屋顶（金字塔形，粉红/白色）：从塔尖往上收
    const roofBase = baseY + H;
    for (let layer = 0; layer <= R + 1; layer++) {
      const rr = R + 1 - layer;
      for (let dx = -rr; dx <= rr; dx++) {
        for (let dz = -rr; dz <= rr; dz++) {
          if (Math.abs(dx) === rr && Math.abs(dz) === rr) continue;
          // 交替粉/白，做出糖果条纹屋顶
          const stripe = (layer % 2 === 0) ? BlockType.BRICK : BlockType.PLANKS;
          set(dx, roofBase + layer, dz, stripe);
        }
      }
    }

    // 正面（+z，朝向出生点）开门 + 窗
    const doorZ = R;
    for (let y = 1; y <= 2; y++) set(0, baseY + y, doorZ, BlockType.AIR);
    set(0, baseY + 3, doorZ, BlockType.GLASS);
    // 风车轴窗洞：在塔身上部正面开一个圆孔，叶片轴心在这
    const axisY = baseY + H - 3;
    set(0, axisY, doorZ, BlockType.AIR);

    // 门两侧 + 窗旁挂灯笼
    set(-1, baseY + 2, doorZ, BlockType.LANTERN);
    set(1, baseY + 2, doorZ, BlockType.LANTERN);

    // 风车周围种一圈樱花树，形成"樱花林风车房"（正面朝南 +z 留通道，不挡视线和道路）
    const ring = [
      [-6, -5], [0, -7], [6, -5], [-7, 0], [7, 0],
      [-6, 4], [6, 4], [-4, -1], [4, -1],
    ];
    for (const [rx, rz] of ring) {
      this._placeCherrySapling(ox + rx, oz + rz, baseY);
    }
    // 正面（朝拱门/出生点 +z）樱花夹道：迎宾大道两侧成对种樱花树（x=±4 外，树冠不压中间 3 宽碎石路）
    const avenue = [
      [-4, 5], [4, 5], [-4, 7], [4, 7], [-5, 9], [5, 9],
    ];
    for (const [rx, rz] of avenue) {
      this._placeCherrySapling(ox + rx, oz + rz, baseY);
    }
    // 风车脚边撒一圈粉色花
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const fx = ox + Math.round(Math.cos(a) * 4);
      const fz = oz + R + 1 + Math.round(Math.sin(a) * 4);
      if (w.getBlock(fx, baseY, fz) === BlockType.GRASS && w.getBlock(fx, baseY + 1, fz) === BlockType.AIR) {
        w.setBlockGen(fx, baseY + 1, fz, (Math.random() < 0.5) ? BlockType.FLOWER_RED : BlockType.FLOWER_WHITE);
      }
    }

    // 返回叶片轴坐标（轴在塔身正面外一格、朝 +z）
    return { x: ox + 0.5, y: axisY + 0.5, z: oz + R + 1.2, facing: '+z' };
  }

  /** 在指定位置放一棵小樱花树（复用樱花树生成的简化版） */
  _placeCherrySapling(x, z, Y) {
    const w = this.world;
    const trunk = 3 + ((Math.random() * 2) | 0);
    for (let h = 1; h <= trunk; h++) w.setBlockGen(x, Y + h, z, BlockType.CHERRY_WOOD);
    const cy = Y + trunk;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = 0; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          const d = Math.abs(dx) + Math.abs(dz) + dy;
          if (d > 4) continue;
          if (dx === 0 && dz === 0 && dy === 0) continue;
          if (Math.random() < 0.25 && dy < 2) continue;
          const lx = x + dx, ly = cy + dy, lz = z + dz;
          if (w.getBlock(lx, ly, lz) === BlockType.AIR) w.setBlockGen(lx, ly, lz, BlockType.CHERRY_LEAVES);
        }
      }
    }
  }
}
