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

messaging.onBackgroundMessage((payload) => {
  console.log('バックグラウンドメッセージ受信:', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/icon.png',
    data: {
      url: payload.data?.url || '/'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 通知をクリックした時の処理
self.addEventListener('notificationclick', function(event) {
  console.log('通知がクリックされました:', event);
  event.notification.close();
  
  // 通知に含まれるURLを取得（なければルートページ）
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // 既に開いているタブがあるか確認
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(urlToOpen.split('?')[0]) && 'focus' in client) {
          return client.focus();
        }
      }
      // 開いているタブがなければ新しいタブで開く
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

