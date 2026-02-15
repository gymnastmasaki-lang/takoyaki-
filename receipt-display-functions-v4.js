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
  
  // 🛍️ レジ袋情報を追加（レシート本体に含める）
  if (receiptData.bagNeeded && receiptData.bagQuantity > 0) {
    const bagPrice = receiptData.bagPrice || 0;
    itemsHtml += `
      <div style="margin: 12px 0; padding-bottom: 8px; border-bottom: 1px dashed #ddd;">
        <div style="font-size: 13px; color: #333; margin-bottom: 2px; display: flex; justify-content: space-between;">
          <span>🛍️ レジ袋 × ${receiptData.bagQuantity}</span>
          <span>¥${bagPrice.toLocaleString()}</span>
        </div>
      </div>
    `;
    console.log('🛍️ レジ袋情報を追加:', receiptData.bagQuantity + '枚, ¥' + bagPrice);
  }
  
  // 消費税計算
  let tax8Total = receiptData.tax8Total || 0;
  let tax10Total = receiptData.tax10Total || 0;
  let totalTax = 0;
  
  if (tax8Total > 0 || tax10Total > 0) {
    totalTax = tax8Total + tax10Total;
  }
  
  // 合計金額
  const totalAmount = receiptData.totalAmount || receiptData.total || 0;
  
  console.log('💰 合計金額:', totalAmount);
  console.log('🔖 消費税(8%):', tax8Total);
  console.log('🔖 消費税(10%):', tax10Total);
  console.log('🔖 消費税合計:', totalTax);
  
  // レシートHTML生成
  const uniqueId = 'receiptDisplayModal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const receiptModal = document.createElement('div');
  receiptModal.id = uniqueId;
  receiptModal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.7) !important; z-index: 99999999 !important; display: flex !important; align-items: center !important; justify-content: center !important; overflow-y: auto !important;';
  
  receiptModal.innerHTML = `
    <div style="background: white; border-radius: 20px; padding: 30px; max-width: 600px; width: 95%; max-height: 95vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
      
      <div id="receipt-content" style="font-family: 'MS Gothic', 'Osaka-Mono', 'Courier New', monospace; max-width: 380px; margin: 0 auto; background: white; padding: 20px; border: 2px solid #333;">
        <!-- レシートヘッダー -->
        <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 15px;">
          <div style="font-size: 20px; font-weight: bold; margin-bottom: 8px;">${receiptStoreName}</div>
          <div style="font-size: 12px; line-height: 1.6;">
            ${receiptAddress}<br>
            ${receiptPhone}
          </div>
        </div>
        
        <!-- レシート番号・日時 -->
        <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #ccc;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="font-size: 14px;">レシート番号:</span>
            <span style="font-size: 14px; font-weight: bold;">#${orderNum}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-size: 14px;">日時:</span>
            <span style="font-size: 14px;">${dateStr}</span>
          </div>
        </div>
        
        <!-- 商品リスト -->
        <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #000;">
          ${itemsHtml}
        </div>
        
        <!-- 合計金額 -->
        <div style="margin-bottom: 20px; padding: 15px; background: #f8f8f8; border: 2px solid #000;">
          ${tax8Total > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px;">
            <span>消費税(8%):</span>
            <span>¥${tax8Total.toLocaleString()}</span>
          </div>
          ` : ''}
          ${tax10Total > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px;">
            <span>消費税(10%):</span>
            <span>¥${tax10Total.toLocaleString()}</span>
          </div>
          ` : ''}
          ${totalTax > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #ccc; font-size: 13px; font-weight: bold;">
            <span>消費税合計:</span>
            <span>¥${totalTax.toLocaleString()}</span>
          </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; font-size: 20px; font-weight: bold;">
            <span>合計金額:</span>
            <span style="color: #d32f2f;">¥${totalAmount.toLocaleString()}</span>
          </div>
        </div>
        
        <!-- メッセージ -->
        <div style="text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #ccc;">
          <div style="font-size: 14px; margin-bottom: 5px;">${receiptMessage1}</div>
          <div style="font-size: 14px;">${receiptMessage2}</div>
        </div>
      </div>
      
      <!-- ボタン -->
      <div style="margin-top: 30px; display: flex; gap: 15px;">
        <button onclick="generateAndShowQRCode('${uniqueId}')" style="flex: 1; padding: 18px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
          QRコード表示
        </button>
        <button onclick="closeReceiptModal('${uniqueId}')" style="flex: 1; padding: 18px; background: #666; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer;">
          閉じる
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(receiptModal);
  console.log('✅ レシートモーダル追加完了:', uniqueId);
  
  // モーダル外クリックで閉じる
  receiptModal.addEventListener('click', function(e) {
    if (e.target === receiptModal) {
      closeReceiptModal(uniqueId);
    }
  });
}

// 領収書表示関数
async function showInvoiceDisplay(receiptData) {
  console.log('📄 ==== 領収書表示開始 ====');
  console.log('🔍 受信データ:', receiptData);
  
  // 既存のモーダルを削除
  const existingModals = document.querySelectorAll('[id^="receiptDisplayModal"], #qrDisplayModal');
  console.log('🗑️ 既存モーダル削除:', existingModals.length);
  existingModals.forEach(el => el.remove());
  
  await new Promise(resolve => setTimeout(resolve, 50));
  
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
  const now = new Date(receiptData.timestamp || Date.now());
  const dateStr = now.getFullYear() + '年' + 
                  String(now.getMonth() + 1).padStart(2, '0') + '月' + 
                  String(now.getDate()).padStart(2, '0') + '日';
  
  // 合計金額
  const totalAmount = receiptData.totalAmount || receiptData.total || 0;
  
  // 但し書きの内容
  const description = 'お食事代として';
  
  // 領収書HTML生成
  const uniqueId = 'receiptDisplayModal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const invoiceModal = document.createElement('div');
  invoiceModal.id = uniqueId;
  invoiceModal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.7) !important; z-index: 99999999 !important; display: flex !important; align-items: center !important; justify-content: center !important; overflow-y: auto !important;';
  
  invoiceModal.innerHTML = `
    <div style="background: white; border-radius: 20px; padding: 30px; max-width: 700px; width: 95%; max-height: 95vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
      
      <div id="receipt-content" style="font-family: 'MS Mincho', 'Yu Mincho', serif; max-width: 600px; margin: 0 auto; background: white; padding: 40px; border: 3px double #000;">
        <!-- 領収書タイトル -->
        <div style="text-align: center; margin-bottom: 40px;">
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">領収書</div>
        </div>
        
        <!-- 宛名 -->
        <div style="margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px;">
          <div style="font-size: 20px; font-weight: bold;">
            ${receiptData.customerName || '_______________'} 様
          </div>
        </div>
        
        <!-- 金額 -->
        <div style="margin-bottom: 30px; text-align: center; padding: 20px; border: 2px solid #000;">
          <div style="font-size: 16px; margin-bottom: 10px;">金額</div>
          <div style="font-size: 36px; font-weight: bold; color: #d32f2f;">
            ¥${totalAmount.toLocaleString()}
          </div>
          <div style="font-size: 14px; margin-top: 10px;">（税込）</div>
        </div>
        
        <!-- 但し書き -->
        <div style="margin-bottom: 30px;">
          <div style="font-size: 16px; display: flex; align-items: center;">
            <span style="margin-right: 10px;">但し</span>
            <span style="border-bottom: 1px solid #000; flex: 1; padding-bottom: 5px;">${description}</span>
          </div>
        </div>
        
        <!-- 発行日 -->
        <div style="margin-bottom: 40px; text-align: right;">
          <div style="font-size: 16px;">発行日: ${dateStr}</div>
        </div>
        
        <!-- 発行元情報 -->
        <div style="text-align: right; border-top: 2px solid #000; padding-top: 20px;">
          <div style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">${receiptStoreName}</div>
          <div style="font-size: 14px; line-height: 1.8;">
            ${receiptAddress}<br>
            ${receiptPhone}
          </div>
        </div>
      </div>
      
      <!-- ボタン -->
      <div style="margin-top: 30px; display: flex; gap: 15px;">
        <button onclick="generateAndShowQRCode('${uniqueId}')" style="flex: 1; padding: 18px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
          QRコード表示
        </button>
        <button onclick="closeReceiptModal('${uniqueId}')" style="flex: 1; padding: 18px; background: #666; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer;">
          閉じる
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(invoiceModal);
  console.log('✅ 領収書モーダル追加完了:', uniqueId);
  
  // モーダル外クリックで閉じる
  invoiceModal.addEventListener('click', function(e) {
    if (e.target === invoiceModal) {
      closeReceiptModal(uniqueId);
    }
  });
}

// QRコード生成と表示
async function generateAndShowQRCode(modalId) {
  console.log('🔨 QRコード生成開始');
  
  const modal = document.getElementById(modalId);
  if (!modal) {
    console.error('❌ モーダルが見つかりません:', modalId);
    return;
  }
  
  const receiptContent = modal.querySelector('#receipt-content');
  if (!receiptContent) {
    console.error('❌ レシート内容が見つかりません');
    return;
  }
  
  console.log('📸 html2canvasでキャプチャ開始...');
  
  // html2canvasライブラリの読み込みを待つ（最大5秒）
  let attempts = 0;
  const maxAttempts = 50;
  console.log('⏳ html2canvasライブラリの読み込みを待機中...');
  while (typeof html2canvas === 'undefined' && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
    if (attempts % 10 === 0) {
      console.log(`⏳ 待機中... (${attempts * 100}ms / ${maxAttempts * 100}ms)`);
    }
  }
  
  if (typeof html2canvas === 'undefined') {
    console.error('❌ html2canvasライブラリが読み込まれていません');
    alert('画像生成ライブラリの読み込みに失敗しました。ページを再読み込みしてください。');
    return;
  }
  
  try {
    // html2canvasでレシート画像を生成
    const canvas = await html2canvas(receiptContent, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true
    });
    
    console.log('✅ キャプチャ完了');
    
    // canvasをbase64画像データに変換
    const imageData = canvas.toDataURL('image/png');
    console.log('📦 画像データ変換完了:', imageData.substring(0, 50) + '...');
    
    // Firebaseストレージにアップロード
    console.log('☁️ Firebaseストレージへアップロード開始...');
    
    // base64をBlobに変換
    const base64Data = imageData.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    
    // ファイル名を生成（7日後に削除されるように設定）
    const timestamp = Date.now();
    const fileName = `receipts/${timestamp}_receipt.png`;
    
    // Firebaseストレージにアップロード
    const storageRef = window.ref(window.storage, fileName);
    const uploadResult = await window.uploadBytes(storageRef, blob);
    console.log('✅ アップロード完了:', uploadResult);
    
    // ダウンロードURLを取得
    const downloadURL = await window.getDownloadURL(storageRef);
    console.log('🔗 ダウンロードURL取得:', downloadURL);
    
    // QRコードモーダルを表示
    await showQRCodeModal(downloadURL, imageData);
    
  } catch (error) {
    console.error('❌ QRコード生成エラー:', error);
    alert('QRコードの生成に失敗しました: ' + error.message);
  }
}

// QRコード表示モーダル
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
      <div id="qrCodeContainerModal" style="display: flex !important; justify-content: center !important; align-items: center !important; margin: 20px auto !important; min-height: 256px !important; width: 280px !important; background: #f0f0f0; border: 2px solid #ccc; overflow: visible !important;"></div>
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
      
      // コンテナのスタイルを事前に設定
      qrContainer.style.cssText = 'display: flex !important; justify-content: center !important; align-items: center !important; margin: 20px auto !important; min-height: 256px !important; width: 280px !important; background: #f0f0f0; border: 2px solid #ccc; overflow: visible !important;';
      
      // QRコードを直接生成
      const qrcode = new QRCode(qrContainer, {
        text: qrUrl,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
      
      console.log('✅ QRコード生成完了');
      
      // 描画完了を待つための関数
      const waitForQRRender = (attempts = 0) => {
        if (attempts > 20) {
          console.error('❌ QRコードの描画がタイムアウトしました');
          qrContainer.innerHTML = '<div style="color: red; padding: 20px;">QRコードの表示に失敗しました</div>';
          return;
        }
        
        const canvas = qrContainer.querySelector('canvas');
        const img = qrContainer.querySelector('img');
        
        if (canvas || img) {
          console.log('🎨 QR要素を発見:', canvas ? 'canvas' : 'img');
          
          // imgがある場合はimgのみ表示、canvasは非表示
          // imgがない場合のみcanvasを表示
          if (img) {
            // canvasを非表示
            if (canvas) {
              canvas.style.display = 'none';
            }
            // imgのみ表示
            img.style.cssText = 'display: block !important; margin: 0 auto !important; width: 256px !important; height: 256px !important; visibility: visible !important; opacity: 1 !important; position: relative !important; z-index: 1 !important;';
            console.log('✅ Img要素のみを表示しました');
          } else if (canvas) {
            // imgがない場合はcanvasを表示
            canvas.style.cssText = 'display: block !important; margin: 0 auto !important; width: 256px !important; height: 256px !important; visibility: visible !important; opacity: 1 !important; position: relative !important; z-index: 1 !important;';
            console.log('✅ Canvas要素を表示しました');
          }
          
          // 親要素のスタイルも再設定
          qrContainer.style.cssText = 'display: block !important; text-align: center !important; margin: 20px auto !important; min-height: 256px !important; width: 280px !important; background: #f0f0f0; border: 2px solid #ccc; overflow: visible !important; padding: 10px !important;';
          
          console.log('📦 QRコンテナの子要素数:', qrContainer.children.length);
        } else {
          // まだ描画されていない場合は再試行
          setTimeout(() => waitForQRRender(attempts + 1), 50);
        }
      };
      
      // 描画を待つ
      setTimeout(() => waitForQRRender(), 100);
      
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

console.log('✅ receipt-display-functions-v5.js 読み込み完了');
