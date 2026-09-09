/**
 * save.js - 存档系统
 *
 * 方案 A：localStorage 本地自动存档（同设备无感恢复）
 * 方案 C：导出 / 导入 JSON 存档文件（手动备份，可跨设备搬运）
 *
 * 存档数据结构：
 * {
 *   version: 存档版本号（地形算法改动后递增，不兼容时提示），
 *   seed: 世界种子，
 *   savedAt: 保存时间戳，
 *   player: { x,y,z, yaw, pitch },
 *   hotbar: [9 个槽位的方块类型，空槽为 0]，
 *   selectedSlot: 当前选中槽位，
 *   fov: 视野，
 *   edits: { "chunkX,chunkZ": [[packedLocal, type], ...] }  // 玩家方块改动
 * }
 */

const STORAGE_KEY = 'voxel_world_save_v1';
export const SAVE_VERSION = 1;

/** 读取本地存档；没有或损坏时返回 null */
export function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (data.version !== SAVE_VERSION) {
      console.warn('[save] 存档版本不匹配，忽略旧存档', data.version);
      return null;
    }
    return data;
  } catch (e) {
    console.error('[save] 读取存档失败', e);
    return null;
  }
}

/** 写入本地存档（localStorage 满了会捕获并告警） */
export function writeSave(data) {
  try {
    data.version = SAVE_VERSION;
    data.savedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('[save] 写入存档失败（可能存储空间已满）', e);
    return false;
  }
}

/** 删除本地存档（重新开新世界） */
export function clearSave() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
}

/** 是否存在本地存档 */
export function hasSave() {
  try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
}

/**
 * 导出存档为 .json 文件下载
 * @param {object} data 存档数据
 * @param {string} [filename]
 */
export function exportSave(data, filename) {
  const payload = { ...data, version: SAVE_VERSION, savedAt: Date.now(), exported: true };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = filename || `voxel-save-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}.json`;
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 从文件导入存档
 * @param {File} file
 * @returns {Promise<object|null>} 解析后的存档数据；失败返回 null
 */
export function importSave(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || typeof data !== 'object' || typeof data.seed !== 'number') {
          resolve(null);
          return;
        }
        if (data.version !== SAVE_VERSION) {
          console.warn('[save] 导入的存档版本不匹配', data.version);
        }
        resolve(data);
      } catch (e) {
        console.error('[save] 导入存档解析失败', e);
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}
