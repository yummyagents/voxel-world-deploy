/**
 * 像素方块世界 - 游戏主模块
 * 包含：玩家控制、物理系统、射线检测、游戏循环
 */

import * as THREE from 'three';
import {
  World, Chunk, BlockType, BlockNames, isSolid,
  CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE, getBlockColor,
  isMobileDevice, getRenderDistance, getBlockDrop, BiomeNames, Biome,
} from './voxel.js?v=20260915a';
import { AnimalManager, Sheep, Rabbit, Horse, Cow, Pig, Chicken, Villager, IronGolem } from './animals.js?v=20260915a';
import { WeatherSystem, WeatherType, WeatherNames } from './weather.js?v=20260915a';
import { DayNightCycle } from './daynight.js?v=20260915a';
import { DropManager } from './drops.js?v=20260915a';
import { VillageGenerator } from './village.js?v=20260915a';
import { Inventory } from './inventory.js?v=20260915a';
import { ExchangeShop } from './exchange.js?v=20260915a';
import { createHeldModel, createArmModel, ItemNames, getItemIcon } from './equipment.js?v=20260915a';
import { StructureGenerator } from './structures.js?v=20260915a';
import { PlayerCharacter } from './player-character.js?v=20260915a';
import { SakuraPetals } from './sakura.js?v=20260915a';
import { BirdManager } from './birds.js?v=20260915a';
import { SoundFX } from './audio.js?v=20260915a';
import { Tutorial } from './tutorial.js?v=20260915a';
import {
  loadSave, writeSave, clearSave, hasSave,
  exportSave, importSave,
} from './save.js?v=20260915a';
import { Portfolio } from './portfolio.js?v=20260915a';

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
    this.pitch = 0;   // 上下俯仰
    this.yaw = 0;     // 左右偏航

    // 物理参数
    this.gravity = -25;
    this.jumpSpeed = 12;
    this.moveSpeed = 5.5;
    this.onGround = false;
    this.flying = false; // 创造飞行（双击空格）

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

    // 计算移动方向（基于视角）
    const forward = new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw)
    ).normalize();

    const right = new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw)
    ).normalize();

    // 根据输入计算目标速度
    const moveDir = new THREE.Vector3(0, 0, 0);
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveDir.add(forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveDir.sub(forward);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveDir.sub(right);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveDir.add(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
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
    this.camera.position.set(
      this.position.x,
      this.position.y + this.eyeHeight,
      this.position.z
    );

    // 更新相机朝向
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

    // 射线检测（目标方块）
    this._raycast();
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

          // 固体方块的 AABB
          const blockMin = { x: bx, y: by, z: bz };
          const blockMax = { x: bx + 1, y: by + 1, z: bz + 1 };

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
    const origin = this.camera.position;
    const direction = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
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

    this.world.setBlock(px, py, pz, this.selectedBlock);
    if (this.onPlace) this.onPlace();
    return true;
  }

  /** 破坏方块 */
  breakBlock() {
    if (!this.targetBlock) return false;

    const { x, y, z } = this.targetBlock;
    if (y < 0 || y >= CHUNK_HEIGHT) return false;

    const blockType = this.world.getBlock(x, y, z);
    this.world.setBlock(x, y, z, BlockType.AIR);
    if (this.onBreak) this.onBreak();

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
    this._initPortfolio();

    // 设置预览视角：近距离平视"WELCOME"立墙
    this.camera.position.set(0, 25, 14);
    this.camera.lookAt(0, 26, 0);

    // 开始界面保持显示，背后渲染 3D 世界
    this.ui.loadingBar.style.display = 'block';

    // 无存档时：出生在固定手工"新手家园"（世界原点），家园半径 30 大平地
    this._isNewHome = (!this.saveData || !this.saveData.player);
    // 出生区块中心：新世界固定原点（家园中心）
    const spCx = 0;
    const spCz = 0;

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

    // 出生点：有存档回到上次位置；新世界出生在固定新手家园（世界原点）
    this._spawnX = 0.5;
    this._spawnZ = 16.5;
    this._spawnY = 28;
    if (this.saveData && this.saveData.player) {
      this._spawnX = this.saveData.player.x;
      this._spawnY = this.saveData.player.y;
      this._spawnZ = this.saveData.player.z;
    }
    this.player.position.set(this._spawnX, this._spawnY, this._spawnZ);
    this.player.yaw = (this.saveData && this.saveData.player && typeof this.saveData.player.yaw === 'number')
      ? this.saveData.player.yaw : Math.PI;    this.player.pitch = (this.saveData && this.saveData.player && typeof this.saveData.player.pitch === 'number')
      ? this.saveData.player.pitch : -0.2;

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
        // 装饰写入后，重建家园范围内的区块网格
        for (let cx = -3; cx <= 3; cx++) {
          for (let cz = -3; cz <= 3; cz++) {
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
      } catch (err) {
        console.error('新手家园生成失败', err);
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

  /** 自动保存调度（每 20 秒，若有改动）+ 切走页面时保存 */
  _tickSave(dt) {
    this._saveTimer += dt;
    if (this._saveTimer >= 20) {
      this._saveTimer = 0;
      if (this._saveDirty) this.saveNow(false);
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
      if (document.pointerLockElement) document.exitPointerLock();
      this.portfolio.open();
    });
  }

  /** 打开装备兑换商店（懒创建 + 容错，确保 G 键始终可用） */
  _openShop() {
    try {
      if (!this.shop) {
        this.shop = new ExchangeShop();
        this.shop.onRedeem = (name) => { this.sound && this.sound.buy(); this._toast(`已兑换：${name}`); };
      }
      if (this.inventory) this.shop.inventory = this.inventory;
      this.shop.toggle();
      this.sound && this.sound.click();
    } catch (err) {
      console.error('[商店] 打开失败：', err);
      this._toast('商店打开失败，请刷新重试');
    }
  }

  /** 拍摄当前场景 */
  takePhoto() {
    if (!this.portfolio || !this.renderer) return;
    // 拍前渲染一帧保证画面最新
    try { this.renderer.render(this.scene, this.camera); } catch (e) {}
    const ok = this.portfolio.capture(this.renderer);
    if (!ok) this._toast('拍照失败，请重试');
  }

  /** 存档相关按钮与事件 */
  _initSaveUI() {
    const autoSave = () => {
      if (this.world) this.saveNow(false);
    };
    window.addEventListener('beforeunload', autoSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') autoSave();
    });

    // 开始界面：继续 / 新世界 / 导出 / 导入
    const continueBtn = document.getElementById('continueBtn');
    const newWorldBtn = document.getElementById('newWorldBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');

    const hasExisting = hasSave();
    if (continueBtn) continueBtn.style.display = hasExisting ? '' : 'none';
    // “继续”按钮直接让点击冒泡到开始界面（存档已在初始化时自动加载），即可进入游戏
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

    // 游戏内快捷键：Ctrl+S 手动保存
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyS')) {
        e.preventDefault();
        if (this.world) this.saveNow(true);
      }
    });
  }

  /** 创建区块 */
  _createChunk(cx, cz) {
    const key = this.world.chunkKey(cx, cz);
    if (this.world.chunks.has(key)) return this.world.chunks.get(key);

    const chunk = new Chunk(cx, cz);
    this.world.generateChunkData(chunk);
    chunk.buildMesh(
      (wx, wy, wz) => this.world.getBlock(wx, wy, wz),
      this.world.material, this.world.waterMaterial, this.world.crossMaterial
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
          this.world.material, this.world.waterMaterial, this.world.crossMaterial
        );
      }
    }
    return chunk;
  }

  /** 初始化渲染器 */
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: this.isMobile ? 'low-power' : 'default',
      preserveDrawingBuffer: true, // 支持作品集截图（toDataURL）
    });
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

    // 天空飞鸟
    this.birdManager = new BirdManager(this.scene, this.isMobile ? 5 : 9);
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
    this.camDist = 4.2;
  }

  toggleView() {
    this.viewMode = this.viewMode === 'first' ? 'third' : 'first';
    this.playerChar.setVisible(this.viewMode === 'third');
    this.heldHolder.visible = this.viewMode === 'first';
    // 第三人称时把角色手持与盔甲同步
    if (this.viewMode === 'third') this._syncCharacter();
    this._toast(this.viewMode === 'third' ? '第三人称视角 (V 切回)' : '第一人称视角 (V 切换)');
  }

  _syncCharacter() {
    if (!this.playerChar) return;
    // 盔甲：快捷栏内是否含胸甲/头盔
    const hot = this.inventory.getHotbar();
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
    const arm = createArmModel(armor);
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
    this.player.onPlace = () => { if (this.sound) this.sound.place(); if (this.tutorial) this.tutorial.notifyPlace(); };
    this.player.onBreak = () => { if (this.sound) this.sound.break(); if (this.tutorial) this.tutorial.notifyBreak(); };
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
      // 兑换商店打开时吞掉按键（仅 ESC 关闭；G 键由商店模块自身切换）
      if (this.shop && this.shop.isOpen) {
        if (e.code === 'Escape') this.shop.close();
        e.preventDefault();
        return;
      }
      // 背包打开时吞掉移动/数字键，避免背后移动
      if (this.inventory && this.inventory.isOpen) {
        if (e.code === 'KeyE' || e.code === 'Escape') {
          this.inventory.close();
        }
        e.preventDefault();
        return;
      }
      this.player.keys[e.code] = true;

      // 双击空格 → 切换创造飞行
      if (e.code === 'Space') {
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
        if (document.pointerLockElement) document.exitPointerLock();
        this.inventory.open();
        e.preventDefault();
        return;
      }

      // G 打开装备兑换商店
      if (e.code === 'KeyG') {
        if (document.pointerLockElement) document.exitPointerLock();
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

      // P 键打开作品集相册
      if (e.code === 'KeyP' && this.portfolio) {
        if (document.pointerLockElement) document.exitPointerLock();
        this.portfolio.toggle();
      }
    });

    document.addEventListener('keyup', (e) => {
      this.player.keys[e.code] = false;
    });

    // 鼠标移动（仅桌面端指针锁定后）
    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      if (this.inventory && this.inventory.isOpen) return;
      this.player.onMouseMove(e.movementX, e.movementY);
    });

    // 鼠标点击（仅桌面端指针锁定后）
    document.addEventListener('mousedown', (e) => {
      if (!this.isPointerLocked) return;
      if (this.inventory && this.inventory.isOpen) return;
      if (e.button === 0) {
        this.player.placeBlock();
      } else if (e.button === 2) {
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
        } else if (this.isRunning) {
          this.ui.pauseScreen.style.display = 'flex';
        }
      });

      const requestLock = () => {
        if (!this.isPointerLocked && this.isRunning) {
          this.canvas.requestPointerLock();
        }
      };

      this.ui.startScreen.addEventListener('click', () => {
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
        requestLock();
      });

      this.ui.pauseScreen.addEventListener('click', requestLock);
      this.canvas.addEventListener('click', requestLock);
    }

    // ----- 移动端：直接进入游戏 + 触摸控制 -----
    if (this.isMobile) {
      this.ui.startScreen.addEventListener('click', () => {
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
      });

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
      this.ui.controlsPanel.style.display = show ? 'flex' : 'none';
    }
    // 移动端控件：仅在移动端显示
    if (this.isMobile) {
      const mobileControls = document.getElementById('mobileControls');
      if (mobileControls) mobileControls.style.display = show ? 'block' : 'none';
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
      `天气: ${weatherName} (T切换)${this.magnetMode ? ' | 收集中(9)' : ''}`;

    this.ui.blockHighlight.style.display = 'none';
  }

  /** 主游戏循环 */
  animate() {
    requestAnimationFrame(() => this.animate());

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
      const wasOnGround = this.player.onGround;
      this.player.update(dt);
      // 起跳瞬间播放音效（地面 → 快速上升）
      if (wasOnGround && !this.player.onGround && this.player.velocity.y > 6 && !this.player.flying) {
        this.sound.jump();
      }
      this.world.update(this.player.position.x, this.player.position.z);
      this.highlight.update(this.player.targetBlock);
      if (this.tutorial) this.tutorial.update(dt, this.player);

      // 第三人称：相机移到角色背后
      if (this.viewMode === 'third') {
        const yaw = this.player.yaw, pitch = this.player.pitch;
        const dist = this.camDist;
        const backX = Math.sin(yaw) * Math.cos(pitch);
        const backZ = Math.cos(yaw) * Math.cos(pitch);
        const backY = -Math.sin(pitch);
        const eyeY = this.player.position.y + this.player.eyeHeight;
        // 理想相机位置
        let camX = this.player.position.x + backX * dist;
        let camY = eyeY + backY * dist;
        let camZ = this.player.position.z + backZ * dist;
        // 简单碰撞：避免相机进墙，向角色拉近
        const ground = this.world.getSurfaceHeight ? this.world.getSurfaceHeight(
          Math.floor(camX), Math.floor(camZ)) : 0;
        if (camY < ground + 0.5) camY = ground + 0.5;
        this.camera.position.set(camX, camY, camZ);
        this.camera.lookAt(
          this.player.position.x,
          this.player.position.y + 1.3,
          this.player.position.z
        );
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

    // 昼夜循环（始终更新）
    if (this.dayNight) {
      this.dayNight.update(dt, this.camera);
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

    // 樱花花瓣
    if (this.sakura) {
      this.sakura.update(dt, this.player.position);
    }

    // 手持视图轻微摆动
    if (this.heldGroup && (this.isPointerLocked || (this.isMobile && this.isRunning))) {
      const moving = this.player.onGround && (
        Math.abs(this.player.velocity.x) + Math.abs(this.player.velocity.z) > 0.5);
      this._heldBob += dt * (moving ? 9 : 2);
      this.heldGroup.position.y = Math.sin(this._heldBob) * (moving ? 0.02 : 0.006);
      this.heldGroup.position.x = Math.cos(this._heldBob * 0.5) * (moving ? 0.012 : 0);
    }

    // 自动存档（每 20 秒，仅有改动时）
    this._tickSave(dt);

    // 渲染
    this.renderer.render(this.scene, this.camera);

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
  }
  // 即使 init 部分失败，也尽量启动主循环，避免"点击开始无反应"
  try {
    if (game) game.animate();
  } catch (err) {
    console.error('[animate 启动失败]', err);
  }
});

// 全局兜底：任何未捕获错误都打印，避免静默卡死
window.addEventListener('error', (e) => {
  console.error('[运行时错误]', e.message, e.filename, e.lineno, e.error);
});
