/**
 * player-character.js
 * 第三人称玩家角色（史蒂夫风格体素小人）
 * - 完整身体：头/身体/手臂/腿，走路时四肢摆动
 * - 盔甲：检测快捷栏内的胸甲/头盔等，自动给身体、头加上铁/钻石甲片
 * - 手持：右手拿当前物品（方块/剑/盾）
 * - V 键在第一人称 / 第三人称之间切换；第三人称相机在角色背后并跟随
 */
import * as THREE from 'three';

// 皮肤配色（史蒂夫风格）
const SKIN = {
  skin: 0xe8b07a,
  skinDark: 0xc98f5f,
  hair: 0x3d2a1a,
  shirt: 0x2aa1c4,   // 青色上衣
  shirtDark: 0x1f7f9c,
  pants: 0x2b3fb0,   // 蓝裤子
  shoes: 0x3a3a42,
  iron: 0xd8d8e0,
  ironDark: 0x9a9aa8,
  diamond: 0x7fe3e0,
  diamondDark: 0x3fb8c4,
};

function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

export class PlayerCharacter {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.walkPhase = 0;
    this.armorLevel = null; // 'iron' | 'diamond' | null
    this.bodyMeshes = {};
    this.armorMeshes = {};
    this._buildBody();
    this._held = null;
  }

  _box(w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    return m;
  }

  _buildBody() {
    const g = this.group;

    // 头（0.5 见方）
    const head = new THREE.Group();
    const headMesh = this._box(0.5, 0.5, 0.5, SKIN.skin);
    head.add(headMesh);
    // 头发（顶 + 后脑勺 + 两侧刘海）
    const hairTop = this._box(0.52, 0.12, 0.52, SKIN.hair); hairTop.position.y = 0.22; head.add(hairTop);
    const hairBack = this._box(0.52, 0.3, 0.1, SKIN.hair); hairBack.position.set(0, 0.02, -0.22); head.add(hairBack);
    // 眼睛（正面 +z）
    const eyeL = this._box(0.1, 0.1, 0.02, 0xffffff); eyeL.position.set(-0.11, 0.03, 0.251); head.add(eyeL);
    const eyeR = this._box(0.1, 0.1, 0.02, 0xffffff); eyeR.position.set(0.11, 0.03, 0.251); head.add(eyeR);
    const pupL = this._box(0.05, 0.06, 0.02, 0x4a3a8f); pupL.position.set(-0.11, 0.03, 0.26); head.add(pupL);
    const pupR = this._box(0.05, 0.06, 0.02, 0x4a3a8f); pupR.position.set(0.11, 0.03, 0.26); head.add(pupR);
    // 鼻子 + 嘴
    const nose = this._box(0.08, 0.08, 0.04, SKIN.skinDark); nose.position.set(0, -0.06, 0.25); head.add(nose);
    const mouth = this._box(0.16, 0.04, 0.02, 0x8a5a3a); mouth.position.set(0, -0.16, 0.251); head.add(mouth);
    head.position.y = 1.5;
    g.add(head);
    this.bodyMeshes.head = head;

    // 头盔（盔甲，默认隐藏）
    const helmet = new THREE.Group();
    const helmMain = this._box(0.58, 0.5, 0.58, SKIN.iron); helmMain.material.transparent = true; helmMain.material.opacity = 0.9;
    helmet.add(helmMain);
    const helmFront = this._box(0.6, 0.16, 0.1, SKIN.ironDark); helmFront.position.set(0, -0.16, 0.28); helmet.add(helmFront);
    helmet.position.y = 1.5;
    helmet.visible = false;
    g.add(helmet);
    this.armorMeshes.helmet = helmet;

    // 身体（0.5 宽 0.75 高 0.25 厚）
    const body = new THREE.Group();
    const torso = this._box(0.5, 0.75, 0.28, SKIN.shirt);
    body.add(torso);
    const torsoShade = this._box(0.5, 0.2, 0.29, SKIN.shirtDark); torsoShade.position.y = -0.27; body.add(torsoShade);
    body.position.y = 0.9;
    g.add(body);
    this.bodyMeshes.body = body;

    // 胸甲
    const chest = this._box(0.56, 0.66, 0.34, SKIN.iron); chest.material.transparent = true; chest.material.opacity = 0.92;
    chest.position.y = 0.92;
    chest.visible = false;
    g.add(chest);
    this.armorMeshes.chest = chest;

    // 手臂（0.2 宽 0.75 高），肩部铰链
    const armL = new THREE.Group();
    const armLmesh = this._box(0.22, 0.7, 0.24, SKIN.shirt); armLmesh.position.y = -0.35; armL.add(armLmesh);
    const handL = this._box(0.22, 0.16, 0.24, SKIN.skin); handL.position.y = -0.72; armL.add(handL);
    armL.position.set(-0.38, 1.22, 0);
    g.add(armL);
    this.bodyMeshes.armL = armL;

    const armR = new THREE.Group();
    const armRmesh = this._box(0.22, 0.7, 0.24, SKIN.shirt); armRmesh.position.y = -0.35; armR.add(armRmesh);
    const handR = this._box(0.22, 0.16, 0.24, SKIN.skin); handR.position.y = -0.72; armR.add(handR);
    armR.position.set(0.38, 1.22, 0);
    g.add(armR);
    this.bodyMeshes.armR = armR;
    this.bodyMeshes.handR = armR; // 手持挂在右手

    // 腿（0.22 宽 0.8 高），髋部铰链
    const legL = new THREE.Group();
    const legLmesh = this._box(0.22, 0.72, 0.24, SKIN.pants); legLmesh.position.y = -0.36; legL.add(legLmesh);
    const shoeL = this._box(0.22, 0.12, 0.28, SKIN.shoes); shoeL.position.set(0, -0.72, 0.02); legL.add(shoeL);
    legL.position.set(-0.13, 0.55, 0);
    g.add(legL);
    this.bodyMeshes.legL = legL;

    const legR = new THREE.Group();
    const legRmesh = this._box(0.22, 0.72, 0.24, SKIN.pants); legRmesh.position.y = -0.36; legR.add(legRmesh);
    const shoeR = this._box(0.22, 0.12, 0.28, SKIN.shoes); shoeR.position.set(0, -0.72, 0.02); legR.add(shoeR);
    legR.position.set(0.13, 0.55, 0);
    legR.visible = false;
    g.add(legR);
    legR.visible = true;
    this.bodyMeshes.legR = legR;

    // 护腿甲（覆盖双腿前片，简化为一片）
    const legsArmor = this._box(0.5, 0.5, 0.3, SKIN.iron); legsArmor.material.transparent = true; legsArmor.material.opacity = 0.85;
    legsArmor.position.y = 0.5;
    legsArmor.visible = false;
    g.add(legsArmor);
    this.armorMeshes.legs = legsArmor;
  }

  /** 根据快捷栏内容决定盔甲：含胸甲→全身，头盔单独等 */
  setArmor(level) {
    if (level === this.armorLevel) return;
    this.armorLevel = level;
    const c = level === 'diamond' ? [SKIN.diamond, SKIN.diamondDark]
      : level === 'iron' ? [SKIN.iron, SKIN.ironDark] : null;
    const vis = !!c;
    for (const key of ['helmet', 'chest', 'legs']) {
      const m = this.armorMeshes[key];
      m.visible = vis;
      if (c) m.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.color.setHex(c[0]);
        }
      });
    }
    if (this.armorMeshes.helmet) {
      this.armorMeshes.helmet.children.forEach((o, i) => {
        if (i === 1 && c) o.material.color.setHex(c[1]);
      });
    }
  }

  /** 手持物品：在右手添加小模型（复用第一人称 viewmodel 的构建） */
  setHeld(buildViewmodelFn) {
    // 清掉旧的
    if (this._held) {
      this.bodyMeshes.handR.remove(this._held);
      this._held.traverse((o) => {
        if (o.isMesh) { o.geometry.dispose(); }
      });
      this._held = null;
    }
    if (buildViewmodelFn) {
      const held = buildViewmodelFn(0.55); // 缩小
      held.position.set(0, -0.78, 0.15);
      held.rotation.x = -Math.PI / 2.4;
      this.bodyMeshes.handR.add(held);
      this._held = held;
    }
  }

  setVisible(v) {
    this.group.visible = v;
  }

  /** 每帧更新：位置、朝向、走路摆动 */
  update(player, dt) {
    // 脚底在 player.position.y（碰撞体）
    this.group.position.set(player.position.x, player.position.y, player.position.z);
    // 朝向：模型正面（眼/鼻）朝 +z，玩家视线 yaw=0 朝 -z，需补 180° 才面向视线方向
    this.group.rotation.y = player.yaw + Math.PI;

    const moving = (Math.abs(player.velocity.x) + Math.abs(player.velocity.z)) > 0.6;
    if (moving && player.onGround) {
      this.walkPhase += dt * 9;
    } else {
      // 回正
      this.walkPhase += (0 - this.walkPhase) * Math.min(1, dt * 8);
    }
    const swing = Math.sin(this.walkPhase) * 0.6;
    this.bodyMeshes.legL.rotation.x = swing;
    this.bodyMeshes.legR.rotation.x = -swing;
    this.bodyMeshes.armL.rotation.x = -swing * 0.8;
    this.bodyMeshes.armR.rotation.x = swing * 0.8;
    if (!player.onGround) {
      // 跳跃时腿微抬
      this.bodyMeshes.legL.rotation.x = -0.4;
      this.bodyMeshes.legR.rotation.x = 0.3;
    }
  }
}
