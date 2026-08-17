/* 上岸通 · Service Worker
 * 首次加载题库/bank 文件时顺带缓存，之后打开秒开（平板多设备复用友好）
 * 策略：同域的 bank/ js/ css/ assets/ 走 "缓存优先，后台更新"（network fallback → 首次填缓存）
 */
const CACHE = 'st-bank-v2';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  // 清理旧版本缓存
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

  // 仅缓存站点静态资源与题库
  if (!/^\/(bank\/|js\/|css\/|assets\/|manifest\.webmanifest|index\.html|icon-192\.png|apple-touch-icon\.png)/.test(url.pathname)) return;

  e.respondWith((async function () {
    var cache = await caches.open(CACHE);
    var cached = await cache.match(req);
    if (cached) {
      // 后台用网络更新缓存（不阻塞响应）
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
