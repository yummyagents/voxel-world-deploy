import * as THREE from 'three';
import { BlockType, isSolid, getBlockColor } from './voxel.js?v=20260925al';

/**
 * 掉落物系统
 * - 方块被破坏时生成掉落物（小立方体，旋转 + 上下浮动）
 * - 按 9 键吸引附近 8 格内掉落物到玩家并收集
 * - 有地面物理（落在方块上）
 */
export class DropManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.drops = [];
    // 共享几何体
    this._boxGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    this._collectRange = 6;
    this._pickupRange = 1.2;
    this._magnetActive = false;
    this._onCollect = null;
  }

  /** 设置收集回调 */
  onCollect(cb) { this._onCollect = cb; }

  /** 生成掉落物 */
  spawn(x, y, z, blockType) {
    if (blockType === BlockType.AIR) return;
    const color = getBlockColor(blockType);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(this._boxGeo, mat);
    mesh.position.set(x + 0.5, y + 0.3, z + 0.5);
    this.scene.add(mesh);

    // 随机初速度（向上弹出 + 水平散射）
    const drop = {
      mesh,
      blockType,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 1.5,
      vz: (Math.random() - 0.5) * 2,
      onGround: false,
      age: 0,
      bobPhase: Math.random() * Math.PI * 2,
    };
    this.drops.push(drop);
  }

  /** 切换磁铁吸引模式（按9键时调用） */
  toggleMagnet() {
    this._magnetActive = !this._magnetActive;
    return this._magnetActive;
  }

  setMagnet(v) { this._magnetActive = v; }

  update(dt, playerPos) {
    const toRemove = [];

    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.age += dt;

      // 旋转 + 浮动
      d.mesh.rotation.y += dt * 1.5;
      d.mesh.rotation.x += dt * 0.7;
      d.bobPhase += dt * 2;

      // 磁铁吸引
      if (this._magnetActive) {
        const dx = playerPos.x - d.mesh.position.x;
        const dy = playerPos.y - d.mesh.position.y;
        const dz = playerPos.z - d.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < this._collectRange) {
          const speed = 6 + (this._collectRange - dist) * 2;
          d.vx = (dx / dist) * speed;
          d.vy = (dy / dist) * speed + 1;
          d.vz = (dz / dist) * speed;
          d.onGround = false;
        }
      }

      // 重力
      if (!d.onGround || this._magnetActive) {
        d.vy -= 18 * dt;
      }

      // 水平摩擦（地面上减速）
      if (d.onGround && !this._magnetActive) {
        d.vx *= 0.85;
        d.vz *= 0.85;
      }

      // 移动 + 碰撞
      const newX = d.mesh.position.x + d.vx * dt;
      const newY = d.mesh.position.y + d.vy * dt;
      const newZ = d.mesh.position.z + d.vz * dt;

      // Y 碰撞（地面检测）
      const footY = newY - 0.15;
      const blockBelow = this.world.getBlock(
        Math.floor(newX),
        Math.floor(footY),
        Math.floor(newZ)
      );
      if (isSolid(blockBelow) && d.vy <= 0) {
        d.mesh.position.y = Math.floor(footY) + 1 + 0.15;
        d.vy = 0;
        d.onGround = true;
      } else {
        d.mesh.position.y = newY;
        d.onGround = false;
      }

      d.mesh.position.x = newX;
      d.mesh.position.z = newZ;

      // 地面浮动动画
      if (d.onGround && !this._magnetActive) {
        d.mesh.position.y += Math.sin(d.bobPhase) * 0.05;
      }

      // 拾取检测
      const pdx = playerPos.x - d.mesh.position.x;
      const pdy = playerPos.y + 0.8 - d.mesh.position.y;
      const pdz = playerPos.z - d.mesh.position.z;
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
      if (pdist < this._pickupRange || (this._magnetActive && pdist < 1.6)) {
        toRemove.push(i);
        if (this._onCollect) this._onCollect(d.blockType);
      }

      // 掉出世界
      if (d.mesh.position.y < -10) toRemove.push(i);
    }

    // 移除（倒序）
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const d = this.drops[idx];
      this.scene.remove(d.mesh);
      d.mesh.material.dispose();
      this.drops.splice(idx, 1);
    }
  }

  get count() { return this.drops.length; }

  dispose() {
    for (const d of this.drops) {
      this.scene.remove(d.mesh);
      d.mesh.material.dispose();
    }
    this.drops = [];
    this._boxGeo.dispose();
  }
}
