/* 上岸通 · Service Worker
 * 策略：
 *  - 安装时预缓存「应用外壳」（HTML/CSS/核心JS），保证首屏立即可用；
 *  - 运行时对所有同源 GET 请求做「缓存优先 + 后台更新」（stale-while-revalidate），
 *    题库(bank/*.js) 首次访问后即被缓存，之后离线也能刷题；
 *  - 跨域请求与 POST 等不拦截，直接走网络；
 *  - 版本号变更时清空旧缓存（题库更新请同步 +1 本版本号）。
 */
var CACHE = 'shangantong-v1';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './css/mock-exam.css',
  './css/features.css',
  './css/pad.css',
  './js/scratchpad.js',
  './js/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL).catch(function () {});
    }).then(function () { return self.skipWaiting(); })
  );
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
  if (url.origin !== self.location.origin) return; // 不缓存跨域
  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type !== 'opaque') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
