/**
 * world-map.js — 世界小地图（M 键打开）
 *
 * 以出生家园为中心，采样世界群系（world.getBiome）绘制成一张清晰的
 * 卡通区域图，叠加：出生家园（固定参照点）、樱花风车、当前玩家位置（带朝向）。
 *
 * - 使用专用高区分度群系配色（而非偏灰的雾色），相邻区域一眼可辨。
 * - 提高底图分辨率，并用离屏高清 canvas 缓存，放大显示也清晰。
 * - 带网格、指北针、十字坐标线；出生点始终标记为中心参照。
 */

import { Biome, BiomeNames } from './voxel.js?v=20260925al';

// 四档缩放（显示半径，单位：格）
const RANGE_LEVELS = [
  { label: '近', range: 64 },
  { label: '中', range: 128 },
  { label: '远', range: 256 },
  { label: '岛', range: 420 },
];

const RES = 300; // 底图采样分辨率（像素）

// 高区分度卡通群系配色（明亮柔和、相邻色拉开）
const BIOME_MAP_COLORS = {
  [Biome.OCEAN]:     { r: 74,  g: 144, b: 226 }, // 海蓝
  [Biome.PLAINS]:    { r: 126, g: 200, b: 92 },  // 草原绿
  [Biome.DESERT]:    { r: 236, g: 205, b: 120 }, // 沙漠黄
  [Biome.JUNGLE]:    { r: 46,  g: 140, b: 78 },  // 丛林深绿
  [Biome.SNOW]:      { r: 226, g: 240, b: 252 }, // 雪原白蓝
  [Biome.SAVANNA]:   { r: 201, g: 184, b: 96 },  // 热带草原黄绿
  [Biome.MOUNTAINS]: { r: 140, g: 126, b: 120 }, // 岩石灰棕
  [Biome.TAIGA]:     { r: 72,  g: 130, b: 110 }, // 针叶林青绿
  [Biome.SWAMP]:     { r: 96,  g: 120, b: 86 },  // 沼泽暗绿
  [Biome.CHERRY]:    { r: 246, g: 170, b: 205 }, // 樱花粉
  [Biome.MESA]:      { r: 214, g: 130, b: 84 },  // 恶地橙
};

function biomeRGB(b) {
  return BIOME_MAP_COLORS[b] || { r: 150, g: 160, b: 170 };
}
function biomeCSS(b) {
  const c = biomeRGB(b);
  return `rgb(${c.r},${c.g},${c.b})`;
}

export class WorldMap {
  /**
   * @param {object} world voxel World（需 getBiome）
   * @param {object} opts  { home:{x,z}, windmill:{x,z}, island:{x,z}, getPlayer:()=>({x,z,yaw}) }
   */
  constructor(world, opts = {}) {
    this.world = world;
    this.home = opts.home || { x: 0, z: 0 };
    this.windmill = opts.windmill || null;
    this.island = opts.island || null;
    this.getPlayer = opts.getPlayer || (() => null);
    this.levelIndex = 1;
    this.open = false;
    this._cacheKey = '';
    this._initDOM();
    this._bind();
  }

  _initDOM() {
    const overlay = document.createElement('div');
    overlay.id = 'worldMapOverlay';
    overlay.className = 'world-map-overlay';
    overlay.innerHTML = `
      <div class="world-map-card">
        <div class="world-map-head">
          <span class="world-map-title">🗺 世界地图</span>
          <div class="world-map-tools">
            <button type="button" id="mapZoomOut" class="map-zoom-btn" title="缩小（看更远）">－</button>
            <span id="mapRangeLabel" class="map-range-label">中</span>
            <button type="button" id="mapZoomIn" class="map-zoom-btn" title="放大（看更近）">＋</button>
            <button type="button" id="mapClose" class="map-close-btn" title="关闭 (M / ESC)">✕</button>
          </div>
        </div>
        <div class="world-map-stage">
          <canvas id="worldMapCanvas" width="${RES}" height="${RES}"></canvas>
          <div id="mapCompass" class="map-compass">N</div>
          <div id="mapYouAre" class="map-you-are"></div>
        </div>
        <div class="world-map-legend" id="mapLegend"></div>
        <div class="world-map-tip">⭐出生点 ｜ 🏯风车 ｜ 🌸樱花岛 ｜ 🧭你的位置 ｜ 点地图切远近档（切到「岛」看樱花岛）｜ M/ESC 关闭</div>
      </div>`;
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.canvas = overlay.querySelector('#worldMapCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.legend = overlay.querySelector('#mapLegend');
    this.rangeLabel = overlay.querySelector('#mapRangeLabel');
    this.youAre = overlay.querySelector('#mapYouAre');
    this._baseCanvas = document.createElement('canvas');
    this._baseCanvas.width = RES;
    this._baseCanvas.height = RES;
    this._buildLegend();
  }

  _buildLegend() {
    const show = [
      Biome.PLAINS, Biome.CHERRY, Biome.MOUNTAINS, Biome.SNOW,
      Biome.DESERT, Biome.SAVANNA, Biome.TAIGA, Biome.JUNGLE,
      Biome.SWAMP, Biome.OCEAN,
    ];
    this.legend.innerHTML = show.map(b =>
      `<span class="legend-item"><i class="legend-dot" style="background:${biomeCSS(b)}"></i>${BiomeNames[b]}</span>`
    ).join('');
  }

  _bind() {
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.closeMap();
    });
    this.overlay.querySelector('#mapClose').addEventListener('click', () => this.closeMap());
    this.overlay.querySelector('#mapZoomIn').addEventListener('click', () => this._zoom(-1));
    this.overlay.querySelector('#mapZoomOut').addEventListener('click', () => this._zoom(1));
    this._tick = () => { if (this.open) this._drawMarkers(); };
    this._timer = setInterval(this._tick, 300);
  }

  _zoom(dir) {
    const n = RANGE_LEVELS.length;
    this.levelIndex = Math.max(0, Math.min(n - 1, this.levelIndex + dir));
    this.rangeLabel.textContent = RANGE_LEVELS[this.levelIndex].label;
    this._cacheKey = '';
    this.show();
  }

  show() {
    this.open = true;
    this.overlay.style.display = 'flex';
    this._render();
  }

  closeMap() {
    this.open = false;
    this.overlay.style.display = 'none';
  }

  toggle() {
    this.open ? this.closeMap() : this.show();
  }

  _render() {
    const range = RANGE_LEVELS[this.levelIndex].range;
    const cx = Math.floor(this.home.x);
    const cz = Math.floor(this.home.z);
    const key = `${range}:${cx}:${cz}`;
    if (key !== this._cacheKey) {
      this._drawBiomes(cx, cz, range);
      this._cacheKey = key;
      this._lastMarkerKey = ''; // 底图变了，重刷缓存
    }
    this._drawMarkers();
  }

  /** 采样群系绘制成高清底图，缓存到离屏 canvas */
  _drawBiomes(cx, cz, range) {
    const bctx = this._baseCanvas.getContext('2d');
    const img = bctx.createImageData(RES, RES);
    const data = img.data;
    const step = (range * 2) / RES;
    for (let py = 0; py < RES; py++) {
      for (let px = 0; px < RES; px++) {
        // 地图上方 = 北（-z）
        const wx = Math.floor(cx + (px - RES / 2) * step);
        const wz = Math.floor(cz + (py - RES / 2) * step);
        let b;
        try { b = this.world.getBiome(wx, wz); } catch (e) { b = Biome.PLAINS; }
        const c = biomeRGB(b);
        const i = (py * RES + px) * 4;
        data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b; data[i + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);

    // 群系交界细分网格线（淡），帮助定位
    bctx.save();
    bctx.strokeStyle = 'rgba(255,255,255,0.12)';
    bctx.lineWidth = 1;
    const grid = RES / 10;
    for (let k = 1; k < 10; k++) {
      bctx.beginPath(); bctx.moveTo(k * grid, 0); bctx.lineTo(k * grid, RES); bctx.stroke();
      bctx.beginPath(); bctx.moveTo(0, k * grid); bctx.lineTo(RES, k * grid); bctx.stroke();
    }
    // 外圈描边
    bctx.strokeStyle = 'rgba(60,40,20,0.55)';
    bctx.lineWidth = 6;
    bctx.strokeRect(3, 3, RES - 6, RES - 6);
    bctx.restore();
  }

  /** 世界坐标 -> 地图像素（中心为出生家园，上方为北） */
  _toMap(wx, wz, range) {
    const px = RES / 2 + (wx - this.home.x) / (range * 2) * RES;
    const py = RES / 2 + (wz - this.home.z) / (range * 2) * RES;
    return { px, py };
  }

  _drawMarkers() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, RES, RES);
    ctx.drawImage(this._baseCanvas, 0, 0);

    const range = RANGE_LEVELS[this.levelIndex].range;

    // 中心十字坐标线（出生家园参照轴）
    ctx.save();
    ctx.strokeStyle = 'rgba(80,50,20,0.28)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(RES / 2, 0); ctx.lineTo(RES / 2, RES); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, RES / 2); ctx.lineTo(RES, RES / 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 风车
    if (this.windmill) {
      const { px, py } = this._toMap(this.windmill.x, this.windmill.z, range);
      this._drawIcon(ctx, px, py, '🏯', '#F46B95');
      this._drawLabel(ctx, px, py - 16, '风车', '#F46B95');
    }

    // 樱花岛（远处的环形山樱花庄园，超出当前视野则在边缘画指引箭头）
    if (this.island) {
      const m = this._toMap(this.island.x, this.island.z, range);
      const inView = m.px > 18 && m.px < RES - 18 && m.py > 18 && m.py < RES - 18;
      if (inView) {
        this._drawIcon(ctx, m.px, m.py, '🌸', '#E84F8F');
        this._drawLabel(ctx, m.px, m.py - 16, '樱花岛', '#E84F8F');
      } else {
        // 边缘指引：从中心指向岛的方向画一个粉色箭头 + 标签
        const dx = this.island.x - this.home.x;
        const dz = this.island.z - this.home.z;
        const ang = Math.atan2(dz, dx);
        const ex = RES / 2 + Math.cos(ang) * (RES / 2 - 30);
        const ey = RES / 2 + Math.sin(ang) * (RES / 2 - 30);
        this._drawEdgeArrow(ctx, ex, ey, ang, '🌸 樱花岛', '#E84F8F');
      }
    }

    // 出生家园（中心固定参照点）
    const home = this._toMap(this.home.x, this.home.z, range);
    this._drawHomeMarker(ctx, home.px, home.py);
    this._drawLabel(ctx, home.px, home.py + 18, '出生点', '#E0983C');

    // 玩家
    const p = this.getPlayer();
    if (p) {
      const { px, py } = this._toMap(p.x, p.z, range);
      this._drawPlayer(ctx, px, py, p.yaw || 0);
      const b = (() => { try { return BiomeNames[this.world.getBiome(Math.floor(p.x), Math.floor(p.z))]; } catch (e) { return ''; } })();
      this.youAre.textContent = b ? `🧭 你在：${b}` : '';
    }
  }

  _drawHomeMarker(ctx, px, py) {
    ctx.save();
    // 外圈光晕
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(244,196,107,0.35)';
    ctx.fill();
    // 五角星
    ctx.translate(px, py);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      const a2 = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
      ctx.lineTo(Math.cos(a2) * 4, Math.sin(a2) * 4);
    }
    ctx.closePath();
    ctx.fillStyle = '#F4C46B';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#b5731f';
    ctx.stroke();
    ctx.restore();
  }

  _drawPlayer(ctx, px, py, yaw) {
    ctx.save();
    // 脉冲外圈
    ctx.beginPath();
    ctx.arc(px, py, 13, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,59,48,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 朝向箭头：forward=(-sin yaw,-cos yaw)，地图上方=北，yaw=0 朝上
    ctx.translate(px, py);
    ctx.rotate(yaw);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#FF3B30';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();
  }

  _drawIcon(ctx, px, py, emoji, ring) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ring;
    ctx.stroke();
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, px, py + 1);
    ctx.restore();
  }

  // 目标在视野外时，在地图边缘画一个指向目标的粉色箭头 + 标签
  _drawEdgeArrow(ctx, px, py, ang, text, color) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-6, -9);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 9);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.rotate(-ang);
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(255,248,235,0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const ly = py < RES / 2 ? 18 : -18;
    ctx.beginPath();
    ctx.roundRect(-w / 2, ly - 9, w, 18, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(text, 0, ly);
    ctx.restore();
  }

  _drawLabel(ctx, px, py, text, color) {
    ctx.save();
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(255,248,235,0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px - w / 2, py - 9, w, 18, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5a3d1c';
    ctx.fillText(text, px, py + 0.5);
    ctx.restore();
  }

  dispose() {
    if (this._timer) clearInterval(this._timer);
    if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
  }
}
