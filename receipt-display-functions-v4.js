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
  console.log('  - receiptData.bagNeeded:', receiptData.bagNeeded);
  console.log('  - receiptData.bagQuantity:', receiptData.bagQuantity);
  console.log('  - receiptData.bagPrice:', receiptData.bagPrice);
  
  if (receiptData.bagNeeded && receiptData.bagQuantity > 0) {
    const bagPrice = receiptData.bagPrice || 0;
    console.log('✅ レジ袋を表示します - 枚数:', receiptData.bagQuantity, '価格:', bagPrice);
    itemsHtml += `
      <div style="margin: 12px 0; padding-bottom: 8px; border-bottom: 1px dashed #ddd;">
        <div style="font-size: 13px; color: #333; margin-bottom: 2px; display: flex; justify-content: space-between;">
          <span>🛍️ レジ袋 × ${receiptData.bagQuantity}</span>
          <span>¥${bagPrice.toLocaleString()}</span>
        </div>
      </div>
    `;
  } else {
    console.log('⚠️ レジ袋は表示されません - 条件を満たしていません');
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
  
  const tax8Excluded = Math.floor(tax8Total / 1.08);
  const tax10Excluded = Math.floor(tax10Total / 1.10);
  const tax8Amount = tax8Total - tax8Excluded;
  const tax10Amount = tax10Total - tax10Excluded;
  
  const receiptHtml = `
    <div style="font-family: 'Yu Gothic', 'Hiragino Sans', sans-serif; padding: 15px; max-width: 400px; margin: 0 auto; border: 2px solid #333; background: white;">
      <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px;">
        <div style="font-size: 20px; font-weight: bold; margin-bottom: 5px;">${receiptStoreName}</div>
        <div style="font-size: 11px; color: #666;">${receiptAddress}</div>
        <div style="font-size: 11px; color: #666;">${receiptPhone}</div>
      </div>
      
      <div style="text-align: center; margin: 15px 0;">
        <div style="font-size: 12px; color: #666;">日時: ${dateStr}</div>
        <div style="font-size: 12px; color: #666; margin-top: 3px;">注文番号: #${orderNum}</div>
        ${receiptData.tableNumber && receiptData.tableNumber !== '即会計' ? `<div style="font-size: 12px; color: #666; margin-top: 3px;">テーブル: ${receiptData.tableNumber}</div>` : ''}
        ${receiptData.paymentMethod ? `<div style="font-size: 12px; color: #666; margin-top: 3px;">支払方法: ${receiptData.paymentMethod}</div>` : ''}
      </div>
      
      <div style="border-top: 1px solid #ddd; padding-top: 15px; margin-bottom: 15px;">
        ${itemsHtml}
      </div>
      
      <div style="border-top: 2px solid #000; padding-top: 15px; margin-top: 20px; font-size: 13px;">
        ${tax8Total > 0 ? `<div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>8%対象額:</span>
          <span>¥${tax8Excluded.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>内税: ¥${tax8Amount.toLocaleString()}</span>
        </div>` : ''}
        ${tax10Total > 0 ? `<div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>10%対象額:</span>
          <span>¥${tax10Excluded.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
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
        <div style="margin-top: 10px; white-space: pre-wrap;">${receiptMessage1}</div>
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
  
  // 電子印鑑HTML（修正版：店舗名の横に配置、flexboxで確実に並べる）
  let sealHtml = '';
  if (sealImageData) {
    sealHtml = `
      <div style="width: 100px; height: 100px; flex-shrink: 0;">
        <img src="${sealImageData}" style="width: 100%; height: 100%; object-fit: contain;" alt="電子印鑑">
      </div>
    `;
  }
  
  const invoiceHtml = `
    <div style="font-family: 'Yu Gothic', 'Hiragino Sans', sans-serif; padding: 20px 30px; margin: 0 auto; border: 2px solid #333; background: white;">
      <div style="text-align: center; border-bottom: 3px double #000; padding-bottom: 20px; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 28px; letter-spacing: 8px;">領収書</h2>
      </div>
      
      <div style="margin: 30px 0;">
        <div style="font-size: 14px; margin-bottom: 10px;">お客様</div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 30px;">
          <span style="font-size: 18px; flex: 1; border-bottom: 1px solid transparent;"></span>
          <span style="font-size: 14px; white-space: nowrap;">様</span>
        </div>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <div style="font-size: 16px; margin-bottom: 10px;">下記の通り<br>領収いたしました</div>
        <div style="border: 2px solid #000; padding: 20px; margin: 20px 0;">
          <div style="font-size: 14px; margin-bottom: 5px;">金額</div>
          <div style="font-size: 36px; font-weight: bold;">¥${invoiceData.total.toLocaleString()}</div>
          <div style="font-size: 14px; margin-top: 10px; color: #666;">（内消費税 ¥${totalTax.toLocaleString()}）</div>
        </div>
      </div>
      
      <div style="margin: 30px 0; font-size: 14px;">
        <div style="margin: 10px 0; line-height: 1.8;">
          <span style="display: inline-block; width: 100px; vertical-align: top;">但し</span>
          <span style="display: inline-block; max-width: 200px;">飲食代として</span>
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
      
      <div style="position: relative; text-align: right; font-size: 14px; margin: 40px 0 20px 0;">
        ${sealImageData ? `<div style="position: absolute; left: 20px; bottom: -20px; width: 80px; height: 80px;">
          <img src="${sealImageData}" style="width: 100%; height: 100%; object-fit: contain;" alt="電子印鑑">
        </div>` : ''}
        <div style="margin: 5px 0;">${dateStr}</div>
      </div>
      
      <div style="border-top: 2px solid #000; padding-top: 20px; margin-top: 0;">
        <div style="text-align: center;">
          <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">${receiptStoreName}</div>
          <div style="font-size: 12px; color: #666;">
            <div>${(receiptAddress || '').replace(/ /g, '<br>')}</div>
            <div style="margin-top: 5px;">${receiptPhone}</div>
            <div style="margin-top: 10px;">※この領収書は再発行できません</div>
          </div>
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
    <div style="background: white; border-radius: 20px; padding: 20px; max-width: 700px; width: 95%; max-height: 90vh; overflow-y: auto;">
      <div id="${contentId}" class="receiptContent" style="padding: 0 10px; display: flex; justify-content: center;">
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
  
  // モーダルの外側クリックで閉じる
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeReceiptModal(modalId);
    }
  });
  
  console.log('✅ モーダル表示完了');
}

// QRコード発行関数
async function issueReceiptQR(contentId) {
  console.log('🔄 QRコード発行開始');
  
  const receiptContent = document.getElementById(contentId);
  if (!receiptContent) {
    alert('レシート内容が見つかりません');
    return;
  }
  
  try {
    console.log('📸 Canvas生成中...');
    
    // html2canvasの確認
    if (typeof html2canvas === 'undefined') {
      throw new Error('html2canvas ライブラリが読み込まれていません');
    }
    
    const canvas = await html2canvas(receiptContent, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      allowTaint: true
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
      <div id="qrCodeContainerModal" style="display: block !important; text-align: center !important; margin: 20px auto !important; width: 280px !important; background: #f0f0f0; border: 2px solid #ccc; padding: 12px !important; box-sizing: border-box !important; overflow: hidden !important;"></div>
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
      
      // 描画完了を待つ - モバイル対応の改善版
      const waitForQRRender = async () => {
        let renderAttempts = 0;
        const maxRenderAttempts = 30;
        
        while (renderAttempts < maxRenderAttempts) {
          const canvas = qrContainer.querySelector('canvas');
          const img = qrContainer.querySelector('img');
          
          if (canvas || img) {
            console.log('🎨 QR要素を発見:', canvas ? 'canvas' : 'img', img ? 'img' : '', 'attempt:', renderAttempts);
            
            // 両方ある場合、canvasを完全に削除
            if (img && canvas) {
              canvas.remove();
              console.log('🗑️ Canvas要素を完全に削除しました');
              
              // 削除後、再度確認
              await new Promise(resolve => setTimeout(resolve, 50));
              const remainingCanvas = qrContainer.querySelector('canvas');
              if (remainingCanvas) {
                remainingCanvas.remove();
                console.log('🗑️ 残りのCanvas要素も削除しました');
              }
            }
            
            // imgのみ残す場合、canvasが本当に削除されたか確認
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // コンテナ内のすべての要素を確認して、img以外を削除
            const allElements = Array.from(qrContainer.children);
            allElements.forEach(element => {
              if (element.tagName === 'CANVAS') {
                element.remove();
                console.log('🗑️ 追加のCanvas要素を削除');
              }
            });
            
            // 表示する要素のみにスタイルを適用
            const finalImg = qrContainer.querySelector('img');
            const finalCanvas = qrContainer.querySelector('canvas');
            const displayElement = finalImg || finalCanvas;
            
            if (displayElement) {
              displayElement.style.cssText = 'display: block !important; margin: 0 !important; padding: 0 !important; width: 256px !important; height: 256px !important; visibility: visible !important; opacity: 1 !important; position: static !important;';
            }
            
            // コンテナのスタイルを確実に設定
            qrContainer.style.cssText = 'display: block !important; text-align: center !important; margin: 20px auto !important; width: 280px !important; height: 280px !important; background: #f0f0f0; border: 2px solid #ccc; padding: 12px !important; box-sizing: border-box !important; overflow: hidden !important; line-height: 0 !important;';
            
            console.log('✅ QR要素を表示設定しました');
            console.log('📦 QRコンテナの最終子要素数:', qrContainer.children.length);
            
            // 要素が実際に描画されるまでさらに待つ
            await new Promise(resolve => setTimeout(resolve, 100));
            
            return;
          }
          
          // まだ描画されていない場合は待機
          await new Promise(resolve => setTimeout(resolve, 100));
          renderAttempts++;
        }
        
        // タイムアウト
        console.error('❌ QRコードの描画がタイムアウトしました');
        qrContainer.innerHTML = '<div style="color: red; padding: 20px;">QRコードの表示に失敗しました</div>';
      };
      
      // 描画を待つ
      await waitForQRRender();
      
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
