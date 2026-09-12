// multiplayer.js —— 多人联机同步（浏览器直连 Supabase）
// 负责：创建/加入房间、拉取共建方块、Realtime 实时同步放拆与玩家现身。
// 未配置 Supabase 或库未加载时自动禁用，不影响单机游戏。
import { SUPABASE_URL, SUPABASE_ANON_KEY, isCommunityEnabled } from './config.js?v=20260925an';

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
    this.pos = { x: 0, y: 0, z: 0, yaw: 0, pose: 'stand' };
    this._mine = new Map(); // 刚发送的编辑 key -> 时间戳，用于跳过自己的回声
    this._acceptEdits = false; // 切换到房间世界完成后才接受实时方块
    this._rosterReady = false; // 正式进房现身之后才向前台广播名单/横幅
    this._knownPids = null; // 已在场玩家 pid 集合；null 表示尚未做首次同步（不报上线）
    // —— REST 心跳兜底通道（不依赖 WebSocket presence）——
    // 两路在线名单合并：WebSocket presence(ws) + HTTPS 心跳(rest)，任一通道看到队友都算在线。
    this._wsList = [];        // WebSocket presence 通道的在线队友
    this._restList = [];      // REST 心跳通道的在线队友
    this._restOk = false;     // 心跳表/RPC 是否已就绪（妈妈跑过新 SQL 后置 true）
    this._restTried = false;  // 是否已经尝试过心跳（探测一次，失败就不再刷屏）
    this.isRealtimeLive = false; // Realtime WebSocket 长连是否真正存活（用于联机自检）
    this._realtimeWarned = false;
    this.heartbeatTimer = null;
    this._hbInFlight = false;
    this.editPollTimer = null; // 方块 REST 兜底轮询（WebSocket postgres_changes 被拦截时）
    this._editSince = 0;       // 已应用过的远端方块最大 created_at 毫秒（去重）
    this._firstPoll = true;
    this.cb = { edit: null, presence: null, status: null, roomEnter: null, chat: null, roster: null };
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
    let occupants = this._presencePids(ch);
    // WebSocket presence 被网络拦截时，用 REST 心跳表清点人数（老 SQL 无此表则忽略）
    if (occupants.size < Multiplayer.ROOM_MAX_PLAYERS) {
      const restN = await this._restOccupancy(code);
      for (const pid of restN) occupants.add(pid);
    }
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
    // 清点阶段产生的 presence 只用于数人，不向前台广播；正式进房后再开始名单/上下线广播
    this._knownPids = null;
    this._nameCache = null;
    this._rosterReady = false;

    // 进房确认后、应用房间方块前：让游戏切换成"同房共享世界"（统一种子/出生点）
    if (this.cb.roomEnter) { try { await this.cb.roomEnter(code); } catch (e) { console.warn('[mp] roomEnter hook', e); } }

    // 先把已有共建内容交给游戏应用
    if (this.cb.edit) for (const r of edits) this.cb.edit(r, true);
    this._acceptEdits = true;

    // 4) 正式现身（track）+ 周期上报位置
    this.channel = ch;
    ch.track({ pid: this.playerId, nickname: this.nickname, skin: this.skin,
      x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.pos.yaw,
      pose: this.pos.pose || 'stand', joinedAt: this.joinAt });
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    this.presenceTimer = setInterval(() => {
      if (!this.channel) return;
      this.channel.track({ pid: this.playerId, nickname: this.nickname, skin: this.skin,
        x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.pos.yaw,
      pose: this.pos.pose || 'stand', joinedAt: this.joinAt });
    }, 1200);

    // REST 心跳兜底通道：立即上报一次，之后每 1.2s 心跳（带最新坐标），
    // WebSocket presence 不通时，队友照样能通过 HTTPS 看到彼此。
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this._heartbeat();
    this.heartbeatTimer = setInterval(() => this._heartbeat(), 1200);

    // 方块 REST 兜底轮询（postgres_changes 实时正常时重复应用也因主键覆盖而无害）
    if (this.editPollTimer) clearInterval(this.editPollTimer);
    this._firstPoll = true;
    this._editSince = 0;
    this.editPollTimer = setInterval(() => this._pollEdits(), 2000);

    const total = occupants.size + 1;
    this._status('已进入房间 ' + code + '（' + total + '/' + Multiplayer.ROOM_MAX_PLAYERS + ' 人），和小伙伴一起搭吧！');

    // 正式现身之后，立即向前台发一次"入场名单"，用于弹欢迎横幅/显示徽章（只此一次）
    this._rosterReady = true;
    this._knownPids = null;
    this._emitPresence(ch);

    // 进房 5 秒后做一次联机自检：两条通道都拿不到"自己已上线"以外的信息时给出可执行提示
    setTimeout(() => {
      if (!this.inRoom || this.roomCode !== code) return;
      if (!this.isRealtimeLive && !this._restOk) {
        this._maybeWarnRealtime();
      }
    }, 5000);
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

  /** REST 心跳清点（WebSocket 不通时的满员判断兜底）；表/函数不存在时返回空集合。 */
  async _restOccupancy(code) {
    const set = new Set();
    try {
      const { data, error } = await this.client.rpc('mp_heartbeat', {
        p_code: code, p_pid: this.playerId, p_nickname: this.nickname,
        p_skin: this.skin, p_x: 0, p_y: 0, p_z: 0, p_yaw: 0, p_pose: 'stand',
      });
      if (error) { this._restOk = false; return set; }
      this._restOk = true;
      this._restTried = true;
      for (const r of (data || [])) if (r && r.pid) set.add(r.pid);
    } catch (e) { /* 忽略，按 WS 结果处理 */ }
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
        // 记录 Realtime 长连真实状态（订阅后也可能掉线）
        this.isRealtimeLive = (status === 'SUBSCRIBED');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.isRealtimeLive = false;
          this._maybeWarnRealtime();
        }
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
    const state = ch.presenceState ? ch.presenceState() : {};
    const list = [];
    const seenPid = new Set();
    for (const key in state) {
      for (const p of state[key]) {
        if (p && p.pid && p.pid !== this.playerId && !seenPid.has(p.pid)) {
          seenPid.add(p.pid);
          list.push({ id: p.pid, nickname: p.nickname || '小探险家', skin: p.skin || 'burger',
            x: p.x || 0, y: p.y || 0, z: p.z || 0, yaw: p.yaw || 0, pose: p.pose || 'stand' });
        }
      }
    }
    this._wsList = list;
    this._mergePresence();
  }

  /** REST 心跳：上报自己 + 拉回同房间在线队友（WebSocket 被网络拦截时的可靠通道）。 */
  async _heartbeat() {
    if (!this.inRoom || !this.client || this._hbInFlight) return;
    this._hbInFlight = true;
    try {
      const { data, error } = await this.client.rpc('mp_heartbeat', {
        v_code: this.roomCode, v_pid: this.playerId, v_nickname: this.nickname,
        v_skin: this.skin, v_x: this.pos.x, v_y: this.pos.y, v_z: this.pos.z,
        v_yaw: this.pos.yaw, v_pose: this.pos.pose || 'stand',
      });
      if (error) {
        // 首次遇到"函数/表不存在"：提示一次并停用心跳通道（老 SQL 未更新），不影响 WebSocket 通道
        if (!this._restTried) {
          this._restTried = true;
          const code = String(error.code || error.message || '');
          if (/42883|42P01|PGRST202|Could not find the function|relation .* does not exist/i.test(code)) {
            console.info('[mp] 未检测到在线心跳表，已自动改用实时通道。让妈妈运行最新 multiplayer-setup.sql 可获得更稳的联机。');
          }
        }
        this._restOk = false;
      } else {
        this._restOk = true;
        this._restTried = true;
        this._restList = (data || [])
          .filter((r) => r && r.pid && r.pid !== this.playerId)
          .map((r) => ({ id: r.pid, nickname: r.nickname || '小探险家', skin: r.skin || 'burger',
            x: r.x || 0, y: r.y || 0, z: r.z || 0, yaw: r.yaw || 0, pose: r.pose || 'stand' }));
        this._mergePresence();
      }
    } catch (e) {
      // 网络抖动：保留上一次名单，下一周期再试
    } finally {
      this._hbInFlight = false;
    }
  }

  /** REST 轮询本房间方块改动（WebSocket postgres_changes 被拦截时的兜底，约 2s 一次）。 */
  async _pollEdits() {
    if (!this.inRoom || !this.client || !this._acceptEdits) return;
    try {
      let q = this.client.from('mp_edits')
        .select('bx,by,bz,type,dir,pid,nickname,created_at')
        .eq('world_code', this.roomCode);
      if (this._firstPoll) {
        // 首次：只认进房时刻之后的新改动（进房全量已经在 joinRoom 里拉过）
        q = q.gt('created_at', new Date(this.joinAt - 2000).toISOString());
        this._firstPoll = false;
      } else if (this._editSince) {
        q = q.gt('created_at', new Date(this._editSince - 500).toISOString());
      }
      const { data, error } = await q.order('created_at', { ascending: true }).limit(300);
      if (error) return;
      for (const r of data || []) {
        if (!r || r.pid === this.playerId) continue;
        const ts = Date.parse(r.created_at) || 0;
        if (ts > this._editSince) this._editSince = ts;
        if (this.cb.edit) this.cb.edit(r, false); // 世界侧按 (x,y,z) 幂等覆盖，与实时通道不冲突
      }
    } catch (e) { /* 网络抖动忽略 */ }
  }

  /** Realtime 长连异常时的自检提示：若 HTTPS 兜底也没开，明确告诉妈妈要跑脚本。 */
  _maybeWarnRealtime() {
    if (this._realtimeWarned) return;
    this._realtimeWarned = true;
    if (!this.inRoom) return;
    if (this._restOk) {
      this._status('实时连接不太稳定，已自动切换到网络通道，仍可和小伙伴一起玩～');
    } else {
      this._status('⚠️ 多人实时连接被当前网络挡住了：换个网络（如手机热点）再试，或请妈妈在 Supabase 运行一次最新的 multiplayer-setup.sql。');
    }
  }

  /** 合并 WebSocket presence 与 REST 心跳两路名单（同一 pid 以更新更频繁的 WS 为准）。 */
  _mergePresence() {
    if (!this.inRoom) return;
    const byId = new Map();
    for (const p of this._restList) byId.set(p.id, p);
    for (const p of this._wsList) byId.set(p.id, p); // WS 覆盖 REST（位置更实时）
    const list = Array.from(byId.values());
    const nowPids = new Set(list.map((p) => p.id));
    const nameByPid = new Map(list.map((p) => [p.id, p.nickname]));

    if (this.cb.presence) this.cb.presence(list);

    if (this.cb.roster && this._rosterReady) {
      if (this._knownPids === null) {
        this._knownPids = nowPids;
        this.cb.roster({ type: 'snapshot', joined: [], left: [], count: list.length, total: list.length + 1 });
      } else {
        const joined = [];
        const left = [];
        for (const pid of nowPids) {
          if (!this._knownPids.has(pid)) joined.push({ pid, nickname: nameByPid.get(pid) || '小探险家' });
        }
        for (const pid of this._knownPids) {
          if (!nowPids.has(pid)) {
            left.push({ pid, nickname: (this._nameCache && this._nameCache.get(pid)) || '小探险家' });
          }
        }
        this._knownPids = nowPids;
        if (joined.length || left.length) {
          this.cb.roster({ type: 'change', joined, left, count: list.length, total: list.length + 1 });
        } else {
          this.cb.roster({ type: 'count', joined: [], left: [], count: list.length, total: list.length + 1 });
        }
      }
    }
    this._nameCache = nameByPid;
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

  /** 每帧/移动时更新本地坐标与姿势（由 presence 定时上报） */
  updatePos(x, y, z, yaw, pose) {
    this.pos = { x, y, z, yaw, pose: pose || 'stand' };
  }

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
    const code = this.roomCode;
    const pid = this.playerId;
    this.inRoom = false;
    this.roomCode = null;
    this._knownPids = null;
    this._nameCache = null;
    this._rosterReady = false;
    this._acceptEdits = false;
    this._wsList = [];
    this._restList = [];
    this.isRealtimeLive = false;
    this._realtimeWarned = false;
    this._restOk = false;
    this._restTried = false;
    if (this.presenceTimer) { clearInterval(this.presenceTimer); this.presenceTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.editPollTimer) { clearInterval(this.editPollTimer); this.editPollTimer = null; }
    // 主动通知心跳通道立即下线（失败也无妨，15 秒后会自动过期）
    if (code && this.client) { try { this.client.rpc('mp_leave_room', { v_code: code, v_pid: pid }); } catch (e) {} }
    if (this.channel && this.client) { try { this.client.removeChannel(this.channel); } catch (e) {} }
    this.channel = null;
  }
}
