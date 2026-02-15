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
  
  const receiptModal = document.createElement('div');
  receiptModal.id = 'receiptDisplayModal_' + Date.now();
  receiptModal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.8) !important; z-index: 99999998 !important; display: flex !important; align-items: center !important; justify-content: center !important;';
  
  receiptModal.innerHTML = `
    <div style="background: white; border-radius: 10px; padding: 20px; max-width: 400px; width: 95%; max-height: 95vh; overflow-y: auto;">
      <div id="receiptContent" style="font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.5;">
        <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 15px;">
          <div style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">${receiptStoreName}</div>
          <div style="font-size: 12px; color: #666;">${receiptAddress}</div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">${receiptPhone}</div>
        </div>
        
        <div style="margin: 15px 0; padding: 10px 0; border-bottom: 1px solid #ddd;">
          <div style="font-size: 12px; color: #666;">日時: ${dateStr}</div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">注文番号: ${orderNum}</div>
        </div>
        
        <div style="border-top: 2px solid #333; border-bottom: 2px solid #333; padding: 12px 0; margin: 15px 0;">
          <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">ご注文内容</div>
          ${itemsHtml}
        </div>
        
        <div style="border-bottom: 2px solid #333; padding: 12px 0; margin: 15px 0;">
          ${tax8Total > 0 ? `<div style="display: flex; justify-content: space-between; margin: 6px 0; font-size: 12px; color: #666;"><span>8%対象額</span><span>¥${tax8Total.toLocaleString()}</span></div>` : ''}
          ${tax10Total > 0 ? `<div style="display: flex; justify-content: space-between; margin: 6px 0; font-size: 12px; color: #666;"><span>10%対象額</span><span>¥${tax10Total.toLocaleString()}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; margin: 6px 0; font-size: 12px; color: #666;"><span>うち消費税</span><span>¥${totalTax.toLocaleString()}</span></div>
          <div style="display: flex; justify-content: space-between; margin-top: 12px; font-size: 18px; font-weight: bold;">
            <span>合計金額</span>
            <span>¥${receiptData.total.toLocaleString()}</span>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px dashed #ccc;">
          <div style="font-size: 13px; margin: 8px 0;">${receiptMessage1}</div>
          <div style="font-size: 13px; margin: 8px 0;">${receiptMessage2}</div>
        </div>
      </div>
      
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button onclick="generateAndShowQRCode()" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: bold; cursor: pointer;">
          QRコード発行
        </button>
        <button onclick="closeReceiptModal('${receiptModal.id}')" style="flex: 1; padding: 15px; background: #666; color: white; border: none; border-radius: 8px; font-size: 15px; cursor: pointer;">
          閉じる
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(receiptModal);
  console.log('✅ レシート表示モーダル作成完了');
  
  // モーダルの外側クリックで閉じる
  receiptModal.addEventListener('click', function(e) {
    if (e.target === receiptModal) {
      closeReceiptModal(receiptModal.id);
    }
  });
}

// 領収書表示関数（同様の構造）
async function showInvoiceDisplay(invoiceData) {
  console.log('📄 ==== 領収書表示開始 ====');
  console.log('🔍 受信データ:', invoiceData);
  
  const existingModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
  console.log('🗑️ 既存モーダル削除:', existingModals.length);
  existingModals.forEach(el => el.remove());
  
  await new Promise(resolve => setTimeout(resolve, 50));
  
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
  
  const now = new Date(invoiceData.timestamp || Date.now());
  const dateStr = now.getFullYear() + '/' + 
                  String(now.getMonth() + 1).padStart(2, '0') + '/' + 
                  String(now.getDate()).padStart(2, '0');
  
  const invoiceModal = document.createElement('div');
  invoiceModal.id = 'receiptDisplayModal_' + Date.now();
  invoiceModal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.8) !important; z-index: 99999998 !important; display: flex !important; align-items: center !important; justify-content: center !important;';
  
  invoiceModal.innerHTML = `
    <div style="background: white; border-radius: 10px; padding: 20px; max-width: 400px; width: 95%; max-height: 95vh; overflow-y: auto;">
      <div id="receiptContent" style="font-family: 'MS Mincho', serif; font-size: 14px; line-height: 1.8;">
        <div style="text-align: center; border: 3px double #333; padding: 20px; margin-bottom: 20px;">
          <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px; letter-spacing: 8px;">領収書</div>
        </div>
        
        <div style="margin: 20px 0; padding: 15px; border: 1px solid #333;">
          <div style="font-size: 16px; margin-bottom: 10px;">
            <span style="border-bottom: 1px solid #333; padding-bottom: 2px;">${invoiceData.customerName || '　　　　　　　　　'}</span> 様
          </div>
          <div style="text-align: right; font-size: 20px; font-weight: bold; margin: 20px 0;">
            金額　¥${invoiceData.total.toLocaleString()}
          </div>
          <div style="font-size: 13px; margin-top: 15px;">
            上記正に領収いたしました
          </div>
        </div>
        
        <div style="margin: 20px 0; font-size: 13px;">
          <div style="margin: 8px 0;">但し　${invoiceData.description || 'お食事代として'}</div>
          <div style="margin: 8px 0;">発行日　${dateStr}</div>
        </div>
        
        <div style="text-align: right; margin-top: 30px; padding: 15px; border-top: 1px solid #333;">
          <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">${receiptStoreName}</div>
          <div style="font-size: 12px; color: #666;">${receiptAddress}</div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">${receiptPhone}</div>
        </div>
      </div>
      
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button onclick="generateAndShowQRCode()" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: bold; cursor: pointer;">
          QRコード発行
        </button>
        <button onclick="closeReceiptModal('${invoiceModal.id}')" style="flex: 1; padding: 15px; background: #666; color: white; border: none; border-radius: 8px; font-size: 15px; cursor: pointer;">
          閉じる
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(invoiceModal);
  console.log('✅ 領収書表示モーダル作成完了');
  
  invoiceModal.addEventListener('click', function(e) {
    if (e.target === invoiceModal) {
      closeReceiptModal(invoiceModal.id);
    }
  });
}

// QRコード生成とFirestore保存
async function generateAndShowQRCode() {
  console.log('🔨 QRコード生成開始');
  
  try {
    // html2canvasの読み込みを待つ
    let attempts = 0;
    while (typeof html2canvas === 'undefined' && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (typeof html2canvas === 'undefined') {
      throw new Error('html2canvas ライブラリが読み込まれていません');
    }
    
    const receiptContent = document.getElementById('receiptContent');
    if (!receiptContent) {
      throw new Error('レシート内容が見つかりません');
    }
    
    console.log('📸 Canvas生成中...');
    const canvas = await html2canvas(receiptContent, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      width: receiptContent.offsetWidth,
      height: receiptContent.offsetHeight
    });
    
    const imageData = canvas.toDataURL('image/png');
    console.log('✅ Canvas生成完了');
    console.log('📏 画像サイズ:', canvas.width, 'x', canvas.height);
    
    // Firestore関数の確認
    if (!window.db || !window.doc || !window.setDoc || !window.Timestamp) {
      throw new Error('Firestore が初期化されていません');
    }
    
    // Firestoreに保存
    const receiptId = 'receipt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    console.log('💾 Firestoreに保存中...', receiptId);
    
    const receiptRef = window.doc(window.db, 'receipt_images', receiptId);
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    await window.setDoc(receiptRef, {
      imageData: imageData,
      createdAt: window.Timestamp.now(),
      expiresAt: window.Timestamp.fromDate(expiresAt)
    });
    
    console.log('✅ Firestoreに保存完了:', receiptId);
    
    // QRコード表示用のURLを生成
    const qrUrl = `https://gymnastmasaki-lang.github.io/takoyaki-/receipt-view-firestore.html?id=${receiptId}`;
    console.log('🔗 QR URL:', qrUrl);
    
    // QRコード表示
    await showQRCodeModal(qrUrl, imageData);
    
  } catch (error) {
    console.error('❌ QRコード発行エラー:', error);
    console.error('エラー詳細:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    alert('QRコード発行に失敗しました:\n' + error.message + '\n\nコンソールを確認してください。');
  }
}

// QRコード表示モーダル（修正版）
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
      <div id="qrCodeContainer" style="display: flex !important; justify-content: center !important; align-items: center !important; margin: 20px auto !important; min-height: 256px !important; width: 256px !important; background: #f0f0f0; border: 2px solid #ccc;"></div>
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
  
  const qrContainer = document.getElementById('qrCodeContainer');
  console.log('📦 QRコンテナ:', qrContainer ? '見つかりました' : '見つかりません');
  console.log('📚 QRCodeライブラリ:', typeof QRCode !== 'undefined' ? '読み込み済み' : '未読み込み');
  
  if (qrContainer && typeof QRCode !== 'undefined') {
    try {
      console.log('🔨 QRコード生成開始:', qrUrl);
      // コンテナをクリア
      qrContainer.innerHTML = '';
      // QRコード生成
      const qrcode = new QRCode(qrContainer, {
        text: qrUrl,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
      console.log('✅ QRコード生成完了');
      console.log('📦 QRコンテナの内容:', qrContainer.innerHTML.substring(0, 200));
      console.log('📦 QRコンテナの子要素数:', qrContainer.children.length);
      
      // **修正: すぐにcanvasとimg要素を強制的に表示**
      // setTimeoutを使わず、即座にスタイルを適用
      const processQRElements = () => {
        const canvas = qrContainer.querySelector('canvas');
        const img = qrContainer.querySelector('img');
        
        if (canvas) {
          canvas.style.cssText = 'display: block !important; margin: 0 auto !important; width: 256px !important; height: 256px !important; visibility: visible !important; opacity: 1 !important;';
          console.log('✅ Canvas要素を表示しました');
          console.log('Canvas style:', canvas.style.cssText);
        }
        if (img) {
          img.style.cssText = 'display: block !important; margin: 0 auto !important; width: 256px !important; height: 256px !important; visibility: visible !important; opacity: 1 !important;';
          console.log('✅ Img要素を表示しました');
          console.log('Img style:', img.style.cssText);
        }
        
        // 要素が存在しない場合は少し待ってリトライ
        if (!canvas && !img) {
          console.log('⚠️ Canvas/Img要素がまだ生成されていません。リトライします...');
          setTimeout(processQRElements, 50);
        }
      };
      
      // 即座に実行
      processQRElements();
      
      // 念のため複数回実行（QRCodeライブラリが遅延して要素を追加する場合に備えて）
      setTimeout(processQRElements, 50);
      setTimeout(processQRElements, 200);
      setTimeout(processQRElements, 500);
      
    } catch (error) {
      console.error('❌ QRコード生成エラー:', error);
      qrContainer.innerHTML = '<div style="color: red; padding: 20px;">QRコード生成に失敗しました:<br>' + error.message + '</div>';
    }
  } else {
    const errorMsg = !qrContainer ? 'QRコンテナが見つかりません' : 'QRCodeライブラリが読み込まれていません';
    console.error('❌', errorMsg);
    if (qrContainer) {
      qrContainer.innerHTML = '<div style="color: red; padding: 20px;">' + errorMsg + '</div>';
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

console.log('✅ receipt-display-functions-v4-fixed.js 読み込み完了');
