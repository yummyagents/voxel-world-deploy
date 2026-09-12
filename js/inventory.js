import * as THREE from 'three';
import { BlockType, BlockNames, BLOCK_TEXTURES, createBlockTexture, ATLAS_COLS, TEX_SIZE } from './voxel.js?v=20260925al';
import { ItemNames, getItemIcon } from './equipment.js?v=20260925al';

/**
 * 创造模式背包：
 * - 列出所有可放置方块
 * - 玩家可点击任意方块"选中"，然后点击底部热键栏空槽位把它放进去
 * - 底部热键栏与游戏内 hotbar 联动；按 1-9 切换（代码中用 0-8 索引）
 * - E 键开关
 */
export class Inventory {
  constructor(world) {
    this.world = world;
    this.isOpen = false;
    this.selectedSourceType = null; // 从背包网格中点击选中的方块
    this.onHotbarChange = null; // 回调：(hotbar: number[]) => void
    // 9 格热键栏，0=空气；第 9 格（索引 8）空槽 = 磁铁收集模式
    // 只放最基础常用方块；木门/围栏/梯子等在兑换商店与创造背包（E）里取用
    this._defaultHotbar = [
      BlockType.GRASS, BlockType.DIRT, BlockType.STONE,
      BlockType.WOOD, BlockType.PLANKS, BlockType.GLASS,
      BlockType.BRICK, BlockType.SAND, BlockType.AIR,
    ];
    this.hotbar = this._defaultHotbar.slice();

    this._atlasTexture = createBlockTexture();
    this._buildDom();
    this._buildFullList();
    this._renderHotbar();
  }

  _buildDom() {
    const overlay = document.createElement('div');
    overlay.id = 'inventory-overlay';
    overlay.className = 'inventory-overlay';
    overlay.innerHTML = `
      <div class="inventory-window">
        <div class="inventory-title">创造背包 · 点击方块，再点底部槽位放入</div>
        <div class="inventory-grid" id="inv-grid"></div>
        <div class="inventory-divider"></div>
        <div class="inventory-hotbar-label">快捷栏（按 1 ~ 9 切换）</div>
        <div class="inventory-hotbar" id="inv-hotbar"></div>
        <div class="inventory-tips">E 关闭背包 · 点击空槽位可清除 · 创造模式无限放置</div>
        <div class="inventory-actions">
          <button id="inv-reset" class="inv-reset-btn" type="button">↺ 恢复默认方块（清空兑换物品）</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.gridEl = overlay.querySelector('#inv-grid');
    this.hotbarEl = overlay.querySelector('#inv-hotbar');
    // 一键恢复默认方块栏（清掉兑换物品/武器）
    const resetBtn = overlay.querySelector('#inv-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetHotbar());
    }
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.close();
    });
  }

  /** 所有可出现在背包中的方块（排除 AIR、水） */
  _buildFullList() {
    const placeable = [];
    for (const key in BlockType) {
      if (!Object.prototype.hasOwnProperty.call(BlockType, key)) continue;
      const t = BlockType[key];
      if (t === BlockType.AIR || t === BlockType.WATER) continue;
      if (typeof BLOCK_TEXTURES[t] === 'undefined') continue;
      placeable.push(t);
    }
    // 固定排序：基础地形 -> 木/叶 -> 矿石 -> 建材 -> 装饰 -> 异世界
    placeable.sort((a, b) => a - b);
    this._placeable = placeable;

    for (const type of placeable) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      cell.dataset.type = String(type);
      cell.title = BlockNames[type] || '';
      cell.appendChild(this._makeIcon(type));
      const label = document.createElement('span');
      label.className = 'inv-cell-label';
      label.textContent = BlockNames[type] || '';
      cell.appendChild(label);
      cell.addEventListener('click', () => {
        this.selectedSourceType = type;
        this.gridEl.querySelectorAll('.inv-cell.selected').forEach(el => el.classList.remove('selected'));
        cell.classList.add('selected');
      });
      this.gridEl.appendChild(cell);
    }
  }

  /** 使用纹理图集中的单个方块面作为图标 */
  _makeIcon(type) {
    // 装备/手持物品：使用 equipment 生成的像素图标
    if (type < 0) {
      const icon = document.createElement('div');
      icon.className = 'inv-icon';
      icon.style.backgroundImage = `url(${getItemIcon(type)})`;
      icon.style.backgroundSize = 'contain';
      return icon;
    }
    const texDef = BLOCK_TEXTURES[type];
    let texIndex;
    if (texDef === 'cross') {
      // 十字植物，使用任意面纹理索引（用 TEX 常量对应值）
      texIndex = type === BlockType.TALL_GRASS ? 36
        : type === BlockType.FLOWER_RED ? 37
        : type === BlockType.FLOWER_YELLOW ? 38
        : type === BlockType.FLOWER_WHITE ? 39
        : type === BlockType.MUSHROOM_RED ? 40
        : type === BlockType.MUSHROOM_BROWN ? 41
        : type === BlockType.TORCH ? 107
        : type === BlockType.SWEET_BERRY ? 126 : 42;
    } else if (typeof texDef === 'object') {
      texIndex = texDef.side !== undefined ? texDef.side : texDef.top;
    } else {
      texIndex = 0;
    }
    const img = document.createElement('canvas');
    img.width = 32; img.height = 32;
    const ctx = img.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // 从图集中拷贝 16×16 区域到 32×32
    const srcImg = this._atlasTexture.image;
    const col = texIndex % ATLAS_COLS;
    const row = Math.floor(texIndex / ATLAS_COLS);
    ctx.drawImage(srcImg, col * TEX_SIZE, row * TEX_SIZE, TEX_SIZE, TEX_SIZE, 0, 0, 32, 32);
    const icon = document.createElement('div');
    icon.className = 'inv-icon';
    icon.style.backgroundImage = `url(${img.toDataURL()})`;
    return icon;
  }

  _renderHotbar() {
    this.hotbarEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.dataset.index = String(i);
      const t = this.hotbar[i];
      if (t && t !== BlockType.AIR) {
        slot.appendChild(this._makeIcon(t));
        const nm = document.createElement('span');
        nm.className = 'inv-slot-key';
        nm.textContent = String(i + 1);
        slot.appendChild(nm);
      } else {
        const empty = document.createElement('span');
        empty.className = 'inv-slot-empty';
        empty.textContent = String(i + 1);
        slot.appendChild(empty);
      }
      slot.addEventListener('click', () => {
        if (this.selectedSourceType !== null) {
          this.hotbar[i] = this.selectedSourceType;
        } else {
          this.hotbar[i] = BlockType.AIR;
        }
        this._renderHotbar();
        this._emit();
      });
      // 右键清除
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.hotbar[i] = BlockType.AIR;
        this._renderHotbar();
        this._emit();
      });
      this.hotbarEl.appendChild(slot);
    }
  }

  _emit() {
    if (this.onHotbarChange) this.onHotbarChange(this.hotbar.slice());
  }

  // 注意：E 键开关统一由 game.js 处理，这里不再单独监听，
  // 否则会与 game.js 的 E 处理同时触发，导致"刚打开又被关掉"。

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.isOpen = true;
    this.overlay.classList.add('open');
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('open');
    this.selectedSourceType = null;
    this.gridEl.querySelectorAll('.inv-cell.selected').forEach(el => el.classList.remove('selected'));
    if (typeof this.onClose === 'function') {
      const cb = this.onClose; this.onClose = null;
      try { cb(); } catch (e) { console.warn(e); }
    }
  }

  /** 玩家选中的当前方块（用于游戏内放置） */
  getSelectedBlock(slotIndex) {
    const t = this.hotbar[slotIndex];
    return t && t !== BlockType.AIR ? t : BlockType.STONE;
  }

  /** 取某个快捷栏槽位的类型（空槽返回 AIR） */
  getSlot(slotIndex) {
    if (slotIndex == null || slotIndex < 0 || slotIndex >= this.hotbar.length) return BlockType.AIR;
    const t = this.hotbar[slotIndex];
    return typeof t === 'number' ? t : BlockType.AIR;
  }

  /** 外部（兑换商店）设置某个槽位 */
  setHotbarSlot(slotIndex, type) {
    if (slotIndex < 0 || slotIndex >= this.hotbar.length) return;
    this.hotbar[slotIndex] = type;
    this._renderHotbar();
    this._emit();
  }

  /** 一键恢复默认方块栏（清掉所有兑换物品/武器，第 9 格回到磁铁） */
  resetHotbar() {
    this.hotbar = this._defaultHotbar.slice();
    this._renderHotbar();
    this._emit();
  }

  /** 外部选中某个槽位 */
  selectSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this.hotbar.length) return;
    this.hotbarEl.querySelectorAll('.inv-slot').forEach((el, i) => {
      el.classList.toggle('active', i === slotIndex);
    });
    if (this.onSlotSelect) this.onSlotSelect(slotIndex);
  }
}
