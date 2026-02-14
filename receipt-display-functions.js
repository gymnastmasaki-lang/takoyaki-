// ========== レシート・領収書表示システム（デバッグ版）==========

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
  console.log('受信データ:', JSON.stringify(receiptData, null, 2));
  
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
      console.log('✅ レシート設定を読み込みました:', settings);
      
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
    } else {
      console.warn('⚠️ レシート設定が見つかりません');
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
  
  // 注文番号を確実に取得
  const orderNum = receiptData.orderNum || receiptData.orderNumber || receiptData.orderNo || 
                   (receiptData.checkoutData && (receiptData.checkoutData.orderNum || receiptData.checkoutData.orderNumber)) ||
                   '未設定';
  
  console.log('🔢 注文番号チェック:', {
    'receiptData.orderNum': receiptData.orderNum,
    'receiptData.orderNumber': receiptData.orderNumber,
    'receiptData.orderNo': receiptData.orderNo,
    '最終値': orderNum
  });
  
  // 商品リストHTML生成
  let itemsHtml = '';
  if (receiptData.items && Array.isArray(receiptData.items) && receiptData.items.length > 0) {
    receiptData.items.forEach(item => {
      const subtotal = item.price * item.quantity;
      itemsHtml += `
        <div style="display: flex; justify-content: space-between; margin: 8px 0; padding: 8px 0; border-bottom: 1px dashed #ddd;">
          <div style="flex: 1;">
            <div style="font-weight: bold;">${item.name}</div>
            <div style="font-size: 12px; color: #666;">トッピング: ${item.toppings || 'なし'}</div>
            <div style="font-size: 12px; color: #666;">単価: ¥${item.price.toLocaleString()} × ${item.quantity}</div>
          </div>
          <div style="font-weight: bold; white-space: nowrap;">¥${subtotal.toLocaleString()}</div>
        </div>
      `;
    });
  } else {
    console.warn('⚠️ 商品データがありません');
  }
  
  // 消費税計算（内税）
  const tax8Total = receiptData.tax8Total || 0;
  const tax10Total = receiptData.tax10Total || 0;
  const tax8Excluded = Math.floor(tax8Total / 1.08);
  const tax10Excluded = Math.floor(tax10Total / 1.10);
  const tax8Amount = tax8Total - tax8Excluded;
  const tax10Amount = tax10Total - tax10Excluded;
  const totalTax = tax8Amount + tax10Amount;
  
  console.log('💴 税額計算:', { 
    tax8Total, 
    tax10Total, 
    tax8Amount, 
    tax10Amount, 
    totalTax 
  });
  
  const receiptHtml = `
    <div style="font-family: 'Courier New', monospace; text-align: center;">
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
  
  // モーダルを作成して表示
  showReceiptModal(receiptHtml, receiptData, 'receipt');
  console.log('✅ レシート表示完了');
}

// 領収書表示関数
async function showInvoiceDisplay(invoiceData) {
  console.log('🧾 ==== 領収書表示開始 ====');
  console.log('受信データ:', JSON.stringify(invoiceData, null, 2));
  
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
      console.log('✅ 領収書設定を読み込みました:', Object.keys(settings));
      
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
        console.log('✅ 電子印鑑データを取得しました（長さ:', sealImageData.length, '文字）');
      } else {
        console.warn('⚠️ 電子印鑑データが設定されていません - kanri.htmlで作成・保存してください');
      }
    } else {
      console.warn('⚠️ 領収書設定が見つかりません');
    }
  } catch (error) {
    console.error('❌ 領収書設定読み込みエラー:', error);
  }
  
  // 日時フォーマット
  const now = new Date(invoiceData.timestamp || Date.now());
  const dateStr = now.getFullYear() + '年' + 
                  String(now.getMonth() + 1).padStart(2, '0') + '月' + 
                  String(now.getDate()).padStart(2, '0') + '日';
  
  // 注文番号を確実に取得
  const orderNum = invoiceData.orderNum || invoiceData.orderNumber || invoiceData.orderNo ||
                   (invoiceData.checkoutData && (invoiceData.checkoutData.orderNum || invoiceData.checkoutData.orderNumber)) ||
                   '未設定';
  
  console.log('🔢 注文番号チェック:', {
    'invoiceData.orderNum': invoiceData.orderNum,
    'invoiceData.orderNumber': invoiceData.orderNumber,
    'invoiceData.orderNo': invoiceData.orderNo,
    '最終値': orderNum
  });
  
  // 消費税計算（内税）
  const tax8Total = invoiceData.tax8Total || 0;
  const tax10Total = invoiceData.tax10Total || 0;
  const tax8Excluded = Math.floor(tax8Total / 1.08);
  const tax10Excluded = Math.floor(tax10Total / 1.10);
  const tax8Amount = tax8Total - tax8Excluded;
  const tax10Amount = tax10Total - tax10Excluded;
  const totalTax = tax8Amount + tax10Amount;
  
  console.log('💴 税額計算:', { 
    tax8Total, 
    tax10Total, 
    totalTax 
  });
  
  // 電子印鑑の表示HTML
  const sealHtml = sealImageData ? `
    <div style="position: absolute; right: 20px; top: 50%; transform: translateY(-50%);">
      <img src="${sealImageData}" style="width: 80px; height: 80px; opacity: 0.8;" alt="印" />
    </div>
  ` : '';
  
  if (!sealImageData) {
    console.warn('⚠️ 電子印鑑が表示されません - kanri.htmlで設定してください');
  }
  
  const invoiceHtml = `
    <div style="font-family: 'Yu Gothic', 'Hiragino Sans', sans-serif; padding: 10px;">
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
      </div>
      
      <div style="text-align: right; margin: 40px 0 20px 0; font-size: 14px;">
        <div style="margin: 5px 0;">${dateStr}</div>
      </div>
      
      <div style="border-top: 2px solid #000; padding-top: 20px; margin-top: 40px; position: relative;">
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
  
  // モーダルを作成して表示
  showReceiptModal(invoiceHtml, invoiceData, 'invoice');
  console.log('✅ 領収書表示完了');
}

// モーダル表示共通関数
function showReceiptModal(html, data, type) {
  console.log('🖼️ モーダル表示開始:', type);
  
  // 既存のモーダルを削除
  const existingModal = document.getElementById('receiptDisplayModal');
  if (existingModal) {
    existingModal.remove();
    console.log('既存のモーダルを削除しました');
  }
  
  // モーダルHTML
  const modalHtml = `
    <div id="receiptDisplayModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; overflow-y: auto;">
      <div style="background: white; border-radius: 16px; padding: 30px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; position: relative;">
        <button onclick="closeReceiptDisplay()" style="position: absolute; top: 10px; right: 10px; width: 40px; height: 40px; border: none; background: #f44336; color: white; border-radius: 50%; font-size: 24px; cursor: pointer; line-height: 1;">×</button>
        
        <div id="receiptContent" style="margin-top: 20px;">
          ${html}
        </div>
        
        <div style="display: flex; gap: 10px; margin-top: 30px;">
          <button onclick="saveReceiptPNG()" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer;">
            店側保存 (PNG)
          </button>
          <button onclick="issueReceiptQR()" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer;">
            発行 (QR)
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // データを一時保存
  window.currentReceiptData = data;
  window.currentReceiptType = type;
  
  console.log('✅ モーダルを表示しました');
  console.log('データを保存:', { type, orderNum: data.orderNum, orderNumber: data.orderNumber });
}

// モーダルを閉じる
function closeReceiptDisplay() {
  const modal = document.getElementById('receiptDisplayModal');
  if (modal) {
    modal.remove();
    console.log('モーダルを閉じました');
  }
}

// PNG保存
async function saveReceiptPNG() {
  console.log('💾 PNG保存開始');
  const element = document.getElementById('receiptContent');
  
  if (typeof html2canvas === 'undefined') {
    alert('画像変換ライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2
    });
    
    const link = document.createElement('a');
    const type = window.currentReceiptType === 'invoice' ? '領収書' : 'レシート';
    const orderNum = window.currentReceiptData.orderNum || window.currentReceiptData.orderNumber || 'nonum';
    link.download = `${type}_${orderNum}.png`;
    link.href = canvas.toDataURL();
    link.click();
    
    console.log('✅ PNG保存完了:', link.download);
    alert(`${type}を保存しました！`);
  } catch (error) {
    console.error('❌ 保存エラー:', error);
    alert('保存に失敗しました: ' + error.message);
  }
}

// QRコード発行
async function issueReceiptQR() {
  console.log('📱 QRコード生成開始');
  const element = document.getElementById('receiptContent');
  
  if (typeof QRCode === 'undefined') {
    alert('QRコードライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  if (typeof html2canvas === 'undefined') {
    alert('画像変換ライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2
    });
    
    const imageData = canvas.toDataURL();
    const id = 'receipt_' + Date.now();
    
    // LocalStorageに保存
    console.log('💾 LocalStorageに保存:', id);
    localStorage.setItem(id, imageData);
    console.log('✅ 保存完了（サイズ:', imageData.length, '文字）');
    
    // 現在のURLからベースURLを作成
    const currentUrl = window.location.href;
    const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
    const qrUrl = baseUrl + 'receipt-view.html?id=' + id;
    
    console.log('🔗 QR URL:', qrUrl);
    
    // QRコード表示モーダルを作成
    const qrModal = document.createElement('div');
    qrModal.id = 'qrDisplayModal';
    qrModal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10001; display: flex; align-items: center; justify-content: center;';
    
    qrModal.innerHTML = `
      <div style="background: white; border-radius: 16px; padding: 30px; text-align: center;">
        <h3 style="margin: 0 0 20px 0;">お客様用QRコード</h3>
        <div id="qrcode" style="margin: 20px auto;"></div>
        <p style="margin: 20px 0; color: #666;">お客様にスキャンしていただいてください</p>
        <button onclick="document.getElementById('qrDisplayModal').remove();" style="padding: 15px 30px; background: #666; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
          閉じる
        </button>
      </div>
    `;
    
    document.body.appendChild(qrModal);
    console.log('✅ QRモーダルを表示');
    
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
        console.log('✅ QRコード生成完了');
      } else {
        console.error('❌ QRコード表示要素が見つかりません');
        alert('QRコードの表示に失敗しました');
      }
    }, 100);
    
  } catch (error) {
    console.error('❌ QRコード生成エラー:', error);
    alert('QRコード生成に失敗しました: ' + error.message);
  }
}

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

console.log('✅ receipt-display-functions.js loaded (デバッグ版)');
