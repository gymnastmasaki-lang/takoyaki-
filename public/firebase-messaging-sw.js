importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBoSdfEkez-b3P0BUHtowxCrTw-yEBdHSg",
  authDomain: "takoyaki-order-system-bacd7.firebaseapp.com",
  projectId: "takoyaki-order-system-bacd7",
  storageBucket: "takoyaki-order-system-bacd7.firebasestorage.app",
  messagingSenderId: "104494752890",
  appId: "1:104494752890:web:c0a25d62f42ffca01687c3"
});

const messaging = firebase.messaging();

// バックグラウンドメッセージを受信
messaging.onBackgroundMessage((payload) => {
  console.log('バックグラウンドメッセージ受信:', payload);
  
  const notificationTitle = payload.notification?.title || '粉もん屋 八 下赤塚店';
  const notificationOptions = {
    body: payload.notification?.body || '新しい通知があります',
    icon: 'https://img.icons8.com/color/96/000000/Tako.png',
    badge: 'https://img.icons8.com/color/96/000000/Tako.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    tag: 'order-notification-' + Date.now(),
    data: payload.data || {}
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 通知をクリックしたときの処理
self.addEventListener('notificationclick', (event) => {
  console.log('通知クリック:', event);
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/menu.html';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既に開いているウィンドウがあればフォーカス
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes('menu.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新しいウィンドウを開く
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
