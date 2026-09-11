// js/fireflies.js
// 漂浮光点（萤火虫/精灵光点）：在玩家周围低空缓慢漂浮、上下起伏的暖黄色发光小点。
// 儿童常亮模式下也可见（当作"花田小精灵"），夜晚更亮。数量少、性能友好。
import * as THREE from 'three';

export class Fireflies {
  constructor(scene, count = 24) {
    this.scene = scene;
    this.count = count;

    // 光点贴图（柔和暖黄圆）
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255,244,180,1)');
    grad.addColorStop(0.4, 'rgba(255,224,120,0.9)');
    grad.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 16);
    const tex = new THREE.CanvasTexture(c);

    this.positions = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    this.baseX = new Float32Array(count);
    this.baseZ = new Float32Array(count);
    this.baseY = new Float32Array(count);
    this.range = 16;

    for (let i = 0; i < count; i++) {
      this.phase[i] = Math.random() * Math.PI * 2;
      this.baseX[i] = (Math.random() - 0.5) * this.range * 2;
      this.baseZ[i] = (Math.random() - 0.5) * this.range * 2;
      this.baseY[i] = Math.random() * 6;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.5,
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xfff0a0,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, playerPos) {
    const cx = playerPos.x, cz = playerPos.z, cy = playerPos.y;
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      this.phase[i] += dt * (0.5 + (i % 3) * 0.2);
      // 围绕玩家附近缓慢漂浮
      this.positions[ix] = cx + this.baseX[i] + Math.sin(this.phase[i] * 0.6) * 2;
      this.positions[ix + 1] = cy + 0.8 + this.baseY[i] * 0.5 + Math.sin(this.phase[i]) * 0.8;
      this.positions[ix + 2] = cz + this.baseZ[i] + Math.cos(this.phase[i] * 0.5) * 2;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
