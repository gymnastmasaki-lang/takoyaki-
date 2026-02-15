// ========== レシート・領収書表示システム（完全修正版）==========

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
  
  // 🔧 修正: 既存のすべてのモーダルを完全削除（ユニークIDに対応）
  // 全てのモーダルを確実に削除
  const existingModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
  console.log('🗑️ 既存モーダル削除（showReceiptDisplay）:', existingModals.length);
  existingModals.forEach(el => {
    el.remove();
  });
  
  // DOMから確実に削除されるまで少し待機
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
  
  // 🔧 重要修正: 注文番号を確実に取得
  let orderNum = receiptData.orderNumber || receiptData.orderNum || 'なし';
  console.log('🔢 注文番号:', orderNum);
  
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
  }
  
  // 消費税計算（内税）
  let tax8Total = receiptData.tax8Total || 0;
  let tax10Total = receiptData.tax10Total || 0;
  let totalTax = 0;
  
  // tax8Totalとtax10Totalが両方0の場合、合計金額から10%として計算
  if (tax8Total === 0 && tax10Total === 0 && receiptData.total > 0) {
    // 全て10%対象として計算（内税）
    const totalExcludingTax = Math.floor(receiptData.total / 1.10);
    totalTax = receiptData.total - totalExcludingTax;
    tax10Total = receiptData.total; // 表示用
    
    console.log('⚠️ 税額情報がないため、全額10%内税として計算');
    console.log('  合計:', receiptData.total);
    console.log('  本体:', totalExcludingTax);
    console.log('  消費税:', totalTax);
  } else {
    // 通常の計算（税額情報がある場合）
    const tax8Excluded = Math.floor(tax8Total / 1.08);
    const tax10Excluded = Math.floor(tax10Total / 1.10);
    const tax8Amount = tax8Total - tax8Excluded;
    const tax10Amount = tax10Total - tax10Excluded;
    totalTax = tax8Amount + tax10Amount;
  }
  
  // 表示用の税額計算
  const tax8Excluded = tax8Total > 0 ? Math.floor(tax8Total / 1.08) : 0;
  const tax10Excluded = tax10Total > 0 ? Math.floor(tax10Total / 1.10) : 0;
  const tax8Amount = tax8Total > 0 ? tax8Total - tax8Excluded : 0;
  const tax10Amount = tax10Total > 0 ? tax10Total - tax10Excluded : 0;
  
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
  
  // モーダルを作成して表示
  await showReceiptModal(receiptHtml, receiptData, 'receipt');
  console.log('✅ レシート表示完了');
}

// 領収書表示関数
async function showInvoiceDisplay(invoiceData) {
  console.log('🧾 ==== 領収書表示開始 ====');
  console.log('🔍 受信データ:', invoiceData);
  console.log('🔢 注文番号:', invoiceData.orderNumber || invoiceData.orderNum);
  
  // 🔧 修正: 既存のすべてのモーダルを完全削除（ユニークIDに対応）
  // 全てのモーダルを確実に削除
  const existingModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
  console.log('🗑️ 既存モーダル削除（showInvoiceDisplay）:', existingModals.length);
  existingModals.forEach(el => {
    el.remove();
  });
  
  // DOMから確実に削除されるまで少し待機
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
  
  // 日時フォーマット
  const now = new Date(invoiceData.timestamp || Date.now());
  const dateStr = now.getFullYear() + '年' + 
                  String(now.getMonth() + 1).padStart(2, '0') + '月' + 
                  String(now.getDate()).padStart(2, '0') + '日';
  
  // 🔧 重要修正: 注文番号を確実に取得
  let orderNum = invoiceData.orderNumber || invoiceData.orderNum || 'なし';
  console.log('🔢 注文番号:', orderNum);
  
  // 消費税計算（内税）
  let tax8Total = invoiceData.tax8Total || 0;
  let tax10Total = invoiceData.tax10Total || 0;
  let totalTax = 0;
  
  // tax8Totalとtax10Totalが両方0の場合、合計金額から10%として計算
  if (tax8Total === 0 && tax10Total === 0 && invoiceData.total > 0) {
    // 全て10%対象として計算（内税）
    const totalExcludingTax = Math.floor(invoiceData.total / 1.10);
    totalTax = invoiceData.total - totalExcludingTax;
    tax10Total = invoiceData.total; // 表示用
    
    console.log('⚠️ 領収書: 税額情報がないため、全額10%内税として計算');
    console.log('  合計:', invoiceData.total);
    console.log('  本体:', totalExcludingTax);
    console.log('  消費税:', totalTax);
  } else {
    // 通常の計算（税額情報がある場合）
    const tax8Excluded = Math.floor(tax8Total / 1.08);
    const tax10Excluded = Math.floor(tax10Total / 1.10);
    const tax8Amount = tax8Total - tax8Excluded;
    const tax10Amount = tax10Total - tax10Excluded;
    totalTax = tax8Amount + tax10Amount;
  }
  
  // 電子印鑑のHTML（線の上に下端を配置）
  const sealHtml = sealImageData ? `
    <img src="${sealImageData}" style="width: 80px; height: 80px; opacity: 0.8; position: absolute; left: 0; top: -80px;" alt="印" />
  ` : '';
  
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
  
  // モーダルを作成して表示
  await showReceiptModal(invoiceHtml, invoiceData, 'invoice');
  console.log('✅ 領収書表示完了');
}

// モーダル表示共通関数
async function showReceiptModal(html, data, type) {
  console.log('==========================================');
  console.log('🖼️ モーダル表示開始:', type);
  console.log('📊 データ:', data);
  console.log('📋 注文番号:', data.orderNumber || data.orderNum);
  console.log('==========================================');
  
  // ユニークなタイムスタンプとIDを生成
  const timestamp = Date.now();
  const uniqueModalId = `receiptDisplayModal_${timestamp}`;
  const uniqueContentId = `receiptContent_${timestamp}`;
  
  console.log('🆔 モーダルID:', uniqueModalId);
  console.log('🆔 コンテンツID:', uniqueContentId);
  
  // 既存のすべてのレシートモーダルを削除
  const existingModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
  console.log('🗑️ 削除対象モーダル数:', existingModals.length);
  
  existingModals.forEach((el, index) => {
    console.log(`  削除 ${index + 1}:`, el.id);
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // DOM更新を待つ（より確実に）
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('✅ 古いモーダル削除完了、新しいモーダル作成開始');
  
  // モーダルHTML（完全にユニークなID）
  const modalHtml = `
    <div id="${uniqueModalId}" data-timestamp="${timestamp}" style="position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.8) !important; z-index: 999999 !important; display: flex !important; align-items: center !important; justify-content: center !important; overflow-y: auto !important;">
      <div style="background: white !important; border-radius: 16px; padding: 30px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important;">
        <button onclick="closeReceiptDisplay('${uniqueModalId}')" style="position: absolute; top: 10px; right: 10px; width: 40px; height: 40px; border: none; background: #f44336; color: white; border-radius: 50%; font-size: 24px; cursor: pointer; line-height: 1; z-index: 1000000;">×</button>
        
        <div id="${uniqueContentId}" class="receiptContent" style="margin-top: 20px;">
          ${html}
        </div>
        
        <div style="display: flex; gap: 10px; margin-top: 30px;">
          <button onclick="saveReceiptPNG('${uniqueContentId}')" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer;">
            店側保存 (PNG)
          </button>
          <button onclick="issueReceiptQR('${uniqueContentId}')" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer;">
            発行 (QR)
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // データを一時保存（タイムスタンプとコンテンツID付き）
  window.currentReceiptData = { ...data, _timestamp: timestamp, _contentId: uniqueContentId, _modalId: uniqueModalId };
  window.currentReceiptType = type;
  
  console.log('✅ モーダル表示完了');
  console.log('💾 currentReceiptData更新:', window.currentReceiptData.orderNumber || window.currentReceiptData.orderNum);
  console.log('==========================================');
}

// モーダルを閉じる
function closeReceiptDisplay(modalId) {
  console.log('🚪 モーダルを閉じる:', modalId || '全て');
  
  if (modalId) {
    // 特定のモーダルを閉じる
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.remove();
      console.log('✅ モーダル削除:', modalId);
    }
  } else {
    // すべてのモーダルを閉じる
    const allModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
    console.log('🗑️ 全モーダル削除:', allModals.length);
    allModals.forEach(el => {
      el.remove();
    });
  }
  
  window.currentReceiptData = null;
  window.currentReceiptType = null;
  
  console.log('✅ モーダル閉じる処理完了');
}

// PNG保存
async function saveReceiptPNG(contentId) {
  console.log('💾 PNG保存開始');
  
  const elementId = contentId || (window.currentReceiptData && window.currentReceiptData._contentId) || 'receiptContent';
  const element = document.getElementById(elementId);
  
  if (!element) {
    const fallbackElement = document.querySelector('.receiptContent');
    if (!fallbackElement) {
      alert('レシート要素が見つかりません');
      return;
    }
  }
  
  if (typeof html2canvas === 'undefined') {
    alert('画像変換ライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  try {
    const targetElement = element || document.querySelector('.receiptContent');
    const canvas = await html2canvas(targetElement, {
      backgroundColor: '#ffffff',
      scale: 2
    });
    
    const link = document.createElement('a');
    const type = window.currentReceiptType === 'invoice' ? '領収書' : 'レシート';
    const orderNum = window.currentReceiptData.orderNumber || window.currentReceiptData.orderNum || 'nonum';
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
window.issueReceiptQR = async function issueReceiptQR(contentId) {
  console.log('📱 ==== QRコード生成開始 ====');
  console.log('🆔 コンテンツID:', contentId);
  console.log('⏰ 時刻:', new Date().toISOString());
  
  // 🔧 重要: まず、古いQRモーダルを全て削除
  const oldQRModals = document.querySelectorAll('#qrDisplayModal');
  console.log('🗑️ 古いQRモーダル削除:', oldQRModals.length);
  oldQRModals.forEach(el => el.remove());
  
  const elementId = contentId || (window.currentReceiptData && window.currentReceiptData._contentId) || 'receiptContent';
  const element = document.getElementById(elementId);
  
  if (!element) {
    const fallbackElement = document.querySelector('.receiptContent');
    if (!fallbackElement) {
      alert('レシート要素が見つかりません。モーダルを開き直してください。');
      console.error('❌ レシート要素が見つかりません');
      return;
    }
  }
  
  const targetElement = element || document.querySelector('.receiptContent');
  
  console.log('📸 キャプチャ対象:', targetElement.id || targetElement.className);
  console.log('📏 要素サイズ:', targetElement.offsetWidth, 'x', targetElement.offsetHeight);
  
  if (typeof QRCode === 'undefined') {
    alert('QRコードライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  if (typeof html2canvas === 'undefined') {
    alert('画像変換ライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  try {
    // 🔧 重要: html2canvasでキャプチャする前に、確実に単一のコンテンツのみが表示されているか確認
    console.log('📸 キャプチャ対象要素:', targetElement.id);
    console.log('📏 要素のサイズ:', targetElement.offsetWidth, 'x', targetElement.offsetHeight);
    
    const canvas = await html2canvas(targetElement, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false
    });
    
    const imageData = canvas.toDataURL();
    const id = 'receipt_' + Date.now();
    
    console.log('💾 LocalStorageに保存:', id);
    console.log('📊 画像データサイズ:', imageData.length, '文字');
    
    // 🔧 重要: 古いレシートデータを削除（最新3件のみ保持に変更）
    const oldKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('receipt_') && key !== 'receipt_settings') {
        oldKeys.push(key);
      }
    }
    
    // タイムスタンプでソート（古い順）
    oldKeys.sort((a, b) => {
      const timeA = parseInt(a.replace('receipt_', '')) || 0;
      const timeB = parseInt(b.replace('receipt_', '')) || 0;
      return timeA - timeB;
    });
    
    // 古いデータを削除（最新3件を残す - より積極的にクリーンアップ）
    if (oldKeys.length >= 3) {
      const toDelete = oldKeys.slice(0, oldKeys.length - 2);
      console.log('🗑️ 古いレシートを削除:', toDelete.length, '件');
      toDelete.forEach(key => {
        localStorage.removeItem(key);
        console.log('  - 削除:', key);
      });
    }
    
    // 🔧 新規保存前に latest_receipt_id を削除して確実に更新
    localStorage.removeItem('latest_receipt_id');
    
    // LocalStorageに保存
    localStorage.setItem(id, imageData);
    localStorage.setItem('latest_receipt_id', id);
    
    console.log('✅ LocalStorage保存完了');
    console.log('📦 現在の保存件数:', localStorage.length);
    console.log('🆕 最新レシートID:', id);
    
    // 🔧 重要: すべてのレシートモーダルを閉じる（ユニークIDに対応）
    const receiptModals = document.querySelectorAll('[id^="receiptDisplayModal"]');
    console.log('🗑️ レシートモーダル削除:', receiptModals.length);
    receiptModals.forEach(el => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    
    // 現在のURLからベースURLを作成
    const currentUrl = window.location.href;
    const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
    // 🔧 強力なキャッシュバスター: タイムスタンプ + ランダム値 + 強制リロードフラグ
    const timestamp = Date.now();
    const randomParam = Math.random().toString(36).substring(7);
    const qrUrl = baseUrl + 'receipt-view.html?id=' + id + '&t=' + timestamp + '&_force=' + randomParam;
    
    console.log('🔗 QR URL:', qrUrl);
    
    // 🔧 既存のQRモーダルを削除
    const existingQRModals = document.querySelectorAll('#qrDisplayModal');
    console.log('🗑️ 既存QRモーダル削除:', existingQRModals.length);
    existingQRModals.forEach(el => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    
    // QRコード表示モーダルを作成
    const qrModal = document.createElement('div');
    qrModal.id = 'qrDisplayModal';
    qrModal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.9) !important; z-index: 9999999 !important; display: flex !important; align-items: center !important; justify-content: center !important;';
    
    qrModal.innerHTML = `
      <div style="background: white; border-radius: 16px; padding: 30px; text-align: center;">
        <h3 style="margin: 0 0 20px 0;">お客様用QRコード</h3>
        <div id="qrcode" style="margin: 20px auto; display: flex; justify-content: center; align-items: center;"></div>
        <p style="margin: 20px 0; color: #666;">お客様にスキャンしていただいてください</p>
        <button onclick="closeQRModal()" style="padding: 15px 30px; background: #666; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
          閉じる
        </button>
      </div>
    `;
    
    document.body.appendChild(qrModal);
    
    // QRモーダルを閉じる関数をグローバルに定義
    window.closeQRModal = function() {
      console.log('🚪 QRモーダルを閉じます');
      const qrModal = document.getElementById('qrDisplayModal');
      if (qrModal) {
        qrModal.remove();
        console.log('✅ QRモーダル削除完了');
      }
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
        
        // QRコード生成後、canvasを非表示にしてimgのみ表示
        setTimeout(() => {
          const qrImg = qrcodeElement.querySelector('img');
          const qrCanvas = qrcodeElement.querySelector('canvas');
          
          // canvasを非表示
          if (qrCanvas) {
            qrCanvas.style.display = 'none';
          }
          
          // imgのみを中央配置で表示
          if (qrImg) {
            qrImg.style.display = 'block';
            qrImg.style.margin = '0 auto';
          }
          
          console.log('✅ QRコード中央配置完了（imgのみ表示）');
        }, 50);
        
        console.log('✅ QRコード生成完了');
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

console.log('✅ receipt-display-functions.js loaded (v3.2 - LocalStorageクリーンアップ・完全デバッグ版)');
