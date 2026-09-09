/**
 * 天气系统模块
 * 支持晴天、下雨、下雪三种天气，使用粒子系统实现
 * 粒子系统跟随玩家移动，提供沉浸式天气效果
 */

import * as THREE from 'three';

const WeatherType = {
  CLEAR: 'clear',
  RAIN: 'rain',
  SNOW: 'snow',
};

const WeatherNames = {
  [WeatherType.CLEAR]: '晴天',
  [WeatherType.RAIN]: '下雨',
  [WeatherType.SNOW]: '下雪',
};

class WeatherSystem {
  constructor(scene) {
    this.scene = scene;
    this.currentWeather = WeatherType.CLEAR;
    this.particleCount = 2000;
    this.particleArea = 50;
    this.particleHeight = 30;
    this.particles = null;
    this.particleData = null;
    this.changeInterval = 45;
    this.timer = 0;
    // 天色叠加（交给昼夜系统）：雨偏暗灰、雪偏冷白
    this.tints = {
      [WeatherType.CLEAR]: { color: null, amt: 0 },
      [WeatherType.RAIN]: { color: 0x4a5560, amt: 0.35 },
      [WeatherType.SNOW]: { color: 0xa8b8c8, amt: 0.25 },
    };
    // 昼夜系统引用（由 game.js 注入）
    this.dayNight = null;
  }

  /** 初始化天气系统 */
  init() {
    this._createParticleSystem();
    this.setWeather(WeatherType.CLEAR);
  }

  /** 创建粒子系统（雨/雪共用） */
  _createParticleSystem() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const velocities = new Float32Array(this.particleCount); // Y方向速度
    const offsets = new Float32Array(this.particleCount * 2); // X/Z方向漂移

    for (let i = 0; i < this.particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.particleArea;
      positions[i * 3 + 1] = Math.random() * this.particleHeight;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.particleArea;
      velocities[i] = 0;
      offsets[i * 2] = 0;
      offsets[i * 2 + 1] = 0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // 使用 PointsMaterial
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geometry, material);
    this.particles.frustumCulled = false; // 跟随玩家移动，禁用视锥剔除
    this.particles.visible = false;
    this.scene.add(this.particles);

    this.particleData = { velocities, offsets };
  }

  /** 设置天气类型 */
  setWeather(type) {
    this.currentWeather = type;

    if (type === WeatherType.CLEAR) {
      this.particles.visible = false;
    } else if (type === WeatherType.RAIN) {
      this.particles.visible = true;
      this.particles.material.color.setHex(0x88aacc);
      this.particles.material.size = 0.08;
      this.particles.material.opacity = 0.6;
      for (let i = 0; i < this.particleCount; i++) {
        this.particleData.velocities[i] = 25 + Math.random() * 10;
      }
    } else if (type === WeatherType.SNOW) {
      this.particles.visible = true;
      this.particles.material.color.setHex(0xffffff);
      this.particles.material.size = 0.22;
      this.particles.material.opacity = 0.9;
      for (let i = 0; i < this.particleCount; i++) {
        this.particleData.velocities[i] = 2 + Math.random() * 2;
        this.particleData.offsets[i * 2] = (Math.random() - 0.5) * 2;
        this.particleData.offsets[i * 2 + 1] = (Math.random() - 0.5) * 2;
      }
    }

    // 通过昼夜系统叠加天色
    if (this.dayNight) {
      const tint = this.tints[type];
      this.dayNight.setSkyTint(tint.color, tint.amt);
    }
  }

  /** 随机切换天气 */
  randomWeather() {
    const types = [WeatherType.CLEAR, WeatherType.RAIN, WeatherType.SNOW];
    // 排除当前天气
    const candidates = types.filter(t => t !== this.currentWeather);
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    this.setWeather(next);
  }

  /**
   * 每帧更新
   * @param {number} dt - 帧间隔（秒）
   * @param {THREE.Vector3} playerPos - 玩家位置
   */
  update(dt, playerPos) {
    // 粒子系统跟随玩家
    if (this.particles) {
      this.particles.position.set(playerPos.x, 0, playerPos.z);
    }

    // 自动切换天气
    this.timer += dt;
    if (this.timer >= this.changeInterval) {
      this.timer = 0;
      this.randomWeather();
    }

    // 晴天不更新粒子
    if (this.currentWeather === WeatherType.CLEAR) return;

    // 更新粒子位置
    const positions = this.particles.geometry.attributes.position.array;
    const { velocities, offsets } = this.particleData;

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      if (this.currentWeather === WeatherType.RAIN) {
        // 雨滴：快速垂直下落
        positions[i3 + 1] -= velocities[i] * dt;
        positions[i3] -= 1.5 * dt; // 轻微风向倾斜
      } else if (this.currentWeather === WeatherType.SNOW) {
        // 雪花：缓慢下落 + 水平漂移
        positions[i3 + 1] -= velocities[i] * dt;
        positions[i3] += Math.sin((positions[i3 + 1] + i) * 0.5) * 0.5 * dt + offsets[i * 2] * 0.3 * dt;
        positions[i3 + 2] += Math.cos((positions[i3 + 1] + i) * 0.4) * 0.5 * dt + offsets[i * 2 + 1] * 0.3 * dt;
      }

      // 粒子落到地面以下或超出范围时，重置到玩家上方
      if (positions[i3 + 1] < -5) {
        positions[i3] = (Math.random() - 0.5) * this.particleArea;
        positions[i3 + 1] = this.particleHeight;
        positions[i3 + 2] = (Math.random() - 0.5) * this.particleArea;
      }

      // 超出XZ范围时回收到对面（循环）
      const halfArea = this.particleArea / 2;
      if (positions[i3] > halfArea) positions[i3] -= this.particleArea;
      if (positions[i3] < -halfArea) positions[i3] += this.particleArea;
      if (positions[i3 + 2] > halfArea) positions[i3 + 2] -= this.particleArea;
      if (positions[i3 + 2] < -halfArea) positions[i3 + 2] += this.particleArea;
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (this.particles) {
      this.particles.geometry.dispose();
      this.particles.material.dispose();
      this.scene.remove(this.particles);
      this.particles = null;
    }
  }
}

export { WeatherSystem, WeatherType, WeatherNames };
