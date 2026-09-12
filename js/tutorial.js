// js/tutorial.js
// 儿童新手引导：向导兔子 NPC（头顶 3D 气泡）+ 三步任务追踪 + 庆祝奖励。
// 三步：① 走路(WASD/摇杆移动 10 格)  ② 右键拆一个方块  ③ 左键放一个方块
export const TUTORIAL_STEPS = [
  { id: 'move',  title: '动起来！',  text: '用 W A S D 走路（手机拖动左摇杆），走出 10 步看看这个世界～' },
  { id: 'break', title: '拆掉方块',  text: '对着地上的方块按【右键】（手机点✋按钮），把它拆掉！' },
  { id: 'place', title: '放个方块',  text: '按【左键】（手机点＋按钮），把手里的方块放下去，你会盖东西啦！' },
  { id: 'done',  title: '太棒了！',  text: '你已经学会基本操作啦！按 E 开背包选方块，按 G 兑换家具，双击空格还能飞起来哦～' },
];

export class Tutorial {
  constructor(scene, THREE, sound) {
    this.scene = scene;
    this.THREE = THREE;
    this.sound = sound;
    this.step = 0;
    this.completed = false;
    this.moved = 0;
    this._lastX = 0; this._lastZ = 0;
    this._hasPos = false;
    this.el = null;
    this.rabbit = null;
    this.sprite = null;
    this._buildHUD();
    this._buildBubble();
  }

  // 绑定向导兔子（game.js 生成动物后传入），在它头顶挂 3D 气泡
  attachRabbit(rabbit) {
    this.rabbit = rabbit;
    if (rabbit && rabbit.group && this.sprite) rabbit.group.add(this.sprite);
  }

  _buildHUD() {
    const el = document.createElement('div');
    el.className = 'tutorial-panel';
    el.innerHTML = `
      <button class="tu-close" aria-label="关闭引导" title="关闭引导（电脑也可按 H 键）">✕</button>
      <div class="tu-bunny">🐰</div>
      <div class="tu-body">
        <div class="tu-title"></div>
        <div class="tu-text"></div>
        <div class="tu-progress"></div>
      </div>
      <div class="tu-hint">电脑按 <b>H</b> 键可收起/重开 · 手机点右上角 ✕</div>`;
    document.body.appendChild(el);
    this.el = el;
    this.titleEl = el.querySelector('.tu-title');
    this.textEl = el.querySelector('.tu-text');
    this.progressEl = el.querySelector('.tu-progress');
    const closeBtn = el.querySelector('.tu-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.dismiss());
    this._render();
  }

  /** 立即关闭引导面板（并隐藏兔子头顶气泡），任务不再显示但仍可继续 */
  dismiss() {
    this._dismissed = true;
    if (this.el) this.el.classList.add('tu-hide');
    if (this.sprite) this.sprite.visible = false;
  }

  /** 重新显示引导面板（用于快捷键重开） */
  show() {
    this._dismissed = false;
    if (this.el) this.el.classList.remove('tu-hide');
    if (this.sprite) this.sprite.visible = true;
    this._render();
  }

  /** 快捷键切换：已关闭则重开，已显示则收起；三步任务全部完成后不再重开 */
  toggle() {
    if (this.completed) return;
    if (this._dismissed) this.show();
    else this.dismiss();
  }

  _buildBubble() {
    const T = this.THREE;
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    this._bubbleCanvas = cv;
    this._bubbleCtx = cv.getContext('2d');
    this.tex = new T.CanvasTexture(cv);
    this.tex.minFilter = T.LinearFilter;
    const mat = new T.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false });
    this.sprite = new T.Sprite(mat);
    this.sprite.scale.set(2.4, 1.2, 1);
    this.sprite.position.set(0, 2.4, 0);
    this.sprite.renderOrder = 999;
    this._redrawBubble();
  }

  _redrawBubble() {
    const ctx = this._bubbleCtx;
    if (!ctx) return;
    ctx.clearRect(0, 0, 256, 128);
    // 气泡底
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, 8, 8, 240, 92, 18); ctx.fill();
    ctx.strokeStyle = '#f46b95'; ctx.lineWidth = 5;
    roundRect(ctx, 8, 8, 240, 92, 18); ctx.stroke();
    // 小尾巴
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.moveTo(70, 96); ctx.lineTo(60, 122); ctx.lineTo(96, 96); ctx.closePath(); ctx.fill();
    const step = TUTORIAL_STEPS[Math.min(this.step, TUTORIAL_STEPS.length - 1)];
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5a3a4a';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(step.title, 128, 48);
    ctx.fillStyle = '#f46b95';
    ctx.font = 'bold 30px sans-serif';
    const mark = this.completed ? '★' : '①②③'[Math.min(this.step, 2)];
    ctx.fillText(mark, 128, 86);
    this.tex.needsUpdate = true;
  }

  _render() {
    const idx = Math.min(this.step, 3);
    const s = TUTORIAL_STEPS[idx];
    this.titleEl.textContent = this.completed ? '新手任务完成！' : `第 ${this.step + 1} 步 · ${s.title}`;
    this.textEl.textContent = s.text;
    const dots = TUTORIAL_STEPS.slice(0, 3).map((t, i) =>
      i < this.step || this.completed ? '<span class="tu-dot done">✓</span>' :
      i === this.step ? '<span class="tu-dot cur">●</span>' :
      '<span class="tu-dot">○</span>').join('');
    this.progressEl.innerHTML = dots;
    this.el.classList.toggle('tu-finished', this.completed);
    this._redrawBubble();
  }

  /** 每帧调用：走路任务追踪 */
  update(dt, player) {
    if (this.completed) return;
    const s = TUTORIAL_STEPS[this.step];
    if (!s) return;
    if (s.id === 'move') {
      if (this._hasPos) {
        const dx = player.position.x - this._lastX;
        const dz = player.position.z - this._lastZ;
        this.moved += Math.sqrt(dx * dx + dz * dz);
      }
      this._lastX = player.position.x; this._lastZ = player.position.z; this._hasPos = true;
      if (this.moved >= 10) this._advance();
    }
  }

  notifyBreak() { if (!this.completed && TUTORIAL_STEPS[this.step]?.id === 'break') this._advance(); }
  notifyPlace() { if (!this.completed && TUTORIAL_STEPS[this.step]?.id === 'place') this._advance(); }

  _advance() {
    this.step++;
    this.sound.taskDone();
    if (this.step >= TUTORIAL_STEPS.length - 1) {
      this.completed = true;
      this.sound.allDone();
      setTimeout(() => this.dismiss(), 6000);
    }
    this._render();
  }

  dispose() { if (this.el) this.el.remove(); }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
