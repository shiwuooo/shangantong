/* 上岸通 · 存储层（IndexedDB 主存 + localStorage 兜底 + 一键备份到 D 盘）
 * 关键点：现有代码用同步语义读取，所以 get/set 主路径仍走 localStorage（同步），
 *         同时异步镜像到 IndexedDB（容量更大，避免 5MB 上限爆掉）。
 *         exportBackup/importBackup 负责"一键备份/恢复"。
 */
(function () {
  'use strict';

  const DB_NAME = 'shangAnTongDB';
  const STORE = 'kv';
  const PREFIX = 'shangAnTong'; // 备份时只导出以该前缀开头的 key
  let _db = null;
  let _idbOk = false;

  function idbOpen() {
    return new Promise((resolve) => {
      try {
        if (!('indexedDB' in window)) return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function init() {
    _db = await idbOpen();
    _idbOk = !!_db;
    return _idbOk;
  }

  // 同步读取（localStorage 主路径）
  function get(key) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? null : JSON.parse(v);
    } catch (e) { return null; }
  }

  // 写入：localStorage（同步）+ IndexedDB（异步镜像）
  function set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    if (_idbOk && _db) {
      try {
        const tx = _db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(JSON.stringify(val), key);
      } catch (e) {}
    }
  }

  function keysToBackup() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0) keys.push(k);
    }
    return keys;
  }

  // 一键备份：导出全部 shangAnTong_* 为 JSON 文件（默认下载到浏览器下载目录，用户可存 D 盘）
  function exportBackup() {
    const data = {};
    keysToBackup().forEach(k => {
      try { data[k] = JSON.parse(localStorage.getItem(k)); }
      catch (e) { data[k] = localStorage.getItem(k); }
    });
    const blob = new Blob([JSON.stringify({ app: 'shangAnTong', ts: Date.now(), data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const pad = n => ('0' + n).slice(-2);
    a.href = url;
    a.download = '上岸通备份_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return data;
  }

  // 导入备份
  function importBackup(file, onDone) {
    if (!file) { if (onDone) onDone(false); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        const data = obj.data || obj;
        Object.keys(data).forEach(k => {
          if (typeof data[k] === 'string') localStorage.setItem(k, data[k]);
          else localStorage.setItem(k, JSON.stringify(data[k]));
        });
        if (onDone) onDone(true);
      } catch (e) { if (onDone) onDone(false); }
    };
    reader.readAsText(file);
  }

  window.Store = {
    init, get, set, exportBackup, importBackup,
    get available() { return _idbOk; }
  };
})();
