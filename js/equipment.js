// js/equipment.js
// 装备/手持物品（剑、盾牌、盔甲等，非方块）的图标与第一人称手持模型
// 手持物品用负数 ID 表示，避免和方块（正数）冲突
import * as THREE from 'three';

// 手持物品 ID（负数）
export const ItemType = {
  SWORD_IRON: -1,
  SWORD_DIAMOND: -2,
  SWORD_GOLD: -3,
  SHIELD: -4,
  HELMET_IRON: -5,
  CHEST_IRON: -6,
  LEGS_IRON: -7,
  BOOTS_IRON: -8,
  HELMET_DIAMOND: -9,
  CHEST_DIAMOND: -10,
  LEGS_DIAMOND: -11,
  BOOTS_DIAMOND: -12,
};

export const ItemNames = {
  [ItemType.SWORD_IRON]: '铁剑',
  [ItemType.SWORD_DIAMOND]: '钻石剑',
  [ItemType.SWORD_GOLD]: '金剑',
  [ItemType.SHIELD]: '盾牌',
  [ItemType.HELMET_IRON]: '铁头盔',
  [ItemType.CHEST_IRON]: '铁胸甲',
  [ItemType.LEGS_IRON]: '铁护腿',
  [ItemType.BOOTS_IRON]: '铁靴子',
  [ItemType.HELMET_DIAMOND]: '钻石头盔',
  [ItemType.CHEST_DIAMOND]: '钻石胸甲',
  [ItemType.LEGS_DIAMOND]: '钻石护腿',
  [ItemType.BOOTS_DIAMOND]: '钻石靴子',
};

const METAL = {
  iron: [0xd8d8d8, 0x9a9aa0],
  diamond: [0x6fe6e0, 0x34a8a8],
  gold: [0xffe066, 0xd8a020],
};

// 画一个像素图标到独立 canvas，返回 dataURL
function pxIcon(drawer) {
  const S = 16, scale = 3;
  const c = document.createElement('canvas');
  c.width = c.height = S * scale;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, S, S);
  drawer(ctx);
  return c.toDataURL();
}

const _iconCache = {};
// 手持物品图标 dataURL
export function getItemIcon(itemId) {
  if (_iconCache[itemId]) return _iconCache[itemId];
  const s = itemId;
  let url = '';
  if (s === ItemType.SWORD_IRON) url = swordIcon('iron');
  else if (s === ItemType.SWORD_DIAMOND) url = swordIcon('diamond');
  else if (s === ItemType.SWORD_GOLD) url = swordIcon('gold');
  else if (s === ItemType.SHIELD) url = shieldIcon();
  else if (s === ItemType.HELMET_IRON) url = armorIcon('iron', 'helmet');
  else if (s === ItemType.CHEST_IRON) url = armorIcon('iron', 'chest');
  else if (s === ItemType.LEGS_IRON) url = armorIcon('iron', 'legs');
  else if (s === ItemType.BOOTS_IRON) url = armorIcon('iron', 'boots');
  else if (s === ItemType.HELMET_DIAMOND) url = armorIcon('diamond', 'helmet');
  else if (s === ItemType.CHEST_DIAMOND) url = armorIcon('diamond', 'chest');
  else if (s === ItemType.LEGS_DIAMOND) url = armorIcon('diamond', 'legs');
  else if (s === ItemType.BOOTS_DIAMOND) url = armorIcon('diamond', 'boots');
  _iconCache[itemId] = url;
  return url;
}

function metal(kind) {
  const m = kind === 'diamond' ? METAL.diamond : kind === 'gold' ? METAL.gold : METAL.iron;
  return { hi: '#' + m[0].toString(16).padStart(6, '0'), lo: '#' + m[1].toString(16).padStart(6, '0') };
}

function swordIcon(kind) {
  const c = metal(kind);
  return pxIcon(ctx => {
    // 斜向剑（像素锯齿）
    ctx.fillStyle = c.hi;
    const blade = [[12,2],[11,3],[10,4],[9,5],[8,6],[7,7],[6,8],[5,9]];
    blade.forEach(([x, y]) => ctx.fillRect(x, y, 2, 2));
    ctx.fillStyle = c.lo;
    ctx.fillRect(11,3,1,2); ctx.fillRect(9,5,1,2); ctx.fillRect(7,7,1,2);
    // 护手
    ctx.fillStyle = '#6b4a28';
    ctx.fillRect(4, 8, 3, 2); ctx.fillRect(5, 9, 2, 1);
    // 手柄
    ctx.fillStyle = '#3a2a14';
    ctx.fillRect(3, 9, 2, 3);
  });
}

function shieldIcon() {
  return pxIcon(ctx => {
    ctx.fillStyle = '#7a4a26'; // 木盾底
    ctx.fillRect(4, 2, 8, 11);
    ctx.fillRect(5, 13, 6, 1); ctx.fillRect(6, 14, 4, 1);
    ctx.fillStyle = '#a86a38';
    ctx.fillRect(5, 3, 6, 9);
    ctx.fillStyle = '#c8c8d0'; // 铁边/纹
    ctx.fillRect(7, 4, 2, 8); ctx.fillRect(5, 6, 6, 2);
  });
}

function armorIcon(kind, part) {
  const c = metal(kind);
  return pxIcon(ctx => {
    ctx.fillStyle = c.hi;
    ctx.fillStyle = c.lo;
    if (part === 'helmet') {
      ctx.fillStyle = c.hi;
      ctx.fillRect(4, 4, 8, 7);
      ctx.fillStyle = c.lo;
      ctx.fillRect(4, 4, 8, 2);
      ctx.fillStyle = '#222';
      ctx.fillRect(5, 8, 6, 2); // 面部开口
    } else if (part === 'chest') {
      ctx.fillStyle = c.hi;
      ctx.fillRect(3, 3, 10, 9);
      ctx.fillStyle = c.lo;
      ctx.fillRect(3, 3, 2, 9); ctx.fillRect(11, 3, 2, 9);
      ctx.fillRect(7, 3, 2, 9);
    } else if (part === 'legs') {
      ctx.fillStyle = c.hi;
      ctx.fillRect(4, 2, 8, 7);
      ctx.fillRect(4, 9, 3, 5); ctx.fillRect(9, 9, 3, 5);
      ctx.fillStyle = c.lo;
      ctx.fillRect(7, 2, 2, 7);
    } else { // boots
      ctx.fillStyle = c.hi;
      ctx.fillRect(3, 6, 4, 6); ctx.fillRect(9, 6, 4, 6);
      ctx.fillRect(3, 11, 5, 2); ctx.fillRect(9, 11, 5, 2);
      ctx.fillStyle = c.lo;
      ctx.fillRect(3, 6, 1, 6); ctx.fillRect(9, 6, 1, 6);
    }
  });
}

// ===== 第一人称手持模型 =====
function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y, z);
  return m;
}

// 创建一个手持物品的 THREE.Group（右下角视角）
export function createHeldModel(itemId) {
  const g = new THREE.Group();
  const mat = (color) => new THREE.MeshLambertMaterial({ color });

  if (itemId < 0 && itemId >= -3) {
    // 剑
    const kind = itemId === ItemType.SWORD_DIAMOND ? 'diamond' : itemId === ItemType.SWORD_GOLD ? 'gold' : 'iron';
    const c = metal(kind);
    const blade = box(0.08, 0.62, 0.08, c.hi, 0, 0.34, 0);
    g.add(blade);
    g.add(box(0.08, 0.62, 0.02, c.lo, -0.02, 0.34, 0));
    g.add(box(0.26, 0.07, 0.1, 0x8a6028, 0, 0.02, 0)); // 护手
    g.add(box(0.07, 0.18, 0.07, 0x3a2a14, 0, -0.1, 0));  // 柄
  } else if (itemId === ItemType.SHIELD) {
    const shield = box(0.5, 0.66, 0.07, 0x9a5f30, 0, 0.1, 0);
    g.add(shield);
    g.add(box(0.12, 0.5, 0.08, 0xc8c8d0, 0, 0.1, 0.01));
    g.add(box(0.4, 0.12, 0.08, 0xc8c8d0, 0, 0.1, 0.01));
  } else {
    // 盔甲：手持时显示为一块相应材质的小模型（头盔更有辨识度）
    const kind = itemId === ItemType.HELMET_DIAMOND || itemId === ItemType.CHEST_DIAMOND ||
      itemId === ItemType.LEGS_DIAMOND || itemId === ItemType.BOOTS_DIAMOND ? 'diamond' : 'iron';
    const c = metal(kind);
    const isHelmet = itemId === ItemType.HELMET_IRON || itemId === ItemType.HELMET_DIAMOND;
    if (isHelmet) {
      g.add(box(0.4, 0.34, 0.4, c.hi, 0, 0.2, 0));
      g.add(box(0.3, 0.12, 0.42, c.lo, 0, 0.1, 0));
    } else {
      g.add(box(0.36, 0.4, 0.3, c.hi, 0, 0.18, 0));
      g.add(box(0.36, 0.1, 0.32, c.lo, 0, 0.34, 0));
    }
  }
  return g;
}

// 创建玩家手臂（Steve/埃里克森风格：青色衣袖 + 肤色手）
// 创建玩家手臂（Steve 风格第一人称：一条从右下角伸向镜头的手臂）
// 手臂沿 -Z（朝前方/镜头）伸展，近大端在屏幕右下、手腕在前方握物品
// armor: null=青色衣袖, 'iron'/'diamond'=套上护臂
export function createArmModel(armor = null) {
  const g = new THREE.Group();
  const sleeveColor = armor === 'diamond' ? 0x3fd9d9 : armor === 'iron' ? 0xe8e8ee : 0x2ea8c8;
  const sleeveLo = armor === 'diamond' ? 0x2bb0b0 : armor === 'iron' ? 0xb8b8c0 : 0x1f86a8;
  // 前臂（衣袖）：沿 Z 轴长条形，从后下方伸向前方
  const arm = box(0.28, 0.28, 0.7, sleeveColor, 0, 0, -0.1);
  g.add(arm);
  // 衣袖阴影面，增加像素层次
  g.add(box(0.28, 0.06, 0.7, sleeveLo, 0, -0.11, -0.1));
  // 拳头（肤色），在最前端
  const fist = box(0.3, 0.3, 0.3, 0xe0a070, 0, 0, -0.55);
  g.add(fist);
  g.add(box(0.3, 0.06, 0.3, 0xc08050, 0, -0.12, -0.55)); // 拳头暗面
  return g;
}
