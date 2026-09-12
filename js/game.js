/**
 * 像素方块世界 - 游戏主模块
 * 包含：玩家控制、物理系统、射线检测、游戏循环
 */

import * as THREE from 'three';
import {
  World, Chunk, BlockType, BlockNames, isSolid,
  CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE, getBlockColor,
  isMobileDevice, getRenderDistance, getBlockDrop, BiomeNames, Biome,
} from './voxel.js?v=20260925an';
import { Multiplayer } from './multiplayer.js?v=20260925an';
import { isCommunityEnabled } from './config.js?v=20260925an';
import { AnimalManager, Sheep, Rabbit, Horse, Cow, Pig, Chicken, Villager, IronGolem } from './animals.js?v=20260925an';
import { WeatherSystem, WeatherType, WeatherNames } from './weather.js?v=20260925an';
import { DayNightCycle } from './daynight.js?v=20260925an';
import { DropManager } from './drops.js?v=20260925an';
import { VillageGenerator } from './village.js?v=20260925an';
import { Inventory } from './inventory.js?v=20260925an';
import { ExchangeShop } from './exchange.js?v=20260925an';
import { createHeldModel, createArmModel, ItemNames, getItemIcon, AGENT_ARMS } from './equipment.js?v=20260925an';
import { StructureGenerator, PLAYER_SPAWN, SAKURA_ISLAND_X, SAKURA_ISLAND_Z } from './structures.js?v=20260925an';
import { PlayerCharacter } from './player-character.js?v=20260925an';
import { SakuraPetals } from './sakura.js?v=20260925an';
import { BirdManager, ButterflyManager } from './birds.js?v=20260925an';
import { WindmillBlades } from './windmill.js?v=20260925an';
import { WorldMap } from './world-map.js?v=20260925an';
import { Fireflies } from './fireflies.js?v=20260925an';
import { SoundFX } from './audio.js?v=20260925an';
import { Tutorial } from './tutorial.js?v=20260925an';
import {
  loadSave, writeSave, clearSave, hasSave,
  exportSave, importSave,
} from './save.js?v=20260925an';
import { Portfolio } from './portfolio.js?v=20260925an';
import { buildFurnitureGroup } from './furniture.js?v=20260925an';

// 多人联机：队友超过该水平距离（格）时，屏幕边缘出现方向指引
const TEAM_POINTER_SHOW_DIST = 40;
const TEAM_RECALL_DIST = 60;     // 与最近队友超过这个距离，会被自动拉回
const TEAM_RECALL_DELAY = 3.0;   // 超距持续几秒才召回（避免偶然擦边）
const TEAM_RECALL_COOLDOWN = 20; // 两次自动召回间隔（秒）

/* ============================================
   玩家类 - 第一人称角色控制
   ============================================ */
class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;

    // 位置与速度
    this.position = new THREE.Vector3(5.4, 22, 22.6);
    this.velocity = new THREE.Vector3(0, 0, 0);

    // 视角旋转（欧拉角）
    this.pitch = 0;   // 上下俯仰（第一人称视角）
    this.yaw = 0;     // 左右偏航（角色身体朝向 / 第一人称视角）

    // 第三人称环绕相机轨道角（独立于角色身体，可 360° 环绕看到正面）
    this.orbitYaw = 0;
    this.orbitPitch = 0.18;
    this.bodyYaw = 0; // 角色模型实际朝向：移动时跟随移动方向，静止时保持
    this._orbitMode = false; // true=第三人称环绕模式（移动/射线/模型均按轨道角）

    // 物理参数
    this.gravity = -25;
    this.jumpSpeed = 12;
    this.moveSpeed = 5.5;
    this.onGround = false;
    this.flying = false; // 创造飞行（双击空格）
    this.pose = 'stand'; // stand | sit | lie
    this.seat = null;    // {x,y,z,top} 当前坐/卧的家具方块

    // 玩家碰撞体尺寸
    this.width = 0.6;
    this.height = 1.75;
    this.eyeHeight = 1.6;

    // 输入状态
    this.keys = {};
    this.mouseDX = 0;
    this.mouseDY = 0;

    // 交互参数
    this.reachDistance = 7;
    this.selectedBlock = BlockType.GRASS;

    // 射线检测结果缓存
    this.targetBlock = null;
    this.targetFace = null;
  }

  /** 处理鼠标移动（视角旋转） */
  onMouseMove(dx, dy) {
    const sensitivity = 0.002;
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    // 限制俯仰角范围
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  /** 每帧更新：物理、碰撞、视角 */
  update(dt) {
    // 限制最大帧间隔，防止穿墙
    dt = Math.min(dt, 0.05);

    // 坐/卧状态：锁定在家具上；家具被其他玩家拆掉或按移动键时起身
    if (this.pose !== 'stand') {
      const seatType = this.seat ? this.world.getBlock(this.seat.x, this.seat.y, this.seat.z) : BlockType.AIR;
      const seatGone = this.seat && (seatType === BlockType.AIR
        || (this.pose === 'sit' && seatType !== BlockType.CHAIR_WOOD && seatType !== BlockType.SOFA_RED)
        || (this.pose === 'lie' && seatType !== BlockType.BED_RED && seatType !== BlockType.BED_BLUE
          && seatType !== BlockType.BED_GREEN && seatType !== BlockType.BED_YELLOW));
      const wantsMove = this.keys['KeyW'] || this.keys['KeyA'] || this.keys['KeyS'] || this.keys['KeyD']
        || this.keys['ArrowUp'] || this.keys['ArrowDown']
        || this.keys['ArrowLeft'] || this.keys['ArrowRight'];
      if (seatGone || wantsMove) {
        this.standUp();
        if (this.onStandUp) this.onStandUp();
      } else {
        this.velocity.set(0, 0, 0);
        this.onGround = true;
        if (this.seat) {
          this.position.set(this.seat.anchorX, this.seat.top - 0.02, this.seat.anchorZ);
          this.yaw = this.seat.yaw;
          if (this._orbitMode) {
            this.orbitYaw = this.seat.yaw;
            this.bodyYaw = this.seat.yaw;
          }
        }
        this._updateCameraOnly();
        this._raycast();
        return;
      }
    }

    // 计算移动方向（基于视角）。第三人称用相机轨道角，第一人称用角色 yaw。
    const viewYaw = this._orbitMode ? this.orbitYaw : this.yaw;
    const forward = new THREE.Vector3(
      -Math.sin(viewYaw),
      0,
      -Math.cos(viewYaw)
    ).normalize();

    const right = new THREE.Vector3(
      Math.cos(viewYaw),
      0,
      -Math.sin(viewYaw)
    ).normalize();

    // 根据输入计算目标速度
    const moveDir = new THREE.Vector3(0, 0, 0);
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveDir.add(forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveDir.sub(forward);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveDir.sub(right);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveDir.add(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      // 第三人称环绕：移动时让角色身体朝向实际前进方向（静止时保持 bodyYaw）
      if (this._orbitMode) {
        this.bodyYaw = Math.atan2(-moveDir.x, -moveDir.z);
      }
    }

    // 水平移动
    this.velocity.x = moveDir.x * this.moveSpeed;
    this.velocity.z = moveDir.z * this.moveSpeed;

    // === 水物理检测 ===
    const footBlock = this.world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y),
      Math.floor(this.position.z)
    );
    const eyeBlock = this.world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + this.eyeHeight),
      Math.floor(this.position.z)
    );
    const inWater = (footBlock === BlockType.WATER || eyeBlock === BlockType.WATER);

    // 重力：飞行时无重力；水中大幅降低
    const effectiveGravity = this.flying ? 0 : (inWater ? this.gravity * 0.15 : this.gravity);
    this.velocity.y += effectiveGravity * dt;

    if (this.flying) {
      // 创造飞行：空格上升 / Shift 下降
      const up = this.keys['Space'] || this.keys['KeyK'];
      const down = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyJ'];
      this.velocity.y = up ? 8 : (down ? -8 : 0);
    } else {
      // 水中游泳：按住空格上浮
      if (inWater && (this.keys['Space'] || this.keys['KeyK'])) {
        this.velocity.y = 3;
        this.onGround = false;
      }
      // 跳跃（仅在地面且不在水中）
      if (!inWater && (this.keys['Space'] || this.keys['KeyK']) && this.onGround) {
        this.velocity.y = this.jumpSpeed;
        this.onGround = false;
      }
    }

    // 飞行时水平加速
    if (this.flying) {
      this.velocity.x = moveDir.x * this.moveSpeed * 1.8;
      this.velocity.z = moveDir.z * this.moveSpeed * 1.8;
    }

    // 水中移动减速
    if (inWater) {
      this.velocity.x *= 0.5;
      this.velocity.z *= 0.5;
    }

    // 逐轴移动并进行碰撞检测
    this.onGround = false;

    // X轴
    this.position.x += this.velocity.x * dt;
    this._resolveCollision('x');

    // Y轴
    this.position.y += this.velocity.y * dt;
    this._resolveCollision('y');

    // Z轴
    this.position.z += this.velocity.z * dt;
    this._resolveCollision('z');

    // 防止掉出世界
    if (this.position.y < -10) {
      this.position.y = 50;
      this.velocity.y = 0;
    }

    // 更新相机
    this._updateCameraOnly();

    // 射线检测（目标方块）
    this._raycast();
  }

  /** 根据当前眼睛高度更新相机位置与朝向（移动/坐卧共用） */
  _updateCameraOnly() {
    this.camera.position.set(
      this.position.x,
      this.position.y + this.eyeHeight,
      this.position.z
    );
    const lookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.camera.lookAt(
      this.camera.position.x + lookDir.x,
      this.camera.position.y + lookDir.y,
      this.camera.position.z + lookDir.z
    );
  }

  /** 坐到 / 躺到家具上 */
  sitOn(block, pose, yaw) {
    const top = block.y + (pose === 'lie'
      ? PlayerCharacter.POSE.lie.seatTop
      : PlayerCharacter.POSE.sit.seatTop);
    this.pose = pose;
    this.velocity.set(0, 0, 0);
    this.flying = false;
    this.seat = {
      x: block.x, y: block.y, z: block.z,
      top, yaw,
      anchorX: block.x + 0.5,
      anchorZ: block.z + 0.5,
    };
    this.position.set(block.x + 0.5, top - 0.02, block.z + 0.5);
    this.yaw = yaw;
    this.bodyYaw = yaw;
    if (this._orbitMode) this.orbitYaw = yaw;
    this.eyeHeight = pose === 'lie'
      ? PlayerCharacter.POSE.lie.eye
      : PlayerCharacter.POSE.sit.eye;
    this._updateCameraOnly();
  }

  /** 起身 */
  standUp() {
    if (this.pose === 'stand') return;
    const seat = this.seat;
    this.pose = 'stand';
    this.seat = null;
    this.eyeHeight = 1.6;
    if (seat) {
      // 站到家具前侧（面朝方向），避免卡进方块
      const fx = -Math.sin(seat.yaw), fz = -Math.cos(seat.yaw);
      this.position.set(seat.anchorX + fx * 0.62, seat.y + 1.02, seat.anchorZ + fz * 0.62);
      this.velocity.set(0, 0, 0);
    }
    this._updateCameraOnly();
  }

  /**
   * AABB 碰撞检测与解决
   * 沿指定轴检测碰撞并推出
   */
  _resolveCollision(axis) {
    const halfW = this.width / 2;
    const min = new THREE.Vector3(
      this.position.x - halfW,
      this.position.y,
      this.position.z - halfW
    );
    const max = new THREE.Vector3(
      this.position.x + halfW,
      this.position.y + this.height,
      this.position.z + halfW
    );

    // 检测范围内所有可能的方块
    const startX = Math.floor(min.x);
    const endX = Math.floor(max.x);
    const startY = Math.floor(min.y);
    const endY = Math.floor(max.y);
    const startZ = Math.floor(min.z);
    const endZ = Math.floor(max.z);

    for (let bx = startX; bx <= endX; bx++) {
      for (let by = startY; by <= endY; by++) {
        for (let bz = startZ; bz <= endZ; bz++) {
          const blockType = this.world.getBlock(bx, by, bz);
          if (blockType === BlockType.AIR) continue;

          const isWater = blockType === BlockType.WATER;
          // 十字形植物（花/草/蘑菇）无碰撞
          if (!isWater && !isSolid(blockType)) continue;

          // 水方块特殊处理：仅在Y轴下落时充当"地面"
          if (isWater) {
            if (axis !== 'y' || this.velocity.y >= 0) continue;
            // 只有下落接触水面才阻挡
            const blockMinW = { x: bx, y: by, z: bz };
            const blockMaxW = { x: bx + 1, y: by + 1, z: bz + 1 };
            if (min.x < blockMaxW.x && max.x > blockMinW.x &&
                min.y < blockMaxW.y && max.y > blockMinW.y &&
                min.z < blockMaxW.z && max.z > blockMinW.z) {
              this.position.y = blockMaxW.y;
              this.velocity.y = 0;
              this.onGround = true;
              min.y = this.position.y;
              max.y = this.position.y + this.height;
            }
            continue;
          }

          // 坐/卧家具使用矮碰撞盒（可跳上坐垫/床垫），其余固体为整格
          const isSeat = blockType === BlockType.CHAIR_WOOD
            || blockType === BlockType.SOFA_RED
            || blockType === BlockType.BED_RED || blockType === BlockType.BED_BLUE
            || blockType === BlockType.BED_GREEN || blockType === BlockType.BED_YELLOW;
          const collideTop = isSeat
            ? (blockType === BlockType.CHAIR_WOOD ? by + 0.52
              : blockType === BlockType.SOFA_RED ? by + 0.5 : by + 0.56)
            : blockMaxY;

          // 固体方块的 AABB
          const blockMin = { x: bx, y: by, z: bz };
          const blockMax = { x: bx + 1, y: collideTop, z: bz + 1 };

          // 检测 AABB 重叠
          if (min.x < blockMax.x && max.x > blockMin.x &&
              min.y < blockMax.y && max.y > blockMin.y &&
              min.z < blockMax.z && max.z > blockMin.z) {

            // 沿指定轴推出
            if (axis === 'x') {
              if (this.velocity.x > 0) {
                this.position.x = blockMin.x - halfW;
              } else {
                this.position.x = blockMax.x + halfW;
              }
              this.velocity.x = 0;
            } else if (axis === 'y') {
              if (this.velocity.y > 0) {
                this.position.y = blockMin.y - this.height;
              } else {
                this.position.y = blockMax.y;
                this.onGround = true;
              }
              this.velocity.y = 0;
            } else if (axis === 'z') {
              if (this.velocity.z > 0) {
                this.position.z = blockMin.z - halfW;
              } else {
                this.position.z = blockMax.z + halfW;
              }
              this.velocity.z = 0;
            }

            // 更新碰撞体范围
            min.x = this.position.x - halfW;
            max.x = this.position.x + halfW;
            min.y = this.position.y;
            max.y = this.position.y + this.height;
            min.z = this.position.z - halfW;
            max.z = this.position.z + halfW;
          }
        }
      }
    }
  }

  /**
   * DDA 射线检测算法（基于格子步进）
   * 从相机位置沿视线方向步进，找到第一个实体方块
   * 使用标准 DDA 算法准确计算命中面的法线
   */
  _raycast() {
    // 射线起点：始终从玩家眼睛位置出发（而不是相机位置）。
    // 这样第三人称下，准星瞄准的就是角色真正注视的方块，而不会被相机位置/角色身体干扰。
    const origin = new THREE.Vector3(
      this.position.x,
      this.position.y + this.eyeHeight,
      this.position.z
    );
    // 射线方向：第一人称用角色 yaw/pitch；第三人称用环绕相机轨道角，
    // 让放置/破坏跟随准星（屏幕中心）看到的方块。
    const dirYaw = this._orbitMode ? this.orbitYaw : this.yaw;
    const dirPitch = this._orbitMode ? this.orbitPitch : this.pitch;
    const direction = new THREE.Vector3(
      -Math.sin(dirYaw) * Math.cos(dirPitch),
      Math.sin(dirPitch),
      -Math.cos(dirYaw) * Math.cos(dirPitch)
    ).normalize();

    this.targetBlock = null;
    this.targetFace = null;

    // 起点所在格子
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    // 各轴步进方向
    const stepX = direction.x > 0 ? 1 : (direction.x < 0 ? -1 : 0);
    const stepY = direction.y > 0 ? 1 : (direction.y < 0 ? -1 : 0);
    const stepZ = direction.z > 0 ? 1 : (direction.z < 0 ? -1 : 0);

    // 到下一个格子边界的距离
    const tDeltaX = direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity;
    const tDeltaY = direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity;
    const tDeltaZ = direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity;

    // 初始 tMax（到第一个边界的距离）
    const distToBoundary = (o, s) => {
      if (s > 0) return (Math.floor(o) + 1 - o);
      if (s < 0) return (o - Math.floor(o));
      return Infinity;
    };
    let tMaxX = direction.x !== 0 ? distToBoundary(origin.x, stepX) * tDeltaX : Infinity;
    let tMaxY = direction.y !== 0 ? distToBoundary(origin.y, stepY) * tDeltaY : Infinity;
    let tMaxZ = direction.z !== 0 ? distToBoundary(origin.z, stepZ) * tDeltaZ : Infinity;

    // 记录上一次步进的面法线（用于确定命中面）
    let face = { x: 0, y: 0, z: 0 };
    let t = 0;

    while (t <= this.reachDistance) {
      const block = this.world.getBlock(x, y, z);
      if (isSolid(block)) {
        this.targetBlock = { x, y, z, type: block };
        this.targetFace = face;
        return;
      }

      // 步进最小的轴
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          t = tMaxX;
          tMaxX += tDeltaX;
          face = { x: -stepX, y: 0, z: 0 };
        } else {
          z += stepZ;
          t = tMaxZ;
          tMaxZ += tDeltaZ;
          face = { x: 0, y: 0, z: -stepZ };
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          t = tMaxY;
          tMaxY += tDeltaY;
          face = { x: 0, y: -stepY, z: 0 };
        } else {
          z += stepZ;
          t = tMaxZ;
          tMaxZ += tDeltaZ;
          face = { x: 0, y: 0, z: -stepZ };
        }
      }
    }
  }

  /** 放置方块 */
  placeBlock() {
    if (this.pose !== 'stand') return false;
    if (!this.targetBlock || !this.targetFace) return false;
    // 手持装备（负 ID，剑/盾/盔甲）不能放置为方块
    if (!this.selectedBlock || this.selectedBlock < 0) return false;

    const px = this.targetBlock.x + this.targetFace.x;
    const py = this.targetBlock.y + this.targetFace.y;
    const pz = this.targetBlock.z + this.targetFace.z;

    // 检查新方块是否与玩家碰撞
    const halfW = this.width / 2;
    const playerMin = {
      x: this.position.x - halfW, y: this.position.y, z: this.position.z - halfW
    };
    const playerMax = {
      x: this.position.x + halfW, y: this.position.y + this.height, z: this.position.z + halfW
    };

    if (px + 1 > playerMin.x && px < playerMax.x &&
        py + 1 > playerMin.y && py < playerMax.y &&
        pz + 1 > playerMin.z && pz < playerMax.z) {
      return false; // 不能在玩家位置放置
    }

    if (py < 0 || py >= CHUNK_HEIGHT) return false;
    if (this.world.getBlock(px, py, pz) !== BlockType.AIR) return false;

    // 家具/可朝向方块：按玩家视角决定朝向（正面朝向玩家）
    const viewYaw = (typeof this.orbitYaw === 'number' && this._orbitMode) ? this.orbitYaw : this.yaw;
    const dir = World.yawToFurnDir(viewYaw);
    this.world.setBlock(px, py, pz, this.selectedBlock, dir);
    if (this.onPlace) this.onPlace(px, py, pz, this.selectedBlock, dir);
    return true;
  }

  /** 破坏方块 */
  breakBlock() {
    if (this.pose !== 'stand') return false;
    if (!this.targetBlock) return false;

    const { x, y, z } = this.targetBlock;
    if (y < 0 || y >= CHUNK_HEIGHT) return false;

    const blockType = this.world.getBlock(x, y, z);
    this.world.setBlock(x, y, z, BlockType.AIR);
    if (this.onBreak) this.onBreak(x, y, z, BlockType.AIR, -1);

    // 生成掉落物（由 game 层注入 dropManager）
    const drop = getBlockDrop(blockType);
    if (drop !== BlockType.AIR && this.dropManager) {
      this.dropManager.spawn(x, y, z, drop);
    }
    return true;
  }
}

/* ============================================
   高亮方块线框
   ============================================ */
class BlockHighlight {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2, transparent: true, opacity: 0.6 });
    this.mesh = new THREE.LineSegments(edges, mat);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(targetBlock) {
    if (targetBlock) {
      this.mesh.position.set(targetBlock.x + 0.5, targetBlock.y + 0.5, targetBlock.z + 0.5);
      this.mesh.visible = true;
    } else {
      this.mesh.visible = false;
    }
  }
}

/* ============================================
   触摸控制器（移动端专用）
   ============================================ */
class TouchController {
  constructor(player, game) {
    this.player = player;
    this.game = game;
    this.moveX = 0;    // -1 ~ 1 左右
    this.moveZ = 0;    // -1 ~ 1 前后
    this._joystickId = null;
    this._lookTouchId = null;
    this._lastTouchX = 0;
    this._lastTouchY = 0;
    this._init();
  }

  _init() {
    const zone = document.getElementById('joystickZone');
    const thumb = document.getElementById('joystickThumb');
    const canvas = this.game.canvas;

    // 用 pointerId 区分摇杆触点和视角触点，支持多点同时操作
    this._joystickId = null;
    this._lookTouchId = null;

    // ----- 虚拟摇杆 -----
    const findJoystickTouch = (e) => {
      if (this._joystickId === null) return null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === this._joystickId) return e.touches[i];
      }
      return null;
    };

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this._joystickId === null) {
        this._joystickId = e.changedTouches[0].identifier;
      }
      const t = findJoystickTouch(e);
      if (t) this._updateJoystick(t, zone, thumb);
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = findJoystickTouch(e);
      if (t) this._updateJoystick(t, zone, thumb);
    }, { passive: false });
    zone.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this._joystickId === e.changedTouches[0].identifier) {
        this._joystickId = null;
      }
      this.moveX = 0;
      this.moveZ = 0;
      thumb.style.transform = 'translate(-50%, -50%)';
    });
    zone.addEventListener('touchcancel', (e) => {
      if (this._joystickId === e.changedTouches[0].identifier) {
        this._joystickId = null;
      }
      this.moveX = 0;
      this.moveZ = 0;
      thumb.style.transform = 'translate(-50%, -50%)';
    });

    // ----- 视角控制（右侧区域） -----
    // 找一个非摇杆触点用于视角
    const findLookTouch = (e) => {
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier !== this._joystickId && t.clientX > window.innerWidth * 0.35) {
          return t;
        }
      }
      return null;
    };

    canvas.addEventListener('touchstart', (e) => {
      // 只在有新触点落在右侧区域时开启视角（排除UI按钮区域）
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        // 跳过落在操作按钮区域的触摸
        if (t.target && t.target.closest && t.target.closest('#actionButtons, #joystickZone, #mobileHotbar')) continue;
        if (t.identifier !== this._joystickId && t.clientX > window.innerWidth * 0.35) {
          this._lookTouchId = t.identifier;
          this._lastTouchX = t.clientX;
          this._lastTouchY = t.clientY;
          break;
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (this._lookTouchId === null) return;
      // 在全部触点中找到我们的视角触点
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier === this._lookTouchId) {
          const dx = t.clientX - this._lastTouchX;
          const dy = t.clientY - this._lastTouchY;
          this.player.onMouseMove(dx * 1.8, dy * 1.8);
          this._lastTouchX = t.clientX;
          this._lastTouchY = t.clientY;
          break;
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._lookTouchId) {
          this._lookTouchId = null;
          break;
        }
      }
    });
    canvas.addEventListener('touchcancel', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._lookTouchId) {
          this._lookTouchId = null;
          break;
        }
      }
    });

    // ----- 操作按钮 -----
    const btnJump = document.getElementById('btnJump');
    const btnPlace = document.getElementById('btnPlace');
    const btnBreak = document.getElementById('btnBreak');
    const btnSeat = document.getElementById('btnSeat');

    // 按钮按下时的视觉反馈
    const _flashBtn = (btn, isError) => {
      if (!btn) return;
      const bg = isError ? 'rgba(255, 80, 80, 0.4)' : 'rgba(255, 255, 255, 0.35)';
      const border = isError ? 'rgba(255, 80, 80, 0.7)' : 'rgba(255, 255, 255, 0.6)';
      btn.style.background = bg;
      btn.style.borderColor = border;
      btn.style.transition = 'background 0.1s, border-color 0.1s';
      setTimeout(() => {
        btn.style.background = 'rgba(255, 255, 255, 0.12)';
        btn.style.borderColor = 'rgba(255, 255, 255, 0.25)';
      }, 150);
    };

    // 触觉反馈（设备支持时）
    const _haptic = (pattern) => {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    };

    if (btnJump) {
      const _jumpDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.player.keys['Space'] = true;
        _flashBtn(btnJump);
      };
      const _jumpUp = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.player.keys['Space'] = false;
      };
      btnJump.addEventListener('pointerdown', _jumpDown);
      btnJump.addEventListener('pointerup', _jumpUp);
      btnJump.addEventListener('pointercancel', _jumpUp);
      btnJump.addEventListener('pointerleave', _jumpUp);
    }

    if (btnSeat) {
      const _seatDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.game && this.game.interactSeat) {
          this.game.interactSeat();
          _flashBtn(btnSeat);
        }
      };
      btnSeat.addEventListener('pointerdown', _seatDown);
    }

    if (btnPlace) {
      const _placeDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = this.player.placeBlock();
        _flashBtn(btnPlace, !ok);
        if (!ok) _haptic(10);
      };
      btnPlace.addEventListener('pointerdown', _placeDown);
    }

    if (btnBreak) {
      const _breakDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = this.player.breakBlock();
        _flashBtn(btnBreak, !ok);
        if (!ok) _haptic(10);
      };
      btnBreak.addEventListener('pointerdown', _breakDown);
    }
  }

  _updateJoystick(touch, zone, thumb) {
    const rect = zone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width / 2 - 25;

    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxR) {
      dx = dx / dist * maxR;
      dy = dy / dist * maxR;
    }

    this.moveX = dx / maxR;
    this.moveZ = dy / maxR;

    thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}

/* ============================================
   远程玩家（多人联机：别的小特工）
   ============================================ */
class RemotePlayer {
  constructor(scene, THREE, PlayerCharacter, info) {
    this.THREE = THREE;
    this.id = info.id;
    this.target = new THREE.Vector3(info.x, info.y, info.z);
    this.cur = new THREE.Vector3(info.x, info.y, info.z);
    this.targetYaw = info.yaw;
    this.yaw = info.yaw;
    this.pose = info.pose || 'stand';
    this.nickname = info.nickname || '小探险家';
    this.avatar = new PlayerCharacter(scene);
    this.avatar.setSkin(info.skin || 'burger');
    this.avatar.setPose(info.pose || 'stand');
    this.avatar.setVisible(true);
    this.avatar.group.visible = true;
    // 名字标签
    this.label = this._makeLabel(THREE, this.nickname);
    scene.add(this.label);
    // 对话气泡
    this.bubble = this._makeBubble(THREE);
    scene.add(this.bubble);
    this._bubbleUntil = 0;
    this._updateTransform(1);
  }

  _makeLabel(THREE, name) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 72;
    const ctx = cv.getContext('2d');
    ctx.font = 'bold 34px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(20,12,4,0.85)';
    ctx.strokeText(name, 128, 36);
    ctx.fillStyle = '#ffd9ec';
    ctx.fillText(name, 128, 36);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set(1.7, 0.48, 1);
    spr.renderOrder = 999;
    return spr;
  }

  _makeBubble(THREE) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false }));
    spr.renderOrder = 998;
    spr.userData = { cv, tex };
    spr.visible = false;
    return spr;
  }

  _wrapText(ctx, text, maxW) {
    const lines = [];
    let line = '';
    for (const ch of String(text)) {
      if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    return lines.slice(0, 4); // 最多 4 行
  }

  say(text, durationMs) {
    const { cv, tex } = this.bubble.userData;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, 512);
    const PAD = 28, MAXW = cv.width - PAD * 2;
    ctx.font = 'bold 42px "Microsoft YaHei", "PingFang SC", sans-serif';
    const lines = this._wrapText(ctx, text, MAXW);
    const lh = 54;
    const boxH = lines.length * lh + PAD * 2;
    const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + PAD * 2;
    const x0 = (cv.width - boxW) / 2;
    const y0 = 10;
    // 气泡背景（米黄底 + 金边，呼应开始界面）
    ctx.fillStyle = 'rgba(255,243,220,0.97)';
    ctx.strokeStyle = '#e0983c';
    ctx.lineWidth = 8;
    this._roundRect(ctx, x0, y0, boxW, boxH, 22);
    ctx.fill(); ctx.stroke();
    // 底部小尾巴
    ctx.beginPath();
    ctx.moveTo(cv.width / 2 - 16, y0 + boxH - 2);
    ctx.lineTo(cv.width / 2, y0 + boxH + 24);
    ctx.lineTo(cv.width / 2 + 16, y0 + boxH - 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,243,220,0.97)';
    ctx.fill();
    ctx.strokeStyle = '#e0983c'; ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cv.width / 2 - 16, y0 + boxH - 2);
    ctx.lineTo(cv.width / 2, y0 + boxH + 22);
    ctx.lineTo(cv.width / 2 + 16, y0 + boxH - 2);
    ctx.stroke();
    // 文字
    ctx.fillStyle = '#3a2410';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, cv.width / 2, y0 + PAD + i * lh));
    tex.needsUpdate = true;
    const w = Math.min(3.6, Math.max(1.6, boxW / 110));
    // 画布为 512×512，气泡只占其中 boxW×boxH 区域，按比例缩放使实际世界尺寸正确
    this.bubble.scale.set(w * boxW / 512, w * boxH / 512, 1);
    this.bubble.material.opacity = 1;
    this.bubble.visible = true;
    this._bubbleUntil = performance.now() + (durationMs || 6000);
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  updateInfo(info) {
    this.target.set(info.x, info.y, info.z);
    this.targetYaw = info.yaw;
    const pose = info.pose || 'stand';
    if (pose !== this.pose) {
      this.pose = pose;
      if (this.avatar) this.avatar.setPose(pose);
    }
    if (this.avatar && info.skin) {
      // 皮肤可能中途切换
      if (this._skin !== info.skin) { this._skin = info.skin; this.avatar.setSkin(info.skin); }
    }
  }

  _updateTransform(t) {
    this.cur.lerp(this.target, t);
    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, t);
    // 姿势（坐/躺/站）的模型位置、旋转、四肢全部交给 PlayerCharacter.update
    this.avatar.update({
      position: { x: this.cur.x, y: this.cur.y, z: this.cur.z },
      yaw: this.yaw, pose: this.pose || 'stand',
      velocity: { x: 0, z: 0 }, onGround: true, _orbitMode: false,
    }, 0.016);
    const headLift = (this.pose === 'lie') ? 1.05 : (this.pose === 'sit' ? 1.75 : 2.1);
    this.label.position.set(this.cur.x, this.cur.y + headLift, this.cur.z);
    this.bubble.position.set(this.cur.x, this.cur.y + headLift + 0.55, this.cur.z);
  }

  update(dt) {
    this._updateTransform(Math.min(1, dt * 8));
    // 气泡到点淡出
    if (this.bubble.visible) {
      const remain = this._bubbleUntil - performance.now();
      if (remain <= 0) { this.bubble.visible = false; this.bubble.material.opacity = 0; }
      else if (remain < 800) { this.bubble.material.opacity = Math.max(0, remain / 800); }
    }
  }

  dispose(scene) {
    scene.remove(this.avatar.group);
    scene.remove(this.label);
    scene.remove(this.bubble);
    if (this.label.material && this.label.material.map) this.label.material.map.dispose();
    if (this.label.material) this.label.material.dispose();
    if (this.bubble.material && this.bubble.material.map) this.bubble.material.map.dispose();
    if (this.bubble.material) this.bubble.material.dispose();
  }
}

class RemotePlayers {
  constructor(scene, THREE, PlayerCharacter) {
    this.scene = scene; this.THREE = THREE; this.PC = PlayerCharacter;
    this.map = new Map();
  }
  sync(list) {
    const seen = new Set();
    for (const info of list) {
      seen.add(info.id);
      let rp = this.map.get(info.id);
      if (!rp) { rp = new RemotePlayer(this.scene, this.THREE, this.PC, info); this.map.set(info.id, rp); }
      else rp.updateInfo(info);
    }
    for (const [id, rp] of this.map) {
      if (!seen.has(id)) { rp.dispose(this.scene); this.map.delete(id); }
    }
  }
  update(dt) { for (const rp of this.map.values()) rp.update(dt); }
  clear() { for (const rp of this.map.values()) rp.dispose(this.scene); this.map.clear(); }

  /** 让指定队友的角色头顶冒出对话气泡 */
  speak(pid, text, durationMs) {
    const rp = this.map.get(pid);
    if (rp) rp.say(text, durationMs);
  }

  /** 返回距离 (x,z) 最近的在线队友（水平距离），无队友时返回 null */
  nearest(x, z) {
    let best = null, bestD2 = Infinity;
    for (const rp of this.map.values()) {
      const dx = rp.cur.x - x, dz = rp.cur.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = rp; }
    }
    return best ? { rp, dist: Math.sqrt(bestD2) } : null;
  }
  get count() { return this.map.size; }
}

/* ============================================
   游戏主类
   ============================================ */
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.isRunning = false;
    this.isPointerLocked = false;

    // 设备检测
    this.isMobile = isMobileDevice();
    this.renderDistance = getRenderDistance();

    // Three.js 核心对象
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // 游戏对象
    this.world = null;
    this.player = null;
    this.highlight = null;
    this.touchController = null;
    this.animalManager = null;

    // 帧率统计
    this.clock = new THREE.Clock();
    this.frameCount = 0;
    this.fpsTime = 0;
    this.fps = 0;

    // UI 元素
    this.ui = {
      crosshair: document.getElementById('crosshair'),
      hotbar: document.getElementById('hotbar'),
      selectedBlockName: document.getElementById('selectedBlockName'),
      debugInfo: document.getElementById('debugInfo'),
      blockHighlight: document.getElementById('blockHighlight'),
      startScreen: document.getElementById('startScreen'),
      pauseScreen: document.getElementById('pauseScreen'),
      loadingBar: document.getElementById('loadingBar'),
      loadingFill: document.getElementById('loadingFill'),
      controlsPanel: document.getElementById('controlsPanel'),
    };
    this._teamPointerEl = document.getElementById('teamPointer');
    this._seatHintEl = document.getElementById('seatHint');
    if (this._teamPointerEl) {
      this._teamPointerEl.addEventListener('click', (e) => { e.preventDefault(); this.teleportToTeammate(); });
    }
    // 多人"走远自动召回"状态
    this._recallOverTime = 0;
    this._recallCooldown = 0;
    this._initChatUI();

    // 【关键】开始界面的"下一步/选特工"交互是纯 DOM 操作，必须在世界区块生成（init 中大量 await）
    // 之前就绑定好。否则一旦区块生成中途卡住/挂起，欢迎页能显示但按钮永远点不动。
    try { this._initCharSelect(); } catch (e) { console.warn('[char] 提前初始化失败', e); }
    try { this._initStartSteps(); } catch (e) { console.warn('[steps] 提前初始化失败', e); }

    // 热键栏 9 格由 inventory.js 控制（E 键打开创造背包配置）
    this.hotbarCount = 9;
    this.selectedSlot = 0;
    this.magnetMode = false; // 第 9 格（索引 8）为空时作为收集模式
    this.collectedBlocks = {};
    this.inventory = null;
  }

  /** 初始化游戏 */
  async init() {
    // 读档：同设备自动恢复世界种子/改动/玩家状态
    this.saveData = loadSave();
    this._saveDirty = false;
    this._saveTimer = 0;

    this._initRenderer();
    this._initScene();
    this._initPlayer();
    this._initHighlight();
    this._initEvents();
    this._initInventory();
    this._initSaveUI();
    this._initMultiplayerUI();
    this._initPortfolio();

    // 设置预览视角：出生广场开阔草地，远处尽头是高大气派的樱花风车房（叶片在屋顶上转动）
    this.camera.position.set(0, 30, 30);
    this.camera.lookAt(0, 36, -18);

    // 开始界面保持显示，背后渲染 3D 世界
    this.ui.loadingBar.style.display = 'block';

    // 无存档时：出生在固定手工"新手家园"（世界原点），家园半径 30 大平地
    this._isNewHome = (!this.saveData || !this.saveData.player);
    // 出生区块中心：新世界固定出生点（开阔广场南端，面朝北端风车房）；读档则以上次所在位置为中心预生成地形
    let centerX = PLAYER_SPAWN.x, centerZ = PLAYER_SPAWN.z;
    if (this.saveData && this.saveData.player) {
      centerX = this.saveData.player.x;
      centerZ = this.saveData.player.z;
    }
    const spCx = Math.floor(centerX / 16);
    const spCz = Math.floor(centerZ / 16);

    const radius = this.renderDistance;

    // 围绕出生点加载区块（同时保证 WELCOME 立墙所在的原点区域也加载）
    const loadSet = new Map();
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const a = spCx + dx, b = spCz + dz;
        loadSet.set(`${a},${b}`, [a, b]);
      }
    }
    // 原点（WELCOME 墙）附近也加载，避免出生在远处时墙被卸载
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        loadSet.set(`${dx},${dz}`, [dx, dz]);
      }
    }
    // 樱花风车房（出生广场北端地标）所在区块强制加载，确保第一眼就能看到
    const wmCx = Math.floor(PLAYER_SPAWN.x / 16);
    const wmCz = Math.floor(-6 / 16);   // 风车中心 z=-6 → chunk cz=-1
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const a = wmCx + dx, b = wmCz + dz;
        loadSet.set(`${a},${b}`, [a, b]);
      }
    }
    const chunksToLoad = [...loadSet.values()];
    chunksToLoad.sort((a, b) => {
      // 优先出生点区块，其次原点
      const dA = (a[0] - spCx) ** 2 + (a[1] - spCz) ** 2 + (a[0] ** 2 + a[1] ** 2) * 0.01;
      const dB = (b[0] - spCx) ** 2 + (b[1] - spCz) ** 2 + (b[0] ** 2 + b[1] ** 2) * 0.01;
      return dA - dB;
    });

    const needed = chunksToLoad.length;
    let generated = 0;
    let firstFrameDone = false;

    for (const [cx, cz] of chunksToLoad) {
      const key = this.world.chunkKey(cx, cz);
      if (!this.world.chunks.has(key)) {
        try {
          const chunk = await this._createChunk(cx, cz);
          if (chunk.mesh) this.scene.add(chunk.mesh);
          if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
          if (chunk.crossMesh) this.scene.add(chunk.crossMesh);
          if (chunk.glassMesh) this.scene.add(chunk.glassMesh);
          this.world._addChunkFurniture(chunk);
        } catch (err) {
          console.error('生成区块失败', cx, cz, err);
        }
        generated++;
        this.ui.loadingFill.style.width = `${(generated / needed * 100) | 0}%`;

        // 中心区块加载完毕后立即渲染首帧（确保"Coze"立墙可见）
        if (!firstFrameDone && cx * cx + cz * cz <= 4) {
          this.renderer.render(this.scene, this.camera);
          firstFrameDone = true;
        }

        this.renderer.render(this.scene, this.camera);
        if (generated % (this.isMobile ? 1 : 3) === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }
    }

    // 出生点：有存档回到上次位置；新世界出生在固定新手家园（WELCOME 拱门后、正对樱花风车房）
    this._spawnX = PLAYER_SPAWN.x;
    this._spawnZ = PLAYER_SPAWN.z;
    this._spawnY = PLAYER_SPAWN.y;
    if (this.saveData && this.saveData.player) {
      this._spawnX = this.saveData.player.x;
      this._spawnZ = this.saveData.player.z;
      // 该位置地形此刻已预生成，把玩家稳稳放到地表上方 2 格，避免旧高度导致下坠/错位
      try {
        const groundY = this.world.getSurfaceHeight(Math.floor(this._spawnX), Math.floor(this._spawnZ));
        if (Number.isFinite(groundY) && groundY > 0) {
          this._spawnY = groundY + 2;
        } else {
          this._spawnY = this.saveData.player.y;
        }
      } catch (_) {
        this._spawnY = this.saveData.player.y;
      }
    }
    this.player.position.set(this._spawnX, this._spawnY, this._spawnZ);
    this.player.velocity.set(0, 0, 0);
    this.player.yaw = (this.saveData && this.saveData.player && typeof this.saveData.player.yaw === 'number')
      ? this.saveData.player.yaw : 0;    this.player.pitch = (this.saveData && this.saveData.player && typeof this.saveData.player.pitch === 'number')
      ? this.saveData.player.pitch : -0.18;

    // 相机保持立墙预览视角，等用户点击开始后再切到玩家视角
    // 不做 camera.position 移动，保持背景一直是游戏世界

    this.ui.loadingBar.style.display = 'none';

    // 恢复快捷栏与选中槽位
    if (this.saveData && Array.isArray(this.saveData.hotbar)) {
      for (let i = 0; i < 9; i++) {
        const t = this.saveData.hotbar[i];
        if (typeof t === 'number' && t > 0) this.inventory.hotbar[i] = t;
      }
      if (typeof this.saveData.selectedSlot === 'number') {
        this.selectedSlot = Math.max(0, Math.min(8, this.saveData.selectedSlot));
      }
      if (typeof this.saveData.fov === 'number' && this.saveData.fov > 0) {
        this._adjustFOV(this.saveData.fov - this.defaultFov);
      }
      this._updateHotbar();
      this._updateMobileHotbar();
    }

    // 新世界：生成固定手工"新手家园"（木屋/牧场/池塘/凉亭/樱花/鲜花/拱门），仅生成一次且不计入玩家改动
    if (this._isNewHome) {
      try {
        const home = this.structures.decorateSpawn();
        // 装饰写入后，重建家园 + 落樱庄园范围内的区块网格（庄园在出生点东侧远处，需额外覆盖）
        for (let cx = -3; cx <= 6; cx++) {
          for (let cz = -4; cz <= 3; cz++) {
            this.world.update(cx * 16 + 8, cz * 16 + 8);
          }
        }
        await new Promise(r => setTimeout(r, 120));
        // 清场出生点
        const cleared = this.world.clearSpawnArea(Math.floor(home.spawnX), Math.floor(home.spawnZ));
        this.world.update(Math.floor(home.spawnX), Math.floor(home.spawnZ));
        this._spawnX = cleared.x;
        this._spawnZ = cleared.z;
        this._spawnY = cleared.y + 2;
        this.player.position.set(this._spawnX, this._spawnY, this._spawnZ);
        this.player.velocity.set(0, 0, 0);

        // 牧场里放几只友好动物（羊/猪/兔/鸡）
        if (home.penCenter) {
          const pc = home.penCenter;
          const ay = 28; // 脚落在草地表层，略高让重力落定
          this.animalManager.spawn(Sheep, pc.x - 2, ay, pc.z);
          this.animalManager.spawn(Pig, pc.x + 2, ay, pc.z + 1);
          this.animalManager.spawn(Chicken, pc.x - 1, ay, pc.z - 2);
        }
        // 向导兔子（新手引导 NPC），站在出生点前方的 guideSpot
        if (home.guideSpot) {
          const g = home.guideSpot;
          const rabbit = this.animalManager.spawn(Rabbit, g.x, 28, g.z);
          if (rabbit) {
            this._guideRabbit = rabbit;
            // 向导兔子固定站立不漫游（偶有转头即可）
            rabbit._pickNewState = () => { rabbit.state = 'idle'; rabbit.stateTimer = 30; };
            this.tutorial.attachRabbit(rabbit); // 气泡挂在兔子 group 上
          }
        }
        // 风车磨坊转动叶片（动态装饰）
        if (home.windmillSpot) {
          try {
            this.windmill = new WindmillBlades(this.scene, home.windmillSpot);
          } catch (e) { /* 叶片失败不影响游戏 */ }
        }

        // 保证在家乡东侧不远处生成一座村庄农庄（农舍+水井+土路+村民），
        // 避免随机率导致小朋友找不到"农庄"。该结构属于世界生成，不计入存档。
        if (this.villageGenerator && !this._spawnVillageDone) {
          this._spawnVillageDone = true;
          try {
            const prevTrack = this.world._trackEdits;
            this.world._trackEdits = false;
            // 家乡中心约 (0,0)，向东 ~46 格选一块平原做村庄
            const v = this.villageGenerator.forceVillageAt(46, 6);
            this.world._trackEdits = prevTrack;
            if (v) {
              // 重建村庄涉及的区块网格 + 从家乡修一条沙砾小路通往农庄
              for (let cx = 2; cx <= 4; cx++) {
                for (let cz = -1; cz <= 1; cz++) {
                  this.world.update(cx * 16 + 8, cz * 16 + 8);
                }
              }
              this._buildRoadTo(0, 4, v.x, v.z, v.y);
              this.world.update(Math.floor(v.x), Math.floor(v.z));
            }
          } catch (e) { console.warn('[村庄生成失败]', e); }
        }
      } catch (err) {
        console.error('新手家园生成失败', err);
      }
    }

    // 无论新世界还是旧存档，都幂等确保出生家园核心区有「樱花风车房 + 迎宾道」主景观。
    // 旧世界（风车版本之前生成的）也会补建，已有则自动跳过，不重复。
    try {
      if (this.structures && !this.windmill) {
        const prevTrack = this.world._trackEdits;
        this.world._trackEdits = false;
        const spot = this.structures.ensureWindmillLandmark ? this.structures.ensureWindmillLandmark() : null;
        this.world._trackEdits = prevTrack;
        if (spot) {
          // 重建出生广场 + 风车地标 + WELCOME 木牌网格（风车 z=-18 在 chunk cz=-2，出生点/木牌在 cz=1）
          for (let cx = -2; cx <= 1; cx++) {
            for (let cz = -2; cz <= 1; cz++) this.world.update(cx * 16 + 8, cz * 16 + 8);
          }
          if (!this.windmill) {
            try { this.windmill = new WindmillBlades(this.scene, spot); } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.warn('[风车地标补建失败]', err);
    }
  }

  /** 从 (x1,z1) 到 (x2,z2) 铺一条世界生成的沙砾小路（不堵水、不计入存档） */
  _buildRoadTo(x1, z1, x2, z2, roadY) {
    const w = this.world;
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = Math.round(x1 + (x2 - x1) * t);
      const z = Math.round(z1 + (z2 - z1) * t);
      for (let y = roadY + 2; y >= roadY - 6; y--) {
        const b = w.getBlock(x, y, z);
        if (b === BlockType.GRASS || b === BlockType.DIRT || b === BlockType.SAND) {
          w.setBlockGen(x, y, z, BlockType.GRAVEL);
          break;
        }
        if (b !== BlockType.AIR && b !== BlockType.TALL_GRASS && b !== BlockType.FLOWER_RED
          && b !== BlockType.FLOWER_YELLOW && b !== BlockType.FLOWER_WHITE && b !== BlockType.WATER) break;
      }
    }
  }

  /** 收集当前存档数据 */
  _collectSaveData() {
    const p = this.player.position;
    return {
      seed: this.worldSeed,
      player: {
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        character: this.character || this._getSelectedChar() || 'burger',
      },
      hotbar: (this.inventory ? this.inventory.hotbar : []).slice(0, 9),
      selectedSlot: this.selectedSlot,
      fov: this.fov,
      edits: this.world.serializeEdits(),
    };
  }

  /** 立即保存到本地 */
  saveNow(showHint) {
    const ok = writeSave(this._collectSaveData());
    this._saveDirty = false;
    if (showHint) this._toast(ok ? '进度已保存' : '保存失败：存储空间不足');
    return ok;
  }

  /** 标记有改动需要保存 */
  _markSaveDirty() { this._saveDirty = true; }

  /** 玩家放/拆方块后调度一次保存（去抖 1 秒，避免连续操作频繁写存储） */
  _scheduleSave() {
    this._saveDirty = true;
    if (this._saveDebounce) clearTimeout(this._saveDebounce);
    this._saveDebounce = setTimeout(() => {
      this._saveDebounce = null;
      if (this.world) this.saveNow(false);
    }, 1000);
  }

  /** 自动保存调度（每 5 秒检查，若有改动则存）+ 位置每 3 秒随动存档 */
  _tickSave(dt) {
    this._saveTimer += dt;
    if (this._saveTimer >= 5) {
      this._saveTimer = 0;
      // 有方块改动、或玩家位置发生变化时都保存（保证退出后回到原地）
      if (this._saveDirty || this._playerMoved) {
        this._playerMoved = false;
        if (this.world) this.saveNow(false);
      }
    }
  }

  /** 简易提示气泡 */
  _toast(text) {
    let el = document.getElementById('saveToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'saveToast';
      el.className = 'save-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  /**
   * 健壮复制：优先现代 Clipboard API（需 HTTPS/用户手势），
   * 不可用时降级到隐藏 textarea + execCommand，尽量保证一键复制可用。
   * 返回 true=复制成功。
   */
  _copyText(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        // 同步路径无法 await，这里用 Promise 但调用方按"已发起"处理；
        // 为兼容点击事件内立即给反馈，先走下面 execCommand 兜底更稳。
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return true;
    } catch (e) {}
    // 最后兜底：异步 Clipboard API（不阻塞）
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
    } catch (e) {}
    return false;
  }

  /** 房间码 → 确定性正整数种子（同房所有人地形一致） */
  _seedFromRoomCode(code) {
    let h = 2166136261 >>> 0;
    const s = String(code || 'ROOM');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) + 1;
  }

  /** 多人进房成功后切换到"房间共享世界"：同房种子 + 出生家园 + 统一出生点 */
  async _switchToRoomWorld(code) {
    try {
      this._mpRoomCode = code;
      const seed = this._seedFromRoomCode(code);
      this.worldSeed = seed;
      this.world.reseed(seed);
      // 共建世界：本人放/拆只上传房间，不写入本地单机存档（避免污染个人世界）
      this.world._trackEdits = false;
      // 远程玩家/挂起队列先清空，稍后由房间方块重新填充
      this.remotePlayers.clear();

      // 生成固定出生家园（不计入个人存档，也不会被当作共建方块上传）
      let sx = PLAYER_SPAWN.x, sz = PLAYER_SPAWN.z, sy = PLAYER_SPAWN.y;
      try {
        const home = this.structures.decorateSpawn();
        for (let cx = -3; cx <= 6; cx++) {
          for (let cz = -4; cz <= 3; cz++) {
            this.world.update(cx * 16 + 8, cz * 16 + 8);
          }
        }
        await new Promise(r => setTimeout(r, 60));
        const cleared = this.world.clearSpawnArea(Math.floor(home.spawnX), Math.floor(home.spawnZ));
        this.world.update(Math.floor(home.spawnX), Math.floor(home.spawnZ));
        sx = cleared.x; sz = cleared.z; sy = cleared.y + 2;
      } catch (e) { console.warn('[mp] 出生家园生成失败，使用默认落点', e); }

      // 统一落点：同房所有人都从出生家园同一位置开始
      this._spawnX = sx; this._spawnY = sy; this._spawnZ = sz;
      this.player.position.set(sx, sy, sz);
      this.player.velocity.set(0, 0, 0);
      this.player.yaw = 0;
      this.player.pitch = 0;
      // 清掉旧世界残留掉落物/动物
      try { if (this.dropManager && this.dropManager.clear) this.dropManager.clear(); } catch (e) {}
      try { if (this.animalManager && this.animalManager.dispose) this.animalManager.dispose(); } catch (e) {}
      this._toast('🏠 已进入共建世界，和小伙伴在出生点会合吧！');
    } catch (e) {
      console.warn('[mp] 切换共建世界失败', e);
    }
  }

  /** 一键回到出生家园（防迷路/卡住）。传送到出生点并确保站在安全高度。 */
  /** 桌面端右上角“?”操作说明面板：点击收起/展开 */
  _initControlsPanel() {
    const panel = this.ui && this.ui.controlsPanel;
    if (!panel) return;
    const trigger = panel.querySelector('#controlsTrigger');
    if (!trigger) return;
    const toggle = (ev) => {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      panel.classList.toggle('collapsed');
      try { if (this.sound) this.sound.click(); } catch (e) {}
    };
    trigger.addEventListener('click', toggle);
  }

  /** 世界小地图（M 键 / 手机菜单“地图”） */
  _initWorldMap() {
    if (this.worldMap) return;
    const windmillSpot = (this.structures && this.structures.windmillSpot) || null;
    this.worldMap = new WorldMap(this.world, {
      home: { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z },
      windmill: windmillSpot ? { x: windmillSpot.x, z: windmillSpot.z } : null,
      island: { x: SAKURA_ISLAND_X, z: SAKURA_ISLAND_Z },
      getPlayer: () => {
        if (!this.player) return null;
        return { x: this.player.position.x, z: this.player.position.z, yaw: this.player.yaw };
      },
    });
  }

  _toggleWorldMap() {
    if (!this.worldMap) {
      try { this._initWorldMap(); } catch (e) { console.warn('[map] init fail', e); return; }
    }
    // 世界生成后再取风车坐标补全（初始化时可能尚未生成）
    if (this.worldMap && !this.worldMap.windmill && this.structures && this.structures.windmillSpot) {
      this.worldMap.windmill = { x: this.structures.windmillSpot.x, z: this.structures.windmillSpot.z };
    }
    const willOpen = !this.worldMap.open;
    this.worldMap.toggle();
    if (willOpen) {
      // 打开地图：释放鼠标指针，方便点击缩放/关闭
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
      if (this.sound) { try { this.sound.click(); } catch (e) {} }
    }
  }

  /** 准星对准可坐/可躺家具时，在准星下方显示操作提示 */
  _updateSeatHint() {
    const el = this._seatHintEl;
    if (!el) return;
    if (this.player.pose !== 'stand') {
      el.hidden = false;
      el.innerHTML = '按 <b>F</b> 或移动起身';
      const btn = document.getElementById('btnSeat');
      if (btn) { btn.classList.add('show'); btn.textContent = '起'; }
      return;
    }
    const t = this.player.targetBlock;
    let label = '';
    let btnText = '';
    if (t) {
      if (t.type === BlockType.CHAIR_WOOD) { label = '木椅 · 按 <b>F</b> 坐下'; btnText = '坐'; }
      else if (t.type === BlockType.SOFA_RED) { label = '沙发 · 按 <b>F</b> 坐下'; btnText = '坐'; }
      else if (t.type === BlockType.BED_RED || t.type === BlockType.BED_BLUE
        || t.type === BlockType.BED_GREEN || t.type === BlockType.BED_YELLOW) { label = '小床 · 按 <b>F</b> 躺下'; btnText = '躺'; }
    }
    const btn = document.getElementById('btnSeat');
    if (label) {
      el.hidden = false; el.innerHTML = label;
      if (btn) { btn.classList.add('show'); btn.textContent = btnText; }
    } else {
      el.hidden = true;
      if (btn) btn.classList.remove('show');
    }
  }

  /** 家具朝向 dir → 坐/卧时玩家面朝方向（furnDir 正面方向向量） */
  _furnDirToYaw(dir) {
    // 0=正面朝 +z（南） yaw=π；1=-x（西） yaw=π/2；2=-z（北） yaw=0；3=+x（东） yaw=-π/2
    return [Math.PI, Math.PI / 2, 0, -Math.PI / 2][dir & 3];
  }

  /** 准星对准椅子/沙发/床时交互：坐下 / 躺下；已坐着再按则起身 */
  interactSeat() {
    if (!this.isRunning || !this.player) return;
    if (this.player.pose !== 'stand') {
      this.player.standUp();
      if (this.playerChar) this.playerChar.setPose('stand');
      this._toast('起身啦');
      return;
    }
    const t = this.player.targetBlock;
    if (!t) { this._toast('对准椅子、沙发或床再按哦'); return; }
    let pose = null;
    if (t.type === BlockType.CHAIR_WOOD || t.type === BlockType.SOFA_RED) pose = 'sit';
    else if (t.type === BlockType.BED_RED || t.type === BlockType.BED_BLUE
      || t.type === BlockType.BED_GREEN || t.type === BlockType.BED_YELLOW) pose = 'lie';
    if (!pose) { this._toast('这个还不能坐哦'); return; }
    // 预生成目标区块，并在座位周围补一圈，避免家具朝向读不到
    this.world.update(t.x, t.z);
    this.world.update(t.x + 1, t.z); this.world.update(t.x - 1, t.z);
    this.world.update(t.x, t.z + 1); this.world.update(t.x, t.z - 1);
    const dir = this.world.getFurnDirAt ? this.world.getFurnDirAt(t.x, t.y, t.z) : 0;
    const yaw = this._furnDirToYaw(typeof dir === 'number' ? dir : 0);
    this.player.sitOn(t, pose, yaw);
    if (this.playerChar) this.playerChar.setPose(pose);
    this._toast(pose === 'lie' ? '🛏️ 躺平休息啦，按 F 或移动起身' : '🪑 坐下啦，按 F 或移动起身');
  }

  /** 传送到距离最近的队友身边（多人联机防走散） */
  teleportToTeammate() {
    if (!this.isRunning || !this.player) return;
    if (!this.mp || !this.mp.inRoom || !this.remotePlayers || this.remotePlayers.count === 0) {
      this._toast('当前房间里还没有其他小伙伴哦');
      return;
    }
    try {
      const near = this.remotePlayers.nearest(this.player.position.x, this.player.position.z);
      if (!near) { this._toast('找不到队友位置'); return; }
      if (this._doTeleportTo(near)) this._toast(`🧲 已传送到 ${near.rp.nickname} 身边（相距约 ${Math.round(near.dist)} 格）`);
    } catch (e) {
      console.warn('[传送队友失败]', e);
      this._toast('传送失败，请再试一次');
    }
  }

  /** 真正执行落地到队友身边；成功 true。供手动传送与自动召回共用。 */
  _doTeleportTo(near) {
    const rp = near.rp;
    const tx = rp.cur.x, tz = rp.cur.z;
    // 强制加载目标周围区块，避免读到未生成地形
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) this.world.update(tx + cx * 16, tz + cz * 16);
    }
    // 落在队友旁边 1.5 格，避免两个角色重叠被互相推开
    let lx = tx + 1.5, lz = tz;
    let y = rp.cur.y + 1;
    try {
      const surf = this.world.getSurfaceHeight(Math.floor(lx), Math.floor(lz));
      if (typeof surf === 'number' && surf > 0) y = surf + 2;
    } catch (e) {}
    this.player.position.set(lx, y, lz);
    this.player.velocity.set(0, 0, 0);
    // 落在队友东侧，面朝 -Z 即朝向队友
    this.player.yaw = 0;
    if (typeof this.player.orbitYaw === 'number') this.player.orbitYaw = 0;
    this.player.onGround = false;
    if (this.playerChar) this.playerChar.group.position.set(lx, y + 0.25, lz);
    this.world.update(lx, lz);
    if (this.sound) try { this.sound.click(); } catch (e) {}
    return true;
  }

  /**
   * 走远自动召回：与最近队友距离 > TEAM_RECALL_DIST 持续 TEAM_RECALL_DELAY 秒，
   * 就把本地玩家拉回队友身边（只移动走远的那一方，各自独立判定，不会互相弹跳）。
   */
  _updateTeamRecall(dt) {
    if (!(this.isRunning && this.player && this.mp && this.mp.inRoom && this.remotePlayers && this.remotePlayers.count > 0)) {
      this._recallOverTime = 0;
      return;
    }
    if (this._recallCooldown > 0) this._recallCooldown -= dt;
    const near = this.remotePlayers.nearest(this.player.position.x, this.player.position.z);
    if (!near) { this._recallOverTime = 0; return; }
    if (near.dist > TEAM_RECALL_DIST) {
      this._recallOverTime += dt;
      if (this._recallOverTime >= TEAM_RECALL_DELAY && this._recallCooldown <= 0) {
        this._doTeleportTo(near);
        this._recallOverTime = 0;
        this._recallCooldown = TEAM_RECALL_COOLDOWN;
        this._toast(`🧲 离 ${near.rp.nickname} 太远啦，已带你回到 TA 身边`);
        this._appendChatSystem && this._appendChatSystem('你走得太远，已自动回到小伙伴身边');
      }
    } else {
      this._recallOverTime = 0;
    }
  }

  /** 每帧更新"队友过远"边缘指引（多人联机） */
  _updateTeamPointer() {
    const el = this._teamPointerEl;
    const inRoom = !!(this.isRunning && this.mp && this.mp.inRoom);
    // 聊天条 / 找队友·说话按钮：只要在房间里就显示（哪怕暂时只有自己）
    document.querySelectorAll('.m-fn-team, .m-fn-chat').forEach((b) => { b.style.display = inRoom ? '' : 'none'; });
    if (inRoom) {
      if (this._chatDock && this._chatDock.style.display === 'none') this._setChatVisible(true);
    } else {
      this._setChatVisible(false);
    }
    if (!el) return;
    const active = !!(inRoom && this.remotePlayers && this.remotePlayers.count > 0);
    if (!active) {
      if (el.classList.contains('show')) el.classList.remove('show');
      return;
    }
    const near = this.remotePlayers.nearest(this.player.position.x, this.player.position.z);
    if (!near || near.dist <= TEAM_POINTER_SHOW_DIST) { el.classList.remove('show'); return; }

    const rp = near.rp;
    const yaw = (this.viewMode === 'third' && typeof this.player.orbitYaw === 'number') ? this.player.orbitYaw : this.player.yaw;
    const dx = rp.cur.x - this.player.position.x;
    const dz = rp.cur.z - this.player.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    // 相机前向 (-sin,-cos)、右向 (cos,-sin)；φ=0 正前方，>0 在右侧
    const fDot = -ux * Math.sin(yaw) - uz * Math.cos(yaw);
    const rDot = ux * Math.cos(yaw) - uz * Math.sin(yaw);
    const phi = Math.atan2(rDot, fDot);
    const deg = phi * 180 / Math.PI;

    const Rx = Math.max(60, window.innerWidth / 2 - 52);
    const Ry = Math.max(60, window.innerHeight / 2 - 70);
    const ox = Math.sin(phi) * Rx;
    const oy = -Math.cos(phi) * Ry;
    const arrow = el.querySelector('.tp-arrow');
    if (arrow) arrow.style.transform = `translate(${ox}px, ${oy}px) rotate(${deg}deg)`;
    const info = el.querySelector('.tp-info');
    if (info) info.style.transform = `translate(calc(-50% + ${ox}px), ${oy - 8}px)`;
    const nameEl = el.querySelector('.tp-name');
    const distEl = el.querySelector('.tp-dist');
    if (nameEl) nameEl.textContent = rp.nickname;
    if (distEl) distEl.textContent = `${Math.round(near.dist)} 格 · B键/点我传送`;
    if (!el.classList.contains('show')) el.classList.add('show');
  }

  teleportHome() {
    if (!this.isRunning || !this.player) return;
    try {
      const x = PLAYER_SPAWN.x;
      const z = PLAYER_SPAWN.z;
      // 取地表高度，确保不会卡在地下或悬空
      let y = PLAYER_SPAWN.y;
      try {
        // 强制加载出生点区块后再读地表，避免读到未生成区块
        for (let cx = -1; cx <= 1; cx++) {
          for (let cz = -1; cz <= 1; cz++) this.world.update(x + cx * 16, z + cz * 16);
        }
        const surf = this.world.getSurfaceHeight(Math.floor(x), Math.floor(z));
        if (typeof surf === 'number' && surf > 0) y = surf + 2;
      } catch (e) {}
      this.player.position.set(x, y, z);
      this.player.velocity.set(0, 0, 0);
      this.player.yaw = 0;
      this.player.pitch = -0.1;
      this.player.onGround = false;
      if (this.playerChar) this.playerChar.group.position.set(x, y + 0.25, z);
      // 再次强制刷新生点周围区块
      this.world.update(x, z);
      this._toast('🏠 已回到出生家园');
      if (this.sound) try { this.sound.click(); } catch (e) {}
    } catch (e) {
      console.warn('[回出生点失败]', e);
      this._toast('回家失败，请再试一次');
    }
  }

  /** 作品集相册：一键截图 + 相册 */
  _initPortfolio() {
    this.portfolio = new Portfolio(THREE);
    this.portfolio.onShot(() => {
      if (this.sound) { try { this.sound.click(); } catch (e) {} }
      this._toast('📷 已拍入作品集！按 P 查看相册');
    });

    // 右下角拍照按钮（移动端友好）
    const btn = document.createElement('button');
    btn.id = 'photoBtn';
    btn.className = 'photo-btn';
    btn.title = '拍照 (C)';
    btn.textContent = '📷';
    document.body.appendChild(btn);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.takePhoto();
    });

    // 相册按钮（在拍照按钮上方）
    const albumBtn = document.createElement('button');
    albumBtn.id = 'albumBtn';
    albumBtn.className = 'photo-btn album-btn';
    albumBtn.title = '作品集 (P)';
    albumBtn.textContent = '🖼';
    document.body.appendChild(albumBtn);
    albumBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._openMenu(() => this.portfolio.open(), () => this.portfolio.close());
    });
  }

  /**
   * 打开一个"覆盖式菜单"（背包/商店/相册）。
   * 统一处理：退出指针锁定、抑制暂停菜单弹出；关闭后自动恢复鼠标锁定。
   * @param {Function} openFn 真正打开面板的函数
   * @param {Function|null} closeFn 面板关闭时的回调（可选）
   */
  _openMenu(openFn, closeFn = null) {
    // 先同步打开面板、挂好关闭回调，再退出指针锁定
    try {
      openFn && openFn();
      this.ui.pauseScreen.style.display = 'none';
    } catch (err) {
      console.error('[菜单] 打开失败：', err);
      return;
    }
    // 标记当前有覆盖菜单打开（供 pointerlockchange 判断）
    this._menuOpen = true;
    // 关闭后：清除标记并回到游戏（桌面端重新锁定鼠标）
    const closeHandler = () => {
      this._menuOpen = false;
      closeFn && closeFn();
      if (!this.isMobile && this.isRunning && !document.pointerLockElement
          && !this._anyMenuOpen()) {
        try { this.canvas.requestPointerLock(); } catch (e) { /* 忽略 */ }
      }
    };
    this._menuCloseFn = closeHandler;
    // 把关闭回调挂到刚打开的面板上（点遮罩/X/内部ESC 关闭时触发）
    try {
      for (const p of [this.inventory, this.shop, this.portfolio]) {
        if (p && p.isOpen) { p.onClose = closeHandler; break; }
      }
    } catch (e) { /* 忽略 */ }
    // 抑制本次退出锁定可能带来的"暂停菜单"弹出（双保险）
    this._suppressPause = true;
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(() => { this._suppressPause = false; }, 300);
  }

  /** 是否有任何覆盖菜单仍处于打开状态 */
  _anyMenuOpen() {
    return (this.inventory && this.inventory.isOpen)
      || (this.shop && this.shop.isOpen)
      || (this.portfolio && this.portfolio.isOpen);
  }

  /** 打开装备兑换商店（懒创建 + 容错，确保 G 键始终可用） */
  _openShop() {
    try {
      if (!this.shop) {
        this.shop = new ExchangeShop();
        this.shop.onRedeem = (name, info) => {
          this.sound && this.sound.buy();
          this._toast(info && info.how ? `已兑换：${name}｜${info.how}` : `已兑换：${name}`);
        };
      }
      if (this.inventory) this.shop.inventory = this.inventory;
      // 未打开则走统一菜单流程（抑制暂停菜单 + 退出指针锁定）；已打开则 close() 会触发 onClose 恢复
      if (!this.shop.isOpen) {
        this._openMenu(() => this.shop.open(), () => this.shop.close());
      } else {
        this.shop.close();
      }
      this.sound && this.sound.click();
    } catch (err) {
      console.error('[商店] 打开失败：', err);
      this._suppressPause = false;
      this._toast('商店打开失败，请刷新重试');
    }
  }

  /** 拍摄当前场景 */
  takePhoto() {
    // 懒初始化：即使初始化阶段未成功，拍照时也补建相册
    if (!this.portfolio) {
      try { this._initPortfolio(); } catch (e) { console.error('[相册] 初始化失败', e); }
    }
    if (!this.portfolio || !this.renderer) {
      this._toast('相机还没准备好，请刷新页面后重试');
      return;
    }
    // 拍前渲染一帧保证画面最新
    try { this.renderer.render(this.scene, this.camera); } catch (e) {}
    const ok = this.portfolio.capture(this.renderer);
    if (ok) {
      this._photoFlash();
    } else {
      this._toast('拍照失败，请重试');
    }
  }

  /** 拍照白闪反馈 */
  _photoFlash() {
    let el = document.getElementById('photoFlash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'photoFlash';
      document.body.appendChild(el);
    }
    el.classList.remove('flashing');
    void el.offsetWidth; // 强制重排，重新触发动画
    el.classList.add('flashing');
    try { if (this.sound) this.sound.click(); } catch (e) {}
  }

  /** 手持武器时的挥砍反馈（音效 + 第一人称手臂挥动） */
  _swing() {
    try { if (this.sound) this.sound.break(); } catch (e) {}
    // 第一人称：手臂挥一下
    if (this.viewMode === 'first' && this.heldGroup) {
      this._swingT = 0.22; // 挥砍动画剩余时间
    }
  }

  /**
   * 隐藏彩蛋：按下 F 键在玩家头顶撒一波彩色庆祝粒子（樱花/彩带）。
   * 纯视觉、无副作用，约 2 秒后自动消失。
   */
  _celebrate() {
    if (!this.scene || !this.player) return;
    try { if (this.sound) this.sound.taskDone(); } catch (e) {}
    const N = 60;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const vel = [];
    const cx = this.player.position.x;
    const cy = this.player.position.y + 2.2;
    const cz = this.player.position.z;
    const palette = [
      [1.0, 0.55, 0.75], // 粉
      [1.0, 0.9, 0.4],   // 黄
      [0.55, 0.85, 1.0], // 蓝
      [0.6, 1.0, 0.6],   // 绿
      [0.85, 0.65, 1.0], // 紫
    ];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = cx;
      pos[i * 3 + 1] = cy;
      pos[i * 3 + 2] = cz;
      const c = palette[i % palette.length];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;
      vel.push(new THREE.Vector3(
        Math.cos(ang) * spd,
        3 + Math.random() * 3,
        Math.sin(ang) * spd
      ));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.28, vertexColors: true, transparent: true,
      depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this._toast('🌸 彩蛋：撒花庆祝！');

    let life = 2.0;
    const tick = (dt) => {
      life -= dt;
      const arr = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const v = vel[i];
        v.y -= 9 * dt; // 重力
        arr[i * 3] += v.x * dt;
        arr[i * 3 + 1] += v.y * dt;
        arr[i * 3 + 2] += v.z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = Math.max(0, life / 2.0);
      if (life <= 0) {
        this.scene.remove(points);
        geo.dispose(); mat.dispose();
        return false;
      }
      return true;
    };
    if (!this._celebrates) this._celebrates = [];
    this._celebrates.push(tick);
  }

  /** 存档相关按钮与事件 */
  _initSaveUI() {
    const autoSave = () => {
      if (this.world) {
        // 强制保存当前位置 + 改动，确保随时关掉都不丢进度
        try { writeSave(this._collectSaveData()); } catch (e) { console.warn('[save] 自动保存失败', e); }
      }
    };
    window.addEventListener('beforeunload', autoSave);
    window.addEventListener('pagehide', autoSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') autoSave();
    });
    // 离开页面时退出多人房间（presence 自动通知其他人离线）
    const leaveMp = () => {
      try {
        if (this.mp && this.mp.inRoom) this.mp.leave();
        const badge = document.getElementById('mpBadge');
        if (badge) badge.hidden = true;
      } catch (e) {}
    };
    window.addEventListener('beforeunload', leaveMp);
    window.addEventListener('pagehide', leaveMp);

    // 开始界面：继续 / 新世界 / 导出 / 导入
    const continueBtn = document.getElementById('continueBtn');
    const newWorldBtn = document.getElementById('newWorldBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');

    const hasExisting = hasSave();
    if (continueBtn) continueBtn.style.display = hasExisting ? '' : 'none';
    // “继续”按钮：显式进入游戏（与开始按钮同一入口）
    if (continueBtn) {
      continueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof this._requestEnterGame === 'function') this._requestEnterGame();
      });
    }
    if (newWorldBtn) {
      newWorldBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('开启一个全新的随机世界？当前本地存档将被清除（建议先导出备份）。')) {
          clearSave();
          location.reload();
        }
      });
    }
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.world) return;
        exportSave(this._collectSaveData());
        this._toast('存档已导出为文件');
      });
    }
    if (importBtn && importFile) {
      importBtn.addEventListener('click', (e) => e.stopPropagation());
      importFile.addEventListener('click', (e) => e.stopPropagation());
      importFile.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const data = await importSave(file);
        if (!data) { alert('导入失败：文件不是有效的存档。'); return; }
        if (writeSave(data)) {
          alert('存档已导入，即将重新载入世界。');
          location.reload();
        } else {
          alert('导入失败：无法写入本地存储。');
        }
      });
    }

    // 开始界面：主角选择（美味特工队 4 角色）
    // 用 try/catch 隔离：即使角色选择初始化异常，也绝不能拖垮后面的移动端菜单
    try { this._initCharSelect(); } catch (e) { console.warn('[char] 初始化失败', e); }
    // 开始界面两步引导（欢迎+留言墙 → 选特工+开始）
    try { this._initStartSteps(); } catch (e) { console.warn('[steps] 初始化失败', e); }
    // 移动端功能菜单（⋯）
    try { if (this.isMobile) this._initMobileMenu(); } catch (e) { console.warn('[mobile-menu] 初始化失败', e); }
    // 桌面端右上角操作说明：点击 “?” 收起/展开
    try { this._initControlsPanel(); } catch (e) { console.warn('[controls-panel] 初始化失败', e); }
    // 世界小地图（M 键 / 地图按钮）
    try { this._initWorldMap(); } catch (e) { console.warn('[world-map] 初始化失败', e); }

    // 游戏内快捷键：Ctrl+S 手动保存
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyS')) {
        e.preventDefault();
        if (this.world) this.saveNow(true);
      }
    });

    // 世界与全部界面初始化完成：允许"开始冒险"进入
    this._initReady = true;
  }

  /** 多人共建面板：昵称 / 建房 / 加入房间码 / 复制房码 */
  _initMultiplayerUI() {
    const box = document.getElementById('mpBox');
    if (!box) return;
    // 未配置云端时整个面板隐藏，不影响单机
    if (!this.mp || !isCommunityEnabled() || !window.supabase) { box.style.display = 'none'; return; }

    const nameInput = document.getElementById('mpName');
    const codeInput = document.getElementById('mpCode');
    const createBtn = document.getElementById('mpCreate');
    const joinBtn = document.getElementById('mpJoin');
    const codeBar = document.getElementById('mpCodeBar');
    const codeValue = document.getElementById('mpCodeValue');
    const copyBtn = document.getElementById('mpCopy');
    const setStatus = (t) => this._onMpStatus(t);

    if (nameInput) {
      if (this.mp.nickname) nameInput.value = this.mp.nickname;
      nameInput.addEventListener('input', () => this.mp.setNickname(nameInput.value));
    }
    // 房间码输入：大写、只保留字母数字
    if (codeInput) {
      codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
    }
    // 选角变化时同步给联机皮肤
    const syncSkin = () => { try { this.mp.setSkin(this._getSelectedChar()); } catch (e) {} };
    const busy = (on) => { if (createBtn) createBtn.disabled = on; if (joinBtn) joinBtn.disabled = on; };

    const showRoomCode = (code) => {
      if (codeBar && codeValue) {
        codeValue.textContent = code;
        codeBar.style.display = 'flex';
      }
    };

    if (createBtn) {
      createBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (nameInput && nameInput.value.trim()) this.mp.setNickname(nameInput.value);
        if (!this.mp.nickname || this.mp.nickname === '小探险家') {
          if (nameInput && !nameInput.value.trim()) { setStatus('先给小特工取个昵称，再创建房间哦～'); nameInput.focus(); return; }
        }
        syncSkin();
        busy(true); setStatus('正在创建房间…');
        const code = await this.mp.createRoom();
        busy(false);
        if (code) { showRoomCode(code); setStatus('🎉 房间已创建！房间码：' + code + ' 。把这串码发给小伙伴，让他们输入后点「加入」。进入游戏后就能一起搭建啦！'); }
      });
    }
    if (joinBtn && codeInput) {
      const doJoin = async () => {
        if (nameInput && nameInput.value.trim()) this.mp.setNickname(nameInput.value);
        const code = codeInput.value.trim();
        if (!code) { setStatus('请先输入小伙伴给你的 6 位房间码～'); codeInput.focus(); return; }
        syncSkin();
        busy(true); setStatus('正在加入房间 ' + code + ' …');
        const ok = await this.mp.joinRoom(code);
        busy(false);
        if (ok) { showRoomCode(code); setStatus('✅ 已加入房间 ' + code + '！点「开始冒险」进入世界，就能和小伙伴一起搭建、互相看到对方啦。'); }
      };
      joinBtn.addEventListener('click', (e) => { e.stopPropagation(); doJoin(); });
      codeInput.addEventListener('click', (e) => e.stopPropagation());
      codeInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doJoin(); });
    }
    if (copyBtn && codeValue) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = codeValue.textContent || '';
        const ok = this._copyText(code);
        if (ok) {
          copyBtn.textContent = '✅ 已复制';
          setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 1500);
        } else {
          // 剪贴板 API 不可用（非 HTTPS / 老浏览器）：自动选中房码方便手动复制
          try {
            const range = document.createRange();
            range.selectNodeContents(codeValue);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (err) {}
          setStatus('已选中房间码 ' + code + '，按 Ctrl/Cmd+C 复制给小伙伴。');
        }
      });
    }
    // 阻止面板上的点击/按键冒泡到开始界面（避免误触开始游戏 / 打字触发游戏按键）
    box.addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('keydown', (e) => e.stopPropagation());
    box.addEventListener('pointerdown', (e) => e.stopPropagation());

    // 初始一定隐藏游戏内多人徽章/横幅，只有真正进房后才出现
    const badge = document.getElementById('mpBadge');
    const banner = document.getElementById('mpBanner');
    if (badge) badge.hidden = true;
    if (banner) { banner.hidden = true; banner.classList.remove('hide'); }
  }

  /** 合法主角 key */
  _validAgent(k) {
    return ['burger', 'fries', 'popcorn', 'witch'].includes(k) ? k : null;
  }

  /** 读取当前选择的主角：优先独立本地存储，其次存档；兼容旧值 boy/girl */
  _getSelectedChar() {
    try {
      const c = localStorage.getItem('voxel_character_v1');
      if (this._validAgent(c)) return c;
      if (c === 'boy') return 'burger';
      if (c === 'girl') return 'witch';
    } catch (e) {}
    const saved = this.saveData?.player?.character;
    if (this._validAgent(saved)) return saved;
    if (saved === 'boy') return 'burger';
    if (saved === 'girl') return 'witch';
    return 'burger';
  }

  /** 开始界面主角选择（美味特工队 4 角色），选择立即写入本地保存。
   *  采用「事件委托」：监听绑在 document 捕获层，点击落到角色卡任意位置（含头像/名字）
   *  都能命中；不依赖逐卡绑定，也不怕子元素吞事件。桌面移动通用。 */
  _initCharSelect() {
    if (this._charSelectInited) return;
    this._charSelectInited = true;
    this.character = this._getSelectedChar();
    const VALID = ['burger', 'fries', 'popcorn', 'witch'];
    const cards = () => Array.from(document.querySelectorAll('#startScreen .char-card'));

    const apply = (gender, silent) => {
      if (!this._validAgent(gender)) return;
      this.character = gender;
      cards().forEach((c) => {
        const on = c.dataset.char === gender;
        c.classList.toggle('selected', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      // 第三人称角色实时换装
      if (this.playerChar) { try { this.playerChar.setSkin(gender); } catch (e) {} }
      // 第一人称手臂颜色跟随角色
      try { if (this.heldHolder) this._refreshHeldView(); } catch (e) {}
      // 立即持久化（开始游戏前也能记住），并同步到游戏存档
      try { localStorage.setItem('voxel_character_v1', gender); } catch (e) {}
      if (this.saveData) {
        this.saveData.player = this.saveData.player || {};
        this.saveData.player.character = gender;
      }
      try { if (this.player) this._scheduleSave(); } catch (e) {}
      if (!silent) { try { this.sound && this.sound.click && this.sound.click(); } catch (e) {} }
    };

    // 去重 + 执行
    let lastPick = 0;
    let lastCard = '';
    const fire = (key) => {
      if (!VALID.includes(key)) return;
      const now = Date.now();
      if (key === lastCard && now - lastPick < 450) return;
      lastPick = now; lastCard = key;
      apply(key);
    };

    // 1) 直接给每张角色卡绑定（最可靠：不依赖 closest 委托、不被父层拦截）
    cards().forEach((card) => {
      const key = card.dataset.char;
      if (!VALID.includes(key)) return;
      card.style.cursor = 'pointer';
      card.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fire(key); }, { passive: false });
      card.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fire(key); });
      card.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fire(key); });
      // 键盘可达性（Enter/空格 选中）
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(key); }
      });
    });

    // 2) document 捕获层兜底（扣子内嵌 WebView 对卡片自身事件不可靠时仍能命中）
    const handle = (e) => {
      const card = e.target && e.target.closest ? e.target.closest('#startScreen .char-card') : null;
      if (!card || !card.dataset) return;
      e.preventDefault();
      e.stopPropagation();
      fire(card.dataset.char);
    };
    document.addEventListener('touchstart', handle, { passive: false, capture: true });
    document.addEventListener('pointerdown', handle, { capture: true });
    document.addEventListener('click', handle, { capture: true });

    apply(this.character, true);
    this._charApply = apply;
  }

  /** 开始界面标签页切换（开始游戏 / 留言墙 / 存档更多） */
  /** 开始界面两步引导：第 1 步欢迎+留言墙 → 第 2 步选特工+开始 */
  _initStartSteps() {
    if (this._startStepsInited) return;
    this._startStepsInited = true;
    const steps = Array.from(document.querySelectorAll('#startScreen .start-step'));
    const dots = Array.from(document.querySelectorAll('#startScreen .step-dots .sd'));
    const nextBtn = document.getElementById('stepNextBtn');
    const backBtn = document.getElementById('stepBackBtn');
    if (!steps.length) return;
    let last = 0;
    const show = (n) => {
      steps.forEach((s) => {
        const on = s.dataset.step === String(n);
        s.classList.toggle('active', on);
        s.hidden = !on;
      });
      dots.forEach((d) => d.classList.toggle('active', Number(d.textContent.trim()) === n));
      try { this.sound && this.sound.click && this.sound.click(); } catch (err) {}
    };
    const bind = (el, fn) => {
      if (!el) return;
      const once = (e) => {
        const now = Date.now();
        if (now - last < 350) return;
        last = now;
        e.preventDefault();
        e.stopPropagation();
        try { fn(); } catch (err) { console.warn('[steps] action fail', err); }
      };
      // 直接绑定（最可靠）：触摸 + 点击
      el.addEventListener('touchstart', once, { passive: false });
      el.addEventListener('mousedown', once);
      el.addEventListener('click', once);
    };
    bind(nextBtn, () => show(2));
    bind(backBtn, () => show(1));
    // 委托兜底：即便直接绑定因缓存/时序失效，document 层也能识别按钮 id
    const delegate = (e) => {
      const t = e.target && e.target.closest && e.target.closest('#stepNextBtn, #stepBackBtn');
      if (!t) return;
      const now = Date.now();
      if (now - last < 350) return;
      last = now;
      e.preventDefault();
      e.stopPropagation();
      show(t.id === 'stepNextBtn' ? 2 : 1);
    };
    document.addEventListener('click', delegate);
    document.addEventListener('touchstart', delegate, { passive: false });
  }

  /** 移动端「⋯」功能菜单：把键盘上的功能键变成可点按钮 */
  _initMobileMenu() {
    const btn = document.getElementById('mMenuBtn');
    const panel = document.getElementById('mMenuPanel');
    if (!btn || !panel) return;

    // 兼容性最强的触摸方案：touchstart 是所有移动 WebView（含扣子 APP 内置浏览器）
    // 都保证最先、最可靠触发的事件，作为主触发；pointerdown / click 作为桌面与兜底。
    // 三者用时间戳去重，保证一次触摸只执行一次（开关类动作不会开了又关）。
    const singleFire = (el, action) => {
      let lastFire = 0;
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now - lastFire < 400) return; // 同一次触摸的后续事件，丢弃
        lastFire = now;
        try { action(); } catch (err) { console.warn('[mobile-menu]', err); }
      };
      el.addEventListener('touchstart', fire, { passive: false, capture: true });
      el.addEventListener('pointerdown', fire, { capture: true });
      el.addEventListener('click', fire, { capture: true });
    };

    singleFire(btn, () => panel.classList.toggle('open'));

    panel.querySelectorAll('.m-fn').forEach((b) => {
      singleFire(b, () => {
        this._mobileAction(b.dataset.fn);
        panel.classList.remove('open');
      });
    });

    // 点击菜单以外区域收起（touchstart + pointerdown 都监听，兼容各类 WebView）
    const onOutside = (e) => {
      if (panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.classList.remove('open');
      }
    };
    document.addEventListener('touchstart', onOutside, { passive: true, capture: true });
    document.addEventListener('pointerdown', onOutside, { capture: true });
  }

  /** 移动端功能按钮对应的动作（复用键盘逻辑） */
  _mobileAction(fn) {
    if (!this.isRunning && fn !== 'help') return;
    try {
      switch (fn) {
        case 'photo':
          this.takePhoto();
          break;
        case 'album':
          if (!this.portfolio) { try { this._initPortfolio(); } catch (err) { console.error(err); } }
          if (this.portfolio) {
            if (!this.portfolio.isOpen) this._openMenu(() => this.portfolio.open(), () => this.portfolio.close());
            else if (this._menuCloseFn) this._menuCloseFn();
          }
          break;
        case 'inventory':
          if (this.inventory && !this.inventory.isOpen) this._openMenu(() => this.inventory.open(), () => this.inventory.close());
          else if (this._menuCloseFn) this._menuCloseFn();
          break;
        case 'shop':
          if (this.shop && this.shop.isOpen && this._menuCloseFn) { this._menuCloseFn(); }
          else this._openShop();
          break;
        case 'view':
          this.toggleView();
          break;
        case 'home':
          this.teleportHome();
          break;
        case 'team':
          this.teleportToTeammate();
          break;
        case 'chat':
          this._toggleChatFocus();
          break;
        case 'map':
          this._toggleWorldMap();
          break;
        case 'fly':
          this.player.flying = !this.player.flying;
          if (this.player.flying) { this.player.velocity.y = 0; }
          this._toast(this.player.flying ? '🕊️ 飞行模式已开启（跳=上升，下蹲=下降）' : '已降落');
          this._scheduleSave();
          break;
        case 'weather':
          if (this.weather) {
            const order = [WeatherType.CLEAR, WeatherType.RAIN, WeatherType.SNOW];
            const idx = order.indexOf(this.weather.currentWeather);
            this.weather.setWeather(order[(idx + 1) % order.length]);
          }
          break;
        case 'help':
          this._toggleHelpMobile();
          break;
      }
    } catch (err) {
      console.warn('[mobile-menu] 动作失败', fn, err);
    }
  }

  /** 移动端简易说明弹层 */
  _toggleHelpMobile() {
    let el = document.getElementById('mHelpPanel');
    if (el) { el.remove(); return; }
    el = document.createElement('div');
    el.id = 'mHelpPanel';
    el.className = 'm-help-panel';
    el.innerHTML = `
      <div class="m-help-card">
        <div class="m-help-title">操作说明</div>
        <div class="m-help-row">🕹️ 左下摇杆：移动</div>
        <div class="m-help-row">👆 右侧空白处拖动：转视角</div>
        <div class="m-help-row">跳 / 拆 / 放：右侧三个按钮</div>
        <div class="m-help-row">底部方块栏：点选要放的方块</div>
        <div class="m-help-row">📷 拍照　🖼️ 相册　🎒 背包</div>
        <div class="m-help-row">🛒 商店　👁️ 切视角　🕊️ 飞行　🌦️ 天气</div>
        <button class="m-help-ok" type="button">知道啦</button>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === el || e.target.classList.contains('m-help-ok')) el.remove(); });
  }

  /** 创建区块 */
  _createChunk(cx, cz) {
    const key = this.world.chunkKey(cx, cz);
    if (this.world.chunks.has(key)) return this.world.chunks.get(key);

    const chunk = new Chunk(cx, cz);
    this.world.generateChunkData(chunk);
    chunk.buildMesh(
      (wx, wy, wz) => this.world.getBlock(wx, wy, wz),
      this.world.material, this.world.waterMaterial, this.world.crossMaterial, this.world.glassMaterial
    );
    this.world.chunks.set(key, chunk);
    // 检查是否生成村庄（村庄写入的方块属于世界生成，不计入存档改动）
    if (this.villageGenerator) {
      const prevTrack = this.world._trackEdits;
      this.world._trackEdits = false;
      this.villageGenerator.onChunkGenerated(chunk);
      this.world._trackEdits = prevTrack;
      // 村庄生成后再回放一次玩家改动，保证玩家操作优先
      this.world.applyEdits(chunk);
      if (chunk.dirty) {
        chunk.buildMesh(
          (wx, wy, wz) => this.world.getBlock(wx, wy, wz),
          this.world.material, this.world.waterMaterial, this.world.crossMaterial, this.world.glassMaterial
        );
      }
    }
    return chunk;
  }

  /** 初始化渲染器 */
  _initRenderer() {
    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: this.isMobile ? 'low-power' : 'default',
        preserveDrawingBuffer: true, // 支持作品集截图（toDataURL）
      });
    } catch (err) {
      renderer = null;
    }
    if (!renderer || !renderer.getContext || !renderer.getContext()) {
      // WebGL 不可用：明确提示，而不是继续进主循环导致画面/输入全卡死
      this.renderer = null;
      const tip = '当前浏览器无法开启 3D 渲染（WebGL）。请换用最新版 Chrome / Edge / Safari，'
        + '或在系统设置里开启"硬件加速 / 硬件加速图形"后刷新重试。';
      console.error('[WebGL 初始化失败]', tip);
      if (window.__showErrorOverlay) window.__showErrorOverlay(tip);
      const bar = document.getElementById('loadingFill');
      if (bar) bar.style.width = '100%';
      const lb = document.getElementById('loadingBar');
      if (lb) lb.style.display = 'none';
      throw new Error('WebGL context unavailable');
    }
    this.renderer = renderer;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // 移动端降低像素比以提升性能
    const maxPixelRatio = this.isMobile ? 1.2 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    this.renderer.setClearColor(0x87CEEB);
  }

  /** 初始化场景与灯光 */
  _initScene() {
    this.scene = new THREE.Scene();

    // 雾效：距离根据设备动态调整
    const fogFar = this.renderDistance * CHUNK_SIZE + 4;
    const fogNear = this.isMobile ? Math.max(25, fogFar - 20) : Math.max(15, fogFar - 40);
    this.scene.fog = new THREE.Fog(0x87CEEB, fogNear, fogFar);

    // 初始化世界（有存档则沿用同一颗种子，保证地形一致）
    const seed = this.saveData && typeof this.saveData.seed === 'number'
      ? this.saveData.seed
      : (Math.floor(Math.random() * 1e9) + 1);
    this.worldSeed = seed;
    this.world = new World(this.scene, seed);
    this.world.renderDistance = this.renderDistance;
    this.world.init();
    // 载入历史方块改动（区块生成时回放）
    if (this.saveData && this.saveData.edits) this.world.loadEdits(this.saveData.edits);
    this.world.onPlayerEdit = () => this._markSaveDirty();
    // 家具微模型构建钩子：床/桌/椅/沙发/箱子渲染为真实 3D 造型而非满格贴图块
    this.world.furnitureBuilder = (chunk) =>
      buildFurnitureGroup(THREE, chunk, chunk.cx * CHUNK_SIZE, chunk.cz * CHUNK_SIZE);

    // 昼夜循环系统（管理太阳/月亮/星空/天空色/光照）
    this.dayNight = new DayNightCycle(this.scene, { dayLength: 240, startTime: 0.28 });
    // 儿童模式：默认永远明亮白天，不再有吓人的黑夜
    this.dayNight.setAlwaysDay(true);

    // 天气系统（把天色叠加权交给昼夜系统）
    this.weather = new WeatherSystem(this.scene);
    this.weather.dayNight = this.dayNight;
    this.weather.init();
    this.scene.background = new THREE.Color(0x87ceeb);

    // 生物管理器
    this.animalManager = new AnimalManager(this.scene, this.world);

    // 掉落物管理器
    this.dropManager = new DropManager(this.scene, this.world);
    this.dropManager.onCollect((blockType) => {
      this.collectedBlocks[blockType] = (this.collectedBlocks[blockType] || 0) + 1;
      if (this.sound) this.sound.collect();
    });

    // 村庄生成器
    this.villageGenerator = new VillageGenerator(this.world, this.animalManager);

    // 出生点结构（凉亭/小桥/鲜花）
    this.structures = new StructureGenerator(this.world);
    // 樱花海岛装饰钩子：任何区块（含老存档后加载的区块）首次生成地形时，
    // 若落在樱花岛范围，自动堆出环形山/火山口湖/山顶樱花林/湖边庄园
    this.world.chunkDecorator = (chunk) => this.structures.decorateSakuraIslandChunk(chunk);

    // 天空飞鸟
    this.birdManager = new BirdManager(this.scene, this.isMobile ? 5 : 9);

    // 花田/樱花区蝴蝶（数量少）
    this.butterflyManager = new ButterflyManager(this.scene, this.isMobile ? 4 : 8);
    // 漂浮光点小精灵（花田暖光，数量少）
    this.fireflies = new Fireflies(this.scene, this.isMobile ? 14 : 26);
    // 樱花花瓣（出生在樱花林，始终飘一些花瓣增加氛围）
    this.sakura = new SakuraPetals(this.scene, this.isMobile ? 120 : 220);

    // 音效系统（WebAudio 实时合成，无音频文件）
    this.sound = new SoundFX();
    // 新手引导（向导兔子 + 三步任务）
    this.tutorial = new Tutorial(this.scene, THREE, this.sound);

    // 相机
    this.defaultFov = this.isMobile ? 90 : 75;
    this.fov = this.defaultFov;
    this.fovMin = 15;
    this.fovMax = 130;
    this.camera = new THREE.PerspectiveCamera(
      this.fov, window.innerWidth / window.innerHeight, 0.1, 1000
    );

    // 第一人称手持视图（手臂 + 手持物品）
    this.heldGroup = new THREE.Group();
    this.heldHolder = new THREE.Group();
    this.heldHolder.add(this.heldGroup);
    this.camera.add(this.heldHolder);
    this.scene.add(this.camera);
    this._heldBob = 0;
    this._refreshHeldView();

    // 第三人称完整角色（V 键切换）
    this.viewMode = 'first'; // 'first' | 'third'
    this.playerChar = new PlayerCharacter(this.scene);
    this.playerChar.setSkin(this._getSelectedChar());
    this.camDist = 4.2;

    // 多人共建（未配置 Supabase 时自动禁用，不影响单机）
    this.mp = new Multiplayer();
    this.mp.setSkin(this._getSelectedChar());
    this.remotePlayers = new RemotePlayers(this.scene, THREE, PlayerCharacter);
    this.mp.on({
      edit: (r, isInitial) => {
        try { this.world.setBlockRemote(r.bx, r.by, r.bz, r.type, (typeof r.dir === 'number' ? r.dir : -1)); } catch (e) {}
      },
      presence: (list) => { try { this.remotePlayers.sync(list); } catch (e) {} },
      status: (msg) => { this._onMpStatus(msg); },
      roomEnter: async (code) => { await this._switchToRoomWorld(code); },
      chat: (msg) => { this._onTeammateChat(msg); },
      roster: (ev) => { this._onMpRoster(ev); },
    });
  }

  // —— 多人在线名单 / 上下线提醒 / 状态徽章 ——
  _onMpRoster(ev) {
    try {
      // 双保险：只有真正在房间里才更新徽章/弹横幅（清点人数阶段不会误触发）
      if (!this.mp || !this.mp.inRoom || !this.mp.roomCode) return;
      const total = (typeof ev.total === 'number' ? ev.total : ev.count + 1);
      this._setMpBadge(total);
      if (ev.type === 'snapshot') {
        // 自己刚进房：弹欢迎横幅 + 已在场队友提示
        this._showMpBanner(total, ev.count);
        if (ev.count > 0) this._appendChatSystem('当前房间还有 ' + ev.count + ' 位小伙伴在线');
        else this._appendChatSystem('你是第一个进入房间的，等小伙伴加入吧');
      } else if (ev.type === 'change') {
        for (const j of ev.joined) {
          this._toast('🟢 ' + j.nickname + ' 上线啦');
          this._appendChatSystem('🟢 ' + j.nickname + ' 加入了房间');
        }
        for (const l of ev.left) {
          this._toast('⚪ ' + l.nickname + ' 下线了');
          this._appendChatSystem('⚪ ' + l.nickname + ' 离开了房间');
        }
      }
    } catch (e) { /* 提示失败不影响联机 */ }
  }

  _setMpBadge(total) {
    const badge = document.getElementById('mpBadge');
    const codeEl = document.getElementById('mpBadgeCode');
    const countEl = document.getElementById('mpBadgeCount');
    if (!badge) return;
    if (this.mp && this.mp.inRoom) {
      badge.hidden = false;
      if (codeEl) codeEl.textContent = this.mp.roomCode || '';
      if (countEl) countEl.textContent = total + ' 人在线';
    } else {
      badge.hidden = true;
    }
  }

  _showMpBanner(total, others) {
    const banner = document.getElementById('mpBanner');
    const codeEl = document.getElementById('mpBannerCode');
    const peopleEl = document.getElementById('mpBannerPeople');
    const copyBtn = document.getElementById('mpBannerCopy');
    if (!banner) return;
    if (codeEl) codeEl.textContent = this.mp ? this.mp.roomCode : '';
    if (peopleEl) {
      peopleEl.textContent = others > 0
        ? ('已有 ' + others + ' 位小伙伴在房间里 · 共 ' + total + ' 人')
        : ('你是第 1 位进入的 · 房间还可再来 3 位小伙伴');
    }
    banner.classList.remove('hide');
    banner.hidden = false;
    clearTimeout(this._mpBannerTimer);
    this._mpBannerTimer = setTimeout(() => {
      banner.classList.add('hide');
      setTimeout(() => { banner.hidden = true; banner.classList.remove('hide'); }, 520);
    }, 3200);
  }

  // 聊天记录里的系统提示（居中浅色小字）
  _appendChatSystem(text) {
    if (!this._chatLog) return;
    const div = document.createElement('div');
    div.className = 'chat-msg sys';
    div.textContent = text;
    this._chatLog.appendChild(div);
    while (this._chatLog.children.length > 8) this._chatLog.removeChild(this._chatLog.firstChild);
    this._chatLog.scrollTop = this._chatLog.scrollHeight;
  }

  // 收到队友对话：头顶气泡 + 聊天条留痕
  _onTeammateChat(msg) {
    try { this.remotePlayers.speak(msg.pid, msg.text, 6500); } catch (e) {}
    this._appendChatLog(msg.nickname, msg.text, false);
    try { this.sound && this.sound.click && this.sound.click(); } catch (e) {}
  }

  // 自己发送对话
  _sendChat(text) {
    const t = String(text == null ? '' : text).trim().slice(0, 80);
    if (!t || !this.mp || !this.mp.inRoom) return;
    const ok = this.mp.sendChat(t);
    if (ok) {
      this._appendChatLog(this.mp.nickname || '我', t, true);
      try { this.sound && this.sound.click && this.sound.click(); } catch (e) {}
    }
  }

  // —— 多人聊天 UI ——
  _initChatUI() {
    this._chatDock = document.getElementById('chatDock');
    this._chatLog = document.getElementById('chatLog');
    this._chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSendBtn');
    if (!this._chatDock || !this._chatInput) return;
    this._chatInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') { e.preventDefault(); this._commitChat(); }
      e.stopPropagation(); // 打字时不触发游戏键位（Esc 由全局输入框守卫负责失焦）
    });
    this._chatInput.addEventListener('keyup', (e) => e.stopPropagation());
    if (sendBtn) sendBtn.addEventListener('click', (e) => { e.preventDefault(); this._commitChat(); });
    this._initVoiceChat();

    // 多人徽章 / 横幅：点击复制房间号
    const bindCopy = (el) => {
      if (!el) return;
      const copy = (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (_) {}
        if (!this.mp || !this.mp.inRoom || !this.mp.roomCode) return;
        const ok = this._copyText(this.mp.roomCode);
        if (ok) this._toast('✅ 房间号已复制：' + this.mp.roomCode);
      };
      el.addEventListener('click', copy);
      ['pointerdown', 'mousedown', 'touchstart'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
    };
    bindCopy(document.getElementById('mpBadge'));
    bindCopy(document.getElementById('mpBannerCopy'));
  }

  // 语音转文字：浏览器自带 Web Speech API（Chrome / Edge / Safari 支持）
  _initVoiceChat() {
    const micBtn = document.getElementById('chatMicBtn');
    if (!micBtn) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      // 浏览器不支持：麦克风按钮置灰并说明
      micBtn.classList.add('unsupported');
      micBtn.title = '当前浏览器不支持语音，换 Chrome / Edge / Safari，或直接打字';
      micBtn.addEventListener('click', () => {
        this._toast('这个浏览器不支持语音哦，换 Chrome/Edge/Safari 或直接打字');
      });
      return;
    }
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.interimResults = true;
    rec.continuous = false;
    this._voiceRec = rec;
    this._voiceBase = '';      // 开始听之前输入框里已有的文字
    this._voiceListening = false;

    rec.onstart = () => {
      this._voiceListening = true;
      this._voiceBase = this._chatInput ? this._chatInput.value : '';
      micBtn.classList.add('listening');
      micBtn.textContent = '⏺';
      this._toast('🎤 在听啦，慢慢说…');
    };
    rec.onresult = (ev) => {
      let interim = '', finalText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (this._chatInput) {
        this._chatInput.value = (this._voiceBase + finalText + interim).slice(0, 80);
        if (finalText) this._voiceBase = (this._voiceBase + finalText).slice(0, 80);
      }
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        this._toast('没拿到麦克风权限，请在浏览器地址栏允许使用麦克风');
      } else if (ev.error === 'no-speech') {
        this._toast('没听到声音，再靠近一点说试试');
      } else if (ev.error === 'network') {
        this._toast('语音识别需要联网，请检查网络');
      } else {
        this._toast('语音识别没成功（' + ev.error + '），可以打字');
      }
    };
    const stopUI = (autoSend) => {
      if (!this._voiceListening) return;
      this._voiceListening = false;
      micBtn.classList.remove('listening');
      micBtn.textContent = '🎤';
      const text = (this._chatInput ? this._chatInput.value.trim() : '');
      if (autoSend && text) this._commitChat(); // 说完自动发送
      else if (this._chatInput) this._chatInput.focus();
    };
    rec.onend = () => stopUI(true);

    micBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.mp || !this.mp.inRoom) { this._toast('多人房间里才能说话哦'); return; }
      if (this._voiceListening) { try { rec.stop(); } catch (_) {} return; }
      try { rec.start(); } catch (_) {}
    });
    ['pointerdown', 'mousedown', 'touchstart'].forEach((ev) =>
      micBtn.addEventListener(ev, (e) => e.stopPropagation()));
  }

  _commitChat() {
    if (!this._chatInput) return;
    const t = this._chatInput.value;
    this._sendChat(t);
    this._chatInput.value = '';
    this._chatInput.blur(); // 发完回到游戏，恢复移动/视角
  }

  _setChatVisible(v) {
    if (this._chatDock) this._chatDock.style.display = v ? 'flex' : 'none';
  }

  _appendChatLog(nickname, text, mine) {
    if (!this._chatLog) return;
    const div = document.createElement('div');
    div.className = 'chat-msg' + (mine ? ' me' : '');
    const who = document.createElement('span');
    who.className = 'chat-who';
    who.textContent = (nickname || '小探险家') + '：';
    const body = document.createElement('span');
    body.textContent = text; // textContent 防注入
    div.appendChild(who); div.appendChild(body);
    this._chatLog.appendChild(div);
    while (this._chatLog.children.length > 8) this._chatLog.removeChild(this._chatLog.firstChild);
  }

  _toggleChatFocus() {
    if (!this.mp || !this.mp.inRoom) { this._toast('多人房间里才能聊天哦'); return; }
    if (!this._chatInput) return;
    if (document.activeElement === this._chatInput) this._chatInput.blur();
    else this._chatInput.focus();
  }

  // 多人状态提示：开始界面时写到面板，游戏内用 toast
  _onMpStatus(msg) {
    const el = document.getElementById('mpStatus');
    if (el && this.ui.startScreen && this.ui.startScreen.style.display !== 'none') {
      el.textContent = msg;
      el.classList.remove('mp-error', 'mp-success');
      if (/🛠️|失败|找不到|📶/.test(msg)) el.classList.add('mp-error');
      else if (/🎉|✅/.test(msg)) el.classList.add('mp-success');
    }
    try { this._toast(msg); } catch (e) {}
  }

  toggleView() {
    this.viewMode = this.viewMode === 'first' ? 'third' : 'first';
    this.playerChar.setVisible(this.viewMode === 'third');
    this.heldHolder.visible = this.viewMode === 'first';
    if (this.player) {
      this.player._orbitMode = (this.viewMode === 'third');
      if (this.viewMode === 'third') {
        // 进第三人称：相机从角色背后开始（orbitYaw 对齐当前朝向），身体朝向初始为前进方向
        this.player.orbitYaw = this.player.yaw;
        this.player.orbitPitch = 0.22;
        this.player.bodyYaw = this.player.yaw;
        // 立即把角色放到玩家身上（避免等下一帧才出现 / 停在世界原点）
        this.playerChar.update(this.player, 0);
        this._syncCharacter();
      } else {
        // 回第一人称：把视角朝向同步到当前相机轨道角，保证转身无缝
        this.player.yaw = this.player.orbitYaw;
        this.player.pitch = 0;
      }
    }
    this._toast(this.viewMode === 'third' ? '第三人称环绕视角（转鼠标看全身，V 切回）' : '第一人称视角 (V 切换)');
  }

  _syncCharacter() {
    if (!this.playerChar) return;
    // 盔甲：快捷栏内是否含胸甲/头盔
    const hot = (this.inventory && this.inventory.hotbar) ? this.inventory.hotbar : [];
    let armor = null;
    for (const id of hot) {
      if (typeof id === 'number' && id < 0) {
        const n = ItemNames[id] || '';
        if (n.includes('钻石')) armor = 'diamond';
        else if (n.includes('铁') && !armor) armor = 'iron';
      }
    }
    this.playerChar.setArmor(armor);
    // 手持物品
    const sel = this.inventory ? this.inventory.getSlot(this.inventory.selectedSlot) : null;
    if (typeof sel === 'number' && sel < 0) {
      this.playerChar.setHeld((scale) => {
        const m = createHeldModel(sel, scale);
        return m;
      });
    } else if (typeof sel === 'number' && sel > 0) {
      // 拿一个小方块
      this.playerChar.setHeld((scale) => {
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(scale, scale, scale),
          new THREE.MeshLambertMaterial({ color: getBlockColor(sel) })
        );
        return b;
      });
    } else {
      this.playerChar.setHeld(null);
    }
  }


  /** 根据当前选中槽位刷新手持模型 */
  _refreshHeldView() {
    // 清空旧模型
    while (this.heldGroup.children.length) {
      const ch = this.heldGroup.children[0];
      this.heldGroup.remove(ch);
    }
    const slot = this.inventory ? this.inventory.hotbar[this.inventory.selectedSlot ?? 0] : 0;
    // 持握内容挂点：位于手臂拳头位置（前方 -Z）
    const grip = new THREE.Group();
    grip.position.set(0, 0, -0.62);

    // 基础手臂（从屏幕右下角伸向镜头中央）
    // 检测是否穿戴盔甲（快捷栏里有对应胸甲则护臂变色）
    const hasDiamond = this._hotbarHasItem([-10, -9, -11, -12]);
    const hasIron = this._hotbarHasItem([-6, -5, -7, -8]);
    const armor = hasDiamond ? 'diamond' : hasIron ? 'iron' : null;
    // 以本地存储中“当前所选角色”为唯一真相，避免 this.character 时序问题导致手臂回退成默认汉堡
    const agentKey = this._getSelectedChar();
    this.character = agentKey;
    const armColors = armor ? null : (AGENT_ARMS[agentKey] || null);
    const arm = createArmModel(armor, armColors);
    arm.position.set(0.62, -0.62, -0.5);
    arm.rotation.set(0, 0, 0);
    this.heldGroup.add(arm);

    if (slot && slot < 0) {
      // 装备：把物品放在拳头位置（手握）
      const model = createHeldModel(slot);
      model.scale.setScalar(0.9);
      model.position.set(0, 0.1, -0.1);
      if (slot === -4) {
        // 盾牌竖立在前方
        model.rotation.set(0, 0, 0);
        model.position.set(0, 0.18, -0.15);
      } else if (slot >= -3) {
        // 剑朝上
        model.rotation.set(0, 0, -0.35);
      }
      grip.add(model);
    } else if (slot && slot > 0) {
      // 方块：手里握一个小方块
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.26, 0.26),
        new THREE.MeshLambertMaterial({ color: getBlockColor(slot) })
      );
      cube.position.set(0, 0.06, -0.02);
      cube.rotation.set(0.2, 0.6, 0);
      grip.add(cube);
    }
    arm.add(grip);
  }

  /** 快捷栏是否包含任一物品（负数=装备） */
  _hotbarHasItem(ids) {
    if (!this.inventory) return false;
    return this.inventory.hotbar.some(t => ids.includes(t));
  }

  /** 初始化玩家 */
  _initPlayer() {
    this.player = new Player(this.camera, this.world);
    this.player.dropManager = this.dropManager;
    // 放/拆方块：音效 + 新手引导进度（此时 player 与 sound 均已就绪）
    this.player.onPlace = (x, y, z, type, dir) => {
      if (this.sound) this.sound.place();
      if (this.tutorial) this.tutorial.notifyPlace();
      this._scheduleSave();
      if (this.mp && this.mp.inRoom) this.mp.pushEdit(x, y, z, type, dir);
    };
    this.player.onBreak = (x, y, z, type, dir) => {
      if (this.sound) this.sound.break();
      if (this.tutorial) this.tutorial.notifyBreak();
      this._scheduleSave();
      if (this.mp && this.mp.inRoom) this.mp.pushEdit(x, y, z, type, dir);
    };
    this.player.onStandUp = () => {
      if (this.playerChar) this.playerChar.setPose('stand');
    };
  }

  /** 初始化方块高亮 */
  _initHighlight() {
    this.highlight = new BlockHighlight(this.scene);
  }

  /** 初始化背包系统（必须在 world 就绪后调用） */
  _initInventory() {
    this.inventory = new Inventory(this.world);
    this.inventory.onHotbarChange = (hotbar) => {
      this._refreshHotbarFromInventory();
    };
    this._refreshHotbarFromInventory();

    // 背包槽位外部选中时同步游戏内热栏
    this.inventory.onSlotSelect = (i) => {
      this.selectedSlot = i;
      this._refreshHotbarFromInventory();
    };
  }

  /** 根据背包数据重建底部热键栏图标 */
  _refreshHotbarFromInventory() {
    if (!this.inventory) return;
    const hotbar = this.ui.hotbar;
    hotbar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = `hotbar-slot${i === this.selectedSlot ? ' selected' : ''}`;
      slot.dataset.index = i;
      const t = this.inventory.hotbar[i];
      if (t && t < 0) {
        // 装备：用装备像素图标
        const preview = document.createElement('div');
        preview.className = 'block-preview';
        preview.style.backgroundImage = `url(${getItemIcon(t)})`;
        preview.style.backgroundSize = 'contain';
        preview.style.backgroundRepeat = 'no-repeat';
        preview.style.backgroundPosition = 'center';
        preview.style.boxShadow = 'none';
        slot.appendChild(preview);
      } else if (t && t !== BlockType.AIR) {
        const preview = document.createElement('div');
        preview.className = 'block-preview';
        preview.style.background = getBlockColor(t);
        preview.style.boxShadow = 'inset -3px -3px 0 rgba(0,0,0,0.25), inset 3px 3px 0 rgba(255,255,255,0.15)';
        slot.appendChild(preview);
      } else if (i === 8) {
        // 第 9 格默认可作为磁铁收集
        const ico = document.createElement('div');
        ico.className = 'block-preview magnet-icon';
        ico.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" style="margin:4px"><path fill="#ff6" stroke="#222" stroke-width="1.5" d="M4 8h4v6a4 4 0 008 0V8h4v6a8 8 0 01-16 0V8z"/></svg>';
        ico.style.background = '#444';
        slot.appendChild(ico);
      }
      const keyLabel = document.createElement('span');
      keyLabel.className = 'slot-key';
      keyLabel.textContent = i + 1;
      slot.appendChild(keyLabel);
      slot.addEventListener('click', () => this._selectSlot(i));
      hotbar.appendChild(slot);
    }
    // 移动端同步
    if (this.isMobile) this._rebuildMobileHotbar();
    this._applySelectedSlot();
  }

  _selectSlot(i) {
    this.selectedSlot = i;
    const t = this.inventory ? this.inventory.hotbar[i] : BlockType.AIR;
    if (i === 8 && (!t || t === BlockType.AIR)) {
      this.magnetMode = !this.magnetMode;
      if (this.dropManager) this.dropManager.setMagnet(this.magnetMode);
    } else {
      this.magnetMode = false;
      if (this.dropManager) this.dropManager.setMagnet(false);
    }
    this._updateHotbar();
  }

  /** 应用当前选中格对应的方块 / 收集模式 */
  _applySelectedSlot() {
    if (!this.inventory) return;
    const t = this.inventory.hotbar[this.selectedSlot];
    if (this.selectedSlot === 8 && (!t || t === BlockType.AIR)) {
      this.player.selectedBlock = BlockType.AIR; // 第9格空槽 = 磁铁收集模式
    } else if (t && t < 0) {
      this.player.selectedBlock = t; // 装备（负 ID），手持不可放置
    } else {
      this.player.selectedBlock = t || BlockType.STONE;
    }
    if (this.dropManager) this.dropManager.setMagnet(this.magnetMode);
    this._refreshHeldView();
    this._syncCharacter();
  }

  /** 更新物品栏选中状态 */
  _updateHotbar() {
    const slots = this.ui.hotbar.querySelectorAll('.hotbar-slot');
    slots.forEach((slot, i) => {
      slot.classList.toggle('selected', i === this.selectedSlot);
    });
    this._applySelectedSlot();

    // 更新选中方块名称提示
    let name = '';
    const t = this.inventory ? this.inventory.hotbar[this.selectedSlot] : BlockType.AIR;
    if (this.selectedSlot === 8 && (!t || t === BlockType.AIR)) {
      name = '收集掉落物' + (this.magnetMode ? ' [开启]' : '');
    } else if (t && t < 0) {
      name = ItemNames[t] || '装备';
    } else {
      name = BlockNames[t] || '';
    }
    const nameEl = this.ui.selectedBlockName;
    if (nameEl) {
      nameEl.textContent = name;
      nameEl.style.transform = 'translateX(-50%) scale(1.15)';
      nameEl.style.opacity = '1';
      clearTimeout(this._nameTimer);
      this._nameTimer = setTimeout(() => {
        nameEl.style.transform = 'translateX(-50%) scale(1)';
      }, 120);
    }

    if (this.isMobile) this._updateMobileHotbar();
  }

  /** 初始化移动端物品栏（由 _refreshHotbarFromInventory 调用） */
  _rebuildMobileHotbar() {
    const mobileHotbar = document.getElementById('mobileHotbar');
    if (!mobileHotbar) return;
    mobileHotbar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = `m-slot${i === this.selectedSlot ? ' selected' : ''}`;
      slot.dataset.index = i;
      // 数字角标 1-9
      const num = document.createElement('div');
      num.className = 'm-slot-num';
      num.textContent = (i === 8) ? '🧲' : String(i + 1);
      slot.appendChild(num);
      const t = this.inventory ? this.inventory.hotbar[i] : BlockType.AIR;
      if (t && t < 0) {
        // 装备：用装备像素图标
        const preview = document.createElement('div');
        preview.className = 'm-block-preview';
        preview.style.backgroundImage = `url(${getItemIcon(t)})`;
        preview.style.backgroundSize = 'contain';
        preview.style.backgroundRepeat = 'no-repeat';
        preview.style.backgroundPosition = 'center';
        preview.style.boxShadow = 'none';
        slot.appendChild(preview);
      } else if (t && t !== BlockType.AIR) {
        const preview = document.createElement('div');
        preview.className = 'm-block-preview';
        preview.style.background = getBlockColor(t);
        preview.style.boxShadow = 'inset -2px -2px 0 rgba(0,0,0,0.25), inset 2px 2px 0 rgba(255,255,255,0.15)';
        slot.appendChild(preview);
      } else if (i === 8) {
        const ico = document.createElement('div');
        ico.className = 'm-block-preview';
        ico.style.background = '#444';
        ico.innerHTML = '<span style="color:#ff6;font-size:18px;font-weight:bold">9</span>';
        ico.style.display = 'flex';
        ico.style.alignItems = 'center';
        ico.style.justifyContent = 'center';
        slot.appendChild(ico);
      }
      slot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this._selectSlot(i);
      });
      mobileHotbar.appendChild(slot);
    }
  }

  /** 更新移动端物品栏选中状态 */
  _updateMobileHotbar() {
    const slots = document.querySelectorAll('#mobileHotbar .m-slot');
    slots.forEach((slot, i) => {
      slot.classList.toggle('selected', i === this.selectedSlot);
    });
  }

  /** 绑定事件监听 */
  _initEvents() {
    // 键盘事件（桌面端 + 移动端外接键盘通用）
    document.addEventListener('keydown', (e) => {
      // 在输入框/文本域打字时（如开始界面留言），不把按键传给游戏
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.code === 'Escape' && document.activeElement) document.activeElement.blur();
        return;
      }
      // 相册打开时：ESC 关闭
      if (this.portfolio && this.portfolio.isOpen) {
        if (e.code === 'Escape') this.portfolio.close();
        e.preventDefault();
        return;
      }
      // 世界地图打开时：ESC / M 关闭
      if (this.worldMap && this.worldMap.open) {
        if (e.code === 'Escape' || e.code === 'KeyM') this.worldMap.closeMap();
        e.preventDefault();
        return;
      }
      // 兑换商店打开时吞掉按键（仅 ESC/G 关闭）
      if (this.shop && this.shop.isOpen) {
        if (e.code === 'Escape' || e.code === 'KeyG') this.shop.close();
        e.preventDefault();
        return;
      }
      // 背包打开时吞掉移动/数字键，避免背后移动
      if (this.inventory && this.inventory.isOpen) {
        if (e.code === 'KeyE' || e.code === 'Escape') {
          this.inventory.close(); // close() 内部会触发 onClose 恢复鼠标
        }
        e.preventDefault();
        return;
      }
      this.player.keys[e.code] = true;

      // 双击空格 → 切换创造飞行（坐着/躺着时空格只用于起身）
      if (e.code === 'Space') {
        if (this.player.pose !== 'stand') {
          this.player.standUp();
          if (this.playerChar) this.playerChar.setPose('stand');
          e.preventDefault();
          return;
        }
        const now = performance.now();
        if (this._lastSpace && now - this._lastSpace < 320) {
          this.player.flying = !this.player.flying;
          this.player.velocity.y = 0;
          this.sound.click();
          this._toast(this.player.flying ? '飞行模式：空格上升 / Shift 下降（再双击空格降落）' : '已降落');
        }
        this._lastSpace = now;
      }

      // 数字键 1-9 选择快捷栏槽位（第 9 格如为空则作为磁铁收集）
      if (e.code >= 'Digit1' && e.code <= 'Digit9') {
        const idx = parseInt(e.code.charAt(5)) - 1;
        this._selectSlot(idx);
        e.preventDefault();
        return;
      }

      // E 打开背包（桌面端需要先退出指针锁定）
      if (e.code === 'KeyE' && this.inventory) {
        this._openMenu(() => this.inventory.open(), () => this.inventory.close());
        e.preventDefault();
        return;
      }

      // G 打开装备兑换商店
      if (e.code === 'KeyG') {
        if (this.inventory && this.inventory.isOpen) this.inventory.close();
        this._openShop();
        e.preventDefault();
        return;
      }

      // ESC 暂停（移动端也支持）
      if (e.code === 'Escape' && this.isRunning) {
        if (this.isMobile) {
          this.isRunning = false;
          this.ui.pauseScreen.style.display = 'flex';
          this._showGameUI(false);
        }
      }

      // 视野调整快捷键（= 放大/缩小视野，- 缩小/扩大视野）
      if (e.code === 'Equal') {           // = 放大画面 → 视野变窄
        this._adjustFOV(-5);
      }
      if (e.code === 'Minus') {           // - 缩小画面 → 视野变广
        this._adjustFOV(5);
      }
      if (e.code === 'Digit0' || e.code === 'Numpad0') {  // 0 重置视野
        this._resetFOV();
      }

      // V 键切换第一/第三人称
      if (e.code === 'KeyV') {
        this.toggleView();
      }

      // T 键切换天气（晴天→下雨→下雪→晴天）
      if (e.code === 'KeyT' && this.weather) {
        const order = [WeatherType.CLEAR, WeatherType.RAIN, WeatherType.SNOW];
        const idx = order.indexOf(this.weather.currentWeather);
        const next = order[(idx + 1) % order.length];
        this.weather.setWeather(next);
      }

      // C 键拍照（作品集会自动存入相册）
      if (e.code === 'KeyC') {
        this.takePhoto();
      }

      // F 键：对准椅子/沙发/床 → 坐下/躺下/起身；否则保留撒花彩蛋
      if (e.code === 'KeyF') {
        const canSeat = this.player.pose !== 'stand' ||
          (this.player.targetBlock && [
            BlockType.CHAIR_WOOD, BlockType.SOFA_RED,
            BlockType.BED_RED, BlockType.BED_BLUE,
            BlockType.BED_GREEN, BlockType.BED_YELLOW,
          ].includes(this.player.targetBlock.type));
        if (canSeat) {
          this.interactSeat();
        } else {
          this._celebrate();
        }
      }

      // P 键打开作品集相册
      if (e.code === 'KeyP') {
        if (!this.portfolio) {
          try { this._initPortfolio(); } catch (err) { console.error('[相册] 初始化失败', err); }
        }
        if (this.portfolio) {
          if (!this.portfolio.isOpen) {
            this._openMenu(() => this.portfolio.open(), () => this.portfolio.close());
          } else {
            this.portfolio.close();
          }
        }
        e.preventDefault();
        return;
      }

      // Q 键：打开/收起操作说明面板（帮助），指针锁定时也能用，无需解放鼠标
      if (e.code === 'KeyQ') {
        const panel = document.getElementById('controlsPanel');
        if (panel) panel.classList.toggle('collapsed');
        e.preventDefault();
      }

      // H 键：关闭/重开新手引导提示（向导兔子任务面板）
      if (e.code === 'KeyH') {
        if (this.tutorial) this.tutorial.toggle();
        e.preventDefault();
      }

      // R 键：一键回到出生家园（防迷路/卡住）
      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        this.teleportHome();
      }

      // M 键：打开/关闭世界小地图
      if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this._toggleWorldMap();
      }

      // B 键：多人联机时一键传送到最近队友身边
      if (e.code === 'KeyB' && !e.ctrlKey && !e.metaKey) {
        this.teleportToTeammate();
      }

      // Enter 键：多人联机时聚焦/发送聊天
      if (e.code === 'Enter') {
        if (this.mp && this.mp.inRoom) {
          e.preventDefault();
          if (document.activeElement === this._chatInput) this._commitChat();
          else this._toggleChatFocus();
        }
      }
    });

    document.addEventListener('keyup', (e) => {
      this.player.keys[e.code] = false;
    });

    // 鼠标移动（仅桌面端指针锁定后）
    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      if (this.inventory && this.inventory.isOpen) return;
      if (this.viewMode === 'third') {
        // 第三人称：鼠标控制环绕相机轨道角（可 360° 绕到角色正面）
        const sens = 0.0024;
        this.player.orbitYaw -= e.movementX * sens;
        this.player.orbitPitch += e.movementY * sens;
        this.player.orbitPitch = Math.max(-0.35, Math.min(1.15, this.player.orbitPitch));
      } else {
        this.player.onMouseMove(e.movementX, e.movementY);
      }
    });

    // 鼠标点击（仅桌面端指针锁定后）
    document.addEventListener('mousedown', (e) => {
      if (!this.isPointerLocked) return;
      if (this.inventory && this.inventory.isOpen) return;
      if (e.button === 0) {
        // 左键：手持武器/装备时触发挥砍（不放置方块）；否则放置方块
        const held = this.player ? this.player.selectedBlock : 0;
        if (held && held < 0) {
          this._swing();
        } else {
          this.player.placeBlock();
        }
      } else if (e.button === 2) {
        const held = this.player ? this.player.selectedBlock : 0;
        if (held && held < 0) {
          this._swing();
        }
        this.player.breakBlock();
      }
    });

    // 禁用右键菜单
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 滚轮切换方块（仅桌面端指针锁定后）
    document.addEventListener('wheel', (e) => {
      if (!this.isPointerLocked) return;

      // Ctrl + 滚轮 / 触控板双指缩放 → 调整视野
      // 捏合(deltaY>0) = 缩小画面 = 视野变广(FOV变大)；推开(deltaY<0) = 放大画面 = 视野变窄(FOV变小)
      if (e.ctrlKey) {
        this._adjustFOV(e.deltaY > 0 ? 5 : -5);
        return;
      }

      // 滚轮循环切换 9 格快捷栏；Shift+滚轮只在已填充槽位间循环
      const slots = this.inventory ? this.inventory.hotbar : [];
      const dir = e.deltaY > 0 ? 1 : -1;
      if (e.shiftKey) {
        const filled = slots.map((t, i) => ({ t, i })).filter(x => x.t && x.t !== BlockType.AIR);
        if (filled.length) {
          const cur = filled.findIndex(x => x.i === this.selectedSlot);
          const next = filled[(cur + dir + filled.length) % filled.length];
          this.selectedSlot = next.i;
        }
      } else {
        this.selectedSlot = (this.selectedSlot + dir + 9) % 9;
      }
      this.magnetMode = false;
      if (this.dropManager) this.dropManager.setMagnet(false);
      this._updateHotbar();
    });

    // ----- 桌面端：指针锁定逻辑 -----
    if (!this.isMobile) {
      document.addEventListener('pointerlockchange', () => {
        this.isPointerLocked = document.pointerLockElement === this.canvas;
        if (this.isPointerLocked) {
          this.ui.pauseScreen.style.display = 'none';
          this._showGameUI(true);
          const ov = document.getElementById('errOverlay');
          if (ov) ov.hidden = true;
        } else if (this.isRunning && !this._suppressPause && !this._menuOpen && !this._anyMenuOpen()) {
          // 真正失去焦点（非打开背包/商店/相册）时才显示暂停菜单
          this.ui.pauseScreen.style.display = 'flex';
        }
      });

      const requestLock = () => {
        if (!this.isPointerLocked && this.isRunning) {
          try {
            const r = this.canvas.requestPointerLock();
            // 新版浏览器可能返回 Promise（失败会 reject），捕获后给出可恢复提示
            if (r && typeof r.catch === 'function') {
              r.catch((err) => this._onPointerLockFail(err));
            }
          } catch (err) { this._onPointerLockFail(err); }
        }
      };

      const enterGame = () => {
        if (!this._initReady) { this._toast('世界还在生成中，请稍等一两秒再点～'); return; }
        // 确保已同步当前选择的主角，避免“先进游戏后卡片没生效”
        this.character = this._getSelectedChar(); if (this.playerChar) this.playerChar.setSkin(this.character);
        // 第一人称手臂颜色也按所选角色重建
        try { this._refreshHeldView(); } catch (e) {}
        this.isRunning = true;
        this.ui.startScreen.style.display = 'none';
        this.sound.unlock();
        // 相机从立墙预览切到玩家第一人称
        this.camera.position.set(this._spawnX, this._spawnY + this.player.eyeHeight, this._spawnZ);
        const lookDir = new THREE.Vector3(
          -Math.sin(this.player.yaw) * Math.cos(this.player.pitch),
          Math.sin(this.player.pitch),
          -Math.cos(this.player.yaw) * Math.cos(this.player.pitch)
        );
        this.camera.lookAt(
          this.camera.position.x + lookDir.x,
          this.camera.position.y + lookDir.y,
          this.camera.position.z + lookDir.z
        );
      };
      // 统一入口：开始按钮 / 继续按钮 都走这里
      this._requestEnterGame = () => { enterGame(); requestLock(); };
      // 只能点击醒目的「开始游戏」按钮进入（避免在空白处误触）
      const startBtn = document.getElementById('startPlayBtn');
      if (startBtn) {
        startBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._requestEnterGame();
        });
      }

      this.ui.pauseScreen.addEventListener('click', requestLock);
      this.canvas.addEventListener('click', requestLock);
      // 指针锁定被浏览器/系统拒绝时，明确提示并允许点击画面重试，而不是卡在静止世界
      this.canvas.addEventListener('pointerlockerror', () => this._onPointerLockFail(null));
    }

    // ----- 移动端：直接进入游戏 + 触摸控制 -----
    if (this.isMobile) {
      const enterGameMobile = () => {
        if (!this._initReady) { this._toast('世界还在生成中，请稍等一两秒再点～'); return; }
        this.character = this._getSelectedChar(); if (this.playerChar) this.playerChar.setSkin(this.character);
        // 第一人称手臂颜色也按所选角色重建
        try { this._refreshHeldView(); } catch (e) {}
        this.isRunning = true;
        this.ui.startScreen.style.display = 'none';
        this.sound.unlock();
        // 相机从立墙预览切到玩家第一人称
        this.camera.position.set(this._spawnX, this._spawnY + this.player.eyeHeight, this._spawnZ);
        const lookDir = new THREE.Vector3(
          -Math.sin(this.player.yaw) * Math.cos(this.player.pitch),
          Math.sin(this.player.pitch),
          -Math.cos(this.player.yaw) * Math.cos(this.player.pitch)
        );
        this.camera.lookAt(
          this.camera.position.x + lookDir.x,
          this.camera.position.y + lookDir.y,
          this.camera.position.z + lookDir.z
        );
        this._showGameUI(true);
      };
      this.ui._showMobileGame = () => { enterGameMobile(); };
      // 统一入口（移动端不请求指针锁定）
      this._requestEnterGame = () => { enterGameMobile(); };
      // 只能点击醒目的「开始游戏」按钮进入（移动端）
      const startBtn = document.getElementById('startPlayBtn');
      if (startBtn) {
        startBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); enterGameMobile(); }, true);
        startBtn.addEventListener('click', (e) => { e.stopPropagation(); });
      }

      this.ui.pauseScreen.addEventListener('click', () => {
        this.isRunning = true;
        this.ui.pauseScreen.style.display = 'none';
        this._showGameUI(true);
      });

      // 初始化触摸控制器
      this.touchController = new TouchController(this.player, this);
    }

    // 窗口尺寸变化
    window.addEventListener('resize', () => this._onResize());
  }

  /** 指针锁定失败：不能让世界静止死锁，回退到"点击继续"暂停屏，点击即重新请求锁定 */
  _onPointerLockFail(err) {
    if (err) console.warn('[指针锁定失败]', err);
    if (!this.isRunning || this.isPointerLocked || this.isMobile) return;
    if (window.__showErrorOverlay) {
      window.__showErrorOverlay('鼠标锁定没成功（可能是浏览器弹窗拦截或权限问题）。点一下画面即可继续，若反复出现请用最新版 Chrome/Edge 全屏打开。');
    }
    // 短暂展示后自动收起浮层提示，避免长期遮挡（暂停屏提供点击恢复入口）
    setTimeout(() => {
      const ov = document.getElementById('errOverlay');
      if (ov) ov.hidden = true;
    }, 6000);
    try {
      if (this.ui && this.ui.pauseScreen) this.ui.pauseScreen.style.display = 'flex';
    } catch (e) { /* ignore */ }
  }

  /** 显示/隐藏游戏HUD */
  _showGameUI(show) {
    const display = show ? 'flex' : 'none';
    this.ui.crosshair.style.display = show ? 'block' : 'none';
    this.ui.selectedBlockName.style.display = show ? 'block' : 'none';
    this.ui.hotbar.style.display = this.isMobile ? 'none' : display; // 桌面端物品栏
    this.ui.debugInfo.style.display = show ? 'block' : 'none';
    this.ui.blockHighlight.style.display = 'none'; // 已禁用
    // 右上角操作说明面板（仅桌面端）
    if (!this.isMobile) {
      this.ui.controlsPanel.style.display = show ? 'block' : 'none';
    }
    // 移动端控件：仅在移动端显示
    if (this.isMobile) {
      const mobileControls = document.getElementById('mobileControls');
      if (mobileControls) mobileControls.style.display = show ? 'block' : 'none';
      // 每次进入游戏都重建一次底部方块栏，确保 1-9 格可点
      if (show) { this._rebuildMobileHotbar(); this._updateMobileHotbar(); }
    }
  }

  /** 窗口大小变化处理 */
  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** 调整视野角度（FOV） */
  _adjustFOV(delta) {
    this.fov = Math.max(this.fovMin, Math.min(this.fovMax, this.fov + delta));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this._showFOVHint();
  }

  /** 重置视野到默认值 */
  _resetFOV() {
    this._adjustFOV(this.defaultFov - this.fov);
  }

  /** 短暂显示 FOV 提示 */
  _showFOVHint() {
    if (this._fovHintTimer) clearTimeout(this._fovHintTimer);
    let hint = document.getElementById('fovHint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'fovHint';
      hint.style.cssText =
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'color:#fff;font-size:28px;font-weight:bold;' +
        'text-shadow:0 2px 8px rgba(0,0,0,0.6);pointer-events:none;z-index:100;' +
        'transition:opacity 0.3s;';
      document.body.appendChild(hint);
    }
    hint.textContent = `FOV: ${this.fov.toFixed(0)}°`;
    hint.style.opacity = '1';
    this._fovHintTimer = setTimeout(() => {
      hint.style.opacity = '0';
    }, 1200);
  }

  /** 更新调试信息 */
  _updateDebugInfo() {
    const pos = this.player.position;
    const cx = Math.floor(pos.x / CHUNK_SIZE);
    const cz = Math.floor(pos.z / CHUNK_SIZE);
    const chunks = this.world.chunks.size;
    const weatherName = this.weather ? WeatherNames[this.weather.currentWeather] : '';
    const timeName = this.dayNight ? this.dayNight.getTimeOfDay() : '';
    const biome = this.world.getBiome ? BiomeNames[this.world.getBiome(Math.floor(pos.x), Math.floor(pos.z))] : '';

    this.ui.debugInfo.innerHTML =
      `FPS: ${this.fps}<br>` +
      `FOV: ${this.fov.toFixed(0)}°<br>` +
      `XYZ: ${pos.x.toFixed(1)} / ${pos.y.toFixed(1)} / ${pos.z.toFixed(1)}<br>` +
      `群系: ${biome} | 时间: ${timeName}<br>` +
      `区块: ${cx}, ${cz} | 已加载: ${chunks}<br>` +
      `生物: ${this.animalManager ? this.animalManager.animals.length : 0} 只 | ` +
      `掉落物: ${this.dropManager ? this.dropManager.count : 0}<br>` +
      `天气: ${weatherName} (T切换)${this.magnetMode ? ' | 收集中(9)' : ''}<br>` +
      (this.mp && this.mp.inRoom
        ? `联机: 房间 ${this.mp.roomCode} · ${(this.remotePlayers ? this.remotePlayers.count : 0) + 1}人 · ` +
          `${this.mp.isRealtimeLive ? '实时通道✓' : '实时通道✗'} · HTTPS心跳${this.mp._restOk ? '✓' : '✗'}<br>`
        : '') +
      `<span class="hud-keys">🗺️M 地图 · 🏠R 回家 · ❔Q 说明 · H 新手提示 · V 视角</span>`;

    this.ui.blockHighlight.style.display = 'none';
  }

  /** 主游戏循环 */
  animate() {
    requestAnimationFrame(() => this.animate());
    if (!this.renderer || !this.scene || !this.camera) return;

    const dt = this.clock.getDelta();

    // FPS 计算
    this.frameCount++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTime = 0;
    }

    // 移动端：从触控控制器注入键盘输入
    if (this.isMobile && this.touchController && this.isRunning) {
      const tc = this.touchController;
      const deadZone = 0.15;
      const absX = Math.abs(tc.moveX);
      const absZ = Math.abs(tc.moveZ);
      this.player.keys['KeyW'] = tc.moveZ < -deadZone;
      this.player.keys['KeyS'] = tc.moveZ > deadZone;
      this.player.keys['KeyA'] = tc.moveX < -deadZone;
      this.player.keys['KeyD'] = tc.moveX > deadZone;
    }

    // 桌面端指针锁定 或 移动端运行时更新游戏逻辑
    if (this.isPointerLocked || (this.isMobile && this.isRunning)) {
     try {
      const wasOnGround = this.player.onGround;
      this.player.update(dt);
      // 起跳瞬间播放音效（地面 → 快速上升）
      if (wasOnGround && !this.player.onGround && this.player.velocity.y > 6 && !this.player.flying) {
        this.sound.jump();
      }
      this.world.update(this.player.position.x, this.player.position.z);
      this.highlight.update(this.player.targetBlock);
      this._updateSeatHint();
      if (this.tutorial) this.tutorial.update(dt, this.player);

      // 多人：上报自己位置 + 平滑其他特工
      if (this.mp && this.mp.inRoom) {
        const yawForMp = (this.viewMode === 'third' && typeof this.player.orbitYaw === 'number') ? this.player.orbitYaw : this.player.yaw;
        this.mp.updatePos(this.player.position.x, this.player.position.y, this.player.position.z, yawForMp, this.player.pose || 'stand');
      }
      if (this.remotePlayers) this.remotePlayers.update(dt);
      this._updateTeamPointer();
      this._updateTeamRecall(dt);

      // 第三人称：环绕相机（可 360° 绕角色，相机始终看向角色身体）
      if (this.viewMode === 'third') {
        const oy = this.player.orbitYaw, op = this.player.orbitPitch;
        const dist = this.camDist;
        // 相机在轨道方向上的位置（绕角色）
        const backX = Math.sin(oy) * Math.cos(op);
        const backZ = Math.cos(oy) * Math.cos(op);
        const backY = -Math.sin(op);
        const pose = this.player.pose || 'stand';
        const focusLift = pose === 'lie'
          ? PlayerCharacter.POSE.lie.groupDY - 0.15
          : pose === 'sit' ? PlayerCharacter.POSE.sit.groupDY + 0.05 : 0;
        const focusY = this.player.position.y + this.player.eyeHeight * 0.82 + focusLift; // 看向角色躯干
        let camX = this.player.position.x + backX * dist;
        let camY = focusY - backY * dist;
        let camZ = this.player.position.z + backZ * dist;
        // 简单碰撞：避免相机进地面，向角色抬高/拉近
        const ground = this.world.getSurfaceHeight ? this.world.getSurfaceHeight(
          Math.floor(camX), Math.floor(camZ)) : 0;
        if (camY < ground + 0.6) camY = ground + 0.6;
        this.camera.position.set(camX, camY, camZ);
        this.camera.lookAt(this.player.position.x, focusY, this.player.position.z);
        // 角色更新
        if (this.playerChar) {
          this.playerChar.update(this.player, dt);
          this.playerChar.setVisible(true);
        }
      } else {
        if (this.playerChar) this.playerChar.setVisible(false);
      }
    } else if (this.viewMode === 'third') {
      // 暂停时仍显示角色
      if (this.playerChar) this.playerChar.setVisible(true);
    }

    // 兜底：第一人称且游戏进行中，保证相机始终在玩家眼睛位置（即使未 pointerLock 也不黑屏）
    if (this.viewMode === 'first' && this.isRunning) {
      this.camera.position.set(
        this.player.position.x,
        this.player.position.y + this.player.eyeHeight,
        this.player.position.z
      );
    }
     } catch (frameErr) {
       // 单帧逻辑异常：记录一次并显示，但不中断后续帧（避免永久卡死）
       if (!this._frameErrShown) {
         this._frameErrShown = true;
         console.error('[帧逻辑错误]', frameErr);
         if (window.__showErrorOverlay) window.__showErrorOverlay('帧错误：' + (frameErr && frameErr.message));
       }
     }
    }

    // 昼夜循环（始终更新），并按玩家所在群系给远景雾轻微染色（空气透视）
    if (this.dayNight) {
      let biomeFogColor = null;
      try {
        if (this.world && this.world.getBiomeFogColor) {
          biomeFogColor = this.world.getBiomeFogColor(
            Math.floor(this.player.position.x), Math.floor(this.player.position.z));
        }
      } catch (e) { biomeFogColor = null; }
      this.dayNight.update(dt, this.camera, { biomeFogColor });
    }

    // 生物 AI
    if (this.animalManager) {
      this.animalManager.update(dt, this.player.position);
    }

    // 天气系统
    if (this.weather) {
      this.weather.update(dt, this.player.position);
    }

    // 掉落物
    if (this.dropManager) {
      this.dropManager.update(dt, this.player.position);
    }

    // 天空飞鸟
    if (this.birdManager) {
      this.birdManager.update(dt, this.player.position);
    }

    // 花田蝴蝶
    if (this.butterflyManager) {
      this.butterflyManager.update(dt, this.player.position);
    }
    // 漂浮光点小精灵
    if (this.fireflies) {
      this.fireflies.update(dt, this.player.position);
    }

    // 樱花花瓣：仅在樱花林或出生家园附近飘落（密度按环境平滑变化）
    if (this.sakura) {
      let density = 0;
      try {
        const px = Math.floor(this.player.position.x);
        const pz = Math.floor(this.player.position.z);
        if (this.world && this.world.getBiome) {
          const biome = this.world.getBiome(px, pz);
          if (biome === Biome.CHERRY) density = 1;
        }
        // 出生家园（半径 ~30 内）也有少量花瓣，烘托梦幻出生区
        const dHome = Math.hypot(px, pz);
        if (dHome < 34) density = Math.max(density, 0.55);
        else if (dHome < 50) density = Math.max(density, 0.25);
        // 樱花岛（正北海面环形山樱花林 + 湖边庄园）：靠近即花瓣纷飞，最浓
        if (this.structures && typeof SAKURA_ISLAND_X === 'number') {
          const dIsle = Math.hypot(px - SAKURA_ISLAND_X, pz - SAKURA_ISLAND_Z);
          if (dIsle < 60) density = Math.max(density, 1);
        }
      } catch (e) { density = 0; }
      this.sakura.setDensity(density);
      this.sakura.update(dt, this.player.position);
    }

    // 出生区风车磨坊叶片旋转
    if (this.windmill) {
      this.windmill.update(dt);
    }

    // 手持视图轻微摆动（坐/卧时隐藏第一人称手臂，避免悬空）
    if (this.heldGroup && (this.isPointerLocked || (this.isMobile && this.isRunning))) {
      const seated = this.player.pose !== 'stand';
      this.heldGroup.visible = !seated;
      const moving = !seated && this.player.onGround && (
        Math.abs(this.player.velocity.x) + Math.abs(this.player.velocity.z) > 0.5);
      this._heldBob += dt * (moving ? 9 : 2);
      let swingX = 0, swingRot = 0;
      // 挥砍动画（持武器左键/右键时触发，0.22 秒内手臂向下挥再回位）
      if (this._swingT && this._swingT > 0) {
        this._swingT -= dt;
        const p = 1 - Math.max(0, this._swingT) / 0.22; // 0→1
        const s = Math.sin(p * Math.PI);                  // 0→1→0
        swingX = -s * 0.35;
        swingRot = -s * 1.1;
      }
      this.heldGroup.position.y = Math.sin(this._heldBob) * (moving ? 0.02 : 0.006) + swingX;
      this.heldGroup.position.x = Math.cos(this._heldBob * 0.5) * (moving ? 0.012 : 0);
      this.heldGroup.rotation.x = swingRot;
    }

    // 玩家移动时标记位置需要保存（用于退出后回到原地）
    if (this.isRunning && this.player) {
      const pm = this.player.position;
      if (this._lastSaveX === undefined) {
        this._lastSaveX = pm.x; this._lastSaveY = pm.y; this._lastSaveZ = pm.z;
      } else {
        const ddx = pm.x - this._lastSaveX, ddz = pm.z - this._lastSaveZ;
        if (ddx * ddx + ddz * ddz > 1.0) { // 移动超过约 1 格
          this._playerMoved = true;
          this._lastSaveX = pm.x; this._lastSaveZ = pm.z;
        }
      }
    }

    // 自动存档（放/拆后去抖保存 + 每 5 秒位置/改动检查）
    this._tickSave(dt);

    // 彩蛋粒子（庆祝撒花）
    if (this._celebrates && this._celebrates.length) {
      this._celebrates = this._celebrates.filter(fn => fn(dt));
    }

    // 渲染（单独保护：渲染异常不应打断下一帧）
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      if (!this._renderErrShown) {
        this._renderErrShown = true;
        console.error('[渲染失败]', err);
        if (window.__showErrorOverlay) window.__showErrorOverlay('渲染错误：' + (err && err.message));
      }
    }

    // 更新UI
    if (this.frameCount % 10 === 0) {
      this._updateDebugInfo();
    }
  }
}

/* ============================================
   启动游戏
   ============================================ */
window.addEventListener('DOMContentLoaded', async () => {
  let game = null;
  try {
    game = new Game();
    await game.init();
  } catch (err) {
    console.error('[init 失败]', err);
    const bar = document.getElementById('loadingBar');
    if (bar) bar.style.display = 'none';
    if (window.__showErrorOverlay) {
      window.__showErrorOverlay('初始化失败：' + ((err && (err.stack || err.message)) || String(err)).split('\n').slice(0, 4).join(' ⏎ '));
    }
  }
  // 即使 init 部分失败，也尽量启动主循环，避免"点击开始无反应"
  try {
    if (game) { game.animate(); window.__gameLoaded = true; }
  } catch (err) {
    console.error('[animate 启动失败]', err);
  }
});

// 全局兜底：任何未捕获错误都打印，并显示到屏幕浮层，避免静默卡死
function __showErrorOverlay(msg) {
  try {
    const el = document.getElementById('errOverlay');
    if (!el) return;
    const line = document.createElement('div');
    line.textContent = '⚠ ' + msg;
    el.appendChild(line);
    el.hidden = false;
  } catch (e) { /* ignore */ }
}
window.__showErrorOverlay = __showErrorOverlay;
window.addEventListener('error', (e) => {
  console.error('[运行时错误]', e.message, e.filename, e.lineno, e.error);
  __showErrorOverlay(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`);
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason && (e.reason.stack || e.reason.message)) || String(e.reason);
  console.error('[未处理 Promise]', msg);
  __showErrorOverlay('Promise: ' + String(msg).split('\n')[0]);
});
