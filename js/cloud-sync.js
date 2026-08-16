/* 上岸通 · GitHub 云同步
 * 用你自己的 GitHub 私有仓库做云端存档，跨设备(平板/手机/PC)同步学习数据。
 * 同步内容：localStorage 全量镜像（进度/错题/收藏/演草等），不含本模块的配置键(cs_)。
 * 数据只存到你本人的私有仓库，不经过任何第三方。
 * 依赖 window.Store（store.js）。
 */
(function () {
  'use strict';

  var API = 'https://api.github.com';
  var DEFAULT_REPO = 'shangantong-sync';
  var SYNC_PATH = 'sync/snapshot.json';
  var MAX_BYTES = 900 * 1024; // Contents API 单文件上限约 1MB，留余量

  function storeGet(k) {
    try { return window.Store ? window.Store.get(k) : JSON.parse(localStorage.getItem(k) || 'null'); }
    catch (e) { return null; }
  }
  function storeSet(k, v) {
    try { if (window.Store) window.Store.set(k, v); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  function getToken() { return storeGet('cs_token') || ''; }
  function setToken(t) { storeSet('cs_token', t); }
  function getRepo() { return storeGet('cs_repo') || DEFAULT_REPO; }
  function setRepo(r) { storeSet('cs_repo', r || DEFAULT_REPO); }
  function getAuto() { return !!storeGet('cs_auto'); }
  function setAuto(b) { storeSet('cs_auto', !!b); }
  function getLastSync() { return storeGet('cs_last') || 0; }
  function setLastSync(t) { storeSet('cs_last', t); }

  function headers(token, extra) {
    var h = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'shangantong-sync'
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function b64encodeUnicode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64decodeUnicode(str) {
    return decodeURIComponent(escape(atob(str.replace(/\s/g, ''))));
  }

  // 收集本地全部数据（排除本模块配置键 cs_）
  function collect() {
    var data = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;
      if (key.indexOf('cs_') === 0) continue; // 不同步配置本身
      try { data[key] = JSON.parse(localStorage.getItem(key)); }
      catch (e) { data[key] = localStorage.getItem(key); }
    }
    return { v: 1, updatedAt: Date.now(), device: (navigator.userAgent || '').slice(0, 48), data: data };
  }

  function getOwner(token) {
    return fetch(API + '/user', { headers: headers(token) }).then(function (r) {
      if (!r.ok) throw new Error('Token 无效或权限不足(' + r.status + ')');
      return r.json();
    }).then(function (u) { return u.login; });
  }

  function ensureRepo(token, owner, repo) {
    return fetch(API + '/repos/' + owner + '/' + repo, { headers: headers(token) }).then(function (r) {
      if (r.status === 200) return true;
      if (r.status === 404) {
        return fetch(API + '/user/repos', {
          method: 'POST', headers: headers(token),
          body: JSON.stringify({ name: repo, private: true, auto_init: true, description: '上岸通云端存档(自动创建)' })
        }).then(function (c) {
          if (!c.ok) throw new Error('创建私有仓库失败(' + c.status + ')');
          return new Promise(function (res) { setTimeout(res, 1500); }); // 等 auto_init 完成
        });
      }
      throw new Error('仓库检查失败(' + r.status + ')');
    });
  }

  // 上传本地 -> 云端
  function push() {
    var token = getToken();
    if (!token) throw new Error('请先填写 GitHub Token');
    var repo = getRepo();
    var snapshot = collect();
    var raw = JSON.stringify(snapshot);
    if (raw.length > MAX_BYTES) throw new Error('数据超过 ' + (MAX_BYTES / 1024 | 0) + 'KB，无法单文件同步（请清理或联系开发者）');
    var content = b64encodeUnicode(raw);
    return getOwner(token).then(function (owner) {
      return ensureRepo(token, owner, repo).then(function () {
        return fetch(API + '/repos/' + owner + '/' + repo + '/contents/' + SYNC_PATH, { headers: headers(token) });
      }).then(function (r) {
        var sha = null;
        if (r.status === 200) return r.json().then(function (j) { sha = j.sha; return sha; });
        if (r.status === 404) return null;
        throw new Error('读取云端失败(' + r.status + ')');
      }).then(function (sha) {
        var body = { message: 'sync push ' + new Date().toISOString(), content: content };
        if (sha) body.sha = sha;
        return fetch(API + '/repos/' + owner + '/' + repo + '/contents/' + SYNC_PATH, {
          method: 'PUT', headers: headers(token), body: JSON.stringify(body)
        });
      }).then(function (r) {
        if (!r.ok) throw new Error('上传失败(' + r.status + ')');
        setLastSync(snapshot.updatedAt);
        return snapshot.updatedAt;
      });
    });
  }

  // 云端 -> 本地（合并：本地缺失的键从云端补回；都有的以云端覆盖，保证云端为最新）
  function pull() {
    var token = getToken();
    if (!token) throw new Error('请先填写 GitHub Token');
    var repo = getRepo();
    return getOwner(token).then(function (owner) {
      return fetch(API + '/repos/' + owner + '/' + repo + '/contents/' + SYNC_PATH, { headers: headers(token) });
    }).then(function (r) {
      if (r.status === 404) throw new Error('云端暂无存档，请先“上传到云端”');
      if (!r.ok) throw new Error('拉取失败(' + r.status + ')');
      return r.json();
    }).then(function (j) {
      var text = b64decodeUnicode(j.content);
      var remote = JSON.parse(text);
      var data = remote.data || {};
      var n = 0;
      for (var k in data) {
        if (k.indexOf('cs_') === 0) continue;
        storeSet(k, data[k]);
        n++;
      }
      setLastSync(remote.updatedAt || Date.now());
      return { count: n, updatedAt: remote.updatedAt };
    });
  }

  // 自动同步：包装 Store.set 监听变更，防抖上传
  var _dirty = false, _timer = null, _origSet = null;
  function installAuto() {
    if (!window.Store || _origSet) return;
    _origSet = window.Store.set;
    window.Store.set = function (k, v) {
      var r = _origSet(k, v);
      if (getAuto() && k.indexOf('cs_') !== 0) {
        _dirty = true;
        if (_timer) clearTimeout(_timer);
        _timer = setTimeout(function () {
          if (!_dirty) return;
          _dirty = false;
          if (!getToken()) return;
          push().then(function () { if (window.CloudSync && CloudSync._onStatus) CloudSync._onStatus('已自动上传 ' + new Date().toLocaleString()); })
            .catch(function (e) { if (window.CloudSync && CloudSync._onStatus) CloudSync._onStatus('自动上传失败: ' + e.message); });
        }, 20000);
      }
      return r;
    };
  }

  // 启动时若开启自动，则先拉取云端（云端较新则覆盖本地）
  function autoStart() {
    if (!getAuto() || !getToken()) return;
    pull().then(function (r) {
      if (window.CloudSync && CloudSync._onStatus) CloudSync._onStatus('已自动从云端恢复 ' + r.count + ' 项');
    }).catch(function (e) {
      if (window.CloudSync && CloudSync._onStatus) CloudSync._onStatus('自动恢复跳过: ' + e.message);
    });
  }

  window.CloudSync = {
    push: push, pull: pull,
    getToken: getToken, setToken: setToken,
    getRepo: getRepo, setRepo: setRepo,
    getAuto: getAuto, setAuto: setAuto,
    getLastSync: getLastSync,
    installAuto: installAuto, autoStart: autoStart,
    _onStatus: null
  };

  // 初始化
  if (window.Store && window.Store.init) {
    window.Store.init().then(function () { installAuto(); autoStart(); });
  } else {
    installAuto();
  }

  // UI 绑定（设置页的云同步卡片）
  function fmtTime(t) {
    if (!t) return '从未';
    var d = new Date(t);
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function setStatus(msg, isErr) {
    var el = document.getElementById('csStatus');
    if (el) { el.textContent = msg; el.style.color = isErr ? '#c0392b' : '#2e7d32'; }
  }
  window.CloudSync._onStatus = function (msg) { setStatus(msg, false); };

  function bindUI() {
    var tk = document.getElementById('csToken');
    var rp = document.getElementById('csRepo');
    var au = document.getElementById('csAuto');
    if (!tk) return; // 设置页未渲染
    tk.value = getToken();
    rp.value = getRepo();
    au.checked = getAuto();
    setStatus('最后同步：' + fmtTime(getLastSync()));

    document.getElementById('csSave').addEventListener('click', function () {
      setToken(tk.value.trim());
      setRepo(rp.value.trim());
      setAuto(au.checked);
      setStatus('配置已保存', false);
    });
    document.getElementById('csAuto').addEventListener('change', function () {
      setAuto(au.checked);
      if (au.checked) { installAuto(); autoStart(); }
    });
    document.getElementById('csPush').addEventListener('click', function () {
      setToken(tk.value.trim()); setRepo(rp.value.trim()); setAuto(au.checked);
      setStatus('上传中…', false);
      push().then(function (t) { setStatus('已上传 ' + fmtTime(t), false); })
        .catch(function (e) { setStatus('上传失败: ' + e.message, true); });
    });
    document.getElementById('csPull').addEventListener('click', function () {
      setToken(tk.value.trim()); setRepo(rp.value.trim()); setAuto(au.checked);
      setStatus('恢复中…', false);
      pull().then(function (r) { setStatus('已恢复 ' + r.count + ' 项 (' + fmtTime(r.updatedAt) + ')', false); })
        .catch(function (e) { setStatus('恢复失败: ' + e.message, true); });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUI);
  } else {
    bindUI();
  }
})();
