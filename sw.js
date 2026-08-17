/* 上岸通 · Service Worker (v3)
 * 策略变更(吸取教训):
 *   - 题库(bank/)与图片(assets/)一律「网络优先」: 永远先向服务器取最新小文件,
 *     只在网络彻底失败时才回退到缓存。杜绝旧版本缓存 serving 已删除的巨无霸文件
 *     导致页面卡在 0% / 打不开。
 *   - 仅站点外壳(index.html / js/ / css/ / 图标)走「缓存优先」, 让二次打开更快。
 */
const CACHE = 'st-bank-v3';

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

  // 题库与图片: 网络优先, 失败回退缓存
  if (/^\/(bank\/|assets\/)/.test(url.pathname)) {
    e.respondWith((async function () {
      try {
        var net = await fetch(req);
        if (net && net.ok) {
          var cache = await caches.open(CACHE);
          cache.put(req, net.clone());
        }
        return net;
      } catch (err) {
        var cache = await caches.open(CACHE);
        var cached = await cache.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  // 站点外壳: 缓存优先, 后台更新
  if (!/^\/(js\/|css\/|manifest\.webmanifest|index\.html|icon-192\.png|apple-touch-icon\.png)/.test(url.pathname)) return;
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
