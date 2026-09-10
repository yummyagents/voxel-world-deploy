/**
 * portfolio.js - 作品集相册
 *
 * 一键截图当前 3D 场景，存入 localStorage 相册，可翻看 / 放大 / 下载 / 删除。
 * 面向儿童：拍照有快门音效与闪光反馈，相册是"我的作品"成就墙。
 *
 * 数据结构（localStorage: voxel_portfolio_v1）：
 *   [ { id, dataUrl, thumb, time, title, w, h }, ... ]  // 新的在前
 *
 * 截图来源：renderer.domElement.toDataURL('image/png')，
 * 需在创建 WebGLRenderer 时设置 preserveDrawingBuffer: true。
 */

const STORAGE_KEY = 'voxel_portfolio_v1';
const MAX_PHOTOS = 24;          // 相册容量上限（localStorage 空间保护）
const JPEG_QUALITY = 0.82;      // jpeg 体积更小，适合本地存储
const THUMB_SCALE = 0.28;       // 缩略图缩放比例

export class Portfolio {
  constructor(three) {
    this.THREE = three;
    this.photos = [];
    this.isOpen = false;
    this._el = null;
    this._onShot = null; // 拍照回调（可用于播放快门音效）
    this._load();
    this._buildUI();
  }

  /** 设置拍照回调（音效等） */
  onShot(cb) { this._onShot = cb; }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.photos = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(this.photos)) this.photos = [];
    } catch (e) {
      console.error('[portfolio] 读取相册失败', e);
      this.photos = [];
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.photos));
      return true;
    } catch (e) {
      console.error('[portfolio] 保存失败（存储空间可能已满）', e);
      return false;
    }
  }

  /**
   * 拍摄一张照片
   * @param {THREE.WebGLRenderer} renderer
   * @param {string} [title] 作品标题
   * @returns {boolean} 是否成功
   */
  capture(renderer, title) {
    try {
      if (!renderer) return false;
      const canvas = renderer.domElement;
      // 先确保渲染一帧，画面最新
      const w = canvas.width;
      const h = canvas.height;

      const fullUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const thumb = this._makeThumb(canvas, w, h);

      const photo = {
        id: 'p' + Date.now() + Math.floor(Math.random() * 1000),
        dataUrl: fullUrl,
        thumb,
        time: Date.now(),
        title: title || ('我的作品 ' + (this.photos.length + 1)),
        w, h,
      };
      this.photos.unshift(photo);
      // 超出容量，删最旧的
      while (this.photos.length > MAX_PHOTOS) this.photos.pop();

      const ok = this._save();
      if (this.isOpen) this._renderGrid();
      this._flash();
      if (this._onShot) { try { this._onShot(); } catch (e) {} }
      return ok;
    } catch (e) {
      console.error('[portfolio] 截图失败', e);
      return false;
    }
  }

  /** 生成缩略图 dataURL（缩小体积，列表用） */
  _makeThumb(canvas, w, h) {
    try {
      const tw = Math.max(80, Math.round(w * THUMB_SCALE));
      const th = Math.round(tw * h / w);
      const c = document.createElement('canvas');
      c.width = tw; c.height = th;
      const ctx = c.getContext('2d');
      ctx.drawImage(canvas, 0, 0, tw, th);
      return c.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      return '';
    }
  }

  /** 拍照白闪反馈 */
  _flash() {
    let f = document.getElementById('photoFlash');
    if (!f) {
      f = document.createElement('div');
      f.id = 'photoFlash';
      document.body.appendChild(f);
    }
    f.classList.remove('flashing');
    void f.offsetWidth; // 重置动画
    f.classList.add('flashing');
  }

  _buildUI() {
    if (this._el) return;
    const el = document.createElement('div');
    el.id = 'portfolioPanel';
    el.className = 'portfolio-panel';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="portfolio-mask"></div>
      <div class="portfolio-dialog">
        <div class="portfolio-header">
          <h2>📷 我的作品集</h2>
          <button class="portfolio-close" title="关闭">✕</button>
        </div>
        <p class="portfolio-tip">把你搭好的作品拍下来，留作纪念吧！</p>
        <div class="portfolio-grid"></div>
        <div class="portfolio-empty">还没有作品～按 <b>C</b> 或点右下角📷拍一张吧！</div>
        <div class="portfolio-lightbox" style="display:none">
          <img alt="作品大图" />
          <div class="lightbox-bar">
            <button class="lb-download">⬇ 下载</button>
            <button class="lb-delete">🗑 删除</button>
            <button class="lb-close">✕ 关闭</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;

    el.querySelector('.portfolio-mask').addEventListener('click', () => this.close());
    el.querySelector('.portfolio-close').addEventListener('click', () => this.close());
    el.querySelector('.lb-close').addEventListener('click', () => this._closeLightbox());

    el.querySelector('.lb-download').addEventListener('click', () => this._downloadCurrent());
    el.querySelector('.lb-delete').addEventListener('click', () => this._deleteCurrent());
  }

  open() {
    this.isOpen = true;
    this._el.style.display = 'flex';
    this._renderGrid();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this._el.style.display = 'none';
    this._closeLightbox();
    if (typeof this.onClose === 'function') {
      const cb = this.onClose; this.onClose = null;
      try { cb(); } catch (e) { console.warn(e); }
    }
  }

  toggle() { this.isOpen ? this.close() : this.open(); }

  _renderGrid() {
    const grid = this._el.querySelector('.portfolio-grid');
    const empty = this._el.querySelector('.portfolio-empty');
    grid.innerHTML = '';
    if (this.photos.length === 0) {
      empty.style.display = 'block';
      grid.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    grid.style.display = 'grid';

    this.photos.forEach((p) => {
      const cell = document.createElement('div');
      cell.className = 'photo-cell';
      const src = p.thumb || p.dataUrl;
      cell.innerHTML = `
        <img src="${src}" alt="${p.title}" />
        <div class="photo-meta">
          <span class="photo-title">${p.title}</span>
          <span class="photo-date">${this._fmtDate(p.time)}</span>
        </div>
      `;
      cell.addEventListener('click', () => this._openLightbox(p.id));
      grid.appendChild(cell);
    });
  }

  _fmtDate(t) {
    try {
      const d = new Date(t);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return ''; }
  }

  _currentId = null;
  _openLightbox(id) {
    const p = this.photos.find((x) => x.id === id);
    if (!p) return;
    this._currentId = id;
    const lb = this._el.querySelector('.portfolio-lightbox');
    lb.querySelector('img').src = p.dataUrl;
    lb.style.display = 'flex';
  }

  _closeLightbox() {
    this._currentId = null;
    this._el.querySelector('.portfolio-lightbox').style.display = 'none';
  }

  async _downloadCurrent() {
    const p = this.photos.find((x) => x.id === this._currentId);
    if (!p) return;
    const filename = `${(p.title || 'minecraft-photo').replace(/[\\/:*?"<>|]/g, '_')}.jpg`;
    // 用 fetch + blob 下载，兼容手机浏览器和跨域 dataURL
    try {
      const resp = await fetch(p.dataUrl);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    } catch (e) {
      // 兜底：直接用 a 标签
      const a = document.createElement('a');
      a.href = p.dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  _deleteCurrent() {
    if (!this._currentId) return;
    if (!confirm('确定要删掉这张照片吗？删掉就找不回来啦。')) return;
    this.photos = this.photos.filter((x) => x.id !== this._currentId);
    this._save();
    this._closeLightbox();
    this._renderGrid();
  }
}
