// js/audio.js
// 轻量音效系统：用 WebAudio 实时合成，不依赖任何音频文件。
// 覆盖儿童游戏常见反馈：放方块、拆方块、收集、兑换成功、任务完成、UI 点击、跳跃。
export class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
  }

  /** 必须在用户首次交互（点击开始）后调用，解锁音频上下文 */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  }

  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.35 : 0; }

  // 基础：播放一个振荡器音
  _tone(freq, dur, type = 'sine', vol = 0.5, slideTo = null, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // 噪声（破坏/脚步用）
  _noise(dur, vol = 0.4, hp = 400) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filt = this.ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t0);
  }

  place() { this._tone(180, 0.09, 'square', 0.25, 120); this._tone(320, 0.06, 'sine', 0.15, null, 0.02); }
  break() { this._noise(0.16, 0.3, 500); this._tone(140, 0.12, 'triangle', 0.2, 70); }
  collect() { this._tone(660, 0.08, 'sine', 0.3, 990); this._tone(990, 0.1, 'sine', 0.25, 1320, 0.07); }
  buy() { this._tone(523, 0.09, 'triangle', 0.3); this._tone(784, 0.12, 'triangle', 0.3, null, 0.09); }
  click() { this._tone(440, 0.05, 'square', 0.18); }
  jump() { this._tone(300, 0.1, 'sine', 0.18, 520); }
  step() { this._noise(0.05, 0.08, 800); }

  // 任务完成：欢快上行琶音
  taskDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._tone(f, 0.16, 'triangle', 0.3, null, i * 0.09));
  }
  // 全部完成：小号角
  allDone() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this._tone(f, 0.18, 'square', 0.22, null, i * 0.12));
  }
}
