/* 上岸通 · Service Worker (v4)
 * 策略(吸取教训, 恢复「前几天平板秒开」的状态):
 *   - 题库(bank/)与图片(assets/): 「缓存优先 + 后台静默刷新」(stale-while-revalidate)。
 *     命中缓存即时返回(秒开), 同时后台向服务器取最新; 首次打开缓存为空则走网络并写入缓存。
 *     这样首次打开后, 之后每次打开都从本地缓存秒开 —— 与几天前一致。
 *   - 站点外壳(index.html / js/ / css/ / 图标): 同样缓存优先。
 *   - 版本号随每次改动递增, 新 SW 安装时自动清掉旧缓存, 杜绝「旧缓存 serving 已删文件」。
 *   - 注意: 路径匹配用 includes('/bank/') / includes('/assets/'), 兼容 github.io/shangantong/ 子目录。
 */
const CACHE = 'st-bank-v4';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var p = url.pathname;
  // 题库与图片: 缓存优先 + 后台刷新(秒开 + 自动更新)
  if (p.indexOf('/bank/') >= 0 || p.indexOf('/assets/') >= 0) {
    e.respondWith((async function () {
      var cache = await caches.open(CACHE);
      var cached = await cache.match(req);
      if (cached) {
        fetch(req).then(function (r) { if (r && r.ok) cache.put(req, r.clone()); }).catch(function () {});
        return cached;
      }
      try {
        var net = await fetch(req);
        if (net && net.ok) cache.put(req, net.clone());
        return net;
      } catch (err) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // 站点外壳: 缓存优先, 后台更新
  if (!/^\/(js\/|css\/|manifest\.webmanifest|index\.html|icon-192\.png|apple-touch-icon\.png)/.test(p)) return;
  e.respondWith((async function () {
    var cache = await caches.open(CACHE);
    var cached = await cache.match(req);
    if (cached) {
      fetch(req).then(function (r) { if (r && r.ok) cache.put(req, r.clone()); }).catch(function () {});
      return cached;
    }
    try {
      var net = await fetch(req);
      if (net && net.ok) cache.put(req, net.clone());
      return net;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
