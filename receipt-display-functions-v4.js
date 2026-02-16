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
  if (receiptData.bagNeeded === true || receiptData.bagNeeded === 'true') {
    const bagQty = receiptData.bagQuantity || 1;
    const bagPrice = receiptData.bagPrice || 0;
    const bagTotal = bagQty * bagPrice;
    
    console.log('🛍️ レジ袋を追加 - 数量:', bagQty, '単価:', bagPrice, '合計:', bagTotal);
    
    itemsHtml += `
      <div style="margin: 12px 0; padding-bottom: 8px; border-bottom: 1px dashed #ddd;">
        <div style="font-size: 13px; color: #333; margin-bottom: 2px; display: flex; justify-content: space-between;">
          <span>レジ袋 × ${bagQty}</span>
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
  
  // 小計と合計
  const subtotal = receiptData.subtotal || receiptData.total || 0;
  const tax = receiptData.tax || 0;
  const total = receiptData.total || subtotal;
  
  const paymentMethod = receiptData.paymentMethod || '現金';
  const receivedAmount = receiptData.receivedAmount || receiptData.total || 0;
  const changeAmount = receiptData.changeAmount || 0;
  
  console.log('💰 支払い情報 - 受け取り:', receivedAmount, '釣り:', changeAmount);
  
  // モーダルHTML生成
  const modalHtml = `
    <div id="receiptDisplayModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 999999; display: flex; align-items: center; justify-content: center;">
      <div style="background: white; border-radius: 20px; padding: 30px; max-width: 400px; width: 95%; max-height: 90vh; overflow-y: auto;">
        <h2 style="text-align: center; margin: 0 0 20px 0; font-size: 22px; color: #333;">レシート</h2>
        
        <div id="receiptContent" style="font-family: 'Courier New', monospace; background: white; padding: 20px; border: 2px solid #ddd; border-radius: 8px;">
          <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 15px;">
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">${receiptStoreName}</div>
            <div style="font-size: 12px; color: #666; margin-bottom: 3px;">${receiptAddress}</div>
            <div style="font-size: 12px; color: #666;">${receiptPhone}</div>
          </div>
          
          <div style="font-size: 12px; color: #666; margin-bottom: 20px;">
            <div>日時: ${dateStr}</div>
            <div>注文番号: ${orderNum}</div>
          </div>
          
          <div style="border-top: 1px solid #ddd; padding-top: 15px;">
            ${itemsHtml}
          </div>
          
          <div style="border-top: 2px solid #333; padding-top: 15px; margin-top: 20px;">
            <div style="font-size: 14px; margin: 8px 0; display: flex; justify-content: space-between;">
              <span>小計</span>
              <span>¥${subtotal.toLocaleString()}</span>
            </div>
            <div style="font-size: 14px; margin: 8px 0; display: flex; justify-content: space-between;">
              <span>消費税 (10%)</span>
              <span>¥${tax.toLocaleString()}</span>
            </div>
            <div style="font-size: 18px; font-weight: bold; margin: 15px 0; display: flex; justify-content: space-between; border-top: 2px solid #333; padding-top: 10px;">
              <span>合計</span>
              <span>¥${total.toLocaleString()}</span>
            </div>
          </div>
          
          <div style="border-top: 1px dashed #999; padding-top: 15px; margin-top: 15px; font-size: 13px;">
            <div style="margin: 5px 0; display: flex; justify-content: space-between;">
              <span>支払方法</span>
              <span>${paymentMethod}</span>
            </div>
            ${receivedAmount > 0 ? `
              <div style="margin: 5px 0; display: flex; justify-content: space-between;">
                <span>お預かり</span>
                <span>¥${receivedAmount.toLocaleString()}</span>
              </div>
            ` : ''}
            ${changeAmount > 0 ? `
              <div style="margin: 5px 0; display: flex; justify-content: space-between; font-weight: bold;">
                <span>おつり</span>
                <span>¥${changeAmount.toLocaleString()}</span>
              </div>
            ` : ''}
          </div>
          
          <div style="text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px dashed #999;">
            <div style="font-size: 13px; color: #666; line-height: 1.6; white-space: pre-wrap;">${receiptMessage1}</div>
            ${receiptMessage2 ? `<div style="font-size: 13px; color: #666; margin-top: 8px; white-space: pre-wrap;">${receiptMessage2}</div>` : ''}
          </div>
        </div>
        
        <div style="margin-top: 25px; display: flex; flex-direction: column; gap: 12px;">
          <button id="generateQRBtn" onclick="generateQRCode()" 
                  style="width: 100%; padding: 18px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer;">
            QRコードを生成
          </button>
          <button onclick="closeReceiptModal('receiptDisplayModal')" 
                  style="width: 100%; padding: 18px; background: #666; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer;">
            閉じる
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  console.log('✅ レシートモーダル表示完了');
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
  
  const total = receiptData.total || 0;
  const customerName = receiptData.customerName || '　　　　　　　　様';
  
  // モーダルHTML生成
  const modalHtml = `
    <div id="receiptDisplayModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 999999; display: flex; align-items: center; justify-content: center;">
      <div style="background: white; border-radius: 20px; padding: 30px; max-width: 500px; width: 95%; max-height: 90vh; overflow-y: auto;">
        <h2 style="text-align: center; margin: 0 0 20px 0; font-size: 22px; color: #333;">領収書</h2>
        
        <div id="receiptContent" style="font-family: 'Courier New', monospace; background: white; padding: 30px; border: 3px double #333; border-radius: 8px;">
          <h1 style="text-align: center; font-size: 28px; margin: 0 0 30px 0; border-bottom: 2px solid #333; padding-bottom: 15px;">領収書</h1>
          
          <div style="margin-bottom: 30px;">
            <div style="font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #333; padding-bottom: 5px;">
              ${customerName}
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="font-size: 14px; color: #666; margin-bottom: 10px;">金額</div>
            <div style="font-size: 32px; font-weight: bold; border: 2px solid #333; padding: 15px; display: inline-block;">
              ¥ ${total.toLocaleString()}
            </div>
          </div>
          
          <div style="margin: 30px 0;">
            <div style="font-size: 14px; margin-bottom: 10px;">但し、飲食代として</div>
            <div style="font-size: 14px; margin-top: 10px;">上記の通り領収いたしました</div>
          </div>
          
          <div style="text-align: right; margin-top: 40px;">
            <div style="font-size: 14px; margin-bottom: 5px;">${dateStr}</div>
          </div>
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd;">
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">${receiptStoreName}</div>
            <div style="font-size: 12px; color: #666; margin-bottom: 3px;">${receiptAddress}</div>
            <div style="font-size: 12px; color: #666;">${receiptPhone}</div>
          </div>
        </div>
        
        <div style="margin-top: 25px; display: flex; flex-direction: column; gap: 12px;">
          <button id="generateQRBtn" onclick="generateQRCode()" 
                  style="width: 100%; padding: 18px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer;">
            QRコードを生成
          </button>
          <button onclick="closeReceiptModal('receiptDisplayModal')" 
                  style="width: 100%; padding: 18px; background: #666; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer;">
            閉じる
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  console.log('✅ 領収書モーダル表示完了');
}

// QRコード生成関数
async function generateQRCode() {
  console.log('🔨 QRコード生成開始');
  
  const generateBtn = document.getElementById('generateQRBtn');
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = '生成中...';
  }
  
  const receiptContent = document.getElementById('receiptContent');
  if (!receiptContent) {
    console.error('❌ レシートコンテンツが見つかりません');
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = 'QRコードを生成';
    }
    return;
  }
  
  try {
    console.log('📸 html2canvas実行開始');
    const canvas = await html2canvas(receiptContent, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true
    });
    
    const imageData = canvas.toDataURL('image/png');
    console.log('✅ 画像データ生成完了');
    
    // Firebaseにアップロード
    console.log('☁️ Firebaseにアップロード開始');
    const storageRef = window.ref(window.storage, 'receipts/' + Date.now() + '.png');
    
    // Base64をBlobに変換
    const base64Data = imageData.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    
    await window.uploadBytes(storageRef, blob);
    const downloadURL = await window.getDownloadURL(storageRef);
    
    console.log('✅ アップロード完了:', downloadURL);
    
    // QRコード表示
    await showQRCodeModal(downloadURL, imageData);
    
    // ボタンを元に戻す
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = 'QRコードを生成';
    }
    
  } catch (error) {
    console.error('❌ QRコード生成エラー:', error);
    alert('QRコード生成に失敗しました: ' + error.message);
    
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = 'QRコードを生成';
    }
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
      <div id="qrCodeContainerModal" style="display: flex !important; justify-content: center !important; align-items: center !important; margin: 20px auto !important; min-height: 280px !important; width: 280px !important; background: #f0f0f0; border: 2px solid #ccc; padding: 10px; box-sizing: border-box;"></div>
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
      
      // 描画完了を待つための関数（修正版）
      const waitForQRRender = (attempts = 0) => {
        if (attempts > 30) {
          console.error('❌ QRコードの描画がタイムアウトしました');
          qrContainer.innerHTML = '<div style="color: red; padding: 20px;">QRコードの表示に失敗しました</div>';
          return;
        }
        
        const canvas = qrContainer.querySelector('canvas');
        const img = qrContainer.querySelector('img');
        
        console.log(`🔍 描画確認 (試行${attempts + 1}):`, { canvas: !!canvas, img: !!img });
        
        if (img) {
          console.log('🎨 Img要素を発見');
          
          // canvasを完全に削除
          if (canvas) {
            canvas.remove();
            console.log('🗑️ Canvas要素を削除');
          }
          
          // imgのスタイルを強制設定（!importantを使用）
          img.style.cssText = 'display: block !important; margin: 0 auto !important; width: 256px !important; height: 256px !important; visibility: visible !important; opacity: 1 !important; position: static !important;';
          
          // 親要素のスタイルも再設定
          qrContainer.style.cssText = 'display: flex !important; justify-content: center !important; align-items: center !important; margin: 20px auto !important; min-height: 280px !important; width: 280px !important; background: #f0f0f0; border: 2px solid #ccc; padding: 10px; box-sizing: border-box;';
          
          console.log('✅ Img要素を表示しました');
          
          // 画像が読み込まれるまで待つ
          if (!img.complete) {
            console.log('⏳ 画像の読み込みを待機中...');
            img.onload = () => {
              console.log('✅ 画像の読み込み完了');
            };
            img.onerror = (e) => {
              console.error('❌ 画像の読み込みエラー:', e);
            };
          } else {
            console.log('✅ 画像は既に読み込まれています');
          }
        } else if (canvas) {
          console.log('🎨 Canvas要素のみ発見 - imgの生成を待機');
          // imgの生成を待つため再試行
          setTimeout(() => waitForQRRender(attempts + 1), 100);
        } else {
          console.log('⏳ QR要素が見つかりません - 再試行');
          // まだ描画されていない場合は再試行
          setTimeout(() => waitForQRRender(attempts + 1), 100);
        }
      };
      
      // 描画を待つ（初回は少し長めに待つ）
      setTimeout(() => waitForQRRender(), 200);
      
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
