import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, isSolid, BlockType } from './voxel.js?v=20260925af';

/**
 * 友好生物系统
 * 包含：羊、兔、马、牛、猪、鸡、村民、铁傀儡
 * 每种生物使用体素模型（BoxGeometry 拼接）+ 简单AI（游荡/观察）
 */

function makeBox(w, h, d, color, x = 0, y = 0, z = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  return mesh;
}

/* ============================================
   生物基类
   ============================================ */
class Animal {
  constructor(world, x, y, z) {
    this.world = world;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.rotation = 0;
    this.group = new THREE.Group();
    this.width = 0.6;
    this.height = 0.8;
    this.speed = 1.2;
    this.state = 'idle';
    this.stateTimer = Math.random() * 3;
    this.targetRot = 0;
    this.legPhase = 0;
    this._buildModel();
    this.group.position.copy(this.pos);
  }

  _buildModel() {}
  _getLegs() { return []; }

  _setRotation(r) {
    this.rotation = r;
    this.group.rotation.y = r;
  }

  update(dt) {
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this._pickNewState();
    }

    if (this.state === 'wander') {
      // 平滑转向
      let diff = this.targetRot - this.rotation;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this._setRotation(this.rotation + diff * Math.min(1, dt * 4));

      this.vel.x = Math.sin(this.rotation) * this.speed;
      this.vel.z = Math.cos(this.rotation) * this.speed;
      this.legPhase += dt * this.speed * 4;
    } else {
      this.vel.x *= 0.8;
      this.vel.z *= 0.8;
    }

    // 重力
    this.vel.y -= 20 * dt;

    // 移动 + 碰撞
    this._moveAxis('x', this.vel.x * dt);
    this._moveAxis('z', this.vel.z * dt);
    this._moveAxis('y', this.vel.y * dt);

    this.group.position.copy(this.pos);

    // 腿部动画
    const legs = this._getLegs();
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (leg) leg.rotation.x = Math.sin(this.legPhase + i * Math.PI) * (this.state === 'wander' ? 0.5 : 0);
    }
  }

  _pickNewState() {
    if (Math.random() < 0.6) {
      this.state = 'idle';
      this.stateTimer = 1 + Math.random() * 3;
    } else {
      this.state = 'wander';
      this.stateTimer = 2 + Math.random() * 4;
      this.targetRot = Math.random() * Math.PI * 2;
    }
  }

  _moveAxis(axis, delta) {
    if (Math.abs(delta) < 0.0001) return;
    const newPos = this.pos.clone();
    newPos[axis] += delta;

    const hw = this.width / 2;
    const minX = Math.floor(newPos.x - hw), maxX = Math.floor(newPos.x + hw);
    const minZ = Math.floor(newPos.z - hw), maxZ = Math.floor(newPos.z + hw);
    const minY = Math.floor(newPos.y), maxY = Math.floor(newPos.y + this.height);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let by = minY; by <= maxY; by++) {
          if (isSolid(this.world.getBlock(bx, by, bz))) {
            // 碰到方块：阶梯检测（自动上1格）
            if (axis !== 'y' && this.onGround) {
              const stepUp = newPos.clone();
              stepUp.y += 1.01;
              if (!this._collidesAt(stepUp)) {
                this.pos.copy(stepUp);
                return;
              }
            }
            return; // 撞墙，不移动该轴
          }
        }
      }
    }
    this.pos[axis] = newPos[axis];

    if (axis === 'y') {
      // 检测地面
      const footY = Math.floor(this.pos.y - 0.05);
      this.onGround = isSolid(this.world.getBlock(Math.floor(this.pos.x), footY, Math.floor(this.pos.z)));
      if (this.onGround && this.vel.y < 0) this.vel.y = 0;
    }
  }

  _collidesAt(p) {
    const hw = this.width / 2;
    for (let bx = Math.floor(p.x - hw); bx <= Math.floor(p.x + hw); bx++)
      for (let bz = Math.floor(p.z - hw); bz <= Math.floor(p.z + hw); bz++)
        for (let by = Math.floor(p.y); by <= Math.floor(p.y + this.height); by++)
          if (isSolid(this.world.getBlock(bx, by, bz))) return true;
    return false;
  }

  dispose() {
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

/* ===== 羊 ===== */
class Sheep extends Animal {
  constructor(world, x, y, z) {
    super(world, x, y, z);
    this.width = 0.7; this.height = 1.1; this.speed = 1.3;
  }
  _buildModel() {
    const wool = 0xf0f0e8;
    const skin = 0xd8c8b8;
    // 身体
    this.body = makeBox(0.7, 0.7, 1.0, wool, 0, 0.75, 0);
    this.group.add(this.body);
    // 头
    this.head = makeBox(0.4, 0.4, 0.4, skin, 0, 0.95, -0.6);
    this.group.add(this.head);
    // 腿
    this.legs = [];
    const legPos = [[0.25,0.35,-0.35],[-0.25,0.35,-0.35],[0.25,0.35,0.35],[-0.25,0.35,0.35]];
    for (const [lx, ly, lz] of legPos) {
      const leg = makeBox(0.18, 0.4, 0.18, skin, lx, ly, lz);
      this.legs.push(leg);
      this.group.add(leg);
    }
  }
  _getLegs() { return this.legs; }
}

/* ===== 兔子 ===== */
class Rabbit extends Animal {
  constructor(world, x, y, z) {
    super(world, x, y, z);
    this.width = 0.35; this.height = 0.5; this.speed = 2.2;
  }
  _buildModel() {
    const fur = 0xc8a888;
    const belly = 0xf0e0d0;
    this.body = makeBox(0.35, 0.35, 0.5, fur, 0, 0.3, 0);
    this.group.add(this.body);
    this.head = makeBox(0.28, 0.28, 0.28, fur, 0, 0.5, -0.28);
    this.group.add(this.head);
    // 长耳朵
    this.group.add(makeBox(0.08, 0.3, 0.08, fur, -0.08, 0.78, -0.28));
    this.group.add(makeBox(0.08, 0.3, 0.08, fur, 0.08, 0.78, -0.28));
    // 尾巴
    this.group.add(makeBox(0.12, 0.12, 0.12, 0xffffff, 0, 0.4, 0.28));
    this.legs = [];
    for (const [lx,lz] of [[0.12,-0.15],[-0.12,-0.15],[0.12,0.18],[-0.12,0.18]]) {
      const leg = makeBox(0.1, 0.2, 0.1, fur, lx, 0.1, lz);
      this.legs.push(leg);
      this.group.add(leg);
    }
  }
  _getLegs() { return this.legs; }
  _pickNewState() {
    if (Math.random() < 0.4) {
      this.state = 'idle';
      this.stateTimer = 0.5 + Math.random() * 2;
    } else {
      this.state = 'wander';
      this.stateTimer = 0.8 + Math.random() * 2;
      this.targetRot = Math.random() * Math.PI * 2;
    }
  }
}

/* ===== 马 ===== */
class Horse extends Animal {
  constructor(world, x, y, z) {
    super(world, x, y, z);
    this.width = 0.8; this.height = 1.6; this.speed = 2.5;
  }
  _buildModel() {
    const coat = 0x8b5a2b;
    const mane = 0x3a2515;
    const sock = 0x1a1a1a;
    this.body = makeBox(0.7, 0.7, 1.4, coat, 0, 1.0, 0);
    this.group.add(this.body);
    // 脖子
    this.neck = makeBox(0.35, 0.6, 0.4, coat, 0, 1.45, -0.6);
    this.group.add(this.neck);
    // 头
    this.head = makeBox(0.35, 0.35, 0.55, coat, 0, 1.65, -0.95);
    this.group.add(this.head);
    // 鬃毛
    this.group.add(makeBox(0.1, 0.5, 0.4, mane, 0, 1.55, -0.6));
    // 尾巴
    this.group.add(makeBox(0.15, 0.5, 0.2, mane, 0, 0.85, 0.7));
    // 4条腿
    this.legs = [];
    const legPos = [[0.25,0.5,-0.5],[-0.25,0.5,-0.5],[0.25,0.5,0.5],[-0.25,0.5,0.5]];
    for (const [lx, ly, lz] of legPos) {
      const leg = makeBox(0.2, 1.0, 0.2, coat, lx, ly, lz);
      this.legs.push(leg);
      this.group.add(leg);
      // 蹄子
      this.group.add(makeBox(0.22, 0.15, 0.22, sock, lx, 0.08, lz));
    }
  }
  _getLegs() { return this.legs; }
}

/* ===== 牛 ===== */
class Cow extends Animal {
  constructor(world, x, y, z) {
    super(world, x, y, z);
    this.width = 0.75; this.height = 1.2; this.speed = 1.2;
  }
  _buildModel() {
    const brown = 0x6b4020;
    const white = 0xf0f0e8;
    const pink = 0xffaaaa;
    // 身体（白底棕斑）
    this.body = makeBox(0.75, 0.75, 1.2, white, 0, 0.8, 0);
    this.group.add(this.body);
    // 棕斑
    this.group.add(makeBox(0.3, 0.5, 0.4, brown, 0.2, 0.9, -0.2));
    this.group.add(makeBox(0.35, 0.4, 0.35, brown, -0.2, 0.75, 0.3));
    // 头
    this.head = makeBox(0.5, 0.5, 0.5, brown, 0, 1.0, -0.75);
    this.group.add(this.head);
    // 鼻子
    this.group.add(makeBox(0.35, 0.2, 0.1, pink, 0, 0.85, -1.0));
    // 角
    this.group.add(makeBox(0.08, 0.2, 0.08, 0xe8e0d0, -0.15, 1.3, -0.7));
    this.group.add(makeBox(0.08, 0.2, 0.08, 0xe8e0d0, 0.15, 1.3, -0.7));
    // 腿
    this.legs = [];
    for (const [lx,lz] of [[0.25,-0.4],[-0.25,-0.4],[0.25,0.4],[-0.25,0.4]]) {
      const leg = makeBox(0.2, 0.55, 0.2, brown, lx, 0.3, lz);
      this.legs.push(leg);
      this.group.add(leg);
    }
  }
  _getLegs() { return this.legs; }
}

/* ===== 猪 ===== */
class Pig extends Animal {
  constructor(world, x, y, z) {
    super(world, x, y, z);
    this.width = 0.65; this.height = 0.8; this.speed = 1.4;
  }
  _buildModel() {
    const pink = 0xf0a8a0;
    const darkPink = 0xd08080;
    this.body = makeBox(0.65, 0.6, 0.9, pink, 0, 0.55, 0);
    this.group.add(this.body);
    this.head = makeBox(0.5, 0.5, 0.45, pink, 0, 0.6, -0.6);
    this.group.add(this.head);
    // 猪鼻
    this.group.add(makeBox(0.3, 0.2, 0.1, darkPink, 0, 0.5, -0.82));
    // 腿
    this.legs = [];
    for (const [lx,lz] of [[0.2,-0.3],[-0.2,-0.3],[0.2,0.3],[-0.2,0.3]]) {
      const leg = makeBox(0.18, 0.35, 0.18, pink, lx, 0.2, lz);
      this.legs.push(leg);
      this.group.add(leg);
    }
  }
  _getLegs() { return this.legs; }
}

/* ===== 鸡 ===== */
class Chicken extends Animal {
  constructor(world, x, y, z) {
    super(world, x, y, z);
    this.width = 0.3; this.height = 0.5; this.speed = 1.6;
  }
  _buildModel() {
    const white = 0xf8f8f8;
    const red = 0xcc2020;
    const yellow = 0xffaa20;
    this.body = makeBox(0.3, 0.35, 0.4, white, 0, 0.3, 0);
    this.group.add(this.body);
    this.head = makeBox(0.22, 0.22, 0.22, white, 0, 0.55, -0.2);
    this.group.add(this.head);
    // 喙
    this.group.add(makeBox(0.1, 0.08, 0.12, yellow, 0, 0.52, -0.35));
    // 鸡冠
    this.group.add(makeBox(0.08, 0.1, 0.08, red, 0, 0.7, -0.2));
    // 肉垂
    this.group.add(makeBox(0.06, 0.08, 0.04, red, 0, 0.42, -0.3));
    this.legs = [];
    for (const lx of [-0.08, 0.08]) {
      const leg = makeBox(0.06, 0.2, 0.06, yellow, lx, 0.1, 0);
      this.legs.push(leg);
      this.group.add(leg);
    }
  }
  _getLegs() { return this.legs; }
}

/* ===== 村民 ===== */
class Villager extends Animal {
  constructor(world, x, y, z, profession = 'farmer') {
    super(world, x, y, z);
    this.width = 0.5; this.height = 1.8; this.speed = 0.9;
    this.profession = profession;
  }
  _buildModel() {
    const robeColors = { farmer: 0x8b6f47, librarian: 0x8b4513, priest: 0x4a2545, butcher: 0x6b3030, smith: 0x3a3a3a };
    const robe = robeColors[this.profession] || 0x8b6f47;
    const skin = 0xc89878;
    // 长袍身体
    this.body = makeBox(0.5, 1.0, 0.35, robe, 0, 0.9, 0);
    this.group.add(this.body);
    // 头
    this.head = makeBox(0.4, 0.4, 0.4, skin, 0, 1.65, 0);
    this.group.add(this.head);
    // 大鼻子
    this.group.add(makeBox(0.15, 0.2, 0.15, skin, 0, 1.6, -0.25));
    // 眉毛（突出的额头）
    this.group.add(makeBox(0.35, 0.08, 0.05, skin, 0, 1.78, -0.2));
    // 手臂（交叉在胸前）
    this.leftArm = makeBox(0.15, 0.7, 0.15, robe, -0.32, 1.0, 0.1);
    this.rightArm = makeBox(0.15, 0.7, 0.15, robe, 0.32, 1.0, 0.1);
    this.group.add(this.leftArm);
    this.group.add(this.rightArm);
    // 腿（在袍子下面）
    this.legs = [];
    for (const lx of [-0.12, 0.12]) {
      const leg = makeBox(0.16, 0.45, 0.16, 0x3a2a1a, lx, 0.25, 0);
      this.legs.push(leg);
      this.group.add(leg);
    }
  }
  _getLegs() { return this.legs; }
  _pickNewState() {
    if (Math.random() < 0.5) {
      this.state = 'idle';
      this.stateTimer = 2 + Math.random() * 4;
    } else {
      this.state = 'wander';
      this.stateTimer = 3 + Math.random() * 5;
      this.targetRot = Math.random() * Math.PI * 2;
    }
  }
}

/* ===== 铁傀儡 ===== */
class IronGolem extends Animal {
  constructor(world, x, y, z) {
    super(world, x, y, z);
    this.width = 1.0; this.height = 2.5; this.speed = 0.6;
  }
  _buildModel() {
    const iron = 0xc0c0c0;
    const darkIron = 0x808080;
    const vine = 0x5a8030;
    // 身体（大块）
    this.body = makeBox(1.1, 1.2, 0.7, iron, 0, 1.4, 0);
    this.group.add(this.body);
    // 藤蔓覆盖
    this.group.add(makeBox(0.3, 0.8, 0.05, vine, -0.2, 1.3, 0.36));
    // 头
    this.head = makeBox(0.6, 0.6, 0.6, iron, 0, 2.4, 0);
    this.group.add(this.head);
    // 眼睛
    this.group.add(makeBox(0.12, 0.1, 0.05, 0xff3030, -0.15, 2.45, -0.3));
    this.group.add(makeBox(0.12, 0.1, 0.05, 0xff3030, 0.15, 2.45, -0.3));
    // 大鼻子
    this.group.add(makeBox(0.2, 0.3, 0.2, darkIron, 0, 2.3, -0.35));
    // 长腿
    this.legs = [];
    for (const lx of [-0.25, 0.25]) {
      const leg = makeBox(0.35, 0.9, 0.35, iron, lx, 0.5, 0);
      this.legs.push(leg);
      this.group.add(leg);
    }
    // 长手臂
    this.leftArm = makeBox(0.3, 1.3, 0.3, iron, -0.7, 1.3, 0);
    this.rightArm = makeBox(0.3, 1.3, 0.3, iron, 0.7, 1.3, 0);
    this.group.add(this.leftArm);
    this.group.add(this.rightArm);
  }
  _getLegs() { return this.legs; }
  _pickNewState() {
    if (Math.random() < 0.7) {
      this.state = 'idle';
      this.stateTimer = 3 + Math.random() * 6;
    } else {
      this.state = 'wander';
      this.stateTimer = 2 + Math.random() * 3;
      this.targetRot = Math.random() * Math.PI * 2;
    }
  }
}

/* ============================================
   生物管理器
   ============================================ */
export class AnimalManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.animals = [];
    this.spawnRadius = 3; // 区块半径
    this.maxAnimals = 30;
    this.spawnCooldown = 0;
    // 每种生物的权重（自然生成）
    this.naturalTypes = [
      { cls: Sheep, w: 30 },
      { cls: Rabbit, w: 20 },
      { cls: Cow, w: 20 },
      { cls: Pig, w: 20 },
      { cls: Chicken, w: 25 },
      { cls: Horse, w: 8 },
    ];
  }

  _pickNaturalType() {
    const total = this.naturalTypes.reduce((s, t) => s + t.w, 0);
    let r = Math.random() * total;
    for (const t of this.naturalTypes) {
      r -= t.w;
      if (r <= 0) return t.cls;
    }
    return Sheep;
  }

  /** 在指定位置生成生物 */
  spawn(type, x, y, z) {
    const animal = new type(this.world, x, y, z);
    this.animals.push(animal);
    this.scene.add(animal.group);
    return animal;
  }

  /** 生成村民 */
  spawnVillager(x, y, z, profession) {
    return this.spawn(Villager, x, y, z, profession);
  }

  /** 生成铁傀儡 */
  spawnGolem(x, y, z) {
    return this.spawn(IronGolem, x, y, z);
  }

  update(dt, playerPos) {
    // 更新已有生物
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      a.update(dt);
      // 太远的生物移除
      const dx = a.pos.x - playerPos.x;
      const dz = a.pos.z - playerPos.z;
      if (dx * dx + dz * dz > 64 * 64 || a.pos.y < -5) {
        this.scene.remove(a.group);
        a.dispose();
        this.animals.splice(i, 1);
      }
    }

    // 自然生成
    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0 && this.animals.length < this.maxAnimals) {
      this.spawnCooldown = 2;
      this._trySpawn(playerPos);
    }
  }

  _trySpawn(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 16 + Math.random() * 20;
    const wx = playerPos.x + Math.cos(angle) * dist;
    const wz = playerPos.z + Math.sin(angle) * dist;
    const surfaceY = this.world.getSurfaceHeight(Math.floor(wx), Math.floor(wz));
    if (surfaceY < 1) return;
    const biome = this.world.getBiome ? this.world.getBiome(Math.floor(wx), Math.floor(wz)) : 1;

    // 不在水里生成
    const blockAt = this.world.getBlock(Math.floor(wx), surfaceY - 1, Math.floor(wz));
    if (blockAt === BlockType.WATER || blockAt === BlockType.ICE) return;

    const Cls = this._pickNaturalType();
    // 兔子在沙漠/雪原更常见
    this.spawn(Cls, wx, surfaceY, wz);
  }

  dispose() {
    for (const a of this.animals) {
      this.scene.remove(a.group);
      a.dispose();
    }
    this.animals = [];
  }
}

export { Sheep, Rabbit, Horse, Cow, Pig, Chicken, Villager, IronGolem };
