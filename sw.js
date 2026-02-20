// ============================================================
//  Service Worker — オフライン完全対応
//  キャッシュ戦略:
//    Firebase CDN → Cache First（更新されないので永続キャッシュ）
//    HTMLファイル  → Network First（最新を取りつつ、失敗時はキャッシュ）
// ============================================================

const CACHE_NAME = 'takoyaki-app-v1';

// 起動時に必ずキャッシュするファイル（Firebase SDKはCDNなので全部キャッシュ）
const PRECACHE_URLS = [
  '/pos.html',
  '/handy.html',
  '/controller.html',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
];

// ============================================================
// インストール時: 全ファイルを事前キャッシュ
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] インストール開始');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 事前キャッシュ開始');
      // 個別にキャッシュ（1つ失敗しても止まらないように）
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] キャッシュ失敗:', url, err))
        )
      );
    }).then(() => {
      console.log('[SW] 事前キャッシュ完了');
      return self.skipWaiting(); // 即座にアクティブ化
    })
  );
});

// ============================================================
// アクティブ化時: 古いキャッシュを削除
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] アクティブ化');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] 古いキャッシュ削除:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================================
// フェッチ時のキャッシュ戦略
// ============================================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Firebase CDN (gstatic.com) → Cache First
  // SDKは同じバージョンなら変わらないので永続キャッシュOK
  if (url.hostname === 'www.gstatic.com') {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Firestore/Auth API通信はスルー（SW介入しない）
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com')
  ) {
    return; // Firebaseが自前でオフライン処理するので任せる
  }

  // HTMLファイル → Network First（最新優先、失敗時はキャッシュ）
  if (
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html')
  ) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // その他 → Cache First
  event.respondWith(cacheFirst(event.request));
});

// ============================================================
// キャッシュ戦略の実装
// ============================================================

// Network First: まずネット、失敗したらキャッシュ
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // 成功したらキャッシュも更新
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.log('[SW] ネット失敗、キャッシュから返却:', request.url);
    const cached = await caches.match(request);
    if (cached) return cached;
    // キャッシュもなければオフラインページを返す
    return new Response(
      offlineFallbackHTML(),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// Cache First: まずキャッシュ、なければネット
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn('[SW] キャッシュもネットも失敗:', request.url);
    return new Response('', { status: 408 });
  }
}

// ============================================================
// 緊急オフラインページ（HTMLもキャッシュにない最悪ケース）
// ============================================================
function offlineFallbackHTML() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>オフライン</title>
  <style>
    body {
      font-family: sans-serif;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
      background: #1a1a2e; color: white; text-align: center; padding: 20px;
    }
    .icon { font-size: 80px; margin-bottom: 20px; }
    h1 { font-size: 28px; margin-bottom: 12px; }
    p { font-size: 16px; color: #aaa; margin-bottom: 8px; }
    .btn {
      margin-top: 24px; padding: 14px 32px;
      background: #e74c3c; color: white; border: none;
      border-radius: 8px; font-size: 16px; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="icon">📡</div>
  <h1>オフライン中</h1>
  <p>ネットワークに接続できません。</p>
  <p>一度ページを開いていれば、再読込で復旧します。</p>
  <button class="btn" onclick="location.reload()">🔄 再読込</button>
</body>
</html>`;
}
