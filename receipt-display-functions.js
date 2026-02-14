// ========== レシート・領収書表示システム（連続発行対応版）==========

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
  // 🔧 修正: 既存のモーダルを強制的に閉じる
  console.log('🔄 既存モーダルの確認...');
  const existingModal = document.getElementById('receiptDisplayModal');
  if (existingModal) {
    console.log('⚠️ 既存のモーダルを削除します');
    existingModal.remove();
  }
  
  // すべての同じIDのモーダルを念のため削除
  document.querySelectorAll('#receiptDisplayModal').forEach(el => {
    console.log('🗑️ 重複モーダルを削除');
    el.remove();
  });
  
  // 🚨 デバッグ: 受信データを強制表示
  const debugInfo = `
📄 レシート表示開始
注文番号: ${receiptData.orderNumber || receiptData.orderNum || '不明'}
テーブル: ${receiptData.tableNumber || '不明'}
合計: ¥${receiptData.total || 0}
タイムスタンプ: ${new Date().toLocaleTimeString()}
  `;
  console.log(debugInfo);
  alert(debugInfo);  // 強制的にアラート表示
  
  console.log('📄 ==== レシート表示開始 ====');
  console.log('🔍 受信データ:', receiptData);
  console.log('🔍 注文番号:', receiptData.orderNumber || receiptData.orderNum);
  console.log('🔍 合計金額:', receiptData.total);
  console.log('🔍 タイムスタンプ:', new Date().toISOString());
  
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
  
  // 🔧 完全修正: ordersから注文番号を取得
  let orderNum = null;
  
  console.log('🔢 注文番号探索開始...');
  
  // CRITICAL: ordersの中から注文番号を取得（handy対応）
  if (receiptData.orders && Array.isArray(receiptData.orders) && receiptData.orders.length > 0) {
    console.log('🔍 orders配列を確認:', receiptData.orders.length, '件');
    for (const order of receiptData.orders) {
      console.log('  - order:', order);
      if (order.orderNumber) {
        orderNum = order.orderNumber;
        console.log('✅ orders[].orderNumberから取得:', orderNum);
        break;
      }
    }
  }
  
  // フォールバック1: 直接のフィールド
  if (!orderNum) {
    if (receiptData.orderNumber) {
      orderNum = receiptData.orderNumber;
      console.log('✅ orderNumberから取得:', orderNum);
    } else if (receiptData.orderNum) {
      orderNum = receiptData.orderNum;
      console.log('✅ orderNumから取得:', orderNum);
    }
  }
  
  // フォールバック2: checkoutData
  if (!orderNum && receiptData.checkoutData) {
    if (receiptData.checkoutData.orderNumber) {
      orderNum = receiptData.checkoutData.orderNumber;
      console.log('✅ checkoutData.orderNumberから取得:', orderNum);
    }
  }
  
  // フォールバック3: グローバル変数
  if (!orderNum && window.currentOrderNumber) {
    orderNum = window.currentOrderNumber;
    console.log('✅ window.currentOrderNumberから取得:', orderNum);
  }
  
  // エラー表示
  if (!orderNum) {
    console.error('❌ 注文番号が見つかりません！');
    console.error('   受信データ:', receiptData);
    orderNum = '番号不明';
  }
  
  console.log('🔢 最終的な注文番号:', orderNum);
  
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
  const tax8Total = receiptData.tax8Total || 0;
  const tax10Total = receiptData.tax10Total || 0;
  const tax8Excluded = Math.floor(tax8Total / 1.08);
  const tax10Excluded = Math.floor(tax10Total / 1.10);
  const tax8Amount = tax8Total - tax8Excluded;
  const tax10Amount = tax10Total - tax10Excluded;
  const totalTax = tax8Amount + tax10Amount;
  
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
  const finalData = {
    ...receiptData,
    orderNumber: orderNum,
    orderNum: orderNum
  };
  
  // レシート表示（タブ切り替え方式）
  showReceiptModal(finalData, receiptHtml);
}

// 領収書表示関数
async function showInvoiceDisplay(invoiceData) {
  // 🔧 修正: 既存のモーダルを強制的に閉じる
  console.log('🔄 既存モーダルの確認...');
  const existingModal = document.getElementById('receiptDisplayModal');
  if (existingModal) {
    console.log('⚠️ 既存のモーダルを削除します');
    existingModal.remove();
  }
  
  // すべての同じIDのモーダルを念のため削除
  document.querySelectorAll('#receiptDisplayModal').forEach(el => {
    console.log('🗑️ 重複モーダルを削除');
    el.remove();
  });
  
  console.log('📄 ==== 領収書表示開始 ====');
  console.log('🔍 受信データ:', invoiceData);
  
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
  
  // 注文番号取得（レシートと同じロジック）
  let orderNum = null;
  
  if (invoiceData.orders && Array.isArray(invoiceData.orders) && invoiceData.orders.length > 0) {
    for (const order of invoiceData.orders) {
      if (order.orderNumber) {
        orderNum = order.orderNumber;
        break;
      }
    }
  }
  
  if (!orderNum) {
    if (invoiceData.orderNumber) {
      orderNum = invoiceData.orderNumber;
    } else if (invoiceData.orderNum) {
      orderNum = invoiceData.orderNum;
    }
  }
  
  if (!orderNum && invoiceData.checkoutData) {
    if (invoiceData.checkoutData.orderNumber) {
      orderNum = invoiceData.checkoutData.orderNumber;
    }
  }
  
  if (!orderNum && window.currentOrderNumber) {
    orderNum = window.currentOrderNumber;
  }
  
  if (!orderNum) {
    orderNum = '番号不明';
  }
  
  const invoiceHtml = `
    <div style="font-family: 'MS Mincho', '游明朝', serif; border: 3px double #000; padding: 30px; max-width: 600px; margin: 0 auto; background: white;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin-bottom: 20px;">領　収　書</div>
        <div style="font-size: 14px; color: #666;">No. ${orderNum}</div>
      </div>
      
      <div style="margin: 30px 0;">
        <div style="font-size: 18px; margin-bottom: 10px;">
          <span style="display: inline-block; min-width: 200px; border-bottom: 1px solid #000; padding-bottom: 5px;">
            ${invoiceData.customerName || '　　　　　　　　　　'}
          </span>
          <span style="margin-left: 10px;">様</span>
        </div>
      </div>
      
      <div style="text-align: center; margin: 40px 0; padding: 20px; border: 2px solid #000; background: #f9f9f9;">
        <div style="font-size: 16px; margin-bottom: 5px;">金　額</div>
        <div style="font-size: 36px; font-weight: bold;">
          ¥ ${invoiceData.total.toLocaleString()}
          <span style="font-size: 20px; margin-left: 5px;">-</span>
        </div>
        <div style="font-size: 14px; margin-top: 10px; color: #666;">（内消費税: ¥${(invoiceData.tax8Total || 0) + (invoiceData.tax10Total || 0) - Math.floor((invoiceData.tax8Total || 0) / 1.08) - Math.floor((invoiceData.tax10Total || 0) / 1.10)}）</div>
      </div>
      
      <div style="margin: 30px 0;">
        <div style="font-size: 14px; margin-bottom: 10px;">但し、</div>
        <div style="border-bottom: 1px solid #000; padding-bottom: 5px; min-height: 30px;">
          ${invoiceData.description || '飲食代として'}
        </div>
      </div>
      
      <div style="margin: 30px 0;">
        <div style="font-size: 14px; margin-bottom: 10px;">上記正に領収いたしました。</div>
      </div>
      
      <div style="margin-top: 50px; text-align: right;">
        <div style="font-size: 14px; color: #666; margin-bottom: 5px;">${dateStr}</div>
        <div style="margin-top: 20px; border-top: 2px solid #000; padding-top: 15px; display: inline-block; text-align: left; min-width: 250px;">
          <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px;">${receiptStoreName}</div>
          <div style="font-size: 12px;">${receiptAddress}</div>
          <div style="font-size: 12px;">${receiptPhone}</div>
          <div style="margin-top: 20px; text-align: right; font-size: 48px; font-family: 'Brush Script MT', cursive; color: #d32f2f; position: relative;">
            印
          </div>
        </div>
      </div>
    </div>
  `;
  
  const finalData = {
    ...invoiceData,
    orderNumber: orderNum,
    orderNum: orderNum
  };
  
  // 領収書表示
  showReceiptModal(finalData, invoiceHtml, 'invoice');
}

// 🔧 重要な修正: モーダル表示関数を完全に書き直し
function showReceiptModal(data, contentHtml, type = 'receipt') {
  console.log('📱 モーダル表示関数開始');
  console.log('  - タイプ:', type);
  console.log('  - データ:', data);
  
  // 🔧 修正1: 既存のモーダルを完全に削除
  const existingModals = document.querySelectorAll('#receiptDisplayModal');
  if (existingModals.length > 0) {
    console.log(`⚠️ ${existingModals.length}個の既存モーダルを削除`);
    existingModals.forEach(modal => modal.remove());
  }
  
  // 🔧 修正2: ユニークIDを生成（タイムスタンプベース）
  const timestamp = Date.now();
  const uniqueContentId = 'receiptContent_' + timestamp;
  
  console.log('🆔 新しいコンテンツID:', uniqueContentId);
  console.log('⏰ タイムスタンプ:', timestamp);
  
  const modalTitle = type === 'invoice' ? '領収書' : 'レシート';
  
  const modalHtml = `
    <div id="receiptDisplayModal" style="position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.8) !important; z-index: 9999998 !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 20px !important;" data-timestamp="${timestamp}">
      <div style="background: white !important; border-radius: 16px !important; max-width: 800px !important; width: 100% !important; max-height: 90vh !important; overflow-y: auto !important; box-shadow: 0 10px 40px rgba(0,0,0,0.3) !important;">
        <div style="position: sticky !important; top: 0 !important; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; color: white !important; padding: 20px !important; border-radius: 16px 16px 0 0 !important; z-index: 10 !important;">
          <div style="display: flex !important; justify-content: space-between !important; align-items: center !important;">
            <h3 style="margin: 0 !important; font-size: 24px !important; font-weight: bold !important;">${modalTitle}プレビュー</h3>
            <button onclick="closeReceiptDisplay()" style="background: rgba(255,255,255,0.2) !important; border: none !important; color: white !important; font-size: 28px !important; width: 40px !important; height: 40px !important; border-radius: 50% !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; transition: background 0.2s !important;">
              ×
            </button>
          </div>
        </div>
        
        <div id="${uniqueContentId}" class="receiptContent" style="padding: 30px !important; background: white !important;">
          ${contentHtml}
        </div>
        
        <div style="padding: 20px !important; background: #f5f5f5 !important; border-radius: 0 0 16px 16px !important;">
          <div style="display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 15px !important;">
            <button onclick="saveReceiptPNG('${uniqueContentId}')" style="padding: 18px !important; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%) !important; color: white !important; border: none !important; border-radius: 12px !important; font-size: 18px !important; font-weight: bold !important; cursor: pointer !important; transition: transform 0.2s !important;">
              💾 PNG保存
            </button>
            <button onclick="issueReceiptQR('${uniqueContentId}')" style="padding: 18px !important; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%) !important; color: white !important; border: none !important; border-radius: 12px !important; font-size: 18px !important; font-weight: bold !important; cursor: pointer !important; transition: transform 0.2s !important;">
              📱 QR発行
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // 🔧 修正3: データを一時保存（タイムスタンプとコンテンツID付き）
  window.currentReceiptData = { ...data, _timestamp: timestamp, _contentId: uniqueContentId };
  window.currentReceiptType = type;
  
  console.log('✅ モーダルを表示しました');
  console.log('  - 注文番号:', data.orderNumber);
  console.log('  - タイムスタンプ:', timestamp);
  console.log('  - コンテンツID:', uniqueContentId);
}

// モーダルを閉じる
function closeReceiptDisplay() {
  console.log('🗑️ モーダルを閉じます');
  const modal = document.getElementById('receiptDisplayModal');
  if (modal) {
    modal.remove();
  }
  // 念のため、すべての同じIDのモーダルを削除
  document.querySelectorAll('#receiptDisplayModal').forEach(el => el.remove());
  
  // データをクリア
  window.currentReceiptData = null;
  window.currentReceiptType = null;
  
  console.log('✅ モーダルを閉じました');
}

// PNG保存
async function saveReceiptPNG(contentId) {
  console.log('💾 PNG保存開始');
  
  // コンテンツIDを取得（引数または currentReceiptData から）
  const elementId = contentId || (window.currentReceiptData && window.currentReceiptData._contentId) || 'receiptContent';
  console.log('🆔 使用するコンテンツID:', elementId);
  
  const element = document.getElementById(elementId);
  
  if (!element) {
    console.error('❌ 要素が見つかりません:', elementId);
    // フォールバック: classで検索
    const fallbackElement = document.querySelector('.receiptContent');
    if (!fallbackElement) {
      alert('レシート要素が見つかりません');
      return;
    }
    console.log('✅ フォールバック要素を使用');
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
  console.log('📱 QRコード生成開始');
  console.log('📋 現在のレシートデータ:', window.currentReceiptData);
  
  // コンテンツIDを取得（引数または currentReceiptData から）
  const elementId = contentId || (window.currentReceiptData && window.currentReceiptData._contentId) || 'receiptContent';
  console.log('🆔 使用するコンテンツID:', elementId);
  
  const element = document.getElementById(elementId);
  
  if (!element) {
    console.error('❌ receiptContent要素が見つかりません, ID:', elementId);
    // フォールバック: classで検索
    const fallbackElement = document.querySelector('.receiptContent');
    if (!fallbackElement) {
      alert('レシート要素が見つかりません。モーダルを開き直してください。');
      return;
    }
    console.log('✅ フォールバック要素を使用');
  }
  
  const targetElement = element || document.querySelector('.receiptContent');
  
  console.log('📄 receiptContent要素:', targetElement);
  console.log('📝 HTML内容（最初の200文字）:', targetElement.innerHTML.substring(0, 200));
  
  if (typeof QRCode === 'undefined') {
    alert('QRコードライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  if (typeof html2canvas === 'undefined') {
    alert('画像変換ライブラリが読み込まれていません。ページを再読み込みしてください。');
    return;
  }
  
  try {
    // 🔧 修正: LocalStorageの古いレシートを削除（最新10件のみ保持）
    console.log('🧹 LocalStorageクリーンアップ開始...');
    const receiptKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('receipt_')) {
        receiptKeys.push(key);
      }
    }
    
    // タイムスタンプでソート（古い順）
    receiptKeys.sort((a, b) => {
      const timeA = parseInt(a.replace('receipt_', '')) || 0;
      const timeB = parseInt(b.replace('receipt_', '')) || 0;
      return timeA - timeB;
    });
    
    // 古いものから削除（最新10件を残す）
    const keepCount = 10;
    if (receiptKeys.length > keepCount) {
      const deleteCount = receiptKeys.length - keepCount;
      console.log(`📦 ${receiptKeys.length}件のレシートがあります。${deleteCount}件を削除します`);
      
      for (let i = 0; i < deleteCount; i++) {
        const keyToDelete = receiptKeys[i];
        localStorage.removeItem(keyToDelete);
        console.log('🗑️ 削除:', keyToDelete);
      }
    }
    
    // html2canvasのキャッシュをクリア
    console.log('🔄 キャンバス生成開始...');
    const canvas = await html2canvas(targetElement, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false
    });
    
    const imageData = canvas.toDataURL();
    const id = 'receipt_' + Date.now();
    
    console.log('🖼️ 生成された画像データ（最初の100文字）:', imageData.substring(0, 100));
    
    // LocalStorageに保存
    console.log('💾 LocalStorageに保存:', id);
    localStorage.setItem(id, imageData);
    console.log('✅ 保存完了（サイズ:', imageData.length, '文字）');
    
    // 保存されたデータを確認
    const savedData = localStorage.getItem(id);
    console.log('🔍 保存確認:', savedData ? '保存成功' : '保存失敗');
    console.log('🔍 保存データ（最初の100文字）:', savedData ? savedData.substring(0, 100) : 'なし');
    
    // 最新レシートIDも保存
    localStorage.setItem('latest_receipt_id', id);
    console.log('✅ 最新レシートIDを保存:', id);
    
    // レシートモーダルを閉じる
    const receiptModal = document.getElementById('receiptDisplayModal');
    if (receiptModal) {
      receiptModal.remove();
    }
    
    // 現在のURLからベースURLを作成
    const currentUrl = window.location.href;
    const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
    const qrUrl = baseUrl + 'receipt-view.html?id=' + id;
    
    console.log('🔗 QR URL:', qrUrl);
    
    // QRコード表示モーダルを作成
    const qrModal = document.createElement('div');
    qrModal.id = 'qrDisplayModal';
    qrModal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.9) !important; z-index: 9999999 !important; display: flex !important; align-items: center !important; justify-content: center !important;';
    
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

console.log('✅ receipt-display-functions.js loaded (v3.0 - 連続発行対応・自動クリーンアップ機能付き)');
