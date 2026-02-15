// ========== レシート・領収書表示システム（Firestore版）==========

// QRCodeライブラリの読み込み確認と動的ロード
(function() {
  if (typeof QRCode === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    document.head.appendChild(script);
  }
  
  if (typeof html2canvas === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(script);
  }
})();

// レシート表示関数
async function showReceiptDisplay(receiptData) {
  console.log('📄 ==== レシート表示開始 ====');
  console.log('🔍 受信データ:', receiptData);
  console.log('🔢 注文番号:', receiptData.orderNumber || receiptData.orderNum);
  
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
        const messages = settings.message.split('\n');
        receiptMessage1 = messages[0] || receiptMessage1;
        receiptMessage2 = messages[1] || receiptMessage2;
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
  
  // 商品リストHTML生成（縦並びで各価格表示）
  let itemsHtml = '';
  if (receiptData.items && Array.isArray(receiptData.items) && receiptData.items.length > 0) {
    receiptData.items.forEach(item => {
      const itemTotal = item.price * item.quantity;
      
      itemsHtml += `
        <div style="margin: 12px 0; padding-bottom: 8px; border-bottom: 1px dashed #ddd;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <div style="font-weight: bold; font-size: 14px;">${item.name}</div>
            <div style="font-weight: bold;">¥${itemTotal.toLocaleString()}</div>
          </div>
      `;
      
      // toppingsList配列がある場合（正しいPOS形式）
      if (item.toppingsList && Array.isArray(item.toppingsList) && item.toppingsList.length > 0) {
        // 基本価格を表示
        const basePrice = item.basePrice || 880; // デフォルト値
        itemsHtml += `<div style="font-size: 13px; color: #333; margin-bottom: 4px;">¥${basePrice.toLocaleString()}</div>`;
        
        // 各トッピングを縦に表示
        item.toppingsList.forEach(topping => {
          itemsHtml += `
            <div style="font-size: 13px; color: #333; margin-top: 2px;">
              ${topping.name} ¥${topping.price.toLocaleString()}
            </div>
          `;
        });
      }
      // Handy形式の場合
      else {
        itemsHtml += `<div style="font-size: 13px; color: #333;">¥${item.price.toLocaleString()} × ${item.quantity}</div>`;
        if (item.toppings && item.toppings !== 'なし' && item.toppings !== '') {
          itemsHtml += `<div style="font-size: 12px; color: #666; margin-top: 4px; font-style: italic;">トッピング: ${item.toppings}</div>`;
        }
      }
      
      itemsHtml += `</div>`;
    });
  }
      
      itemsHtml += `</div>`;
    });
  }
  
  // 消費税計算
  let tax8Total = receiptData.tax8Total || 0;
  let tax10Total = receiptData.tax10Total || 0;
  let totalTax = 0;
  
  if (tax8Total === 0 && tax10Total === 0 && receiptData.total > 0) {
    const totalExcludingTax = Math.floor(receiptData.total / 1.10);
    totalTax = receiptData.total - totalExcludingTax;
    tax10Total = receiptData.total;
  } else {
    const tax8Excluded = Math.floor(tax8Total / 1.08);
    const tax10Excluded = Math.floor(tax10Total / 1.10);
    const tax8Amount = tax8Total - tax8Excluded;
    const tax10Amount = tax10Total - tax10Excluded;
    totalTax = tax8Amount + tax10Amount;
  }
  
  const tax8Excluded = tax8Total > 0 ? Math.floor(tax8Total / 1.08) : 0;
  const tax10Excluded = tax10Total > 0 ? Math.floor(tax10Total / 1.10) : 0;
  const tax8Amount = tax8Total > 0 ? tax8Total - tax8Excluded : 0;
  const tax10Amount = tax10Total > 0 ? tax10Total - tax10Excluded : 0;
  
  const receiptHtml = `
    <div style="font-family: 'Courier New', monospace; text-align: center; padding: 0 15px;">
      <div style="border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 15px;">
        <div style="font-weight: bold; font-size: 20px; margin-bottom: 5px;">${receiptStoreName}</div>
        <div style="font-size: 12px;">${receiptAddress}</div>
        <div style="font-size: 12px;">${receiptPhone}</div>
      </div>
      
      <div style="text-align: left; margin: 20px 0;">
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>日時:</span>
          <span>${dateStr}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>注文番号:</span>
          <span style="font-weight: bold; font-size: 18px;">#${orderNum}</span>
        </div>
        ${receiptData.tableNumber && receiptData.tableNumber !== '即会計' ? `<div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>テーブル:</span>
          <span style="font-weight: bold;">${receiptData.tableNumber}</span>
        </div>` : ''}
      </div>
      
      <div style="border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 15px 0; margin: 15px 0;">
        <div style="text-align: left;">
          ${itemsHtml}
        </div>
      </div>
      
      <div style="text-align: left; font-size: 14px; margin: 15px 0; padding: 10px 0; border-bottom: 1px solid #ddd;">
        ${tax8Total > 0 ? `<div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>8%対象: ¥${tax8Excluded.toLocaleString()}</span>
          <span>内税: ¥${tax8Amount.toLocaleString()}</span>
        </div>` : ''}
        ${tax10Total > 0 ? `<div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>10%対象: ¥${tax10Excluded.toLocaleString()}</span>
          <span>内税: ¥${tax10Amount.toLocaleString()}</span>
        </div>` : ''}
        <div style="display: flex; justify-content: space-between; margin: 5px 0; font-weight: bold;">
          <span>消費税合計:</span>
          <span>¥${totalTax.toLocaleString()}</span>
        </div>
      </div>
      
      <div style="text-align: right; font-size: 24px; font-weight: bold; margin: 20px 0;">
        合計: ¥${receiptData.total.toLocaleString()}
      </div>
      
      <div style="border-top: 2px solid #000; padding-top: 15px; margin-top: 20px; font-size: 12px;">
        <div style="margin-top: 10px;">${receiptMessage1}</div>
        <div style="margin-top: 5px;">${receiptMessage2}</div>
      </div>
    </div>
  `;
  
  await showReceiptModal(receiptHtml, receiptData, 'receipt');
  console.log('✅ レシート表示完了');
}

// 領収書表示関数
async function showInvoiceDisplay(invoiceData) {
  console.log('🧾 ==== 領収書表示開始 ====');
  console.log('🔍 受信データ:', invoiceData);
  console.log('🔢 注文番号:', invoiceData.orderNumber || invoiceData.orderNum);
  
  const existingModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
  console.log('🗑️ 既存モーダル削除:', existingModals.length);
  existingModals.forEach(el => el.remove());
  
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // レシート設定をFirestoreから読み込み
  let receiptStoreName = '粉もん屋 八 下赤塚店';
  let receiptAddress = '東京都板橋区赤塚2-2-4';
  let receiptPhone = 'TEL: 03-6904-2888';
  let sealImageData = '';
  
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
      
      // 電子印鑑データを取得
      if (settings.sealImageData) {
        sealImageData = settings.sealImageData;
      } else if (settings.sealImage) {
        sealImageData = settings.sealImage;
      } else if (settings.seal) {
        sealImageData = settings.seal;
      } else if (settings.stampImage) {
        sealImageData = settings.stampImage;
      }
    }
    
    // LocalStorageからも試す
    if (!sealImageData) {
      const localSealKeys = ['companySealData', 'sealImageData', 'sealImage', 'stampData'];
      for (const key of localSealKeys) {
        const localSeal = localStorage.getItem(key);
        if (localSeal) {
          sealImageData = localSeal;
          break;
        }
      }
    }
  } catch (error) {
    console.error('❌ 領収書設定読み込みエラー:', error);
  }
  
  console.log('📋 電子印鑑データ:', sealImageData ? '取得済み' : 'なし');
  
  const now = new Date(invoiceData.timestamp || Date.now());
  const dateStr = now.getFullYear() + '年' + 
                  String(now.getMonth() + 1).padStart(2, '0') + '月' + 
                  String(now.getDate()).padStart(2, '0') + '日';
  
  let orderNum = invoiceData.orderNumber || invoiceData.orderNum || 'なし';
  
  // 消費税計算（内税）
  let tax8Total = invoiceData.tax8Total || 0;
  let tax10Total = invoiceData.tax10Total || 0;
  let totalTax = 0;
  
  if (tax8Total === 0 && tax10Total === 0 && invoiceData.total > 0) {
    const totalExcludingTax = Math.floor(invoiceData.total / 1.10);
    totalTax = invoiceData.total - totalExcludingTax;
  } else {
    const tax8Excluded = Math.floor(tax8Total / 1.08);
    const tax10Excluded = Math.floor(tax10Total / 1.10);
    const tax8Amount = tax8Total - tax8Excluded;
    const tax10Amount = tax10Total - tax10Excluded;
    totalTax = tax8Amount + tax10Amount;
  }
  
  // 電子印鑑HTML
  let sealHtml = '';
  if (sealImageData) {
    sealHtml = `
      <div style="position: absolute; top: 20px; right: 20px; width: 80px; height: 80px;">
        <img src="${sealImageData}" style="width: 100%; height: 100%; object-fit: contain;" alt="電子印鑑">
      </div>
    `;
  }
  
  const invoiceHtml = `
    <div style="font-family: 'Yu Gothic', 'Hiragino Sans', sans-serif; padding: 20px 30px;">
      <div style="text-align: center; border-bottom: 3px double #000; padding-bottom: 20px; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 28px; letter-spacing: 8px;">領収書</h2>
      </div>
      
      <div style="margin: 30px 0;">
        <div style="font-size: 14px; margin-bottom: 10px;">お客様</div>
        <div style="border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 30px;">
          <span style="font-size: 18px;">　　　　　　　　　　　</span>
          <span style="font-size: 14px;">様</span>
        </div>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <div style="font-size: 16px; margin-bottom: 10px;">下記の通り領収いたしました</div>
        <div style="border: 2px solid #000; padding: 20px; margin: 20px 0;">
          <div style="font-size: 14px; margin-bottom: 5px;">金額</div>
          <div style="font-size: 36px; font-weight: bold;">¥${invoiceData.total.toLocaleString()}</div>
          <div style="font-size: 14px; margin-top: 10px; color: #666;">（内消費税 ¥${totalTax.toLocaleString()}）</div>
        </div>
      </div>
      
      <div style="margin: 30px 0; font-size: 14px;">
        <div style="margin: 10px 0;">
          <span style="display: inline-block; width: 100px;">但し</span>
          <span>飲食代として</span>
        </div>
        <div style="margin: 10px 0;">
          <span style="display: inline-block; width: 100px;">注文番号</span>
          <span>#${orderNum}</span>
        </div>
        ${invoiceData.tableNumber && invoiceData.tableNumber !== '即会計' ? `<div style="margin: 10px 0;">
          <span style="display: inline-block; width: 100px;">テーブル</span>
          <span>${invoiceData.tableNumber}</span>
        </div>` : ''}
      </div>
      
      <div style="text-align: right; font-size: 14px; margin: 40px 0 20px 0;">
        <div style="margin: 5px 0;">${dateStr}</div>
      </div>
      
      <div style="border-top: 2px solid #000; padding-top: 20px; margin-top: 0; position: relative;">
        ${sealHtml}
        <div style="text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 10px;">${receiptStoreName}</div>
        <div style="text-align: center; font-size: 12px; color: #666;">
          <div>${receiptAddress}</div>
          <div style="margin-top: 5px;">${receiptPhone}</div>
          <div style="margin-top: 10px;">※この領収書は再発行できません</div>
        </div>
      </div>
    </div>
  `;
  
  await showReceiptModal(invoiceHtml, invoiceData, 'invoice');
  console.log('✅ 領収書表示完了');
}

// モーダル表示関数
async function showReceiptModal(contentHtml, data, type) {
  const modalId = 'receiptDisplayModal_' + Date.now();
  const contentId = 'receiptContent_' + Date.now();
  
  const modal = document.createElement('div');
  modal.id = modalId;
  modal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.8) !important; z-index: 9999999 !important; display: flex !important; align-items: center !important; justify-content: center !important;';
  
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; padding: 30px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;">
      <div id="${contentId}" class="receiptContent" style="padding: 0 20px;">
        ${contentHtml}
      </div>
      <div style="margin-top: 30px; display: flex; gap: 15px;">
        <button onclick="issueReceiptQR('${contentId}')" style="flex: 1; padding: 18px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; font-size: 18px; font-weight: bold; cursor: pointer;">
          QRコード発行
        </button>
        <button onclick="closeReceiptModal('${modalId}')" style="flex: 1; padding: 18px; background: #666; color: white; border: none; border-radius: 12px; font-size: 18px; font-weight: bold; cursor: pointer;">
          閉じる
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  window.currentReceiptData = data;
  window.currentReceiptData._contentId = contentId;
  
  window.closeReceiptModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.remove();
  };
}

// 🎯 完全に修正されたQRコード発行関数（Firestore版）
window.issueReceiptQR = async function issueReceiptQR(contentId) {
  console.log('📱 ==== QRコード生成開始（Firestore版） ====');
  console.log('⏰ 時刻:', new Date().toISOString());
  
  const elementId = contentId || (window.currentReceiptData && window.currentReceiptData._contentId) || 'receiptContent';
  const element = document.getElementById(elementId);
  
  if (!element) {
    alert('レシート要素が見つかりません');
    console.error('❌ レシート要素が見つかりません');
    return;
  }
  
  if (typeof QRCode === 'undefined' || typeof html2canvas === 'undefined') {
    alert('ライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  try {
    // 🎯 レシート画像をキャプチャ
    console.log('📸 キャプチャ開始');
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false
    });
    
    const imageData = canvas.toDataURL();
    
    // 🔥 重要: Firestoreに保存（各レシートが独立したドキュメント）
    const receiptId = 'receipt_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    
    console.log('💾 Firestoreに保存開始:', receiptId);
    
    // Firestoreに保存
    await window.setDoc(window.doc(window.db, 'receipt_images', receiptId), {
      imageData: imageData,
      createdAt: new Date(),
      orderNumber: window.currentReceiptData?.orderNumber || window.currentReceiptData?.orderNum || 'unknown',
      total: window.currentReceiptData?.total || 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7日後に期限切れ
    });
    
    console.log('✅ Firestore保存完了:', receiptId);
    
    // 全てのレシートモーダルを閉じる
    const receiptModals = document.querySelectorAll('[id^="receiptDisplayModal"]');
    console.log('🗑️ レシートモーダル削除:', receiptModals.length);
    receiptModals.forEach(el => el.remove());
    
    // QRコードURL生成
    const currentUrl = window.location.href;
    const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
    const qrUrl = baseUrl + 'receipt-view-firestore.html?id=' + receiptId;
    
    console.log('🔗 QR URL:', qrUrl);
    
    // 既存のQRモーダルを削除
    const existingQRModals = document.querySelectorAll('#qrDisplayModal');
    existingQRModals.forEach(el => el.remove());
    
    // QRコード表示モーダルを作成
    const qrModal = document.createElement('div');
    qrModal.id = 'qrDisplayModal';
    qrModal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.9) !important; z-index: 9999999 !important; display: flex !important; align-items: center !important; justify-content: center !important;';
    
    qrModal.innerHTML = `
      <div style="background: white; border-radius: 16px; padding: 30px; text-align: center;">
        <h3 style="margin: 0 0 20px 0;">お客様用QRコード</h3>
        <div id="qrcode" style="margin: 20px auto; display: flex; justify-content: center; align-items: center;"></div>
        <p style="margin: 20px 0; color: #666; font-size: 14px;">
          レシートID: ${receiptId}<br>
          注文番号: #${window.currentReceiptData?.orderNumber || window.currentReceiptData?.orderNum || '---'}
        </p>
        <button onclick="closeQRModal()" style="padding: 15px 30px; background: #666; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
          閉じる
        </button>
      </div>
    `;
    
    document.body.appendChild(qrModal);
    
    window.closeQRModal = function() {
      const qrModal = document.getElementById('qrDisplayModal');
      if (qrModal) qrModal.remove();
    };
    
    // QRコード生成
    setTimeout(() => {
      const qrcodeElement = document.getElementById('qrcode');
      if (qrcodeElement) {
        qrcodeElement.innerHTML = '';
        new QRCode(qrcodeElement, {
          text: qrUrl,
          width: 256,
          height: 256,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
        
        setTimeout(() => {
          const qrCanvas = qrcodeElement.querySelector('canvas');
          if (qrCanvas) qrCanvas.style.display = 'none';
          const qrImg = qrcodeElement.querySelector('img');
          if (qrImg) {
            qrImg.style.display = 'block';
            qrImg.style.margin = '0 auto';
          }
        }, 50);
        
        console.log('✅ QRコード生成完了');
      }
    }, 100);
    
  } catch (error) {
    console.error('❌ QRコード生成エラー:', error);
    alert('QRコード生成に失敗しました: ' + error.message);
  }
};

// Wi-Fiドロア開放
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

console.log('✅ receipt-display-functions-firestore.js loaded');
