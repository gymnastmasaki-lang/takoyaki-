// ========== レシート・領収書表示システム（Firestore版）v5 ==========

// QRCodeライブラリの読み込み確認と動的ロード
(function() {
  if (typeof QRCode === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.async = false; // 同期的に読み込む
    document.head.appendChild(script);
    console.log('📚 QRCodeライブラリを読み込み中...');
  }
  
  if (typeof html2canvas === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.async = false; // 同期的に読み込む
    document.head.appendChild(script);
    console.log('📚 html2canvasライブラリを読み込み中...');
  }
})();

// レシート表示関数
async function showReceiptDisplay(receiptData) {
  console.log('📄 ==== レシート表示開始 ====');
  console.log('🔍 受信データ:', receiptData);
  console.log('🔢 注文番号:', receiptData.orderNumber || receiptData.orderNum);
  console.log('🛍️ レジ袋情報チェック - bagNeeded:', receiptData.bagNeeded, 'bagQuantity:', receiptData.bagQuantity, 'bagPrice:', receiptData.bagPrice);
  
  // 既存のモーダルを削除
  const existingModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
  console.log('🗑️ 既存モーダル削除:', existingModals.length);
  existingModals.forEach(el => el.remove());
  
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // レシート設定をFirestoreから読み込み
  let receiptStoreName = '粉もん屋 八 下赤塚店';
  let receiptAddress = '東京都板橋区赤塚2-2-4';
  let receiptPhone = 'TEL: 03-6904-2888';
  let receiptMessage1 = 'ご来店ありがとうございました';
  let receiptMessage2 = 'またのお越しをお待ちしております';
  
  try {
    const storeId = window.currentStoreId;
    let receiptSettingsRef;
    
    if (!storeId || storeId === '') {
      receiptSettingsRef = window.doc(window.db, 'receipt_settings', 'shimoakatsuka');
    } else {
      receiptSettingsRef = window.doc(window.db, 'stores', storeId, 'receipt_settings', 'default');
    }
    
    const receiptSettingsDoc = await window.getDoc(receiptSettingsRef);
    
    if (receiptSettingsDoc.exists()) {
      const settings = receiptSettingsDoc.data();
      
      if (settings.storeName && settings.branchName) {
        receiptStoreName = settings.storeName + ' ' + settings.branchName;
      } else if (settings.branchName) {
        receiptStoreName = settings.branchName;
      } else if (settings.storeName) {
        receiptStoreName = settings.storeName;
      }
      
      if (settings.postalCode && settings.address) {
        receiptAddress = settings.postalCode + ' ' + settings.address;
      } else if (settings.address) {
        receiptAddress = settings.address;
      }
      
      if (settings.phone) {
        receiptPhone = 'TEL: ' + settings.phone;
      }
      
      if (settings.message) {
        // 全行を取得（無制限）
        receiptMessage1 = settings.message;
        receiptMessage2 = ''; // 使用しない
      }
    }
  } catch (error) {
    console.error('❌ レシート設定読み込みエラー:', error);
  }
  
  // 日時フォーマット
  const now = new Date(receiptData.timestamp || Date.now());
  const dateStr = now.getFullYear() + '/' + 
                  String(now.getMonth() + 1).padStart(2, '0') + '/' + 
                  String(now.getDate()).padStart(2, '0') + ' ' +
                  String(now.getHours()).padStart(2, '0') + ':' + 
                  String(now.getMinutes()).padStart(2, '0');
  
  let orderNum = receiptData.orderNumber || receiptData.orderNum || 'なし';
  console.log('🔢 注文番号:', orderNum);
  
  // 商品リストHTML生成（基本価格とトッピングを縦に個別表示し、最後に合計を表示）
  let itemsHtml = '';
  if (receiptData.items && Array.isArray(receiptData.items) && receiptData.items.length > 0) {
    receiptData.items.forEach(item => {
      // 基本価格を計算
      let basePricePerUnit = item.basePrice || item.price;
      
      // トッピング詳細がある場合、トッピング価格の合計を計算
      let toppingTotalPrice = 0;
      if (item.toppingDetails && Array.isArray(item.toppingDetails) && item.toppingDetails.length > 0) {
        item.toppingDetails.forEach(topping => {
          toppingTotalPrice += topping.price || 0;
        });
      } else if (item.toppingsData && Array.isArray(item.toppingsData) && item.toppingsData.length > 0) {
        item.toppingsData.forEach(topping => {
          toppingTotalPrice += topping.price || 0;
        });
      } else if (item.toppingsList && Array.isArray(item.toppingsList) && item.toppingsList.length > 0) {
        item.toppingsList.forEach(topping => {
          toppingTotalPrice += topping.price || 0;
        });
      } else if (item.toppingPrice) {
        toppingTotalPrice = item.toppingPrice;
      }
      
      // basePriceがない場合、item.priceからトッピング価格を引く
      if (!item.basePrice && toppingTotalPrice > 0 && item.price > toppingTotalPrice) {
        basePricePerUnit = item.price - toppingTotalPrice;
      }
      
      // 合計金額を計算（基本価格 + トッピング価格）× 数量
      const itemTotal = (basePricePerUnit + toppingTotalPrice) * item.quantity;
      
      itemsHtml += `
        <div style="margin: 12px 0; padding-bottom: 8px; border-bottom: 1px dashed #ddd;">
      `;
      
      // 基本価格を表示
      itemsHtml += `
        <div style="font-size: 13px; color: #333; margin-bottom: 2px; display: flex; justify-content: space-between;">
          <span>${item.name} × ${item.quantity}</span>
          <span>¥${basePricePerUnit.toLocaleString()}</span>
        </div>
      `;
      
      // toppingDetails配列がある場合（新POS形式）
      if (item.toppingDetails && Array.isArray(item.toppingDetails) && item.toppingDetails.length > 0) {
        item.toppingDetails.forEach(topping => {
          const price = topping.price || 0;
          itemsHtml += `
            <div style="font-size: 13px; color: #333; margin-top: 2px; display: flex; justify-content: space-between;">
              <span>${topping.optionName}</span>
              <span>¥${price.toLocaleString()}</span>
            </div>
          `;
        });
      }
      // toppingsData配列がある場合（menu.htmlから）
      else if (item.toppingsData && Array.isArray(item.toppingsData) && item.toppingsData.length > 0) {
        item.toppingsData.forEach(topping => {
          const price = topping.price || 0;
          itemsHtml += `
            <div style="font-size: 13px; color: #333; margin-top: 2px; display: flex; justify-content: space-between;">
              <span>${topping.name}</span>
              <span>¥${price.toLocaleString()}</span>
            </div>
          `;
        });
      }
      // toppingsList配列がある場合（別のPOS形式）
      else if (item.toppingsList && Array.isArray(item.toppingsList) && item.toppingsList.length > 0) {
        item.toppingsList.forEach(topping => {
          const price = topping.price || 0;
          itemsHtml += `
            <div style="font-size: 13px; color: #333; margin-top: 2px; display: flex; justify-content: space-between;">
              <span>${topping.name}</span>
              <span>¥${price.toLocaleString()}</span>
            </div>
          `;
        });
      }
      // トッピング文字列のみの場合（カンマ区切りを縦に並べる）
      else if (item.toppings && item.toppings !== 'なし' && item.toppings !== '') {
        // カンマ区切りの文字列を配列に分割
        const toppingArray = item.toppings.split(',').map(t => t.trim()).filter(t => t);
        if (toppingArray.length > 0) {
          toppingArray.forEach(toppingName => {
            itemsHtml += `
              <div style="font-size: 13px; color: #333; margin-top: 2px; display: flex; justify-content: space-between;">
                <span>${toppingName}</span>
                <span></span>
              </div>
            `;
          });
        } else {
          itemsHtml += `<div style="font-size: 12px; color: #666; margin-top: 4px; font-style: italic;">トッピング: ${item.toppings}</div>`;
        }
      }
      
      // 合計金額を表示
      itemsHtml += `
        <div style="font-size: 14px; font-weight: bold; margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee; display: flex; justify-content: space-between;">
          <span>合計</span>
          <span>¥${itemTotal.toLocaleString()}</span>
        </div>
      `;
      
      itemsHtml += `</div>`;
    });
  }
  
  // 🛍️ レジ袋情報を追加
  console.log('🛍️ レジ袋情報チェック開始');
  console.log('🛍️ bagNeeded:', receiptData.bagNeeded, typeof receiptData.bagNeeded);
  console.log('🛍️ bagQuantity:', receiptData.bagQuantity, typeof receiptData.bagQuantity);
  console.log('🛍️ bagPrice:', receiptData.bagPrice, typeof receiptData.bagPrice);
  
  if (receiptData.bagNeeded === true || receiptData.bagNeeded === 'true') {
    const bagQuantity = receiptData.bagQuantity || 1;
    const bagPrice = receiptData.bagPrice || 5;
    const bagTotal = bagQuantity * bagPrice;
    
    console.log('🛍️ レジ袋追加 - 数量:', bagQuantity, '単価:', bagPrice, '合計:', bagTotal);
    
    itemsHtml += `
      <div style="margin: 12px 0; padding-bottom: 8px; border-bottom: 1px dashed #ddd;">
        <div style="font-size: 13px; color: #333; margin-bottom: 2px; display: flex; justify-content: space-between;">
          <span>レジ袋 × ${bagQuantity}</span>
          <span>¥${bagPrice.toLocaleString()}</span>
        </div>
        <div style="font-size: 14px; font-weight: bold; margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee; display: flex; justify-content: space-between;">
          <span>合計</span>
          <span>¥${bagTotal.toLocaleString()}</span>
        </div>
      </div>
    `;
  } else {
    console.log('🛍️ レジ袋は不要');
  }
  
  // 支払い方法の判定（優先度: 1. paymentMethod, 2. paymentType, 3. デフォルト）
  let paymentMethodText = '現金';
  if (receiptData.paymentMethod) {
    paymentMethodText = receiptData.paymentMethod;
  } else if (receiptData.paymentType) {
    // paymentTypeが 'cash', 'card', 'paypay' などの場合、適切な日本語に変換
    const paymentTypeMap = {
      'cash': '現金',
      'card': 'クレジットカード',
      'paypay': 'PayPay',
      'linepay': 'LINE Pay',
      'creditcard': 'クレジットカード',
      'debitcard': 'デビットカード',
      'other': 'その他'
    };
    paymentMethodText = paymentTypeMap[receiptData.paymentType.toLowerCase()] || receiptData.paymentType;
  }
  console.log('💳 支払い方法:', paymentMethodText, '(元データ - paymentMethod:', receiptData.paymentMethod, ', paymentType:', receiptData.paymentType, ')');
  
  const totalAmount = receiptData.totalAmount || 0;
  const tax = receiptData.tax || 0;
  const subtotal = totalAmount - tax;
  
  // 領収書作成ボタンを表示するか（qrUrl がない または storeId がない または firebase を使用していない場合は非表示）
  const qrUrl = receiptData.qrUrl;
  const showInvoiceButton = !!qrUrl && !!window.currentStoreId && typeof window.db !== 'undefined';
  console.log('🧾 領収書ボタン表示:', showInvoiceButton, '(qrUrl:', !!qrUrl, ', storeId:', !!window.currentStoreId, ', firebase:', typeof window.db !== 'undefined', ')');
  
  const modalId = 'receiptDisplayModal_' + Date.now();
  const modal = document.createElement('div');
  modal.id = modalId;
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 99999999; display: flex; align-items: center; justify-content: center; overflow-y: auto;';
  
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; padding: 30px; max-width: 500px; width: 95%; margin: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
      <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #333;">
        <div style="font-size: 20px; font-weight: bold; margin-bottom: 8px;">${receiptStoreName}</div>
        <div style="font-size: 13px; color: #666;">${receiptAddress}</div>
        <div style="font-size: 13px; color: #666;">${receiptPhone}</div>
      </div>
      
      <div style="padding: 20px 0; border-bottom: 1px solid #ddd;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px;">
          <span>日時:</span>
          <span>${dateStr}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;">
          <span>注文番号:</span>
          <span style="font-weight: bold;">${orderNum}</span>
        </div>
      </div>
      
      <div style="padding: 20px 0; border-bottom: 2px solid #333;">
        ${itemsHtml}
      </div>
      
      <div style="padding: 20px 0; border-bottom: 2px solid #333;">
        <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px;">
          <span>小計:</span>
          <span>¥${subtotal.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 12px;">
          <span>消費税 (10%):</span>
          <span>¥${tax.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold;">
          <span>合計:</span>
          <span style="color: #e74c3c;">¥${totalAmount.toLocaleString()}</span>
        </div>
      </div>
      
      <div style="padding: 20px 0; border-bottom: 1px solid #ddd;">
        <div style="display: flex; justify-content: space-between; font-size: 14px;">
          <span>支払い方法:</span>
          <span style="font-weight: bold;">${paymentMethodText}</span>
        </div>
      </div>
      
      <div style="padding: 20px 0; text-align: center; font-size: 14px; color: #666; line-height: 1.8; white-space: pre-wrap;">
${receiptMessage1}${receiptMessage2 ? '\n' + receiptMessage2 : ''}
      </div>
      
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        ${showInvoiceButton ? `
          <button onclick="playTapSound(); showInvoiceDisplay('${qrUrl}')" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: bold; cursor: pointer;">
            領収書
          </button>
        ` : ''}
        ${qrUrl ? `
          <button onclick="playTapSound(); generateAndShowQR('${modalId}', '${qrUrl}')" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: bold; cursor: pointer;">
            QRコード
          </button>
        ` : ''}
        <button onclick="playTapSound(); closeReceiptModal('${modalId}')" style="flex: 1; padding: 15px; background: #666; color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: bold; cursor: pointer;">
          閉じる
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  console.log('✅ レシート表示完了');
  
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeReceiptModal(modalId);
    }
  });
}

// 領収書表示関数
async function showInvoiceDisplay(qrUrl) {
  if (!qrUrl) {
    alert('QRコードURLが見つかりません');
    return;
  }
  
  console.log('🧾 領収書表示開始:', qrUrl);
  
  // qrUrl から receiptId を抽出
  const match = qrUrl.match(/[?&]id=([^&]+)/);
  if (!match) {
    alert('無効なQRコードURLです');
    return;
  }
  const receiptId = match[1];
  console.log('🔑 レシートID:', receiptId);
  
  // Firestore からレシートデータを取得
  let receiptData = null;
  try {
    const receiptRef = window.doc(window.db, 'stores', window.currentStoreId, 'receipts', receiptId);
    const receiptDoc = await window.getDoc(receiptRef);
    if (!receiptDoc.exists()) {
      alert('レシートデータが見つかりません');
      return;
    }
    receiptData = receiptDoc.data();
    console.log('📄 レシートデータ取得:', receiptData);
  } catch (error) {
    console.error('❌ レシートデータ取得エラー:', error);
    alert('レシートデータの取得に失敗しました: ' + error.message);
    return;
  }
  
  // レシート設定をFirestoreから読み込み
  let receiptStoreName = '粉もん屋 八 下赤塚店';
  let receiptAddress = '東京都板橋区赤塚2-2-4';
  let receiptPhone = 'TEL: 03-6904-2888';
  
  try {
    const storeId = window.currentStoreId;
    const receiptSettingsRef = window.doc(window.db, 'stores', storeId, 'receipt_settings', 'default');
    const receiptSettingsDoc = await window.getDoc(receiptSettingsRef);
    
    if (receiptSettingsDoc.exists()) {
      const settings = receiptSettingsDoc.data();
      
      if (settings.storeName && settings.branchName) {
        receiptStoreName = settings.storeName + ' ' + settings.branchName;
      } else if (settings.branchName) {
        receiptStoreName = settings.branchName;
      } else if (settings.storeName) {
        receiptStoreName = settings.storeName;
      }
      
      if (settings.postalCode && settings.address) {
        receiptAddress = settings.postalCode + ' ' + settings.address;
      } else if (settings.address) {
        receiptAddress = settings.address;
      }
      
      if (settings.phone) {
        receiptPhone = 'TEL: ' + settings.phone;
      }
    }
  } catch (error) {
    console.error('❌ レシート設定読み込みエラー:', error);
  }
  
  // 日時フォーマット
  const now = new Date(receiptData.timestamp || Date.now());
  const dateStr = now.getFullYear() + '/' + 
                  String(now.getMonth() + 1).padStart(2, '0') + '/' + 
                  String(now.getDate()).padStart(2, '0');
  
  const totalAmount = receiptData.totalAmount || 0;
  
  // 宛名入力プロンプト
  const recipientName = prompt('領収書の宛名を入力してください:', '');
  if (!recipientName) {
    console.log('🚫 領収書作成キャンセル');
    return;
  }
  
  // 既存の領収書モーダルを削除
  const existingInvoiceModals = document.querySelectorAll('[id^="invoiceDisplayModal"]');
  existingInvoiceModals.forEach(el => el.remove());
  
  const modalId = 'invoiceDisplayModal_' + Date.now();
  const modal = document.createElement('div');
  modal.id = modalId;
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 99999999; display: flex; align-items: center; justify-content: center; overflow-y: auto;';
  
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; padding: 40px; max-width: 600px; width: 95%; margin: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
      <div style="text-align: center; padding: 30px 0; border-bottom: 3px double #333;">
        <div style="font-size: 28px; font-weight: bold; margin-bottom: 15px; letter-spacing: 4px;">領収書</div>
      </div>
      
      <div style="padding: 30px 0; border-bottom: 2px solid #333;">
        <div style="font-size: 18px; margin-bottom: 20px;">
          <span style="display: inline-block; border-bottom: 1px solid #333; padding-bottom: 5px; min-width: 300px;">${recipientName} 様</span>
        </div>
        <div style="font-size: 24px; font-weight: bold; text-align: center; margin: 30px 0;">
          金額: <span style="color: #e74c3c;">¥${totalAmount.toLocaleString()}</span>
        </div>
        <div style="font-size: 14px; color: #666; margin-top: 15px;">
          上記の金額を正に領収いたしました
        </div>
      </div>
      
      <div style="padding: 30px 0; border-bottom: 1px solid #ddd;">
        <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px;">
          <span>発行日:</span>
          <span>${dateStr}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 14px;">
          <span>注文番号:</span>
          <span>${receiptData.orderNumber || receiptData.orderNum || 'なし'}</span>
        </div>
      </div>
      
      <div style="padding: 30px 0; text-align: right;">
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px;">${receiptStoreName}</div>
        <div style="font-size: 13px; color: #666;">${receiptAddress}</div>
        <div style="font-size: 13px; color: #666;">${receiptPhone}</div>
      </div>
      
      <div style="display: flex; gap: 10px; margin-top: 30px;">
        <button onclick="playTapSound(); printInvoice('${modalId}')" style="flex: 1; padding: 18px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer;">
          印刷
        </button>
        <button onclick="playTapSound(); closeReceiptModal('${modalId}')" style="flex: 1; padding: 18px; background: #666; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer;">
          閉じる
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  console.log('✅ 領収書表示完了');
  
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeReceiptModal(modalId);
    }
  });
}

// 領収書印刷関数
function printInvoice(modalId) {
  const modalElement = document.getElementById(modalId);
  if (!modalElement) return;
  
  const contentDiv = modalElement.querySelector('div > div');
  if (!contentDiv) return;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>領収書</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          @media print {
            button { display: none !important; }
          }
        </style>
      </head>
      <body>
        ${contentDiv.outerHTML}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 100);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

// QRコード生成と表示（レシート画像込み）
async function generateAndShowQR(modalId, qrUrl) {
  console.log('🎨 QRコード生成開始');
  
  const modalElement = document.getElementById(modalId);
  if (!modalElement) {
    console.error('❌ モーダルが見つかりません');
    return;
  }
  
  const receiptContent = modalElement.querySelector('div > div');
  if (!receiptContent) {
    console.error('❌ レシートコンテンツが見つかりません');
    return;
  }
  
  try {
    console.log('📸 html2canvas でレシート画像化中...');
    const canvas = await html2canvas(receiptContent, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false
    });
    
    const imageData = canvas.toDataURL('image/png');
    console.log('✅ レシート画像化完了');
    
    await showQRCodeModal(qrUrl, imageData);
  } catch (error) {
    console.error('❌ QRコード生成エラー:', error);
    alert('QRコード生成に失敗しました: ' + error.message);
  }
}

// QRコード表示モーダル（修正版 - モバイル対応）
async function showQRCodeModal(qrUrl, imageData) {
  console.log('🎨 QRコードモーダル表示');
  
  const existingQRModal = document.getElementById('qrDisplayModal');
  if (existingQRModal) {
    existingQRModal.remove();
  }
  
  // グローバル変数に保存
  window.currentReceiptImageData = imageData;
  
  const qrModal = document.createElement('div');
  qrModal.id = 'qrDisplayModal';
  qrModal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.9) !important; z-index: 99999999 !important; display: flex !important; align-items: center !important; justify-content: center !important;';
  
  qrModal.innerHTML = `
    <div style="background: white; border-radius: 20px; padding: 30px; max-width: 600px; width: 95%; text-align: center;">
      <h2 style="margin: 0 0 20px 0; font-size: 24px;">QRコード</h2>
      <div id="qrCodeContainerModal" style="display: flex !important; justify-content: center !important; align-items: center !important; margin: 20px auto !important; min-height: 280px !important; max-width: 280px !important; background: #f0f0f0; border: 2px solid #ccc; padding: 12px; box-sizing: border-box;"></div>
      <p style="font-size: 14px; color: #666; margin: 20px 0;">このQRコードをスキャンしてレシート・領収書を表示できます</p>
      <p style="font-size: 12px; color: #999; margin: 10px 0;">有効期限: 7日間</p>
      <div style="margin-top: 30px; display: flex; gap: 15px;">
        <button onclick="downloadReceiptImage()" style="flex: 1; padding: 18px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer;">
          画像をダウンロード
        </button>
        <button onclick="closeQRModal()" style="flex: 1; padding: 18px; background: #666; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer;">
          閉じる
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(qrModal);
  
  console.log('🎨 QRコードモーダルをDOMに追加しました');
  
  // QRCodeライブラリの読み込みを待つ（最大5秒）
  let attempts = 0;
  const maxAttempts = 50; // 5秒
  console.log('⏳ QRCodeライブラリの読み込みを待機中...');
  while (typeof QRCode === 'undefined' && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
    if (attempts % 10 === 0) {
      console.log(`⏳ 待機中... (${attempts * 100}ms / ${maxAttempts * 100}ms)`);
    }
  }
  
  const qrContainer = document.getElementById('qrCodeContainerModal');
  console.log('📦 QRコンテナ:', qrContainer ? '見つかりました' : '見つかりません');
  console.log('📚 QRCodeライブラリ:', typeof QRCode !== 'undefined' ? '読み込み済み' : '未読み込み');
  
  if (qrContainer && typeof QRCode !== 'undefined') {
    try {
      console.log('🔨 QRコード生成開始:', qrUrl);
      // コンテナをクリア
      qrContainer.innerHTML = '';
      
      // 🔧 修正: QRコードを直接生成（canvas優先、img自動生成を無効化）
      const qrcode = new QRCode(qrContainer, {
        text: qrUrl,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
      
      console.log('✅ QRコード生成完了');
      
      // 🔧 修正: 描画完了を待ち、canvas/imgの両方に対応
      const waitForQRRender = (attempts = 0) => {
        if (attempts > 30) {
          console.error('❌ QRコードの描画がタイムアウトしました');
          qrContainer.innerHTML = '<div style="color: red; padding: 20px; font-size: 14px;">QRコードの表示に失敗しました</div>';
          return;
        }
        
        const canvas = qrContainer.querySelector('canvas');
        const img = qrContainer.querySelector('img');
        
        if (canvas || img) {
          console.log('🎨 QR要素を発見:', canvas ? 'canvas' : '', img ? 'img' : '');
          
          // 🔧 修正: canvas、imgともに表示し、強制的に可視化
          if (canvas) {
            canvas.style.cssText = 'display: block !important; margin: 0 auto !important; width: 256px !important; height: 256px !important; visibility: visible !important; opacity: 1 !important; position: static !important;';
            console.log('✅ Canvas要素を表示しました');
          }
          
          if (img) {
            img.style.cssText = 'display: block !important; margin: 0 auto !important; width: 256px !important; height: 256px !important; visibility: visible !important; opacity: 1 !important; position: static !important;';
            // imgのロードを待つ
            if (!img.complete) {
              img.onload = () => {
                console.log('✅ Img要素のロード完了');
                img.style.cssText = 'display: block !important; margin: 0 auto !important; width: 256px !important; height: 256px !important; visibility: visible !important; opacity: 1 !important; position: static !important;';
              };
              img.onerror = () => {
                console.error('❌ Img要素のロードに失敗');
                // imgが失敗した場合、canvasにフォールバック
                if (img.parentNode) {
                  img.parentNode.removeChild(img);
                }
              };
            } else {
              console.log('✅ Img要素は既にロード済み');
            }
          }
          
          // 親要素のスタイルも再設定
          qrContainer.style.cssText = 'display: flex !important; justify-content: center !important; align-items: center !important; margin: 20px auto !important; min-height: 280px !important; max-width: 280px !important; background: #f0f0f0; border: 2px solid #ccc; padding: 12px; box-sizing: border-box;';
          
          console.log('📦 QRコンテナの子要素数:', qrContainer.children.length);
        } else {
          // まだ描画されていない場合は再試行
          setTimeout(() => waitForQRRender(attempts + 1), 100);
        }
      };
      
      // 描画を待つ（少し長めの待機時間）
      setTimeout(() => waitForQRRender(), 200);
      
    } catch (error) {
      console.error('❌ QRコード生成エラー:', error);
      qrContainer.innerHTML = '<div style="color: red; padding: 20px; font-size: 14px;">QRコード生成に失敗しました:<br>' + error.message + '</div>';
    }
  } else {
    const errorMsg = !qrContainer ? 'QRコンテナが見つかりません' : 'QRCodeライブラリが読み込まれていません';
    console.error('❌', errorMsg);
    if (qrContainer) {
      qrContainer.innerHTML = '<div style="color: red; padding: 20px; font-size: 14px;">' + errorMsg + '</div>';
    }
  }
  
  // モーダルの外側クリックで閉じる
  qrModal.addEventListener('click', function(e) {
    if (e.target === qrModal) {
      closeQRModal();
    }
  });
}

// 画像ダウンロード関数
function downloadReceiptImage(imageData) {
  // 引数がない場合はグローバル変数から取得
  const dataToUse = imageData || window.currentReceiptImageData;
  
  if (!dataToUse) {
    alert('画像データがありません');
    return;
  }
  
  const link = document.createElement('a');
  link.download = 'receipt_' + Date.now() + '.png';
  link.href = dataToUse;
  link.click();
  console.log('📥 画像ダウンロード実行');
}

// モーダルを閉じる
function closeReceiptModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.remove();
    console.log('🗑️ モーダル削除:', modalId);
  }
}

function closeQRModal() {
  const qrModal = document.getElementById('qrDisplayModal');
  if (qrModal) {
    qrModal.remove();
    console.log('🗑️ QRモーダル削除');
  }
}

// キャッシュドロア開放関数
async function openCashDrawer() {
  const drawerIp = localStorage.getItem('drawerIp') || '192.168.1.100';
  const duration = localStorage.getItem('drawerDuration') || '500';
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`http://${drawerIp}/open`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ duration: parseInt(duration) })
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log('ドロアを開きました');
  } catch (error) {
    console.error('ドロア開放エラー:', error);
  }
}

// グローバル関数として登録
window.showReceiptDisplay = showReceiptDisplay;
window.showInvoiceDisplay = showInvoiceDisplay;
window.openCashDrawer = openCashDrawer;

console.log('✅ receipt-display-functions-v5-mobile-fix.js 読み込み完了');
