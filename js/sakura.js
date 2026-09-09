/**
 * sakura.js
 * 樱花花瓣飘落粒子：在玩家附近的空气中飘下粉色花瓣，随风轻摆
 * 跟随玩家位置移动，营造樱花林氛围
 */
import * as THREE from 'three';

export class SakuraPetals {
  constructor(scene, count = 220) {
    this.scene = scene;
    this.count = count;

    // 花瓣贴图（小粉片）
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 16, 16);
    g.fillStyle = '#ffb7d1';
    // 画一个心形/圆形花瓣
    g.beginPath();
    g.arc(8, 9, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd9e6';
    g.beginPath();
    g.arc(8, 8, 3, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;

    this.positions = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    this.speed = new Float32Array(count);
    this.drift = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      this.phase[i] = Math.random() * Math.PI * 2;
      this.speed[i] = 0.4 + Math.random() * 0.7;
      this.drift[i] = 0.5 + Math.random() * 1.0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.22,
      map: tex,
      transparent: true,
      alphaTest: 0.3,
      depthWrite: false,
      color: 0xffffff,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.range = 18;
    this.height = 14;
    this._initialized = false;
  }

  update(dt, playerPos) {
    const cx = playerPos.x;
    const cz = playerPos.z;
    const baseY = playerPos.y;
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      if (!this._initialized) {
        this.positions[ix] = cx + (Math.random() - 0.5) * this.range * 2;
        this.positions[ix + 1] = baseY + Math.random() * this.height;
        this.positions[ix + 2] = cz + (Math.random() - 0.5) * this.range * 2;
      }
      this.phase[i] += dt;
      // 下落
      this.positions[ix + 1] -= this.speed[i] * dt;
      // 左右飘
      this.positions[ix] += Math.sin(this.phase[i] * 1.3) * this.drift[i] * dt * 0.5 + 0.15 * dt;
      this.positions[ix + 2] += Math.cos(this.phase[i] * 0.9) * this.drift[i] * dt * 0.4;

      // 超出范围或落地则重置到玩家上方
      const dx = this.positions[ix] - cx;
      const dz = this.positions[ix + 2] - cz;
      if (this.positions[ix + 1] < baseY - 2 || Math.abs(dx) > this.range || Math.abs(dz) > this.range) {
        this.positions[ix] = cx + (Math.random() - 0.5) * this.range * 2;
        this.positions[ix + 1] = baseY + this.height + Math.random() * 3;
        this.positions[ix + 2] = cz + (Math.random() - 0.5) * this.range * 2;
      }
    }
    this._initialized = true;
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
