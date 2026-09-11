import { BlockType, BlockNames, BLOCK_TEXTURES, createBlockTexture, ATLAS_COLS, TEX_SIZE } from './voxel.js?v=20260925l';
import { ItemType, ItemNames, getItemIcon } from './equipment.js?v=20260925l';

/**
 * 装备兑换 / 商店：
 * - 展示床、家具、生活用品、武器、防具等
 * - 点击「兑换」将该物品放进快捷栏第一个空槽位（无空位则替换当前选中槽位）
 * - G 键开关；也可由 UI 按钮触发
 * - 方块为正 ID，装备/手持物品为负 ID（见 equipment.js）
 * - 创造模式下不消耗资源，兑换即拥有、无限使用。
 */

// 可兑换的物品清单（type, 分类）
const SHOP_ITEMS = [
  // 武器
  { type: ItemType.SWORD_IRON, cat: '武器装备' },
  { type: ItemType.SWORD_DIAMOND, cat: '武器装备' },
  { type: ItemType.SWORD_GOLD, cat: '武器装备' },
  { type: ItemType.SHIELD, cat: '武器装备' },
  // 盔甲
  { type: ItemType.HELMET_IRON, cat: '武器装备' },
  { type: ItemType.CHEST_IRON, cat: '武器装备' },
  { type: ItemType.LEGS_IRON, cat: '武器装备' },
  { type: ItemType.BOOTS_IRON, cat: '武器装备' },
  { type: ItemType.HELMET_DIAMOND, cat: '武器装备' },
  { type: ItemType.CHEST_DIAMOND, cat: '武器装备' },
  { type: ItemType.LEGS_DIAMOND, cat: '武器装备' },
  { type: ItemType.BOOTS_DIAMOND, cat: '武器装备' },
  // 卧室
  { type: BlockType.BED_RED, cat: '卧室' },
  { type: BlockType.BED_BLUE, cat: '卧室' },
  { type: BlockType.BED_GREEN, cat: '卧室' },
  { type: BlockType.BED_YELLOW, cat: '卧室' },
  // 照明
  { type: BlockType.TORCH, cat: '照明' },
  { type: BlockType.LANTERN, cat: '照明' },
  { type: BlockType.GLOWSTONE, cat: '照明' },
  { type: BlockType.SEA_LANTERN, cat: '照明' },
  // 家具
  { type: BlockType.CHEST, cat: '家具' },
  { type: BlockType.BOOKSHELF, cat: '家具' },
  { type: BlockType.CRAFTING_TABLE, cat: '家具' },
  { type: BlockType.FURNACE, cat: '家具' },
  { type: BlockType.TABLE_WOOD, cat: '家具' },
  { type: BlockType.CHAIR_WOOD, cat: '家具' },
  { type: BlockType.SOFA_RED, cat: '家具' },
  // 装饰
  { type: BlockType.FLOWER_POT, cat: '装饰' },
  { type: BlockType.PAINTING, cat: '装饰' },
  { type: BlockType.CLOCK_BLOCK, cat: '装饰' },
  // 建材
  { type: BlockType.DOOR, cat: '建材' },
  { type: BlockType.LADDER, cat: '建材' },
  { type: BlockType.FENCE, cat: '建材' },
  { type: BlockType.BRICK, cat: '建材' },
  { type: BlockType.PLANKS, cat: '建材' },
  { type: BlockType.GLASS, cat: '建材' },
];

function itemName(type) {
  return type < 0 ? (ItemNames[type] || '装备') : (BlockNames[type] || '方块');
}


export class ExchangeShop {
  constructor() {
    this.isOpen = false;
    this.inventory = null;   // 由 game.js 注入
    this.onRedeem = null;    // 回调：(type) => void，用于 toast
    this._atlas = createBlockTexture();
    this._buildDom();
    this._buildList();
    // G 键开关统一由 game.js 键盘处理器调用 toggle()，此处不再单独监听，避免重复触发
  }

  _buildDom() {
    const overlay = document.createElement('div');
    overlay.id = 'shop-overlay';
    overlay.className = 'inventory-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="inventory-window shop-window">
        <div class="inventory-title">装备兑换 · 点击「兑换」放入快捷栏</div>
        <div class="shop-grid" id="shop-grid"></div>
        <div class="inventory-tips">G 关闭 · 创造模式兑换免费 · 按 1~9 选用兑换到的物品</div>
      </div>
    `;
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.gridEl = overlay.querySelector('#shop-grid');
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.close();
    });
  }

  _iconDataURL(type) {
    // 装备/手持物品：用 equipment 生成的像素图标
    if (type < 0) return getItemIcon(type);
    const map = BLOCK_TEXTURES[type];
    const texIdx = map === 'cross'
      ? (type === BlockType.TORCH ? 107 : 37)
      : (map ? (map.side ?? map.top ?? 0) : 0);
    const cols = ATLAS_COLS;
    const ts = TEX_SIZE;
    const srcCol = texIdx % cols;
    const srcRow = Math.floor(texIdx / cols);
    const c = document.createElement('canvas');
    c.width = ts; c.height = ts;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // 用离屏 canvas 拿到图集图像
    const atlasCanvas = this._atlas.image;
    if (atlasCanvas) {
      ctx.drawImage(atlasCanvas, srcCol * ts, srcRow * ts, ts, ts, 0, 0, ts, ts);
    }
    return c.toDataURL();
  }

  _buildList() {
    this.gridEl.innerHTML = '';
    let lastCat = '';
    for (const item of SHOP_ITEMS) {
      if (item.cat !== lastCat) {
        const head = document.createElement('div');
        head.className = 'shop-cat';
        head.textContent = item.cat;
        this.gridEl.appendChild(head);
        lastCat = item.cat;
      }
      const cell = document.createElement('div');
      cell.className = 'shop-cell';
      cell.innerHTML = `
        <div class="shop-icon"><img src="${this._iconDataURL(item.type)}" alt=""></div>
        <div class="shop-name">${itemName(item.type)}</div>
        <button class="shop-buy">兑换</button>
      `;
      cell.querySelector('.shop-buy').addEventListener('click', () => this._redeem(item.type));
      this.gridEl.appendChild(cell);
    }
  }

  /** 兑换：放进快捷栏（前 8 格，绝不占用第 9 格磁铁收集槽） */
  _redeem(type) {
    if (!this.inventory) return;
    const hb = this.inventory.hotbar;
    const PLACEABLE = 8; // 槽位 0~7 是方块/物品槽，槽位 8 是磁铁收集专用
    // 已在快捷栏前 8 格则选中它
    let idx = hb.slice(0, PLACEABLE).indexOf(type);
    if (idx === -1) {
      // 在前 8 格里找第一个空槽（空/AIR 视为空）
      idx = -1;
      for (let i = 0; i < PLACEABLE; i++) {
        const t = hb[i];
        if (!t || t === BlockType.AIR) { idx = i; break; }
      }
      // 前 8 格都满了：用当前选中槽（若是磁铁槽则回退到槽 0）
      if (idx === -1) {
        const cur = this.inventory.selectedSlot ?? 0;
        idx = cur < PLACEABLE ? cur : 0;
      }
      this.inventory.setHotbarSlot(idx, type);
    }
    this.inventory.selectSlot ? this.inventory.selectSlot(idx) : null;
    const nm = itemName(type);
    const key = idx + 1; // 显示给玩家的数字键（槽 0→键 1）
    if (this.onRedeem) {
      // 负数 = 武器/手持物；非负 = 可放置方块/家具
      const how = type < 0
        ? `已拿在手上（第 ${key} 格），对着前方点鼠标/点“拆”就能挥动`
        : `已放进第 ${key} 格，选中后【左键/点“放”】放在地上`;
      this.onRedeem(nm, { key, how, placeable: type >= 0 });
    }
  }

  open() {
    this.isOpen = true;
    this.overlay.style.display = 'flex';
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.style.display = 'none';
    if (typeof this.onClose === 'function') {
      const cb = this.onClose; this.onClose = null;
      try { cb(); } catch (e) { console.warn(e); }
    }
  }

  toggle() { this.isOpen ? this.close() : this.open(); }
}
