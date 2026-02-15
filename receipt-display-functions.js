// ========== レシート・領収書表示システム（完全修正版 v4.0）==========

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

// 🔧 グローバル変数で現在表示中のモーダルIDを管理
window.currentActiveModalId = null;
window.currentActiveContentId = null;

// レシート表示関数
async function showReceiptDisplay(receiptData) {
  console.log('📄 ==== レシート表示開始 ====');
  console.log('🔍 受信データ:', receiptData);
  console.log('🔢 注文番号:', receiptData.orderNumber || receiptData.orderNum);
  console.log('⏰ タイムスタンプ:', Date.now());
  
  // 🔧 【重要】既存のすべてのモーダルを完全削除
  const existingModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
  console.log('🗑️ 既存モーダル削除（showReceiptDisplay）:', existingModals.length);
  existingModals.forEach(el => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // グローバル変数もリセット
  window.currentActiveModalId = null;
  window.currentActiveContentId = null;
  
  // DOMから確実に削除されるまで待機（時間を延長）
  await new Promise(resolve => setTimeout(resolve, 150));
  
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
  
  // 注文番号を確実に取得
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
  console.log('⏰ タイムスタンプ:', Date.now());
  
  // 🔧 【重要】既存のすべてのモーダルを完全削除
  const existingModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
  console.log('🗑️ 既存モーダル削除（showInvoiceDisplay）:', existingModals.length);
  existingModals.forEach(el => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // グローバル変数もリセット
  window.currentActiveModalId = null;
  window.currentActiveContentId = null;
  
  // DOMから確実に削除されるまで待機（時間を延長）
  await new Promise(resolve => setTimeout(resolve, 150));
  
  // レシート設定をFirestoreから読み込み
  let receiptStoreName = '粉もん屋 八 下赤塚店';
  let receiptAddress = '東京都板橋区赤塚2-2-4';
  let receiptPhone = 'TEL: 03-6904-2888';
  
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
    }
  } catch (error) {
    console.error('❌ レシート設定読み込みエラー:', error);
  }
  
  // 日時フォーマット
  const now = new Date(invoiceData.timestamp || Date.now());
  const dateStr = now.getFullYear() + '年' + 
                  String(now.getMonth() + 1).padStart(2, '0') + '月' + 
                  String(now.getDate()).padStart(2, '0') + '日';
  
  // 注文番号を確実に取得
  let orderNum = invoiceData.orderNumber || invoiceData.orderNum || 'なし';
  console.log('🔢 注文番号:', orderNum);
  
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
  
  const totalExcludingTax = invoiceData.total - totalTax;
  
  const invoiceHtml = `
    <div style="font-family: 'MS Mincho', serif; padding: 20px;">
      <div style="text-align: center; font-size: 28px; font-weight: bold; margin-bottom: 30px; border-bottom: 3px double #000; padding-bottom: 15px;">
        領収書
      </div>
      
      <div style="margin: 30px 0; font-size: 16px;">
        <div style="margin-bottom: 20px;">
          <span style="border-bottom: 1px solid #000; padding-bottom: 2px; display: inline-block; min-width: 200px;">
            <span style="font-size: 14px; color: #666;">注文番号:</span> <strong>#${orderNum}</strong>
          </span>
          <span style="margin-left: 20px;">様</span>
        </div>
        
        <div style="margin: 30px 0; text-align: right; font-size: 24px;">
          <div style="display: inline-block; border: 2px solid #000; padding: 15px 30px;">
            <div style="font-size: 16px; margin-bottom: 5px;">金額</div>
            <div style="font-weight: bold;">
              ¥${invoiceData.total.toLocaleString()}
              <span style="font-size: 18px; margin-left: 10px;">（税込）</span>
            </div>
          </div>
        </div>
        
        <div style="margin: 30px 0; font-size: 14px; color: #666;">
          <div>但し、飲食代として</div>
          <div style="margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 5px;">
            <div>本体金額: ¥${totalExcludingTax.toLocaleString()}</div>
            <div>消費税額: ¥${totalTax.toLocaleString()}</div>
          </div>
        </div>
        
        <div style="margin-top: 10px; text-align: right; font-size: 14px;">
          上記の通り、領収いたしました
        </div>
      </div>
      
      <div style="margin-top: 50px; text-align: right; font-size: 14px;">
        <div style="margin-bottom: 5px;">${dateStr}</div>
        <div style="font-weight: bold; font-size: 16px; margin-top: 10px;">${receiptStoreName}</div>
        <div style="margin-top: 5px;">${receiptAddress}</div>
        <div>${receiptPhone}</div>
      </div>
    </div>
  `;
  
  // モーダルを作成して表示
  await showReceiptModal(invoiceHtml, invoiceData, 'invoice');
  console.log('✅ 領収書表示完了');
}

// 🔧 【完全修正版】モーダル表示関数
async function showReceiptModal(html, data, type) {
  console.log('==========================================');
  console.log('🖼️ モーダル表示開始:', type);
  console.log('📊 データ:', data);
  console.log('📋 注文番号:', data.orderNumber || data.orderNum);
  console.log('==========================================');
  
  // 🔧 【重要】既存のすべてのモーダルを再度確実に削除
  const existingModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
  console.log('🗑️ 削除対象モーダル数:', existingModals.length);
  
  existingModals.forEach((el, index) => {
    console.log(`  削除 ${index + 1}:`, el.id);
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  
  // DOM更新を待つ
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('✅ 古いモーダル削除完了、新しいモーダル作成開始');
  
  // ユニークなタイムスタンプとIDを生成
  const timestamp = Date.now();
  const uniqueModalId = `receiptDisplayModal_${timestamp}`;
  const uniqueContentId = `receiptContent_${timestamp}`;
  
  // 🔧 【重要】グローバル変数に現在のIDを保存
  window.currentActiveModalId = uniqueModalId;
  window.currentActiveContentId = uniqueContentId;
  
  console.log('🆔 新しいモーダルID:', uniqueModalId);
  console.log('🆔 新しいコンテンツID:', uniqueContentId);
  
  // モーダルHTML
  const modalHtml = `
    <div id="${uniqueModalId}" data-timestamp="${timestamp}" style="position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.8) !important; z-index: 999999 !important; display: flex !important; align-items: center !important; justify-content: center !important; overflow-y: auto !important;">
      <div style="background: white !important; border-radius: 16px; padding: 30px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important;">
        <button onclick="closeReceiptDisplay('${uniqueModalId}')" style="position: absolute; top: 10px; right: 10px; width: 40px; height: 40px; border: none; background: #f44336; color: white; border-radius: 50%; font-size: 24px; cursor: pointer; line-height: 1; z-index: 1000000;">×</button>
        
        <div id="${uniqueContentId}" class="receiptContent" style="margin-top: 20px;">
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
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.remove();
      console.log('✅ モーダル削除:', modalId);
    }
  } else {
    const allModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
    console.log('🗑️ 全モーダル削除:', allModals.length);
    allModals.forEach(el => {
      el.remove();
    });
  }
  
  window.currentReceiptData = null;
  window.currentReceiptType = null;
  window.currentActiveModalId = null;
  window.currentActiveContentId = null;
  
  console.log('✅ モーダル閉じる処理完了');
}

// 🔧 【完全修正版】PNG保存
async function saveReceiptPNG() {
  console.log('💾 PNG保存開始');
  console.log('🆔 使用するコンテンツID:', window.currentActiveContentId);
  
  // 🔧 【重要】グローバル変数から現在アクティブなコンテンツIDを取得
  const contentId = window.currentActiveContentId;
  
  if (!contentId) {
    alert('保存対象のレシートが見つかりません');
    console.error('❌ currentActiveContentIdが設定されていません');
    return;
  }
  
  const element = document.getElementById(contentId);
  
  if (!element) {
    alert('レシート要素が見つかりません');
    console.error('❌ 要素が見つかりません:', contentId);
    return;
  }
  
  if (typeof html2canvas === 'undefined') {
    alert('画像変換ライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  try {
    console.log('📸 キャプチャ開始:', element.id);
    
    const canvas = await html2canvas(element, {
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

// 🔧 【完全修正版】QRコード発行
window.issueReceiptQR = async function issueReceiptQR() {
  console.log('📱 ==== QRコード生成開始 ====');
  console.log('🆔 使用するコンテンツID:', window.currentActiveContentId);
  console.log('⏰ 時刻:', new Date().toISOString());
  
  // 🔧 【重要】まず、古いQRモーダルを全て削除
  const oldQRModals = document.querySelectorAll('#qrDisplayModal');
  console.log('🗑️ 古いQRモーダル削除:', oldQRModals.length);
  oldQRModals.forEach(el => el.remove());
  
  // 🔧 【重要】グローバル変数から現在アクティブなコンテンツIDを取得
  const contentId = window.currentActiveContentId;
  
  if (!contentId) {
    alert('QR発行対象のレシートが見つかりません');
    console.error('❌ currentActiveContentIdが設定されていません');
    return;
  }
  
  const element = document.getElementById(contentId);
  
  if (!element) {
    alert('レシート要素が見つかりません。モーダルを開き直してください。');
    console.error('❌ レシート要素が見つかりません:', contentId);
    return;
  }
  
  console.log('📸 キャプチャ対象:', element.id);
  console.log('📏 要素サイズ:', element.offsetWidth, 'x', element.offsetHeight);
  
  if (typeof QRCode === 'undefined') {
    alert('QRコードライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  if (typeof html2canvas === 'undefined') {
    alert('画像変換ライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  try {
    console.log('📸 html2canvasでキャプチャ開始');
    
    const canvas = await html2canvas(element, {
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
    
    // 🔧 古いレシートデータを削除（最新5件のみ保持）
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
    
    // 古いデータを削除（最新5件を残す）
    if (oldKeys.length >= 5) {
      const toDelete = oldKeys.slice(0, oldKeys.length - 4);
      console.log('🗑️ 古いレシートを削除:', toDelete.length, '件');
      toDelete.forEach(key => {
        localStorage.removeItem(key);
        console.log('  - 削除:', key);
      });
    }
    
    // LocalStorageに保存
    localStorage.setItem(id, imageData);
    localStorage.setItem('latest_receipt_id', id);
    
    console.log('✅ LocalStorage保存完了');
    console.log('📦 現在の保存件数:', localStorage.length);
    
    // 🔧 レシートモーダルは閉じない（QRモーダルのみ表示）
    
    // 現在のURLからベースURLを作成
    const currentUrl = window.location.href;
    const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
    // タイムスタンプを追加してキャッシュを防止
    const timestamp = Date.now();
    const qrUrl = baseUrl + 'receipt-view.html?id=' + id + '&t=' + timestamp;
    
    console.log('🔗 QR URL:', qrUrl);
    
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
          
          if (qrCanvas) {
            qrCanvas.style.display = 'none';
          }
          
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

console.log('✅ receipt-display-functions.js loaded (v4.0 - 完全修正版・連続発行対応)');
