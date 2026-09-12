// js/structures.js
// 新手出生世界（固定手工布局，适合儿童玩家）——「开阔震撼第一眼」设计：
// - 出生大平地：开阔平整草地、无坑无水、无围栏，安全且开阔
// - 高大气派的樱花风车磨坊：位于世界原点（视线尽头），7×7 高塔 + 大风车叶片
// - 中轴视线走廊全留白：出生→风车一条 3 宽碎石迎宾道，只放低矮花草
// - 樱花树退到广场东西两侧做"画框"，不在中轴挡视线
// - 侧边一块小巧 WELCOME 木牌（不再是占满平台的大拱门）
// - 小木屋 / 牧场 / 池塘凉亭 撤到东西外侧作配景，不进第一眼正中
// 所有方块用 world.setBlockGen 写入（属于世界生成，不计入玩家改动存档）。
import { BlockType, CHUNK_HEIGHT, SEA_LEVEL } from './voxel.js?v=20260925af';

// 家园坐标中心（世界原点）。设计目标：一进世界眼前开阔，视线越过草地广场，
// 尽头正中就是高大的樱花风车磨坊在转动；樱花退到广场两侧做"画框"，中轴走廊全留白。
export const HOME_CX = 0;
export const HOME_CZ = 0;
export const HOME_GROUND_Y = 26;      // 平整后的草地高度

// 樱花风车房：高大磨坊塔楼，位于出生广场北端（视线尽头主角），门面 +z 朝出生点
export const SPAWN_WINDMILL_X = HOME_CX;
export const SPAWN_WINDMILL_Z = HOME_CZ - 6;      // 风车中心 z=-6，距出生点(z=18.5)约 24 格

// WELCOME 小木牌：放在广场西侧（侧边），不占中轴、不挡视线
export const SPAWN_SIGN_X = HOME_CX - 6;
export const SPAWN_SIGN_Z = 16;
// 美味特工基地样板房中心（广场西南外缘，不挡第一眼风车视线；整块落在 R=34 平整地内）
export const AGENT_BASE_X = HOME_CX - 17;
export const AGENT_BASE_Z = HOME_CZ + 9;

// ─────────────────────────────────────────────────────────────
// 樱花岛（独立地形地标）：被海环绕的巨大绿色环形山（火山口），
// 山顶环一圈大片樱花林，火山口中心是湖，湖边草地建梦幻樱花庄园。
// 参考 Minecraft「落樱庄园」：整体是一座樱花海中小岛 + 环形山 + 火山口湖。
// 放在出生点正北海面（z 负方向远海），从出生点朝北远眺即可看见粉色山冠。
// ─────────────────────────────────────────────────────────────
export const SAKURA_ISLAND_X = HOME_CX;          // 岛中心 x
export const SAKURA_ISLAND_Z = HOME_CZ - 180;    // 岛中心 z（正北海面）
const ISLE_R_SHELF    = 54;   // 环海浅滩外缘
const ISLE_R_BEACH    = 50;   // 沙滩/草山脚开始
const ISLE_R_OUTER    = 40;   // 草坡外壁
const ISLE_R_RIDGE    = 30;   // 环形山脊（最高、种樱花林）
const ISLE_R_INNER    = 21;   // 火山口内壁（含湖边平地）
const ISLE_LAKE_R     = 13;   // 中心火山口湖半径
const ISLE_BASE_Y     = SEA_LEVEL;   // 湖岸/山脚基准高度 = 海平面
const ISLE_RIDGE_Y    = SEA_LEVEL + 18; // 山脊高度（30 层高山，宏伟）
// 火山口湖：湖偏在岛北侧，湖湖南岸留平地建庄园
const ISLE_LAKE_DX = 0;
const ISLE_LAKE_DZ = -11;
// 樱花庄园：湖南岸平坦草地（面湖），约 17×17
const ISLE_MANOR_X = SAKURA_ISLAND_X;
const ISLE_MANOR_Z = SAKURA_ISLAND_Z + 13;
const ISLE_MANOR_Y = SEA_LEVEL + 1;   // 庄园地基（湖岸草地高度）
const ISLE_MANOR_HW = 8;              // 房屋半宽（17×17）


// 出生点：开阔平整草地南端，面朝正北（yaw=0）越过广场正对风车房（距离 ~24 格，宏伟不压迫）
export const PLAYER_SPAWN = { x: 0.5, y: HOME_GROUND_Y + 2, z: 18.5 };

export class StructureGenerator {
  constructor(world) {
    this.world = world;
  }

  /** 出生点完整家园（固定布局）。返回 {spawnX, spawnZ, penCenter:{x,z}} */
  decorateSpawn() {
    const w = this.world;
    const cx = HOME_CX, cz = HOME_CZ;
    const Y = HOME_GROUND_Y;

    // ---------- 1. 平整出生大平地（半径 34，开阔无围栏）：填坑/削坡成统一草地 ----------
    const R = 34;
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

    // ---------- 2. 配景撤到东西外侧（不进第一眼正中） ----------
    this._buildHouse(cx + 18, cz - 18, Y);           // 小木屋（东北侧翼）
    const pen = { x: cx + 22, z: cz + 6 };           // 牧场（东侧外缘）
    this._buildPen(pen.x, pen.z, Y, 9, 7);
    this._buildPond(cx - 22, cz - 10, Y, 7);         // 池塘（西北）
    this._buildPavilion(cx - 24, cz - 20, Y);        // 凉亭（西北外）
    // 美味特工基地样板房（三间房：休息室/汉堡厨房/展示厅），广场西南外缘，不挡第一眼风车
    this._buildAgentBase(AGENT_BASE_X - 10, AGENT_BASE_Z, Y);

    // ---------- 3. 樱花风车磨坊（高大气派，世界原点 = 视线尽头主角） ----------
    this.windmillSpot = this._buildWindmill(SPAWN_WINDMILL_X, SPAWN_WINDMILL_Z, Y);

    // ---------- 4. 中轴视线走廊留白：出生 → 风车一条 3 宽碎石迎宾道（引导线） ----------
    this._buildWindmillPath(cx, Math.round(PLAYER_SPAWN.z), SPAWN_WINDMILL_Z + 4, Y);

    // ---------- 5. 樱花退到广场东西两侧做"画框"（中轴 x±5 内一棵都不放） ----------
    this._buildCherryRows(cx, cz, Y);
    this._plantCherryTrees(cx, cz, Y);                    // 广场外缘四角再点缀（远景层次）

    // ---------- 6. 彩色花田（广场两侧 + 走廊只放低矮花草，建筑区/中轴避开） ----------
    this._plantFlowers(cx, cz, Y);

    // ---------- 7. 侧边小巧 WELCOME 木牌（广场西侧，不占中轴、不挡视线） ----------
    this._buildWelcomeSign(SPAWN_SIGN_X, SPAWN_SIGN_Z, Y);

    // ---------- 7b. 樱花岛（正北海面：环形山 + 火山口湖 + 山顶樱花林 + 湖边樱花庄园） ----------
    // 纯地形装饰：通过区块装饰钩子注入，玩家朝北航行/走到时区块生成即自然出现
    this.world.chunkDecorator = (chunk) => this.decorateSakuraIslandChunk(chunk);

    // ---------- 8. 出生点清场（确保站在空气里） ----------
    const sx = PLAYER_SPAWN.x, sz = PLAYER_SPAWN.z;
    w.clearSpawnArea(sx, sz);
    // 向导兔子位置标记（由 game.js 生成动物），放在出生点东侧边缘，不挡正前方视线
    this.guideSpot = { x: cx + 4.5, y: Y, z: PLAYER_SPAWN.z - 4 };
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
    // 旧版布局（风车在 z=0/z=13、拱门在 z=24）可能挡在出生点与新风车（z=-6）之间，先幂等清理
    this._clearLegacySpawnLayout(w, Y);
    // 新风车核心位（出生广场北端，高大气派）
    const wx = SPAWN_WINDMILL_X, wz = SPAWN_WINDMILL_Z;
    // 检测：塔身上部是否已有樱木/木板/圆石墙体，有则视为已建
    let towerHits = 0;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const b = w.getBlock(wx + dx, Y + 10, wz + dz);
        if (b === BlockType.CHERRY_WOOD || b === BlockType.PLANKS || b === BlockType.COBBLESTONE) towerHits++;
      }
    }
    if (towerHits >= 4) {
      // 已存在，直接返回轴坐标供叶片使用（轴窗在 Y+10、门墙在 dz=3）
      return { x: wx + 0.5, y: Y + 10 + 0.5, z: wz + 3 + 1.4, facing: '+z', scale: 1.45 };
    }
    // 不存在 → 补建高大风车房 + 迎宾道 + 两侧樱花
    const spot = this._buildWindmill(wx, wz, Y);
    this._buildWindmillPath(cx, Math.round(PLAYER_SPAWN.z), wz + 4, Y);
    this._buildCherryRows(cx, cz, Y);
    // 补建美味特工基地样板房（检测是否已有浅粉陶瓦外墙，无则建）
    this.ensureAgentBase();
    return spot;
  }

  /**
   * 幂等补建「美味特工基地」样板房。检测基地区域是否已有浅粉/浅橙陶瓦外墙，
   * 已有则跳过，避免重复搭建。旧世界玩家进入出生家园时也能看到。
   */
  ensureAgentBase() {
    const w = this.world;
    const Y = HOME_GROUND_Y;
    const ox = AGENT_BASE_X - 10, oz = AGENT_BASE_Z;
    let wallHits = 0;
    for (let dx = 0; dx <= 19; dx += 3) {
      const b = w.getBlock(ox + dx, Y + 3, oz - 4);
      if (b === BlockType.TERRACOTTA_PINK || b === BlockType.TERRACOTTA_ORANGE
        || b === BlockType.GLASS_PINK || b === BlockType.GLASS_BLUE || b === BlockType.GLASS_YELLOW) wallHits++;
    }
    if (wallHits >= 3) return; // 已建
    this._buildAgentBase(ox, oz, Y);
  }

  /**
   * 清理旧版出生布局（风车曾在 z=13、拱门在 z=24）。
   * 仅在检测到"人造结构块悬空在地面 Y 之上"时才把该列削回草地，
   * 不触碰天然地形/矿石/水，因此对新世界或已清理过的世界是幂等无害的。
   */
  _clearLegacySpawnLayout(w, Y) {
    const artificial = new Set([
      BlockType.CHERRY_WOOD, BlockType.PLANKS, BlockType.COBBLESTONE, BlockType.BRICK,
      BlockType.GLASS, BlockType.LANTERN, BlockType.CHERRY_LEAVES, BlockType.FENCE, BlockType.DOOR,
    ]);
    // 历代旧风车/拱门区：z=0 版风车(x±4,z -4..6)、z=13 版风车(z 8..18)、大拱门(z 22..27)
    const zones = [
      { x0: -6, x1: 6, z0: -5, z1: 7 },
      { x0: -5, x1: 5, z0: 8, z1: 18 },
      { x0: -4, x1: 4, z0: 22, z1: 27 },
    ];
    for (const Z of zones) {
      for (let x = Z.x0; x <= Z.x1; x++) {
        for (let z = Z.z0; z <= Z.z1; z++) {
          let hasArtificial = false;
          for (let y = Y + 1; y <= Y + 26; y++) {
            if (artificial.has(w.getBlock(x, y, z))) { hasArtificial = true; break; }
          }
          if (!hasArtificial) continue;
          // 该列有旧建筑：削除 Y 以上方块，把地面恢复成草地
          for (let y = Y + 1; y <= Y + 26; y++) w.setBlockGen(x, y, z, BlockType.AIR);
          if (w.getBlock(x, Y, z) === BlockType.AIR) w.setBlockGen(x, Y, z, BlockType.GRASS);
        }
      }
    }
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

  // 彩色花田：铺满开阔草地（建筑区、风车、中轴碎石道避开）；中轴走廊只放低矮花草
  _plantFlowers(cx, cz, Y) {
    const w = this.world;
    const flowers = [BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.FLOWER_WHITE];
    for (let i = 0; i < 360; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 4 + Math.random() * 32;
      const x = Math.round(cx + Math.cos(ang) * rad);
      const z = Math.round(cz + Math.sin(ang) * rad);
      if (this._inBuilding(x, z)) continue;
      // 中轴碎石迎宾道（x±2，z 风车南门→出生点）不撒花，保持路面干净
      if (Math.abs(x - HOME_CX) <= 2 && z >= SPAWN_WINDMILL_Z + 4 && z <= Math.round(PLAYER_SPAWN.z)) continue;
      if (w.getBlock(x, Y, z) !== BlockType.GRASS) continue;
      if (w.getBlock(x, Y + 1, z) !== BlockType.AIR) continue;
      const r = Math.random();
      if (r < 0.6) w.setBlockGen(x, Y + 1, z, flowers[(Math.random() * 3) | 0]);
      else if (r < 0.9) w.setBlockGen(x, Y + 1, z, BlockType.TALL_GRASS);
    }
  }

  _inBuilding(x, z) {
    // 高大风车磨坊 + 门廊（中心 z=-6）
    if (x >= -10 && x <= 10 && z >= -13 && z <= 1) return true;
    // 小木屋（东北侧翼）
    if (x >= 12 && x <= 30 && z >= -28 && z <= -12) return true;
    // 牧场（东侧外缘）
    if (x >= 16 && x <= 33 && z >= 0 && z <= 14) return true;
    // 池塘 + 凉亭（西北）
    if (x >= -34 && x <= -16 && z >= -28 && z <= -2) return true;
    // WELCOME 小木牌（西侧）
    if (x >= -9 && x <= -4 && z >= 13 && z <= 19) return true;
    // 出生点落脚空地（保证站在干净草地上）
    if (Math.abs(x - HOME_CX) < 3 && Math.abs(z - Math.round(PLAYER_SPAWN.z)) < 4) return true;
    return false;
  }

  // 家园边缘点缀樱花（撤到广场外四角，不进第一眼画面）
  _plantCherryTrees(cx, cz, Y) {
    const w = this.world;
    const spots = [[-28, 22], [28, 24], [-26, -30], [26, -30], [16, -30], [-16, 30]];
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

  // 小巧 WELCOME 木牌（花园指示牌式，放在侧边，不挡中轴视线）
  _buildWelcomeSign(sx, sz, Y) {
    const w = this.world;
    const post = (px) => { for (let y = 1; y <= 3; y++) w.setBlockGen(px, Y + y, sz, BlockType.PLANKS); };
    post(sx); post(sx + 2);
    // 牌面 3 宽 × 2 高（暖木底 + 粉色压顶）
    for (let x = sx; x <= sx + 2; x++) {
      w.setBlockGen(x, Y + 3, sz, BlockType.PLANKS);
      w.setBlockGen(x, Y + 4, sz, BlockType.PLANKS);
    }
    for (let x = sx; x <= sx + 2; x++) w.setBlockGen(x, Y + 5, sz, BlockType.BRICK);
    w.setBlockGen(sx + 1, Y + 6, sz, BlockType.CHERRY_LEAVES);
    w.setBlockGen(sx + 3, Y + 3, sz, BlockType.LANTERN);
  }

  // 樱花画框：沿广场东西两侧成对种樱花（中轴 x±5 内一棵不放，保证视线通透）
  _buildCherryRows(cx, cz, Y) {
    const w = this.world;
    const rows = [
      [-8, 2], [8, 2], [-9, 10], [9, 10], [-8, 17], [8, 17],   // 出生→风车走廊两侧画框
      [-6, -8], [6, -8], [-7, -2], [7, -2],                      // 风车房两侧环绕
    ];
    for (const [dx, dz] of rows) {
      const x = cx + dx, z = cz + dz;
      if (w.getBlock(x, Y, z) === BlockType.GRASS) this._cherryTree(x, z, Y);
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
   * 高大气派的樱花风车磨坊（世界原点、视线尽头主角）。
   * 7×7 截面、13 层高的圆柱形塔楼 + 金字塔粉色坡屋顶；正面(+z)开门窗，
   * 上部高挂大风车叶片轴；转动的叶片由 game.js 的 WindmillBlades(scale 1.45) 渲染。
   * 返回叶片轴世界坐标 {x,y,z,scale}（轴在塔楼正面、朝 +z 面向出生点）。
   */
  _buildWindmill(ox, oz, Y) {
    const w = this.world;
    const R = 3;            // 半径（7×7）
    const H = 13;           // 塔身高度（高大气派）
    const baseY = Y;
    const set = (x, y, z, b) => w.setBlockGen(ox + x, y, oz + z, b);
    const inFootprint = (dx, dz) => (dx * dx + dz * dz) <= R * R;       // 圆柱底（去角）
    const isWallRing = (dx, dz) => inFootprint(dx, dz) &&
      (!inFootprint(dx, dz - 1) || !inFootprint(dx, dz + 1) || !inFootprint(dx - 1, dz) || !inFootprint(dx + 1, dz));

    // 清出建塔空地（含屋顶 + 叶片高度）
    for (let dx = -R - 3; dx <= R + 3; dx++) {
      for (let dz = -R - 3; dz <= R + 3; dz++) {
        for (let y = baseY + 1; y <= baseY + H + 12; y++) w.setBlockGen(ox + dx, y, oz + dz, BlockType.AIR);
        const surf = w.getSurfaceHeight(ox + dx, oz + dz);
        for (let y = Math.min(surf, baseY) + 1; y <= baseY; y++) {
          w.setBlockGen(ox + dx, y, oz + dz, y === baseY ? BlockType.GRASS : BlockType.DIRT);
        }
      }
    }

    // 地基：圆柱范围内两层圆石（坚实台基，进入有一级台阶）
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        if (inFootprint(dx, dz)) {
          set(dx, baseY, dz, BlockType.COBBLESTONE);
          set(dx, baseY + 1, dz, BlockType.COBBLESTONE);
        }
      }
    }

    // 塔身墙环：圆石台基 + 樱木墙，去角呈圆柱；内部留空
    for (let h = 2; h <= H; h++) {
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          if (!isWallRing(dx, dz)) continue;
          // 樱木墙，第 6/10/13 层夹暖色 PLANKS 横带，层次大气
          let wall = BlockType.CHERRY_WOOD;
          if (h === 6 || h === 10 || h === 13) wall = BlockType.PLANKS;
          set(dx, baseY + h, dz, wall);
        }
      }
    }

    // 塔内木地板（一层），形成可进入的磨坊小屋
    for (let dx = -R + 1; dx <= R - 1; dx++) {
      for (let dz = -R + 1; dz <= R - 1; dz++) {
        if (inFootprint(dx, dz)) set(dx, baseY + 2, dz, BlockType.PLANKS);
      }
    }

    // 金字塔坡屋顶（粉色糖果条纹），从塔尖向上收成尖
    const roofBase = baseY + H + 1;
    for (let layer = 0; layer <= R; layer++) {
      const rr = R - layer;
      for (let dx = -rr; dx <= rr; dx++) {
        for (let dz = -rr; dz <= rr; dz++) {
          if (Math.abs(dx) === rr && Math.abs(dz) === rr && rr > 0) continue;
          if (dx * dx + dz * dz > rr * rr) continue;
          const stripe = (layer % 2 === 0) ? BlockType.BRICK : BlockType.PLANKS;
          set(dx, roofBase + layer, dz, stripe);
        }
      }
    }
    // 尖顶装饰：金灯笼
    set(0, roofBase + R + 1, 0, BlockType.LANTERN);

    // 正面（+z，朝向出生点）门 + 两侧窗 + 高挂大风车轴窗
    const doorZ = R;
    for (let y = 2; y <= 4; y++) set(0, baseY + y, doorZ, BlockType.AIR);   // 高 3 格的大门
    set(-1, baseY + 3, doorZ, BlockType.LANTERN);
    set(1, baseY + 3, doorZ, BlockType.LANTERN);
    set(-2, baseY + 4, doorZ, BlockType.GLASS);
    set(2, baseY + 4, doorZ, BlockType.GLASS);
    // 风车叶片轴心窗：塔身上部正面
    const axisY = baseY + 10;
    set(0, axisY, doorZ, BlockType.AIR);

    // 风车脚边撒一点粉色花（少量，不挡正门）
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = 4; dz <= 6; dz++) {
        if (Math.abs(dx) >= 2 && w.getBlock(ox + dx, baseY, oz + dz) === BlockType.GRASS
            && w.getBlock(ox + dx, baseY + 1, oz + dz) === BlockType.AIR) {
          w.setBlockGen(ox + dx, baseY + 1, oz + dz, (Math.random() < 0.5) ? BlockType.FLOWER_RED : BlockType.FLOWER_WHITE);
        }
      }
    }

    // 返回叶片轴坐标（轴在塔身正面外、朝 +z），scale 放大叶片让大风车更气派
    return { x: ox + 0.5, y: axisY + 0.5, z: oz + R + 1.4, facing: '+z', scale: 1.45 };
  }

  /**
   * 「美味特工基地」样板房（三间房横向相连）：
   *   左 = 特工休息室、中 = 汉堡制作厨房、右 = 展示大厅。
   * 用新增道具方块布置：染色玻璃落地窗、灯笼/蜡烛/吸顶灯照明、
   * 木板/半砖/活板门家具、箱子/木桶/讲台/制图台/织布机/展示框、
   * 花盆栽/甜浆果/苔藓装饰、汉堡薯条糖蜂蜜甜品主题。
   * 结构简单、方块整齐、灯光温暖明亮，无怪物，适合 8 岁小朋友照着在《我的世界》里搭。
   * 建造在出生广场西侧（x≈-18），与小木屋/牧场分居、不挡第一眼风车视线。
   */
  _buildAgentBase(ox, oz, Y) {
    const w = this.world;
    const B = BlockType;
    // 房间布局：三间房各 6 宽（含 1 隔墙），共 W=20、深 D=9（z 从 -4..4）
    // 房间 x 范围：休息室 ox..ox+5 ；厨房 ox+7..ox+12 ；展示厅 ox+14..ox+19
    const W = 20, D = 9;              // 外墙外缘尺寸
    const x0 = ox, x1 = ox + W - 1;   // x 方向外墙
    const z0 = oz - 4, z1 = oz + 4;   // z 方向外墙
    const wallH = 4;                  // 墙高（Y+1..Y+4），屋顶在 Y+5
    const put = (x, y, z, t, d = -1) => w.setBlockGen(x, y, z, t, d);
    const isAirOrPlant = (x, y, z) => {
      const b = w.getBlock(x, y, z);
      return b === B.AIR || b === B.TALL_GRASS || b === B.FLOWER_RED
        || b === B.FLOWER_YELLOW || b === B.FLOWER_WHITE || b === B.GRASS;
    };

    // ---- 1. 平整地基（浅粉陶瓦外墙地面打底，房间内铺橡木半砖/木板） ----
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        // 确保地面齐平到 Y
        for (let y = Y + 1; y <= Y + 5; y++) if (!isAirOrPlant(x, y, z)) put(x, y, z, B.AIR);
        put(x, Y, z, B.GRASS);
      }
    }

    // ---- 2. 四面外墙（浅粉陶瓦为主，浅橙陶瓦点缀墙角/腰线；落地窗位置留空放染色玻璃） ----
    // 房间分隔墙 x 坐标
    const sep1 = ox + 6, sep2 = ox + 13;
    // 房间门洞（隔墙开 2 宽通道）与入户门（南墙 z1）
    const doorZ = z1; // 南面入户
    const entryX = ox + 9; // 厨房正中入户
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const onPerim = (x === x0 || x === x1 || z === z0 || z === z1);
        const onSep = (x === sep1 || x === sep2);
        if (!onPerim && !onSep) continue;
        for (let y = 1; y <= wallH; y++) {
          // 隔墙门洞：每堵分隔墙在中部留 2 宽开口
          if (onSep && z >= oz - 1 && z <= oz && y <= 2) { put(x, Y + y, z, B.AIR); continue; }
          // 南墙入户门（2 高开口）
          if (z === doorZ && (x === entryX || x === entryX + 1) && y <= 2) { put(x, Y + y, z, B.AIR); continue; }
          // 落地窗：南/北墙各房间开 3 宽 × 2 高玻璃窗（y=2..3）
          const windowSet = [
            [ox + 2, ox + 4], [ox + 9, ox + 11], [ox + 16, ox + 18], // 南/北对齐
          ];
          let isWin = false, winColor = B.GLASS_PINK;
          for (let r = 0; r < 3; r++) {
            const [wa, wb] = windowSet[r];
            if ((z === z0 || z === z1) && x >= wa && x <= wb && (y === 2 || y === 3)) { isWin = true; winColor = [B.GLASS_BLUE, B.GLASS_YELLOW, B.GLASS_PINK][r]; }
          }
          if (isWin) { put(x, Y + y, z, winColor); continue; }
          // 墙体质感：腰线 y=2 用浅橙陶瓦，其余浅粉陶瓦，墙角与立柱用浅橙
          const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
          const pillar = onSep && (z === z0 || z === z1);
          let t = B.TERRACOTTA_PINK;
          if (y === 2 || corner || pillar) t = B.TERRACOTTA_ORANGE;
          put(x, Y + y, z, t);
        }
      }
    }

    // ---- 3. 地板：房间内铺木板（休息室白桦木板→用白桦木色 PLANKS，厨房用 SLAB 半砖，展示厅蜂蜜块点缀） ----
    for (let x = x0 + 1; x <= x1 - 1; x++) {
      for (let z = z0 + 1; z <= z1 - 1; z++) {
        if (x === sep1 || x === sep2) continue;
        let floor = B.PLANKS;
        if (x >= ox + 7 && x <= ox + 12) floor = B.SLAB;       // 厨房半砖地板
        else if (x >= ox + 14 && x <= ox + 19) floor = (z === oz) ? B.HONEY_BLOCK : B.PLANKS; // 展示厅中央蜜块地毯
        put(x, Y, z, floor);
      }
    }

    // ---- 4. 屋顶：外围一圈浅橙陶瓦压顶 + 中央红石吸顶灯/萤石吊顶 ----
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const onPerim = (x === x0 || x === x1 || z === z0 || z === z1);
        if (onPerim) { put(x, Y + wallH + 1, z, B.TERRACOTTA_ORANGE); continue; }
        // 室内吊顶：默认木板，三个房间中心放吸顶灯
        const roomCx = [ox + 2, ox + 9, ox + 16][ Math.floor((x - ox) / 7) ] || ox + 2;
        if (Math.abs(x - roomCx) <= 0 && Math.abs(z - oz) <= 0) {
          put(x, Y + wallH + 1, z, (x === ox + 9) ? B.GLOWSTONE : B.REDSTONE_LAMP);
        } else {
          put(x, Y + wallH + 1, z, B.PLANKS);
        }
      }
    }

    // ---------- 房间 1：特工休息室（x ox..ox+5） ----------
    const lounge = (lx, ly, lz, t) => put(ox + lx, Y + ly, oz + lz, t);
    // 四张彩色床（靠北墙并排，床头贴北墙→正面朝北 dir=2）
    lounge(1, 1, -3, B.BED_RED, 2); lounge(2, 1, -3, B.BED_BLUE, 2);
    lounge(4, 1, -3, B.BED_GREEN, 2); lounge(5, 1, -3, B.BED_YELLOW, 2);
    // 红沙发待客区（靠南窗，背靠南→正面朝南 dir=0）
    lounge(1, 1, 3, B.SOFA_RED, 0); lounge(2, 1, 3, B.SOFA_RED, 0);
    // 木桌 + 木椅（椅子靠桌子，椅背靠北/南）
    lounge(3, 1, 0, B.TABLE_WOOD); lounge(4, 1, 0, B.TABLE_WOOD);
    lounge(3, 2, 0, B.LANTERN);            // 桌面台灯
    lounge(2, 1, 0, B.CHAIR_WOOD, 2); lounge(5, 1, 0, B.CHAIR_WOOD, 0);
    // 书架 + 钟（西墙）
    lounge(0, 2, -1, B.BOOKSHELF); lounge(0, 3, -1, B.BOOKSHELF);
    lounge(0, 3, 1, B.CLOCK_BLOCK);
    // 彩色蜡烛（窗台装饰）
    lounge(2, 3, -4, B.CANDLE_PINK); lounge(3, 3, -4, B.CANDLE_BLUE);

    // ---------- 房间 2：汉堡制作厨房（x ox+7..ox+12，相对 ox+7） ----------
    const kit = (lx, ly, lz, t) => put(ox + 7 + lx, Y + ly, oz + lz, t);
    // 沿北墙操作台：工作台 + 熔炉 + 制图台 + 织布机
    kit(0, 1, -3, B.CRAFTING_TABLE); kit(1, 1, -3, B.FURNACE);
    kit(3, 1, -3, B.CARTOGRAPHY); kit(4, 1, -3, B.LOOM);
    // 食材储物：木桶 + 箱子（南墙）
    kit(0, 1, 3, B.BARREL); kit(1, 1, 3, B.CHEST); kit(2, 1, 3, B.BARREL);
    // 料理台：半砖台面 + 活板门（北墙前一排）
    kit(2, 1, -2, B.SLAB); kit(3, 1, -2, B.SLAB); kit(4, 1, -2, B.TRAPDOOR);
    // 海晶灯冷光操作台照明 + 灯笼
    kit(2, 3, -2, B.SEA_LANTERN); kit(0, 2, 0, B.LANTERN);
    // 甜品食材展示：汉堡、薯条、糖块、蜂蜜、蜜脾堆在中央台
    kit(2, 2, 0, B.BURGER); kit(3, 2, 0, B.FRIES); kit(4, 2, 0, B.SUGAR);
    kit(2, 1, 1, B.HONEY_BLOCK); kit(3, 1, 1, B.HONEYCOMB); kit(4, 1, 1, B.HONEYCOMB);
    // 黄蜡烛窗台
    kit(3, 3, -4, B.CANDLE_YELLOW);

    // ---------- 房间 3：展示大厅（x ox+14..ox+19，相对 ox+14） ----------
    const hall = (lx, ly, lz, t) => put(ox + 14 + lx, Y + ly, oz + lz, t);
    // 美食展示框墙（北墙 y=2 一排物品展示框，框里是汉堡/薯条/糖/蜂蜜）
    const frames = [B.BURGER, B.FRIES, B.SUGAR, B.HONEY_BLOCK, B.HONEYCOMB];
    for (let i = 0; i < 5; i++) hall(i, 2, -4, B.ITEM_FRAME);
    // 展示框前的半砖展台，摆对应甜品
    for (let i = 0; i < 5; i++) hall(i, 1, -3, frames[i]);
    // 讲台（任务发布台）+ 木桶 + 箱子（南墙）
    hall(0, 1, 3, B.LECTERN); hall(1, 1, 3, B.CHEST); hall(4, 1, 3, B.BARREL); hall(5, 1, 3, B.BARREL);
    // 苔藓块 + 杜鹃叶 + 花盆栽 + 甜浆果丛 点缀（展示厅角落绿化角）
    hall(5, 1, -1, B.MOSS_BLOCK); hall(5, 2, -1, B.AZALEA_LEAVES);
    hall(0, 1, 1, B.FLOWER_POT); hall(5, 1, 2, B.FLOWER_POT);
    hall(4, 1, -2, B.SWEET_BERRY);
    // 展示厅吸顶红灯已在屋顶；加两盏灯笼对称
    hall(1, 3, 0, B.LANTERN); hall(4, 3, 0, B.LANTERN);

    // ---------- 5. 门前栅栏小花园 + 灯笼引路 ----------
    for (let i = -1; i <= 1; i++) {
      const gx = entryX + 1 + i;
      put(gx, Y, doorZ + 1, B.GRAVEL);
      put(gx, Y, doorZ + 2, B.GRAVEL);
    }
    put(entryX - 1, Y + 1, doorZ + 1, B.FENCE); put(entryX - 1, Y + 2, doorZ + 1, B.LANTERN);
    put(entryX + 3, Y + 1, doorZ + 1, B.FENCE); put(entryX + 3, Y + 2, doorZ + 1, B.LANTERN);
    // 房前两侧樱花 + 甜浆果绿化
    this._placeCherrySapling(x0 - 2, z0, Y);
    this._placeCherrySapling(x1 + 2, z0, Y);

    return { x: ox + Math.floor(W / 2), z: oz };
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

  // ═══════════════════════════════════════════════════════════════
  //  樱花岛：独立环形山岛屿地形 + 火山口湖 + 山顶樱花林 + 湖边樱花庄园
  // ═══════════════════════════════════════════════════════════════

  // 平滑插值
  _lerp(a, b, t) { return a + (b - a) * t; }
  _smooth(t) { return t * t * (3 - 2 * t); }

  // 确定性伪随机（按世界坐标哈希），保证各区块生成结果一致
  _isleRand(wx, wz, seed) {
    let h = (wx * 374761393 + wz * 668265263 + seed * 982451653) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return ((h >>> 0) % 10000) / 10000;
  }

  // 环形山剖面：给定到岛中心的水平距离 d，返回该列地表高度（topY）与是否水域
  _isleColumn(d) {
    const B = BlockType;
    // 火山口湖底（d < LAKE_R）：湖底较低，上方填水
    if (d < ISLE_LAKE_R) {
      // 湖底略呈碗底（中心最低）
      const t = d / ISLE_LAKE_R;
      const floorY = (SEA_LEVEL - 4 + Math.round(t * t * 2)); // 海平下 4~2
      return { top: floorY, water: true, surface: B.SAND, sub: B.DIRT };
    }
    // 湖岸平台（LAKE_R ~ INNER）：平坦草地，建庄园、铺沙岸
    if (d < ISLE_R_INNER) {
      return { top: SEA_LEVEL + 1, water: false, surface: B.GRASS, sub: B.DIRT };
    }
    // 火山口内壁（INNER ~ RIDGE）：草坡爬升到山脊
    if (d < ISLE_R_RIDGE) {
      const t = this._smooth((d - ISLE_R_INNER) / (ISLE_R_RIDGE - ISLE_R_INNER));
      const top = Math.round(this._lerp(SEA_LEVEL + 1, ISLE_RIDGE_Y, t));
      return { top, water: false, surface: B.GRASS, sub: B.DIRT };
    }
    // 环形山脊（RIDGE ~ RIDGE+4）：山顶平缓平台，种樱花林
    if (d < ISLE_R_RIDGE + 4) {
      return { top: ISLE_RIDGE_Y, water: false, surface: B.GRASS, sub: B.DIRT };
    }
    // 草坡外壁（RIDGE+4 ~ OUTER）：从山脊降到海边
    if (d < ISLE_R_OUTER) {
      const t = this._smooth((d - (ISLE_R_RIDGE + 4)) / (ISLE_R_OUTER - (ISLE_R_RIDGE + 4)));
      const top = Math.round(this._lerp(ISLE_RIDGE_Y, SEA_LEVEL + 1, t));
      return { top, water: false, surface: B.GRASS, sub: B.DIRT };
    }
    // 沙滩环带（OUTER ~ BEACH）：草山脚到沙滩
    if (d < ISLE_R_BEACH) {
      const t = this._smooth((d - ISLE_R_OUTER) / (ISLE_R_BEACH - ISLE_R_OUTER));
      const top = Math.round(this._lerp(SEA_LEVEL + 1, SEA_LEVEL - 1, t));
      return { top, water: false, surface: B.SAND, sub: B.SAND };
    }
    // 环海浅滩（BEACH ~ SHELF）：水下沙洲，确保整岛被海环绕
    if (d < ISLE_R_SHELF) {
      return { top: SEA_LEVEL - 2, water: true, surface: B.SAND, sub: B.SAND };
    }
    // 岛外深海：不动（原生海洋地形）
    return null;
  }

  /**
   * 樱花岛区块装饰钩子：每个区块首次生成地形时调用。
   * 分两趟：①堆地形（山/湖/海/表面）；②山顶种树、湖边盖庄园（基于最终 topY）。
   */
  decorateSakuraIslandChunk(chunk) {
    const B = BlockType;
    const wx0 = chunk.cx * 16, wz0 = chunk.cz * 16;
    // 快速剔除：与岛范围（含外围浅滩）无交集则跳过
    const pad = 6;
    if (wx0 + 15 < SAKURA_ISLAND_X - ISLE_R_SHELF - pad || wx0 > SAKURA_ISLAND_X + ISLE_R_SHELF + pad) return;
    if (wz0 + 15 < SAKURA_ISLAND_Z - ISLE_R_SHELF - pad || wz0 > SAKURA_ISLAND_Z + ISLE_R_SHELF + pad) return;

    // ── 第一趟：地形 ──
    const topMap = new Int16Array(256).fill(-1); // 记录每列最终地表高度供第二趟
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        const dx = wx - SAKURA_ISLAND_X, dz = wz - SAKURA_ISLAND_Z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const col = this._isleColumn(d);
        if (!col) continue;
        const top = col.top;
        topMap[lz * 16 + lx] = top;

        // 1) 清空 top 之上（削掉原生高地/树），从 SEA_LEVEL-6 起重填到 top
        for (let y = 63; y > top; y--) chunk.setBlock(lx, y, lz, B.AIR);
        for (let y = top; y >= SEA_LEVEL - 6; y--) {
          let b;
          if (y === top) b = col.surface;
          else if (y >= top - 3) b = col.sub;
          else b = B.STONE;
          chunk.setBlock(lx, y, lz, b);
        }
        // 2) 水体：水域列从 top+1 填到海平面
        if (col.water) {
          for (let y = top + 1; y <= SEA_LEVEL; y++) {
            if (chunk.getBlock(lx, y, lz) === B.AIR) chunk.setBlock(lx, y, lz, B.WATER);
          }
        }
        // 3) 湖岸沙滩镶边：湖最外圈一圈沙
        if (!col.water && d >= ISLE_LAKE_R - 0.5 && d < ISLE_LAKE_R + 1.5) {
          chunk.setBlock(lx, top, lz, B.SAND);
        }
      }
    }

    // ── 第二趟：山顶樱花林 + 湖边庄园（基于最终地形）──
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const top = topMap[lz * 16 + lx];
        if (top < 0) continue;
        const wx = wx0 + lx, wz = wz0 + lz;
        const dx = wx - SAKURA_ISLAND_X, dz = wz - SAKURA_ISLAND_Z;
        const d = Math.sqrt(dx * dx + dz * dz);

        // 山顶樱花林：山脊平台环带（R_RIDGE-1 ~ R_RIDGE+4），网格密植一大片
        if (d >= ISLE_R_RIDGE - 1 && d <= ISLE_R_RIDGE + 4 && top >= ISLE_RIDGE_Y - 1) {
          const gx = ((wx % 3) + 3) % 3, gz = ((wz % 3) + 3) % 3;
          if (gx === 1 && gz === 1 && this._isleRand(wx, wz, 7) < 0.9) {
            this._isleGrowCherry(chunk, lx, lz, top);
          }
        }

        // 湖岸零散花草装饰（内平台非庄园区）
        if (d >= ISLE_LAKE_R + 2 && d < ISLE_R_INNER - 1) {
          const r = this._isleRand(wx, wz, 21);
          if (r < 0.06) chunk.setBlock(lx, top + 1, lz, B.FLOWER_PINK);
          else if (r < 0.12) chunk.setBlock(lx, top + 1, lz, B.TALL_GRASS);
        }
      }
    }

    // 湖边樱花庄园（确定性，按世界坐标落方块，跨区块由各区块自行写入）
    this._isleDecorateManor(chunk, topMap);
  }

  // 山顶大樱花树（自包含：树干+多层圆粉冠），全部写入当前区块本地坐标
  _isleGrowCherry(chunk, lx, lz, top) {
    const B = BlockType;
    const trunk = 4 + ((this._isleRand(chunk.cx * 16 + lx, chunk.cz * 16 + lz, 3) * 2) | 0);
    // 树干
    for (let h = 1; h <= trunk; h++) {
      if (top + h < 64) chunk.setBlock(lx, top + h, lz, B.CHERRY_WOOD);
    }
    const cy = top + trunk;
    // 多层圆润花冠（半径 3/3/2 + 顶团）
    const layers = [
      { dy: 0, r: 3 }, { dy: 1, r: 3 }, { dy: 2, r: 2 }
    ];
    for (const L of layers) {
      const r = L.r;
      for (let ax = -r; ax <= r; ax++) {
        for (let ay = 0; ay <= 1; ay++) {
          for (let az = -r; az <= r; az++) {
            const dist = Math.abs(ax) + Math.abs(az) + ay;
            if (dist > r + 1) continue;
            if (ax === 0 && az === 0 && ay === 0 && L.dy === 0) continue;
            const fx = lx + ax, fy = cy + L.dy + ay, fz = lz + az;
            if (fx < 0 || fx > 15 || fz < 0 || fz > 15 || fy < 0 || fy > 63) continue;
            if (chunk.getBlock(fx, fy, fz) === B.AIR) chunk.setBlock(fx, fy, fz, B.CHERRY_LEAVES);
          }
        }
      }
    }
    // 顶部花团
    for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
      const fx = lx + ax, fy = cy + 3, fz = lz + az;
      if (fx >= 0 && fx <= 15 && fz >= 0 && fz <= 15 && fy <= 63) {
        if (chunk.getBlock(fx, fy, fz) === B.AIR) chunk.setBlock(fx, fy, fz, B.CHERRY_LEAVES);
      }
    }
  }

  // 湖边樱花庄园：17×17 白墙粉顶尖塔屋，门朝北(-z)朝湖。按世界坐标确定性写入。
  _isleDecorateManor(chunk, topMap) {
    const B = BlockType;
    const HW = ISLE_MANOR_HW;
    const Y = ISLE_MANOR_Y;
    const wx0 = chunk.cx * 16, wz0 = chunk.cz * 16;
    // 庄园包围盒剔除（含尖塔余量）
    if (wx0 + 15 < ISLE_MANOR_X - HW - 3 || wx0 > ISLE_MANOR_X + HW + 3) return;
    if (wz0 + 15 < ISLE_MANOR_Z - HW - 3 || wz0 > ISLE_MANOR_Z + HW + 3) return;

    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        const dx = wx - ISLE_MANOR_X, dz = wz - ISLE_MANOR_Z;
        if (Math.abs(dx) > HW + 1 || Math.abs(dz) > HW + 1) continue;

        // 台基：HW+1 范围铺沙岩平台（在草地上垫一层）
        if (Math.abs(dx) <= HW + 1 && Math.abs(dz) <= HW + 1) {
          chunk.setBlock(lx, Y - 1, lz, B.SANDSTONE);
        }

        const inHouse = Math.abs(dx) <= HW - 1 && Math.abs(dz) <= HW - 1;
        // 正门：北墙(-z)中央 2 格门洞
        const isDoor = (dz === -HW + 1) && (dx === -1 || dx === 0);
        // 窗洞：墙体上的玻璃位置（一层墙高 4，Y+1/Y+2 开窗）
        const onWall = Math.abs(dx) === HW - 1 || Math.abs(dz) === HW - 1;
        const isWindow = onWall && !isDoor &&
          ((dx + dz) % 4 === 0 || (dx - dz) % 4 === 0);

        if (inHouse) {
          // 内墙到墙高 4（Y..Y+4）
          for (let y = Y; y <= Y + 4; y++) {
            // 房屋内部（离墙一圈）留空
            const interior = Math.abs(dx) <= HW - 2 && Math.abs(dz) <= HW - 2;
            if (interior && y >= Y + 1) {
              // 门洞通道也留空
              if (isDoor && dx >= -2 && dx <= 1) continue;
              // 内部空气（除地面）
              if (y === Y) { chunk.setBlock(lx, y, lz, B.PLANKS); continue; }
              // 吊灯柱
              if (dx === 0 && dz === 0 && y === Y + 3) { chunk.setBlock(lx, y, lz, B.LANTERN); continue; }
              chunk.setBlock(lx, y, lz, B.AIR);
              continue;
            }
            // 墙体
            if (y === Y) { chunk.setBlock(lx, y, lz, B.PLANKS); continue; } // 地板
            const isCorner = (Math.abs(dx) === HW - 1 && Math.abs(dz) === HW - 1);
            if (isCorner) { chunk.setBlock(lx, y, lz, B.BONE_BLOCK); continue; } // 奶白角柱
            if (isDoor && y <= Y + 2) { chunk.setBlock(lx, y, lz, B.AIR); continue; } // 门洞
            if (isWindow && (y === Y + 1 || y === Y + 2)) { chunk.setBlock(lx, y, lz, B.GLASS_PINK); continue; }
            chunk.setBlock(lx, y, lz, B.SNOW); // 白墙
          }

          // 金字塔粉橙坡屋顶（Y+5 起，逐层内收，共 5 层）
          for (let layer = 0; layer < 5; layer++) {
            const ry = Y + 5 + layer;
            const rim = HW - 1 - layer;
            if (Math.abs(dx) <= rim && Math.abs(dz) <= rim) {
              // 最外圈为屋顶方块，内部留空（顶层除外）
              const edge = Math.abs(dx) === rim || Math.abs(dz) === rim;
              if (edge || layer === 4) {
                chunk.setBlock(lx, ry, lz, layer % 2 === 0 ? B.TERRACOTTA_PINK : B.TERRACOTTA_ORANGE);
              }
            }
          }

          // 中央尖塔（屋顶之上）：4 层白色方塔 + 粉色小尖 + 金灯笼
          if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
            for (let y = Y + 6; y <= Y + 11; y++) {
              const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1;
              if (edge) chunk.setBlock(lx, y, lz, B.SNOW);
              else if (y === Y + 9) chunk.setBlock(lx, y, lz, B.GLOWSTONE); // 塔内灯
              else chunk.setBlock(lx, y, lz, B.AIR);
            }
            if (Math.abs(dx) <= 0 && Math.abs(dz) <= 0) {
              // 尖顶：粉尖 + 金灯笼
              chunk.setBlock(lx, Y + 12, lz, B.TERRACOTTA_PINK);
              chunk.setBlock(lx, Y + 13, lz, B.LANTERN);
            } else if (Math.abs(dx) + Math.abs(dz) === 1) {
              chunk.setBlock(lx, Y + 12, lz, B.TERRACOTTA_PINK);
            }
            // 塔窗
            if (Math.abs(dx) === 1 && (dz === 0) ) {
              chunk.setBlock(lx, Y + 8, lz, B.GLASS_BLUE);
              chunk.setBlock(lx, Y + 9, lz, B.GLASS_BLUE);
            }
          }
        }

        // 门前灯笼柱 + 花盆（北门外两侧）
        if (dz === -HW && (dx === -2 || dx === 1)) {
          chunk.setBlock(lx, Y, lz, B.FENCE);
          chunk.setBlock(lx, Y + 1, lz, B.LANTERN);
        }
        if (dz === -HW - 1 && (dx === -3 || dx === 2)) {
          if (chunk.getBlock(lx, Y, lz) === B.AIR || chunk.getBlock(lx, Y, lz) === B.GRASS)
            chunk.setBlock(lx, Y + 1, lz, B.FLOWER_POT);
        }
      }
    }
  }
}
