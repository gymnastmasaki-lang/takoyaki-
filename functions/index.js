<<<<<<< HEAD
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
=======
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// 注文が更新された時の処理
exports.sendOrderNotification = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    
    const orderId = context.params.orderId;
    const tableNumber = newData.tableNumber;
    
    console.log(`注文更新検知: ${orderId}, テーブル: ${tableNumber}`);
    
    // そのテーブルのFCMトークンを取得
    const tokenDoc = await admin.firestore()
      .collection('fcm_tokens')
      .doc(tableNumber)
      .get();
    
    if (!tokenDoc.exists) {
      console.log('FCMトークンが見つかりません:', tableNumber);
      return null;
    }
    
    const fcmToken = tokenDoc.data().token;
    console.log('FCMトークン取得成功:', fcmToken);
    
    // 完了ステータスに変更された場合
    if (newData.status === 'completed' && oldData.status !== 'completed' && !newData.notifiedComplete) {
      console.log('🎉 注文完了通知を送信します');
      
      const message = {
        notification: {
          title: '🎉 商品が出来上がりました!',
          body: `注文番号 #${newData.orderNumber} の商品が完成しました。画面の注文番号を店員にお見せください。`,
          icon: '/icon.png'
        },
        data: {
          type: 'completed',
          orderNumber: String(newData.orderNumber),
          orderId: orderId,
          click_action: 'https://gymnastmasaki-lang.github.io/takoyaki-/'
        },
        token: fcmToken
      };
      
      try {
        const response = await admin.messaging().send(message);
        console.log('✅ プッシュ通知送信成功:', response);
        
        // 通知送信済みフラグを立てる
        await admin.firestore()
          .collection('orders')
          .doc(orderId)
          .update({ notifiedComplete: true });
        
        return response;
      } catch (error) {
        console.error('❌ プッシュ通知送信エラー:', error);
        return null;
      }
    }
    
    // キャンセルされた場合
    if (newData.cancelledAt && !oldData.cancelledAt && !newData.notifiedCancel) {
      console.log('❌ キャンセル通知を送信します');
      
      const message = {
        notification: {
          title: '❌ 注文がキャンセルされました',
          body: `注文番号 #${newData.orderNumber} がキャンセルされました。番号をお呼びしましたがご不在でしたので注文をキャンセルさせて頂きました。`,
          icon: '/icon.png'
        },
        data: {
          type: 'cancelled',
          orderNumber: String(newData.orderNumber),
          orderId: orderId,
          click_action: 'https://gymnastmasaki-lang.github.io/takoyaki-/'
        },
        token: fcmToken
      };
      
      try {
        const response = await admin.messaging().send(message);
        console.log('✅ キャンセル通知送信成功:', response);
        
        // 通知送信済みフラグを立てる
        await admin.firestore()
          .collection('orders')
          .doc(orderId)
          .update({ notifiedCancel: true });
        
        return response;
      } catch (error) {
        console.error('❌ キャンセル通知送信エラー:', error);
        return null;
      }
    }
    
    // お会計完了の場合
    if (newData.paidAt && !oldData.paidAt && !newData.notifiedPaid) {
      console.log('💳 お会計完了通知を送信します');
      
      const message = {
        notification: {
          title: '💳 お会計完了',
          body: `お会計が完了しました。商品が出来上がりましたらお呼びしますので、しばらくお待ちください。`,
          icon: '/icon.png'
        },
        data: {
          type: 'paid',
          orderNumber: String(newData.orderNumber),
          orderId: orderId,
          click_action: 'https://gymnastmasaki-lang.github.io/takoyaki-/'
        },
        token: fcmToken
      };
      
      try {
        const response = await admin.messaging().send(message);
        console.log('✅ お会計通知送信成功:', response);
        
        // 通知送信済みフラグを立てる
        await admin.firestore()
          .collection('orders')
          .doc(orderId)
          .update({ notifiedPaid: true });
        
        return response;
      } catch (error) {
        console.error('❌ お会計通知送信エラー:', error);
        return null;
      }
    }
    
    return null;
  });
>>>>>>> 088e8fea1eb3f1dfce68c966a5ee71868d2ebda2
