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
