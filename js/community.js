// community.js —— 社区功能：访客计数 / 点赞 / 留言（直连 Supabase，浏览器端）
// 使用 publishable(anon) key + 数据库 RLS/RPC 安全策略。功能失败时静默降级，不影响游戏。
import { SUPABASE_URL, SUPABASE_ANON_KEY, isCommunityEnabled } from './config.js?v=20260925aj';

const CHAR_KEY = 'voxel_character_v1';

export class Community {
  constructor() {
    this.client = null;
    this.ok = false;
    this.ready = false;
  }

  /** 在开始界面渲染社区区块；若未配置则什么都不做 */
  async mount(container) {
    if (!isCommunityEnabled()) {
      console.info('[community] 未配置 Supabase，社区区已隐藏');
      return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('[community] supabase 库未加载，跳过社区功能');
      return;
    }
    try {
      this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });
      this.ok = true;
    } catch (e) {
      console.warn('[community] 初始化失败', e);
      return;
    }

    this._buildDOM(container);
    this._bindEvents();

    // 并行：计数 + 点赞 + 留言
    this._initVisits();
    this._initLikes();
    this._loadMessages();
    this.ready = true;
  }

  _buildDOM(container) {
    const box = document.createElement('div');
    box.className = 'community-box';
    box.innerHTML = `
      <div class="cm-visits">🎉 已有 <b class="cm-visits-num">…</b> 位小探险家来过基地！</div>
      <button class="cm-like-btn" type="button">
        <span class="cm-like-heart">❤️</span> 给 Heidi 点个赞，多点几下也可以哦 <span class="cm-like-count"></span>
      </button>
      <div class="cm-board">
        <div class="cm-board-title">💌 给 Heidi 留句话吧</div>
        <input class="cm-name" type="text" maxlength="12" placeholder="你的昵称（可选）" />
        <textarea class="cm-msg" maxlength="100" rows="2" placeholder="写一句鼓励的话～（妈妈审核后会显示出来）"></textarea>
        <button class="cm-send" type="button">送出留言 🎈</button>
        <div class="cm-list"></div>
      </div>
    `;
    container.appendChild(box);
    this.el = box;
    // 阻止点击/按键冒泡到开始界面（否则点赞/留言会顺带触发"开始游戏"或游戏按键）
    ['click', 'pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach((ev) => {
      box.addEventListener(ev, (e) => e.stopPropagation());
    });
    this.visitsNum = box.querySelector('.cm-visits-num');
    this.likeBtn = box.querySelector('.cm-like-btn');
    this.likeHeart = box.querySelector('.cm-like-heart');
    this.likeCount = box.querySelector('.cm-like-count');
    this.nameInput = box.querySelector('.cm-name');
    this.msgInput = box.querySelector('.cm-msg');
    this.sendBtn = box.querySelector('.cm-send');
    this.listEl = box.querySelector('.cm-list');
  }

  _bindEvents() {
    this.likeBtn.addEventListener('click', () => this._like());
    this.sendBtn.addEventListener('click', () => this._sendMessage());
  }

  /** 读取计数（访客、点赞）。优先用 get_counts 函数，失败则返回 null */
  async _getCounts() {
    try {
      const { data, error } = await this.client.rpc('get_counts');
      if (error) throw error;
      // 函数返回单行 {visits, likes}
      const row = Array.isArray(data) ? data[0] : data;
      return { visits: Number(row?.visits ?? 0), likes: Number(row?.likes ?? 0) };
    } catch (e) {
      console.warn('[community] 读取计数失败', e?.message || e);
      return null;
    }
  }

  // ---------- 访客计数（按打开次数，每次打开 +1） ----------
  async _initVisits() {
    try {
      const { data, error } = await this.client.rpc('increment_visit');
      if (error) throw error;
      const n = this._num(data);
      if (typeof n === 'number') { this.visitsNum.textContent = this._fmt(n); return; }
      // 兜底：若函数未返回新值，再读一次计数
      const c = await this._getCounts();
      this.visitsNum.textContent = c ? this._fmt(c.visits) : '很多';
    } catch (e) {
      console.warn('[community] 计数失败', e?.message || e);
      this.visitsNum.textContent = '很多';
    }
  }

  // ---------- 点赞（可以反复点，每次 +1、飘爱心，短防抖防误连点） ----------
  async _initLikes() {
    const c = await this._getCounts();
    this._likeCount = c ? Number(c.likes) || 0 : null;
    if (c) this._renderLike(this._likeCount);
    else this.likeCount.textContent = '';
  }

  _renderLike(count) {
    if (count === null || count === undefined) return;
    this.likeCount.textContent = `(${this._fmt(count)})`;
    this.likeHeart.textContent = '❤️';
    this.likeBtn.classList.add('liked');
  }

  async _like() {
    // 允许连点送赞：每次有效点击都 +1。极短间隔内（90ms）的连点也排进队列，
    // 由 RPC 依次 +1，避免狂点瞬间打爆接口，同时保证"点了就涨"。
    const now = Date.now();
    if (this._likeLockUntil && now < this._likeLockUntil) {
      // 太密集的连点：先飘心给反馈，并排队稍后补一次计数
      this._floatHeart();
      this._pendingLike = (this._pendingLike || 0) + 1;
      return;
    }
    this._likeLockUntil = now + 90;
    // 乐观更新：立刻 +1、飘爱心，体验更爽
    if (this._likeCount === null || this._likeCount === undefined) this._likeCount = 0;
    this._likeCount += 1;
    this._renderLike(this._likeCount);
    this._floatHeart();
    try {
      const { data, error } = await this.client.rpc('increment_like');
      if (error) throw error;
      const count = this._num(data);
      if (typeof count === 'number') {
        this._likeCount = count;
        this._renderLike(count);
      } else {
        const c = await this._getCounts();
        if (c) { this._likeCount = Number(c.likes) || 0; this._renderLike(this._likeCount); }
      }
    } catch (e) {
      console.warn('[community] 点赞失败', e?.message || e);
      this._likeCount = Math.max(0, this._likeCount - 1);
      this._renderLike(this._likeCount);
      this._shake(this.likeBtn);
    } finally {
      // 若连点期间堆积了未计数的点击，稍后补齐
      if (this._pendingLike && this._pendingLike > 0) {
        const n = this._pendingLike;
        this._pendingLike = 0;
        for (let i = 0; i < n; i++) {
          setTimeout(() => this._like(), 120 * (i + 1));
        }
      }
    }
  }

  _floatHeart() {
    const h = document.createElement('span');
    h.className = 'cm-float-heart';
    h.textContent = '❤️';
    this.likeBtn.appendChild(h);
    setTimeout(() => h.remove(), 1000);
  }

  // ---------- 留言 ----------
  async _loadMessages() {
    try {
      const { data, error } = await this.client
        .from('messages')
        .select('nickname, content, created_at')
        .eq('approved', true)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      this._renderMessages(data || []);
    } catch (e) {
      console.warn('[community] 留言读取失败', e?.message || e);
      this.listEl.innerHTML = '<div class="cm-note">留言暂时加载不出来～</div>';
    }
  }

  _renderMessages(msgs) {
    if (!msgs.length) {
      this.listEl.innerHTML = '<div class="cm-note">还没有留言，来当第一个送祝福的人吧！</div>';
      return;
    }
    this.listEl.innerHTML = msgs.map((m) => {
      const name = this._escape(m.nickname || '神秘小探险家');
      const text = this._escape(m.content || '');
      return `<div class="cm-item"><span class="cm-item-name">${name}：</span>${text}</div>`;
    }).join('');
  }

  async _sendMessage() {
    const content = (this.msgInput.value || '').trim();
    if (!content) { this._shake(this.msgInput); return; }
    const nickname = (this.nameInput.value || '').trim() || '神秘小探险家';
    this.sendBtn.disabled = true;
    this.sendBtn.textContent = '发送中…';
    try {
      const { error } = await this.client
        .from('messages')
        .insert([{ nickname, content }]);
      if (error) throw error;
      this.msgInput.value = '';
      this.sendBtn.textContent = '已送出！等妈妈审核 🎈';
      setTimeout(() => { this.sendBtn.disabled = false; this.sendBtn.textContent = '送出留言 🎈'; }, 2200);
    } catch (e) {
      console.warn('[community] 留言发送失败', e?.message || e);
      this.sendBtn.disabled = false;
      this.sendBtn.textContent = '送出失败，稍后再试';
      setTimeout(() => { this.sendBtn.textContent = '送出留言 🎈'; }, 2000);
    }
  }

  // ---------- 工具 ----------
  _num(data) {
    // RPC 标量可能直接是数字，也可能包在数组/对象里
    if (typeof data === 'number') return data;
    if (Array.isArray(data) && typeof data[0] === 'number') return data[0];
    return null;
  }
  _fmt(n) {
    if (typeof n !== 'number') return '很多';
    return n.toLocaleString('zh-CN');
  }
  _escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  _shake(el) {
    if (!el) return;
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 260 });
  }
}

export { CHAR_KEY };
