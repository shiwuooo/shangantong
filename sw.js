// 上岸通 · Service Worker（已停用）
// 站点改为依赖浏览器原生 HTTP 缓存，不再需要 SW。
// 此文件仅用于在已注册旧 SW 的设备上「自我注销」，避免旧缓存继续干扰加载。
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil(
    self.registration.unregister().then(function () {
      return self.clients.matchAll({ includeUncontrolled: true }).then(function (clients) {
        clients.forEach(function (c) { try { c.postMessage('sw-unregistered'); } catch (e) {} });
      });
    })
  );
});
