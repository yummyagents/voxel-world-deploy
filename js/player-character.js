/**
 * player-character.js
 * 第三人称玩家角色（美味特工队 · Yummy Agents 体素小人）
 * 四个可选主角：
 *   burger  汉堡特工（绿面罩 + 红绿黄帽子 + 红衣服 + 紫背带）
 *   fries   薯条厨娘（红头发 + 薯条厨师帽 + 绿衣服 + 白围裙）
 *   popcorn 鸡米花小弟（橙色花椰菜头 + 紫连帽衫 + 橙裤子）
 *   witch   魔法小女巫（粉尖巫师帽 + 棕长发 + 粉上衣 + 紫裤子）
 * - 完整身体：头/身体/手臂/腿，走路时四肢摆动
 * - 盔甲：检测快捷栏内的胸甲/头盔等，自动给身体、头加上铁/钻石甲片
 * - 手持：右手拿当前物品（方块/剑/盾）
 * - V 键在第一人称 / 第三人称之间切换；第三人称相机在角色背后并跟随
 */
import * as THREE from 'three';

// 四个美味特工的身体配色（衣服/裤子/鞋/脸）
export const AGENTS = {
  burger: {
    key: 'burger', name: '汉堡特工',
    skin: 0xf2c9a0,
    shirt: 0xd84b3c, shirtDark: 0xb03628,
    pants: 0xc24030, shoes: 0x2f9e5f,
    // 手/手套用绿色（汉堡戴绿手套）
    glove: 0x3aa86a,
  },
  fries: {
    key: 'fries', name: '薯条厨娘',
    skin: 0xf7d0ad,
    shirt: 0x3aa86a, shirtDark: 0x2b8a55,
    pants: 0x2f9e5f, shoes: 0x2f9e5f,
    glove: 0xf7d0ad,
  },
  popcorn: {
    key: 'popcorn', name: '鸡米花小弟',
    skin: 0xe8b07a,
    shirt: 0x7a4a86, shirtDark: 0x5f3868,
    pants: 0xf0a83c, shoes: 0x2f9e5f,
    glove: 0xf0a83c,
  },
  witch: {
    key: 'witch', name: '魔法小女巫',
    skin: 0xf6c8a6,
    shirt: 0xe58fb0, shirtDark: 0xc96f96,
    pants: 0x9a5bb0, shoes: 0x8a4ea0,
    glove: 0xf6c8a6,
  },
};

function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

// 盔甲色（共用）
const ARMOR = {
  iron: 0xd8d8e0, ironDark: 0x9a9aa8,
  diamond: 0x7fe3e0, diamondDark: 0x3fb8c4,
};

export class PlayerCharacter {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.walkPhase = 0;
    this.armorLevel = null; // 'iron' | 'diamond' | null
    this.bodyMeshes = {};
    this.armorMeshes = {};
    // 染色部件（随角色换色）
    this.clothParts = { shirt: [], pants: [], shoes: [], glove: [] };
    this.agentKey = 'burger';
    this.hatGroup = null;   // 角色专属头饰/装饰
    this._held = null;
    this._buildBody();
    this._buildHats();
    this.setSkin('burger');
  }

  _box(w, h, d, color) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  }

  _buildBody() {
    const g = this.group;
    const A = AGENTS.burger;

    // 头（0.5 见方），脸部共用，眼睛颜色随角色在 setSkin 里处理
    const head = new THREE.Group();
    const headMesh = this._box(0.5, 0.5, 0.5, A.skin);
    head.add(headMesh);
    this.bodyMeshes.headMesh = headMesh;
    // 眼睛（正面 +z）—— 眼白 + 瞳孔，瞳孔/眼罩颜色各角色不同，默认给紫眼
    const eyeW = this._box(0.14, 0.12, 0.02, 0xffffff); eyeW.position.set(-0.11, 0.04, 0.251); head.add(eyeW);
    const eyeWr = this._box(0.14, 0.12, 0.02, 0xffffff); eyeWr.position.set(0.11, 0.04, 0.251); head.add(eyeWr);
    const pupL = this._box(0.07, 0.08, 0.02, 0x5b2a86); pupL.position.set(-0.11, 0.04, 0.26); head.add(pupL);
    const pupR = this._box(0.07, 0.08, 0.02, 0x5b2a86); pupR.position.set(0.11, 0.04, 0.26); head.add(pupR);
    this.bodyMeshes.pupL = pupL;
    this.bodyMeshes.pupR = pupR;
    // 腮红（小可爱）
    const blushL = this._box(0.1, 0.05, 0.02, 0xf29ab0); blushL.position.set(-0.2, -0.08, 0.25); head.add(blushL);
    const blushR = this._box(0.1, 0.05, 0.02, 0xf29ab0); blushR.position.set(0.2, -0.08, 0.25); head.add(blushR);
    head.position.y = 1.5;
    g.add(head);
    this.bodyMeshes.head = head;

    // 头盔（盔甲，默认隐藏）
    const helmet = new THREE.Group();
    const helmMain = this._box(0.58, 0.5, 0.58, ARMOR.iron); helmMain.material.transparent = true; helmMain.material.opacity = 0.9;
    helmet.add(helmMain);
    const helmFront = this._box(0.6, 0.16, 0.1, ARMOR.ironDark); helmFront.position.set(0, -0.16, 0.28); helmet.add(helmFront);
    helmet.position.y = 1.5;
    helmet.visible = false;
    g.add(helmet);
    this.armorMeshes.helmet = helmet;

    // 身体
    const body = new THREE.Group();
    const torso = this._box(0.5, 0.75, 0.28, A.shirt);
    body.add(torso);
    this.clothParts.shirt.push(torso);
    const torsoShade = this._box(0.5, 0.2, 0.29, A.shirtDark); torsoShade.position.y = -0.27; body.add(torsoShade);
    this.clothParts.shirt.push(torsoShade);
    body.position.y = 0.9;
    g.add(body);
    this.bodyMeshes.body = body;

    // 胸甲
    const chest = this._box(0.56, 0.66, 0.34, ARMOR.iron); chest.material.transparent = true; chest.material.opacity = 0.92;
    chest.position.y = 0.92;
    chest.visible = false;
    g.add(chest);
    this.armorMeshes.chest = chest;

    // 手臂（肩部铰链）
    const armL = new THREE.Group();
    const armLmesh = this._box(0.22, 0.7, 0.24, A.shirt); armLmesh.position.y = -0.35; armL.add(armLmesh);
    this.clothParts.shirt.push(armLmesh);
    const handL = this._box(0.22, 0.16, 0.24, A.glove); handL.position.y = -0.72; armL.add(handL);
    this.clothParts.glove.push(handL);
    armL.position.set(-0.38, 1.22, 0);
    g.add(armL);
    this.bodyMeshes.armL = armL;

    const armR = new THREE.Group();
    const armRmesh = this._box(0.22, 0.7, 0.24, A.shirt); armRmesh.position.y = -0.35; armR.add(armRmesh);
    this.clothParts.shirt.push(armRmesh);
    const handR = this._box(0.22, 0.16, 0.24, A.glove); handR.position.y = -0.72; armR.add(handR);
    this.clothParts.glove.push(handR);
    armR.position.set(0.38, 1.22, 0);
    g.add(armR);
    this.bodyMeshes.armR = armR;
    this.bodyMeshes.handR = armR; // 手持挂在右手

    // 腿（髋部铰链）
    const legL = new THREE.Group();
    const legLmesh = this._box(0.22, 0.72, 0.24, A.pants); legLmesh.position.y = -0.36; legL.add(legLmesh);
    this.clothParts.pants.push(legLmesh);
    const shoeL = this._box(0.22, 0.12, 0.28, A.shoes); shoeL.position.set(0, -0.72, 0.02); legL.add(shoeL);
    this.clothParts.shoes.push(shoeL);
    legL.position.set(-0.13, 0.55, 0);
    g.add(legL);
    this.bodyMeshes.legL = legL;

    const legR = new THREE.Group();
    const legRmesh = this._box(0.22, 0.72, 0.24, A.pants); legRmesh.position.y = -0.36; legR.add(legRmesh);
    this.clothParts.pants.push(legRmesh);
    const shoeR = this._box(0.22, 0.12, 0.28, A.shoes); shoeR.position.set(0, -0.72, 0.02); legR.add(shoeR);
    this.clothParts.shoes.push(shoeR);
    legR.position.set(0.13, 0.55, 0);
    g.add(legR);
    this.bodyMeshes.legR = legR;

    // 护腿甲
    const legsArmor = this._box(0.5, 0.5, 0.3, ARMOR.iron); legsArmor.material.transparent = true; legsArmor.material.opacity = 0.85;
    legsArmor.position.y = 0.5;
    legsArmor.visible = false;
    g.add(legsArmor);
    this.armorMeshes.legs = legsArmor;
  }

  /** 构建四个角色的专属头饰/装饰（放在 head 局部坐标），用 data-agent 标记便于切换显隐 */
  _buildHats() {
    this.hats = {};

    // —— 汉堡特工：红绿黄三层贝雷帽 + 绿色面罩 ——
    const burger = new THREE.Group();
    const capY = this._box(0.58, 0.08, 0.58, 0xf2c028); capY.position.y = 0.26; burger.add(capY);       // 黄层
    const capR = this._box(0.54, 0.09, 0.54, 0xd8422f); capR.position.y = 0.32; burger.add(capR);        // 红层
    const capG = this._box(0.5, 0.1, 0.5, 0x2f9e5f); capG.position.y = 0.39; burger.add(capG);           // 绿层
    // 绿色面罩（遮住下半张脸，正面）
    const mask = this._box(0.5, 0.22, 0.06, 0x2f9e5f); mask.position.set(0, -0.08, 0.27); burger.add(mask);
    // 紫色瞳孔（眼睛在面罩上方，这里加深色眼罩条）
    const band = this._box(0.52, 0.12, 0.05, 0x2f9e5f); band.position.set(0, 0.12, 0.27); burger.add(band);
    this.hats.burger = burger;

    // —— 薯条厨娘：红发 + 金色薯条 + 白色厨师帽 ——
    const fries = new THREE.Group();
    // 红色头发（顶 + 后）
    const hairTop = this._box(0.52, 0.14, 0.52, 0xd94b2f); hairTop.position.y = 0.22; fries.add(hairTop);
    const hairBack = this._box(0.52, 0.34, 0.12, 0xd94b2f); hairBack.position.set(0, 0.02, -0.22); fries.add(hairBack);
    const hairL = this._box(0.12, 0.3, 0.2, 0xd94b2f); hairL.position.set(-0.22, -0.02, 0.05); fries.add(hairL);
    const hairR = this._box(0.12, 0.3, 0.2, 0xd94b2f); hairR.position.set(0.22, -0.02, 0.05); fries.add(hairR);
    // 金色薯条（头顶竖条）
    const fryPos = [[-0.2, 0.5], [-0.07, 0.56], [0.07, 0.52], [0.2, 0.46]];
    fryPos.forEach(([x, y], i) => {
      const fry = this._box(0.09, 0.34, 0.09, 0xf2c028);
      fry.position.set(x, y, -0.02 + (i % 2) * 0.12);
      fries.add(fry);
    });
    // 白色厨师帽（右侧小蘑菇）
    const hatBase = this._box(0.2, 0.12, 0.2, 0xf6f4ef); hatBase.position.set(0.3, 0.42, 0.02); fries.add(hatBase);
    const hatTop = this._box(0.26, 0.18, 0.26, 0xf6f4ef); hatTop.position.set(0.3, 0.54, 0.02); fries.add(hatTop);
    // 白色面罩/口罩（遮住下半脸）
    const wmask = this._box(0.46, 0.18, 0.06, 0xf6f4ef); wmask.position.set(0, -0.1, 0.27); fries.add(wmask);
    this.hats.fries = fries;

    // —— 鸡米花小弟：橙色花椰菜头（包住整个头） ——
    const popcorn = new THREE.Group();
    const puff = [
      [0, 0.34, 0, 0.3], [-0.2, 0.28, 0.1, 0.24], [0.2, 0.28, 0.08, 0.24],
      [-0.24, 0.1, 0.05, 0.22], [0.24, 0.12, 0.02, 0.22], [0.02, 0.3, -0.22, 0.26],
      [-0.1, 0.36, -0.1, 0.22], [0.16, 0.34, -0.16, 0.22],
    ];
    puff.forEach(([x, y, z, s]) => {
      const p = this._box(s, s, s, 0xf0a83c);
      p.position.set(x, y, z);
      popcorn.add(p);
    });
    // 眼睛是白色大圆（参考图：白眼睛），在花椰菜前方留脸区域——加白目
    this.hats.popcorn = popcorn;

    // —— 魔法小女巫：紫色弯尖巫师帽 + 黄色星星扣 + 棕色长发 ——
    const witch = new THREE.Group();
    // 棕色长发（披肩 + 两侧）
    const wHairBack = this._box(0.56, 0.52, 0.16, 0x6b4220); wHairBack.position.set(0, -0.18, -0.22); witch.add(wHairBack);
    const wHairL = this._box(0.16, 0.5, 0.2, 0x6b4220); wHairL.position.set(-0.26, -0.2, 0.03); witch.add(wHairL);
    const wHairR = this._box(0.16, 0.5, 0.2, 0x6b4220); wHairR.position.set(0.26, -0.2, 0.03); witch.add(wHairR);
    // 刘海
    const wBangs = this._box(0.5, 0.12, 0.12, 0x6b4220); wBangs.position.set(0, 0.2, 0.22); witch.add(wBangs);
    // 帽檐（紫色宽边）
    const wBrim = this._box(0.78, 0.07, 0.78, 0x9a5bb0); wBrim.position.y = 0.28; witch.add(wBrim);
    // 帽尖：从下往上逐渐变细，并向后微微弯曲
    const wCone = [
      [0.48, 0.37, 0.48, 0], [0.42, 0.48, 0.42, 0], [0.35, 0.58, 0.35, -0.02],
      [0.28, 0.68, 0.28, -0.05], [0.21, 0.77, 0.21, -0.09], [0.14, 0.86, 0.14, -0.14],
    ];
    wCone.forEach(([w, y, d, x]) => {
      const seg = this._box(w, 0.13, d, 0xa86cc0);
      seg.position.set(x, y, 0);
      witch.add(seg);
    });
    // 帽尖金色小球
    const wTip = this._box(0.14, 0.14, 0.14, 0xffd34d); wTip.position.set(-0.18, 0.94, 0); witch.add(wTip);
    // 粉色帽带 + 黄色星星扣
    const wBand = this._box(0.54, 0.11, 0.54, 0xe58fb0); wBand.position.y = 0.34; witch.add(wBand);
    const wStar = this._box(0.13, 0.13, 0.07, 0xffd34d); wStar.position.set(0, 0.34, 0.28); witch.add(wStar);
    this.hats.witch = witch;

    // 全部挂到 head 下，默认只显示当前角色
    Object.keys(this.hats).forEach((k) => {
      this.bodyMeshes.head.add(this.hats[k]);
      this.hats[k].visible = false;
    });
  }

  /** 选择主角：'burger' | 'fries' | 'popcorn' | 'witch' */
  setSkin(key) {
    const A = AGENTS[key];
    if (!A) return;
    this.agentKey = key;
    const recolor = (meshes, hex) => {
      meshes.forEach((m) => { if (m && m.material) m.material.color.setHex(hex); });
    };
    // 身体染色
    this.bodyMeshes.headMesh.material.color.setHex(A.skin);
    recolor(this.clothParts.shirt, A.shirt);
    if (this.clothParts.shirt[1]) this.clothParts.shirt[1].material.color.setHex(A.shirtDark);
    recolor(this.clothParts.pants, A.pants);
    recolor(this.clothParts.shoes, A.shoes);
    recolor(this.clothParts.glove, A.glove);
    // 头饰切换
    Object.keys(this.hats).forEach((k) => { this.hats[k].visible = (k === key); });
    // 鸡米花：白眼睛（无瞳孔），其余显示瞳孔
    if (key === 'popcorn') {
      this.bodyMeshes.pupL.visible = false;
      this.bodyMeshes.pupR.visible = false;
    } else {
      this.bodyMeshes.pupL.visible = true;
      this.bodyMeshes.pupR.visible = true;
      // 薯条厨娘红瞳、女巫深棕瞳、汉堡紫瞳
      const eyeColor = key === 'fries' ? 0xd83a3a : key === 'witch' ? 0x3a2620 : 0x5b2a86;
      this.bodyMeshes.pupL.material.color.setHex(eyeColor);
      this.bodyMeshes.pupR.material.color.setHex(eyeColor);
    }
  }

  /** 根据快捷栏内容决定盔甲：含胸甲→全身，头盔单独等 */
  setArmor(level) {
    if (level === this.armorLevel) return;
    this.armorLevel = level;
    const c = level === 'diamond' ? [ARMOR.diamond, ARMOR.diamondDark]
      : level === 'iron' ? [ARMOR.iron, ARMOR.ironDark] : null;
    const vis = !!c;
    for (const key of ['helmet', 'chest', 'legs']) {
      const m = this.armorMeshes[key];
      m.visible = vis;
      if (c) m.traverse((o) => {
        if (o.isMesh && o.material) o.material.color.setHex(c[0]);
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
    if (this._held) {
      this.bodyMeshes.handR.remove(this._held);
      this._held.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      this._held = null;
    }
    if (buildViewmodelFn) {
      const held = buildViewmodelFn(0.55);
      held.position.set(0, -0.78, 0.15);
      held.rotation.x = -Math.PI / 2.4;
      this.bodyMeshes.handR.add(held);
      this._held = held;
    }
  }

  setVisible(v) {
    this.group.visible = v;
  }

  /**
   * 每帧更新：跟随玩家位置/朝向 + 走路摆臂摆腿。
   * 注意：签名是 update(player, dt)，player 提供位置/速度/着地状态。
   * 模型本地原点在脚踝附近（脚底约 -0.23），所以整体抬升 0.25 对齐玩家脚部。
   */
  update(player, dt) {
    if (!player || !player.position) return;
    // 位置：完整角色跟随玩家身体（第三视角时人物出现在玩家身上，而不是停在世界原点）
    const moving = player.velocity
      ? (Math.abs(player.velocity.x) + Math.abs(player.velocity.z)) > 0.6
      : false;
    const inAir = player.onGround === false;
    this.group.position.set(
      player.position.x,
      player.position.y + 0.25,
      player.position.z
    );
    // 朝向：模型正面朝 +Z，前向为 (-sin yaw, -cos yaw)，故 rotation.y = yaw + π
    // 第三人称环绕时用 bodyYaw（移动方向，静止保持），第一人称用 yaw。
    const facingYaw = (player._orbitMode && typeof player.bodyYaw === 'number') ? player.bodyYaw : player.yaw;
    if (typeof facingYaw === 'number') this.group.rotation.y = facingYaw + Math.PI;
    // 走路摆臂/摆腿
    if (moving && !inAir) this.walkPhase += (dt || 0.016) * 9;
    const swing = moving && !inAir ? Math.sin(this.walkPhase) * 0.7 : 0;
    this.bodyMeshes.armL.rotation.x = swing;
    this.bodyMeshes.armR.rotation.x = -swing;
    this.bodyMeshes.legL.rotation.x = -swing;
    this.bodyMeshes.legR.rotation.x = swing;
    // 走路时身体轻微上下（叠加在跟随高度上，不再覆盖整体 y）
    const bob = moving && !inAir ? Math.abs(Math.sin(this.walkPhase)) * 0.04 : 0;
    this.group.position.y += bob;
  }
}
