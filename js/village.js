import * as THREE from 'three';
import { BlockType, CHUNK_HEIGHT, Biome } from './voxel.js?v=20260925l';
import { SimplexNoise } from './noise.js?v=20260925l';

/**
 * 村庄生成系统
 * - 在平原/热带草原群系中，基于区块坐标确定性选址
 * - 生成小型房屋（木板墙、圆石地基、玻璃窗、木门）
 * - 生成水井、土路
 * - 向 AnimalManager 请求生成村民和铁傀儡
 */
export class VillageGenerator {
  constructor(world, animalManager) {
    this.world = world;
    this.animals = animalManager;
    this.noise = new SimplexNoise(world.seed + 424242);
    this.generatedChunks = new Set();
    this.villages = []; // {cx, cz, x, z, houses:[]}
    this.villageSpacing = 32; // 区块间最小距离
  }

  /** 区块生成完成后调用，检查是否应在此处生成村庄 */
  onChunkGenerated(chunk) {
    const key = `${chunk.cx},${chunk.cz}`;
    if (this.generatedChunks.has(key)) return;
    this.generatedChunks.add(key);

    // 用区块坐标做确定性判定：约 6% 的区块成为村庄中心（提高野外遇见农庄的概率）
    const r = this._hash(chunk.cx, chunk.cz);
    if (r > 0.94) {
      const wx = chunk.cx * 16 + 8;
      const wz = chunk.cz * 16 + 8;
      // 必须在平原或热带草原
      const biome = this.world.getBiome(wx, wz);
      if (biome !== Biome.PLAINS && biome !== Biome.SAVANNA) return;
      // 必须较平坦（适当放宽高度范围，让村庄更常见）
      const surfaceY = this.world.getSurfaceHeight(wx, wz);
      if (surfaceY < 18 || surfaceY > 40) return;
      // 与其他村庄距离检查
      for (const v of this.villages) {
        const dx = v.x - wx, dz = v.z - wz;
        if (dx * dx + dz * dz < this.villageSpacing * this.villageSpacing) return;
      }
      this._generateVillage(wx, surfaceY, wz);
    }
  }

  /**
   * 强制在指定世界坐标生成一个村庄（用于保证出生点附近一定有农庄）。
   * 跳过随机/群系/平坦判定，内部会先平整出一块广场。返回村庄中心 {x,y,z} 或 null。
   */
  forceVillageAt(wx, wz) {
    const key = `force:${wx},${wz}`;
    if (this.generatedChunks.has(key)) return null;
    this.generatedChunks.add(key);
    // 取当前地表高度，平整广场
    let surfaceY;
    try {
      surfaceY = this.world.getSurfaceHeight(Math.floor(wx), Math.floor(wz));
      if (!Number.isFinite(surfaceY) || surfaceY <= 0) surfaceY = 26;
    } catch (_) { surfaceY = 26; }
    // 与已有村庄保持距离，避免重叠
    for (const v of this.villages) {
      const dx = v.x - wx, dz = v.z - wz;
      if (dx * dx + dz * dz < this.villageSpacing * this.villageSpacing) return null;
    }
    this._generateVillage(wx, surfaceY, wz);
    return { x: wx, y: surfaceY, z: wz };
  }

  _hash(x, z) {
    let h = x * 374761393 + z * 668265263 + 424242;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) & 0xffff) / 0xffff;
  }

  _generateVillage(cx, cy, cz) {
    const village = { x: cx, y: cy, z: cz, houses: [] };
    this.villages.push(village);
    this.world.villages.push({ x: cx, z: cz });

    // 平整村庄广场（半径10）
    this._flattenArea(cx, cz, 10, cy);

    // 生成 3-5 栋房子，围绕中心
    const houseCount = 3 + Math.floor(this._hash(cx + 1, cz + 1) * 3);
    const professions = ['farmer', 'librarian', 'priest', 'butcher', 'smith'];

    for (let i = 0; i < houseCount; i++) {
      const angle = (i / houseCount) * Math.PI * 2 + this._hash(cx + i, cz + i) * 0.5;
      const dist = 7 + this._hash(cx + i * 7, cz + i * 11) * 5;
      const hx = Math.floor(cx + Math.cos(angle) * dist);
      const hz = Math.floor(cz + Math.sin(angle) * dist);
      const hy = this.world.getSurfaceHeight(hx, hz);
      this._buildHouse(hx, hy, hz);
      village.houses.push({ x: hx, y: hy, z: hz });

      // 在每栋房子门口生成村民
      const dir = Math.atan2(cx - hx, cz - hz);
      const spawnX = hx + Math.sin(dir) * 1.5;
      const spawnZ = hz + Math.cos(dir) * 1.5;
      const prof = professions[i % professions.length];
      if (this.animals) {
        this.animals.spawnVillager(spawnX, hy, spawnZ, prof);
      }
    }

    // 水井（村庄中心）
    this._buildWell(cx, cy, cz);

    // 土路连接各房屋
    for (const h of village.houses) {
      this._buildPath(cx, cz, h.x, h.z, cy);
    }

    // 铁傀儡：每3栋房子生成1个
    const golemCount = Math.floor(houseCount / 3);
    for (let i = 0; i < golemCount; i++) {
      if (this.animals) {
        const gx = cx + (this._hash(cx + i * 3, cz + i * 5) - 0.5) * 6;
        const gz = cz + (this._hash(cx + i * 7, cz + i * 13) - 0.5) * 6;
        this.animals.spawnGolem(gx, cy, gz);
      }
    }
  }

  _flattenArea(cx, cz, radius, targetY) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const wx = cx + dx, wz = cz + dz;
        if (dx * dx + dz * dz > radius * radius) continue;
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const cur = this.world.getBlock(wx, y, wz);
          if (cur === BlockType.AIR || cur === BlockType.WATER) continue;
          if (y < targetY - 1) {
            if (cur !== BlockType.STONE && cur !== BlockType.DIRT)
              this.world.setBlockGen(wx, y, wz, BlockType.DIRT);
          } else if (y === targetY - 1) {
            this.world.setBlockGen(wx, y, wz, BlockType.GRASS);
          } else {
            this.world.setBlockGen(wx, y, wz, BlockType.AIR);
          }
        }
      }
    }
  }

  /** 建一栋小房子 */
  _buildHouse(sx, sy, sz) {
    const w = 6, d = 6, h = 5;
    // 地基（圆石）
    for (let dx = 0; dx < w; dx++) {
      for (let dz = 0; dz < d; dz++) {
        this.world.setBlockGen(sx + dx, sy - 1, sz + dz, BlockType.COBBLESTONE);
      }
    }
    // 墙（木板）
    for (let y = 0; y < h; y++) {
      for (let dx = 0; dx < w; dx++) {
        for (let dz = 0; dz < d; dz++) {
          const isEdge = dx === 0 || dx === w - 1 || dz === 0 || dz === d - 1;
          if (!isEdge) continue;
          // 门位置（前墙中央底部2格）
          if (dz === 0 && dx === (w >> 1) && (y === 0 || y === 1)) continue;
          // 窗户（玻璃）
          if ((dx === 0 || dx === w - 1) && dz === (d >> 1) && (y === 1 || y === 2)) {
            this.world.setBlockGen(sx + dx, sy + y, sz + dz, BlockType.GLASS);
            continue;
          }
          if (y === h - 1) continue; // 顶部留给屋顶
          this.world.setBlockGen(sx + dx, sy + y, sz + dz, BlockType.PLANKS);
        }
      }
    }
    // 屋顶（砖块阶梯效果，用实心砖+收进）
    for (let layer = 0; layer < 3; layer++) {
      for (let dx = -layer; dx < w + layer; dx++) {
        for (let dz = -layer; dz < d + layer; dz++) {
          if (dx < 0 || dx >= w || dz < 0 || dz >= d) {
            this.world.setBlockGen(sx + dx, sy + h - 1 + layer, sz + dz, BlockType.BRICK);
          } else if (layer === 0) {
            this.world.setBlockGen(sx + dx, sy + h - 1 + layer, sz + dz, BlockType.BRICK);
          }
        }
      }
    }
    // 屋内地板（木板）
    for (let dx = 1; dx < w - 1; dx++) {
      for (let dz = 1; dz < d - 1; dz++) {
        this.world.setBlockGen(sx + dx, sy, sz + dz, BlockType.PLANKS);
      }
    }
  }

  /** 水井 */
  _buildWell(cx, cy, cz) {
    // 3x3 水坑
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this.world.setBlockGen(cx + dx, cy - 1, cz + dz, BlockType.COBBLESTONE);
        this.world.setBlockGen(cx + dx, cy, cz + dz, BlockType.WATER);
      }
    }
    // 4根柱子
    for (const [dx, dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
      for (let y = 0; y < 3; y++) {
        this.world.setBlockGen(cx + dx, cy + y, cz + dz, BlockType.COBBLESTONE);
      }
    }
    // 顶
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this.world.setBlockGen(cx + dx, cy + 3, cz + dz, BlockType.PLANKS);
      }
    }
  }

  /** 土路（略微蜿蜒 + 两侧夹道灯笼/花），连接中心与房屋 */
  _buildPath(x1, z1, x2, z2, y) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1));
    // 路径方向的法向量（用于把灯笼/花放到路两侧）
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len; // 垂直于路径的单位向量

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // 轻微蜿蜒：中段加一点横向偏移，避免笔直生硬
      const sway = Math.sin(t * Math.PI) * (steps > 6 ? 1.2 : 0);
      const baseX = x1 + dx * t + nx * sway;
      const baseZ = z1 + dz * t + nz * sway;
      const px = Math.floor(baseX);
      const pz = Math.floor(baseZ);
      const py = this.world.getSurfaceHeight(px, pz);
      const cur = this.world.getBlock(px, py, pz);
      if (cur === BlockType.GRASS || cur === BlockType.DIRT || cur === BlockType.PODZOL) {
        this.world.setBlockGen(px, py, pz, BlockType.GRAVEL);
      }

      // 每隔 4 格在路两侧放一根灯笼柱（栅栏+灯笼），中间夹杂小花
      if (i > 0 && i % 4 === 0) {
        for (const side of [1, -1]) {
          const sx = Math.floor(baseX + nx * 2.2 * side);
          const sz = Math.floor(baseZ + nz * 2.2 * side);
          const sy = this.world.getSurfaceHeight(sx, sz);
          const ground = this.world.getBlock(sx, sy, sz);
          if (ground !== BlockType.GRASS && ground !== BlockType.DIRT) continue;
          const r = this._hash(sx * 3 + i, sz * 7 + i);
          if (r < 0.45) {
            // 灯笼柱：两根栅栏 + 顶灯笼
            this.world.setBlockGen(sx, sy + 1, sz, BlockType.FENCE);
            this.world.setBlockGen(sx, sy + 2, sz, BlockType.FENCE);
            this.world.setBlockGen(sx, sy + 3, sz, BlockType.LANTERN);
          } else if (r < 0.8) {
            // 小花/高草点缀
            const dec = r < 0.6 ? [BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.FLOWER_WHITE][Math.floor(r * 30) % 3] : BlockType.TALL_GRASS;
            if (this.world.getBlock(sx, sy + 1, sz) === BlockType.AIR) {
              this.world.setBlockGen(sx, sy + 1, sz, dec);
            }
          }
        }
      }
    }
  }
}
