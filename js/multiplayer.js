// multiplayer.js —— 多人联机同步（浏览器直连 Supabase）
// 负责：创建/加入房间、拉取共建方块、Realtime 实时同步放拆与玩家现身。
// 未配置 Supabase 或库未加载时自动禁用，不影响单机游戏。
import { SUPABASE_URL, SUPABASE_ANON_KEY, isCommunityEnabled } from './config.js?v=20260925af';

const PID_KEY = 'voxel_mp_pid_v1';
const NAME_KEY = 'voxel_mp_name_v1';

// 房间码字母表（去掉易混淆的 0/O、1/I/L）
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function genPlayerId() {
  let id = localStorage.getItem(PID_KEY);
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(PID_KEY, id);
  }
  return id;
}

export class Multiplayer {
  // 每个房间最多同时在线人数（凭 Realtime presence 在进房时校验）
  static get ROOM_MAX_PLAYERS() { return 4; }

  constructor() {
    this.client = null;
    this.ok = false;
    this.enabled = false;
    this.inRoom = false;
    this.roomCode = null;
    this.joinAt = 0;
    this.playerId = genPlayerId();
    this.nickname = localStorage.getItem(NAME_KEY) || '';
    this.skin = 'burger';
    this.channel = null;
    this.presenceTimer = null;
    this.touchTimer = null;
    this.pos = { x: 0, y: 0, z: 0, yaw: 0 };
    this._mine = new Map(); // 刚发送的编辑 key -> 时间戳，用于跳过自己的回声
    this._acceptEdits = false; // 切换到房间世界完成后才接受实时方块
    this.cb = { edit: null, presence: null, status: null, roomEnter: null, chat: null };
  }

  setNickname(n) { this.nickname = (n || '').trim().slice(0, 12) || '小探险家'; localStorage.setItem(NAME_KEY, this.nickname); }
  setSkin(s) { this.skin = s || 'burger'; }
  on(cb) { this.cb = { ...this.cb, ...cb }; }
  _status(msg) { if (this.cb.status) this.cb.status(msg); }

  // 把 Supabase/网络错误翻译成小朋友和妈妈都看得懂的提示
  _friendlyError(error, action) {
    const msg = (error && (error.message || error.error_description || error.hint)) || '';
    const code = (error && (error.code || error.pgCode)) || '';
    const raw = String(msg) + ' ' + String(code);
    if (/relation .* does not exist|Could not find the table|42P01|PGRST205|schema cache/i.test(raw)) {
      this._status('🛠️ 多人联机还没开通：需要妈妈先在 Supabase 的 SQL Editor 里运行一次 multiplayer-setup.sql（建房间表）。运行成功后刷新页面就能建房啦。');
      return false;
    }
    if (/Failed to fetch|Network|network|timeout|abort/i.test(raw)) {
      this._status('📶 网络连接失败，检查网络后重试。');
      return false;
    }
    this._status(action + '失败：' + (msg || '请稍后再试'));
    return false;
  }

  _initClient() {
    if (this.ok) return true;
    if (!isCommunityEnabled() || !window.supabase || typeof window.supabase.createClient !== 'function') {
      this.enabled = false;
      return false;
    }
    try {
      this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 15 } },
      });
      this.ok = true;
      this.enabled = true;
      return true;
    } catch (e) {
      console.warn('[mp] 初始化失败', e);
      this.enabled = false;
      return false;
    }
  }

  _genCode() {
    let s = '';
    for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  /** 创建房间：返回房间码；失败返回 null */
  async createRoom() {
    if (!this._initClient()) return null;
    let code = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const c = this._genCode();
      const { data, error } = await this.client.from('mp_worlds')
        .insert({ code: c, name: this.nickname + ' 的共建世界', nickname: this.nickname, skin: this.skin })
        .select('code').maybeSingle();
      if (error && error.code === '23505') continue; // 房间码撞号，重试
      if (error) { return this._friendlyError(error, '创建房间'); }
      code = data && data.code ? data.code : c;
      break;
    }
    if (!code) { this._status('创建房间失败：房间码总是重复，请再点一次试试。'); return null; }
    return (await this.joinRoom(code)) ? code : null;
  }

  /** 加入房间：校验未满 → 拉取已有方块 → 订阅实时并现身。成功 true。 */
  async joinRoom(rawCode) {
    if (!this._initClient()) return false;
    const code = (rawCode || '').trim().toUpperCase();
    if (code.length < 4) return false;

    // 核对房间存在
    const { data: world, error } = await this.client.from('mp_worlds')
      .select('code,name,nickname').eq('code', code).maybeSingle();
    if (error) { return this._friendlyError(error, '加入房间'); }
    if (!world) { this._status('找不到房间 ' + code + '，确认房间码对吗？'); return false; }

    // 刷新活动时间
    this.client.from('mp_worlds').update({ touched_at: new Date().toISOString() }).eq('code', code);

    // 1) 先连入房间频道（暂不现身 track），用于清点当前人数
    let ch;
    try {
      ch = await this._openChannel(code);
    } catch (e) {
      this._status('连接房间失败，网络好像不太顺，等会儿再试。');
      return false;
    }

    // 2) 等 presence 收敛后清点现有成员（自己尚未 track，不会被计入）
    await new Promise((r) => setTimeout(r, 650));
    const occupants = this._presencePids(ch);
    if (occupants.size >= Multiplayer.ROOM_MAX_PLAYERS) {
      try { await this.client.removeChannel(ch); } catch (e) {}
      this._status('房间 ' + code + ' 已满（最多 ' + Multiplayer.ROOM_MAX_PLAYERS + ' 人），换个房间或稍后再试吧。');
      return false;
    }

    // 3) 拉取本世界已有方块改动（分页，每页 900）
    const edits = await this._loadEdits(code);
    this.roomCode = code;
    this.inRoom = true;
    this.joinAt = Date.now();
    this._acceptEdits = false;
    this._mine.clear();

    // 进房确认后、应用房间方块前：让游戏切换成"同房共享世界"（统一种子/出生点）
    if (this.cb.roomEnter) { try { await this.cb.roomEnter(code); } catch (e) { console.warn('[mp] roomEnter hook', e); } }

    // 先把已有共建内容交给游戏应用
    if (this.cb.edit) for (const r of edits) this.cb.edit(r, true);
    this._acceptEdits = true;

    // 4) 正式现身（track）+ 周期上报位置
    this.channel = ch;
    ch.track({ pid: this.playerId, nickname: this.nickname, skin: this.skin,
      x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.pos.yaw, joinedAt: this.joinAt });
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    this.presenceTimer = setInterval(() => {
      if (!this.channel) return;
      this.channel.track({ pid: this.playerId, nickname: this.nickname, skin: this.skin,
        x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.pos.yaw, joinedAt: this.joinAt });
    }, 1200);

    const total = occupants.size + 1;
    this._status('已进入房间 ' + code + '（' + total + '/' + Multiplayer.ROOM_MAX_PLAYERS + ' 人），和小伙伴一起搭吧！');
    return true;
  }

  /** 统计频道内已现身的不同玩家 pid（不含自己）。 */
  _presencePids(ch) {
    const set = new Set();
    try {
      const state = ch.presenceState ? ch.presenceState() : {};
      for (const key in state) {
        for (const p of state[key]) {
          if (p && p.pid && p.pid !== this.playerId) set.add(p.pid);
        }
      }
    } catch (e) { /* presence 尚未就绪按 0 人处理 */ }
    return set;
  }

  /** 打开并绑定房间频道（方块/现身/聊天），resolve 于 SUBSCRIBED，此时还未 track。 */
  _openChannel(code) {
    return new Promise((resolve, reject) => {
      if (this.channel) { try { this.client.removeChannel(this.channel); } catch (e) {} this.channel = null; }
      const ch = this.client.channel('room-' + code, {
        config: { presence: { key: this.playerId } },
      });

      // 方块增/改（同一格 upsert；进房切换世界前先忽略，避免写进单机世界）
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table: 'mp_edits', filter: 'world_code=eq.' + code },
        (payload) => {
          if (!this._acceptEdits) return;
          const r = payload.new;
          if (!r) return;
          const key = r.bx + ',' + r.by + ',' + r.bz;
          const mine = this._mine.get(key);
          if (mine && (Date.now() - mine) < 8000) { this._mine.delete(key); return; } // 跳过自己的回声
          if (r.pid === this.playerId) return;
          if (this.cb.edit) this.cb.edit(r, false);
        });

      // 玩家现身
      ch.on('presence', { event: 'sync' }, () => this._emitPresence(ch));
      ch.on('presence', { event: 'join' }, () => this._emitPresence(ch));
      ch.on('presence', { event: 'leave' }, () => this._emitPresence(ch));

      // 对话气泡（广播消息，不入库；跳过自己回声）
      ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
        if (!payload || payload.pid === this.playerId) return;
        if (this.cb.chat) this.cb.chat({
          pid: payload.pid, nickname: payload.nickname || '小探险家',
          text: String(payload.text || '').slice(0, 80),
        });
      });

      let settled = false;
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED' && !settled) { settled = true; resolve(ch); }
        else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !settled) {
          settled = true; reject(new Error(status));
        }
      });
    });
  }

  async _loadEdits(code) {
    const all = [];
    const page = 900;
    for (let start = 0; ; start += page) {
      const { data, error } = await this.client.from('mp_edits')
        .select('bx,by,bz,type,dir,pid,nickname')
        .eq('world_code', code)
        .range(start, start + page - 1);
      if (error) { console.warn('[mp] 拉取方块失败', error); break; }
      if (!data || !data.length) break;
      all.push(...data);
      if (data.length < page) break;
    }
    return all;
  }

  _emitPresence(ch) {
    if (!this.cb.presence) return;
    const state = ch.presenceState ? ch.presenceState() : {};
    const list = [];
    for (const key in state) {
      for (const p of state[key]) {
        if (p && p.pid && p.pid !== this.playerId) {
          list.push({ id: p.pid, nickname: p.nickname || '小探险家', skin: p.skin || 'burger',
            x: p.x || 0, y: p.y || 0, z: p.z || 0, yaw: p.yaw || 0 });
        }
      }
    }
    this.cb.presence(list);
  }

  /** 本地放/拆方块后调用，同步到房间（dir 为家具朝向，无朝向传 0） */
  pushEdit(bx, by, bz, type, dir) {
    if (!this.inRoom || !this.client) return;
    const key = bx + ',' + by + ',' + bz;
    this._mine.set(key, Date.now());
    this.client.from('mp_edits').upsert({
      world_code: this.roomCode, bx, by, bz, type, dir: dir || 0,
      pid: this.playerId, nickname: this.nickname,
    }, { onConflict: 'world_code,bx,by,bz' }).then(({ error }) => {
      if (error) { console.warn('[mp] 同步方块失败', error); this._mine.delete(key); }
    }).catch(() => this._mine.delete(key));
  }

  /** 每帧/移动时更新本地坐标（由 presence 定时上报） */
  updatePos(x, y, z, yaw) { this.pos = { x, y, z, yaw }; }

  /** 发送一句话对话（广播，不存数据库） */
  sendChat(rawText) {
    if (!this.inRoom || !this.channel) return false;
    const text = String(rawText == null ? '' : rawText).trim().slice(0, 80);
    if (!text) return false;
    try {
      this.channel.send({
        type: 'broadcast', event: 'chat',
        payload: { pid: this.playerId, nickname: this.nickname, text },
      });
      return true;
    } catch (e) { console.warn('[mp] 发送对话失败', e); return false; }
  }

  leave() {
    this.inRoom = false;
    this.roomCode = null;
    if (this.presenceTimer) { clearInterval(this.presenceTimer); this.presenceTimer = null; }
    if (this.channel && this.client) { try { this.client.removeChannel(this.channel); } catch (e) {} }
    this.channel = null;
  }
}
