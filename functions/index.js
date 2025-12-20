const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

// 注文完了時の通知
exports.sendOrderNotification = onDocumentUpdated("orders/{orderId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();
  
  // completedAt が追加された = 注文完了
  if (!beforeData.completedAt && afterData.completedAt) {
    const tableNumber = afterData.tableNumber;
    
    // FCMトークンを取得
    const tokenDoc = await admin.firestore().collection('fcm_tokens').doc(tableNumber).get();
    
    if (!tokenDoc.exists) {
      console.log('FCMトークンが見つかりません:', tableNumber);
      return;
    }
    
    const token = tokenDoc.data().token;
    
    const message = {
      notification: {
        title: '🎉 商品ができ上がりました!',
        body: `注文番号 #${afterData.orderNumber}\n画面の番号を店員にお見せください`
      },
      data: {
        type: 'completed',
        orderNumber: String(afterData.orderNumber)
      },
      token: token
    };
    
    try {
      await admin.messaging().send(message);
      console.log('通知送信成功:', afterData.orderNumber);
    } catch (error) {
      console.error('通知送信エラー:', error);
    }
  }
  
  // キャンセル時の通知
  if (!beforeData.cancelledAt && afterData.cancelledAt) {
    const tableNumber = afterData.tableNumber;
    const tokenDoc = await admin.firestore().collection('fcm_tokens').doc(tableNumber).get();
    
    if (tokenDoc.exists) {
      const message = {
        notification: {
          title: '❌ 注文がキャンセルされました',
          body: `注文番号 #${afterData.orderNumber}\n番号をお呼びしましたがご不在でした`
        },
        data: {
          type: 'cancelled',
          orderNumber: String(afterData.orderNumber)
        },
        token: tokenDoc.data().token
      };
      
      try {
        await admin.messaging().send(message);
      } catch (error) {
        console.error('キャンセル通知エラー:', error);
      }
    }
  }
  
  // お会計完了時の通知
  if (!beforeData.paidAt && afterData.paidAt) {
    const tableNumber = afterData.tableNumber;
    const tokenDoc = await admin.firestore().collection('fcm_tokens').doc(tableNumber).get();
    
    if (tokenDoc.exists) {
      const message = {
        notification: {
          title: '💳 お会計完了',
          body: '商品ができ上がりましたらお呼びします'
        },
        data: {
          type: 'paid',
          orderNumber: String(afterData.orderNumber)
        },
        token: tokenDoc.data().token
      };
      
      try {
        await admin.messaging().send(message);
      } catch (error) {
        console.error('お会計通知エラー:', error);
      }
    }
  }
});