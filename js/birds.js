// js/birds.js
// 天空飞鸟：在玩家头顶上方盘旋，扇动翅膀，随玩家移动而跟随。
// 纯装饰性生物，不受地面碰撞约束。
import * as THREE from 'three';

const BIRD_COLORS = [0x3a3a42, 0x6b4a2a, 0xe8e8e8, 0x88aacc, 0x4a3520];

class Bird {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const color = BIRD_COLORS[(Math.random() * BIRD_COLORS.length) | 0];
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const wingMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.8) });

    // 身体
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.7), bodyMat);
    this.group.add(this.body);
    // 头
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), bodyMat);
    head.position.set(0, 0.06, -0.42);
    this.group.add(head);
    // 喙
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.16),
      new THREE.MeshLambertMaterial({ color: 0xe8a020 }));
    beak.position.set(0, 0.04, -0.6);
    this.group.add(beak);
    // 翅膀（绕 z 轴扇动）
    this.leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.4), wingMat);
    this.leftWing.geometry.translate(0.5, 0, 0);
    this.leftWing.position.set(0.1, 0.1, 0);
    this.group.add(this.leftWing);
    this.rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.4), wingMat);
    this.rightWing.geometry.translate(-0.5, 0, 0);
    this.rightWing.position.set(-0.1, 0.1, 0);
    this.group.add(this.rightWing);
    // 尾羽
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), wingMat);
    tail.position.set(0, 0.05, 0.45);
    this.group.add(tail);

    scene.add(this.group);

    // 盘旋参数
    this.center = new THREE.Vector3();
    this.radius = 6 + Math.random() * 10;
    this.angle = Math.random() * Math.PI * 2;
    this.angularSpeed = 0.15 + Math.random() * 0.2;
    this.height = 18 + Math.random() * 14;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.flapSpeed = 6 + Math.random() * 4;
    this.flap = Math.random() * Math.PI * 2;
  }

  update(dt, playerPos) {
    this.angle += this.angularSpeed * dt;
    // 盘旋中心缓慢跟随玩家
    this.center.x += (playerPos.x - this.center.x) * 0.02;
    this.center.z += (playerPos.z - this.center.z) * 0.02;
    const x = this.center.x + Math.cos(this.angle) * this.radius;
    const z = this.center.z + Math.sin(this.angle) * this.radius;
    this.bobPhase += dt * 1.5;
    const y = this.center.y + this.height + Math.sin(this.bobPhase) * 1.2;
    this.group.position.set(x, y, z);
    // 朝向飞行方向（切线）
    this.group.rotation.y = -this.angle + Math.PI / 2;
    // 扇翅膀
    this.flap += dt * this.flapSpeed;
    const f = Math.sin(this.flap) * 0.7;
    this.leftWing.rotation.z = f;
    this.rightWing.rotation.z = -f;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

export class BirdManager {
  constructor(scene, count = 8) {
    this.scene = scene;
    this.birds = [];
    this.count = count;
  }

  init(playerPos) {
    for (let i = 0; i < this.count; i++) {
      const b = new Bird(this.scene);
      b.center.set(playerPos.x, 0, playerPos.z);
      b.angle = (i / this.count) * Math.PI * 2;
      this.birds.push(b);
    }
  }

  update(dt, playerPos) {
    if (this.birds.length === 0) this.init(playerPos);
    for (const b of this.birds) b.update(dt, playerPos);
  }
}

/* ============================================
   蝴蝶：在花田/樱花区低空（贴近花草）翩翩飞舞
   数量少、体型小，纯装饰
   ============================================ */
const BUTTERFLY_COLORS = [0xff8fc0, 0xffd166, 0x9ad0ff, 0xc7a8ff, 0xffb37a];

class Butterfly {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const color = BUTTERFLY_COLORS[(Math.random() * BUTTERFLY_COLORS.length) | 0];
    const wingMat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });

    // 身体（小竖条）
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x4a3520 }));
    body.rotation.x = Math.PI / 2;
    this.group.add(body);
    // 两片翅膀（竖起来扇动），左右各一片
    this.leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.02), wingMat);
    this.leftWing.geometry.translate(0.16, 0, 0);
    this.leftWing.position.set(0.02, 0.06, 0);
    this.group.add(this.leftWing);
    this.rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.02), wingMat);
    this.rightWing.geometry.translate(-0.16, 0, 0);
    this.rightWing.position.set(-0.02, 0.06, 0);
    this.group.add(this.rightWing);

    scene.add(this.group);

    // 飞舞参数
    this.home = new THREE.Vector3();
    this.t = Math.random() * 100;
    this.radius = 2 + Math.random() * 4;
    this.baseHeight = 1.2 + Math.random() * 1.6;  // 贴近花草
    this.speed = 0.6 + Math.random() * 0.8;
    this.flapSpeed = 12 + Math.random() * 6;
    this.flap = Math.random() * Math.PI * 2;
  }

  update(dt, playerPos) {
    this.t += dt * this.speed;
    // 缓慢跟随玩家（蝴蝶留在花田附近）
    this.home.x += (playerPos.x - this.home.x) * 0.015;
    this.home.z += (playerPos.z - this.home.z) * 0.015;
    const x = this.home.x + Math.sin(this.t) * this.radius;
    const z = this.home.z + Math.cos(this.t * 0.8) * this.radius;
    const y = this.home.y + this.baseHeight + Math.sin(this.t * 2.2) * 0.5;
    this.group.position.set(x, y, z);
    // 朝向运动方向
    this.group.rotation.y = -this.t + Math.PI / 2;
    // 扇翅膀（绕身体前后轴）
    this.flap += dt * this.flapSpeed;
    const f = Math.sin(this.flap) * 0.9 + 0.3;
    this.leftWing.rotation.y = f;
    this.rightWing.rotation.y = -f;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

export class ButterflyManager {
  constructor(scene, count = 6) {
    this.scene = scene;
    this.butterflies = [];
    this.count = count;
  }

  init(playerPos) {
    for (let i = 0; i < this.count; i++) {
      const b = new Butterfly(this.scene);
      b.home.set(playerPos.x, playerPos.y, playerPos.z);
      b.t = (i / this.count) * Math.PI * 2;
      this.butterflies.push(b);
    }
  }

  update(dt, playerPos) {
    if (this.butterflies.length === 0) this.init(playerPos);
    for (const b of this.butterflies) b.update(dt, playerPos);
  }
}

