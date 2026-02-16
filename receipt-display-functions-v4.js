// ========== レシート・領収書表示システム（Firestore版）v5 - QRコード修正版 ==========

// QRCodeライブラリの読み込み確認と動的ロード（改善版）
(function() {
  // QRCodeライブラリを事前に読み込む
  if (typeof QRCode === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.async = false;
    script.onload = function() {
      console.log('✅ QRCodeライブラリ読み込み完了');
      window.qrCodeLibraryLoaded = true;
    };
    script.onerror = function() {
      console.error('❌ QRCodeライブラリ読み込み失敗');
      window.qrCodeLibraryLoaded = false;
    };
    document.head.appendChild(script);
    console.log('📚 QRCodeライブラリを読み込み中...');
  } else {
    window.qrCodeLibraryLoaded = true;
  }
  
  if (typeof html2canvas === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.async = false;
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
        receiptMessage1 = settings.message;
        receiptMessage2 = '';
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
  
  // 商品リストHTML生成
  let itemsHtml = '';
  if (receiptData.items && Array.isArray(receiptData.items) && receiptData.items.length > 0) {
    receiptData.items.forEach(item => {
      let basePricePerUnit = item.basePrice || item.price;
      
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
      
      if (!item.basePrice && toppingTotalPrice > 0 && item.price > toppingTotalPrice) {
        basePricePerUnit = item.price - toppingTotalPrice;
      }
      
      const itemTotal = (basePricePerUnit + toppingTotalPrice) * item.quantity;
      
      itemsHtml += `
        <div style="margin: 12px 0; padding-bottom: 8px; border-bottom: 1px dashed #ddd;">
      `;
      
      itemsHtml += `
        <div style="font-size: 13px; color: #333; margin-bottom: 2px; display: flex; justify-content: space-between;">
          <span>${item.name} × ${item.quantity}</span>
          <span>¥${basePricePerUnit.toLocaleString()}</span>
        </div>
      `;
      
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
      } else if (item.toppingsData && Array.isArray(item.toppingsData) && item.toppingsData.length > 0) {
        item.toppingsData.forEach(topping => {
          const price = topping.price || 0;
          itemsHtml += `
            <div style="font-size: 13px; color: #333; margin-top: 2px; display: flex; justify-content: space-between;">
              <span>${topping.name}</span>
              <span>¥${price.toLocaleString()}</span>
            </div>
          `;
        });
      } else if (item.toppingsList && Array.isArray(item.toppingsList) && item.toppingsList.length > 0) {
        item.toppingsList.forEach(topping => {
          const price = topping.price || 0;
          itemsHtml += `
            <div style="font-size: 13px; color: #333; margin-top: 2px; display: flex; justify-content: space-between;">
              <span>${topping.name}</span>
              <span>¥${price.toLocaleString()}</span>
            </div>
          `;
        });
      } else if (item.toppings && item.toppings !== 'なし' && item.toppings !== '') {
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
      
      itemsHtml += `
        <div style="font-size: 14px; font-weight: bold; margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee; display: flex; justify-content: space-between;">
          <span>合計</span>
          <span>¥${itemTotal.toLocaleString()}</span>
        </div>
      `;
      
      itemsHtml += `</div>`;
    });
  }
  
  // レジ袋情報を追加
  console.log('🛍️ レジ袋情報チェック開始');
  if (receiptData.bagNeeded && receiptData.bagQuantity > 0 && receiptData.bagPrice) {
    const bagTotal = receiptData.bagQuantity * receiptData.bagPrice;
    console.log('✅ レジ袋を表示:', receiptData.bagQuantity, '枚 × ¥', receiptData.bagPrice);
    itemsHtml += `
      <div style="margin: 12px 0; padding-bottom: 8px; border-bottom: 1px dashed #ddd;">
        <div style="font-size: 13px; color: #333; margin-bottom: 2px; display: flex; justify-content: space-between;">
          <span>🛍️ レジ袋 × ${receiptData.bagQuantity}</span>
          <span>¥${receiptData.bagPrice.toLocaleString()}</span>
        </div>
        <div style="font-size: 14px; font-weight: bold; margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee; display: flex; justify-content: space-between;">
          <span>合計</span>
          <span>¥${bagTotal.toLocaleString()}</span>
        </div>
      </div>
    `;
  } else {
    console.log('❌ レジ袋は表示されません');
  }
  
  const subTotal = receiptData.totalPrice || 0;
  const totalPrice = subTotal;
  const receivedAmount = receiptData.receivedAmount || 0;
  const changeAmount = receiptData.changeAmount || 0;
  
  // レシート画像用のHTML生成
  const receiptImageHtml = `
    <div id="receiptImageArea" style="width: 400px; background: white; padding: 40px 30px; font-family: 'MS Gothic', 'Yu Gothic', monospace; color: black; box-sizing: border-box;">
      <div style="text-align: center; margin-bottom: 25px; border-bottom: 2px solid black; padding-bottom: 20px;">
        <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px;">${receiptStoreName}</div>
        <div style="font-size: 14px; margin: 5px 0;">${receiptAddress}</div>
        <div style="font-size: 14px;">${receiptPhone}</div>
      </div>
      
      <div style="font-size: 14px; margin: 15px 0; padding: 10px 0; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd;">
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>日時:</span>
          <span>${dateStr}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>注文番号:</span>
          <span style="font-weight: bold;">${orderNum}</span>
        </div>
      </div>
      
      <div style="margin: 20px 0;">
        ${itemsHtml}
      </div>
      
      <div style="margin-top: 25px; padding-top: 15px; border-top: 2px solid black;">
        <div style="font-size: 16px; font-weight: bold; display: flex; justify-content: space-between; margin-bottom: 15px; padding: 10px; background: #f8f8f8;">
          <span>合計金額</span>
          <span>¥${totalPrice.toLocaleString()}</span>
        </div>
        ${receivedAmount > 0 ? `
          <div style="font-size: 14px; display: flex; justify-content: space-between; margin: 10px 0; padding-left: 10px;">
            <span>お預かり</span>
            <span>¥${receivedAmount.toLocaleString()}</span>
          </div>
          <div style="font-size: 14px; display: flex; justify-content: space-between; margin: 10px 0; padding-left: 10px;">
            <span>お釣り</span>
            <span>¥${changeAmount.toLocaleString()}</span>
          </div>
        ` : ''}
      </div>
      
      <div style="margin-top: 30px; text-align: center; padding-top: 20px; border-top: 1px dashed #999;">
        ${receiptMessage2 ? `
          <div style="font-size: 14px; margin: 8px 0; white-space: pre-line;">${receiptMessage1}</div>
          <div style="font-size: 14px; margin: 8px 0; white-space: pre-line;">${receiptMessage2}</div>
        ` : `
          <div style="font-size: 14px; margin: 8px 0; white-space: pre-line;">${receiptMessage1}</div>
        `}
      </div>
    </div>
  `;
  
  // スクリーンショット作成
  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'fixed';
  tempDiv.style.top = '-9999px';
  tempDiv.style.left = '-9999px';
  tempDiv.innerHTML = receiptImageHtml;
  document.body.appendChild(tempDiv);
  
  let imageDataUrl = null;
  try {
    console.log('📸 スクリーンショット開始');
    const canvas = await html2canvas(tempDiv.querySelector('#receiptImageArea'), {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false
    });
    imageDataUrl = canvas.toDataURL('image/png');
    console.log('✅ スクリーンショット完了');
  } catch (error) {
    console.error('❌ スクリーンショットエラー:', error);
  }
  
  document.body.removeChild(tempDiv);
  
  // Firebaseに保存
  let qrUrl = null;
  if (imageDataUrl && window.currentStoreId) {
    try {
      console.log('☁️ Firebase保存開始');
      
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      
      const receiptId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      const imageRef = window.ref(window.storage, `receipts/${window.currentStoreId}/${receiptId}.png`);
      await window.uploadBytes(imageRef, blob);
      const imageUrl = await window.getDownloadURL(imageRef);
      
      console.log('✅ 画像アップロード完了:', imageUrl);
      
      const receiptDoc = {
        storeId: window.currentStoreId,
        orderNumber: orderNum,
        timestamp: now.getTime(),
        dateString: dateStr,
        imageUrl: imageUrl,
        totalPrice: totalPrice,
        items: receiptData.items || [],
        createdAt: window.serverTimestamp(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };
      
      const docRef = await window.addDoc(
        window.collection(window.db, 'receipts'), 
        receiptDoc
      );
      
      console.log('✅ Firestore保存完了:', docRef.id);
      
      qrUrl = `https://aki-lang.github.io/hachihandy/receipt.html?id=${docRef.id}`;
      console.log('✅ QRコード URL:', qrUrl);
      
    } catch (error) {
      console.error('❌ Firebase保存エラー:', error);
    }
  }
  
  // モーダル生成
  const modal = document.createElement('div');
  const uniqueId = 'receiptDisplayModal_' + Date.now();
  modal.id = uniqueId;
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 99999998; display: flex; align-items: center; justify-content: center; overflow-y: auto;';
  
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; padding: 40px; max-width: 500px; width: 95%; margin: 20px auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
      <h2 style="text-align: center; margin: 0 0 30px 0; font-size: 28px; color: #333;">レシート</h2>
      
      <div style="background: #f5f5f5; padding: 30px 20px; border-radius: 15px; margin-bottom: 30px;">
        <div style="text-align: center; margin-bottom: 25px; border-bottom: 2px solid #333; padding-bottom: 20px;">
          <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px;">${receiptStoreName}</div>
          <div style="font-size: 14px; margin: 5px 0;">${receiptAddress}</div>
          <div style="font-size: 14px;">${receiptPhone}</div>
        </div>
        
        <div style="font-size: 14px; margin: 15px 0; padding: 10px 0; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd;">
          <div style="display: flex; justify-content: space-between; margin: 5px 0;">
            <span>日時:</span>
            <span>${dateStr}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin: 5px 0;">
            <span>注文番号:</span>
            <span style="font-weight: bold;">${orderNum}</span>
          </div>
        </div>
        
        <div style="margin: 20px 0;">
          ${itemsHtml}
        </div>
        
        <div style="margin-top: 25px; padding-top: 15px; border-top: 2px solid #333;">
          <div style="font-size: 18px; font-weight: bold; display: flex; justify-content: space-between; margin-bottom: 15px; padding: 10px; background: white; border-radius: 8px;">
            <span>合計金額</span>
            <span>¥${totalPrice.toLocaleString()}</span>
          </div>
          ${receivedAmount > 0 ? `
            <div style="font-size: 14px; display: flex; justify-content: space-between; margin: 10px 0; padding-left: 10px;">
              <span>お預かり</span>
              <span>¥${receivedAmount.toLocaleString()}</span>
            </div>
            <div style="font-size: 14px; display: flex; justify-content: space-between; margin: 10px 0; padding-left: 10px;">
              <span>お釣り</span>
              <span>¥${changeAmount.toLocaleString()}</span>
            </div>
          ` : ''}
        </div>
        
        <div style="margin-top: 30px; text-align: center; padding-top: 20px; border-top: 1px dashed #999;">
          ${receiptMessage2 ? `
            <div style="font-size: 14px; margin: 8px 0; white-space: pre-line;">${receiptMessage1}</div>
            <div style="font-size: 14px; margin: 8px 0; white-space: pre-line;">${receiptMessage2}</div>
          ` : `
            <div style="font-size: 14px; margin: 8px 0; white-space: pre-line;">${receiptMessage1}</div>
          `}
        </div>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 15px;">
        ${qrUrl ? `
          <button onclick="showQRCodeModal('${qrUrl}', '${imageDataUrl}')" style="width: 100%; padding: 18px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; font-size: 18px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(102,126,234,0.3);">
            📱 QRコード表示
          </button>
        ` : ''}
        <button onclick="downloadReceiptImage('${imageDataUrl}')" style="width: 100%; padding: 18px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 12px; font-size: 18px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(76,175,80,0.3);">
          💾 画像をダウンロード
        </button>
        <button onclick="closeReceiptModal('${uniqueId}')" style="width: 100%; padding: 18px; background: #666; color: white; border: none; border-radius: 12px; font-size: 18px; font-weight: bold; cursor: pointer;">
          閉じる
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  console.log('✅ レシートモーダル表示完了');
  
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeReceiptModal(uniqueId);
    }
  });
}

// 領収書表示関数
async function showInvoiceDisplay(receiptData) {
  console.log('📄 ==== 領収書表示開始 ====');
  await showReceiptDisplay(receiptData);
}

// QRコード表示モーダル（完全修正版）
async function showQRCodeModal(qrUrl, imageData) {
  console.log('🎨 ========== QRコード表示開始 ==========');
  console.log('🔗 URL:', qrUrl);
  
  const existingQRModal = document.getElementById('qrDisplayModal');
  if (existingQRModal) {
    existingQRModal.remove();
    console.log('🗑️ 既存QRモーダルを削除');
  }
  
  window.currentReceiptImageData = imageData;
  
  // QRCodeライブラリの読み込みを最大10秒待つ
  console.log('⏳ QRCodeライブラリの読み込みチェック開始...');
  let loadAttempts = 0;
  const maxLoadAttempts = 100; // 10秒
  
  while (typeof QRCode === 'undefined' && loadAttempts < maxLoadAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100));
    loadAttempts++;
    if (loadAttempts % 10 === 0) {
      console.log(`⏳ ライブラリ待機中... ${loadAttempts * 100}ms / ${maxLoadAttempts * 100}ms`);
    }
  }
  
  if (typeof QRCode === 'undefined') {
    console.error('❌ QRCodeライブラリの読み込みタイムアウト');
    alert('QRコード表示機能が利用できません。ページを再読み込みしてください。');
    return;
  }
  
  console.log('✅ QRCodeライブラリ確認完了');
  
  // モーダルを作成
  const qrModal = document.createElement('div');
  qrModal.id = 'qrDisplayModal';
  qrModal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(0,0,0,0.9) !important; z-index: 999999999 !important; display: flex !important; align-items: center !important; justify-content: center !important;';
  
  qrModal.innerHTML = `
    <div style="background: white; border-radius: 20px; padding: 30px; max-width: 600px; width: 95%; max-height: 90vh; overflow-y: auto; text-align: center;">
      <h2 style="margin: 0 0 20px 0; font-size: 24px;">QRコード</h2>
      <div id="qrCodeContainerModal" style="width: 280px; height: 280px; margin: 20px auto; background: white; border: 2px solid #ddd; border-radius: 10px; padding: 10px; box-sizing: border-box;">
        <div id="qrLoadingText" style="line-height: 260px; color: #999; font-size: 14px;">QRコード生成中...</div>
      </div>
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
  console.log('✅ QRモーダルをDOMに追加完了');
  
  // DOM反映を待つ
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const qrContainer = document.getElementById('qrCodeContainerModal');
  const loadingText = document.getElementById('qrLoadingText');
  
  if (!qrContainer) {
    console.error('❌ QRコンテナが見つかりません');
    return;
  }
  
  console.log('📦 QRコンテナ取得成功');
  
  try {
    console.log('🔨 QRコード生成開始...');
    
    // ローディングテキストを削除
    if (loadingText) {
      loadingText.remove();
    }
    
    // QRコードを生成（シンプルな設定）
    new QRCode(qrContainer, {
      text: qrUrl,
      width: 256,
      height: 256,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
    
    console.log('✅ QRCode生成コマンド実行完了');
    
    // レンダリング完了を待つ（3秒待機）
    let renderAttempts = 0;
    const maxRenderAttempts = 30;
    
    const checkRendering = async () => {
      while (renderAttempts < maxRenderAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        renderAttempts++;
        
        const canvas = qrContainer.querySelector('canvas');
        const img = qrContainer.querySelector('img');
        
        if (canvas || img) {
          console.log('🎨 QR要素を検出:', canvas ? 'canvas' : 'img');
          
          // 要素のスタイルを強制設定
          const element = img || canvas;
          element.style.cssText = 'display: block !important; width: 256px !important; height: 256px !important; margin: 0 auto !important; visibility: visible !important; opacity: 1 !important; position: relative !important;';
          
          // 親要素のスタイルも設定
          qrContainer.style.cssText = 'width: 280px !important; height: 280px !important; margin: 20px auto !important; background: white !important; border: 2px solid #ddd !important; border-radius: 10px !important; padding: 10px !important; box-sizing: border-box !important; display: flex !important; align-items: center !important; justify-content: center !important;';
          
          console.log('✅ QRコード表示設定完了');
          return true;
        }
        
        if (renderAttempts % 10 === 0) {
          console.log(`⏳ レンダリング待機中... ${renderAttempts * 100}ms`);
        }
      }
      
      console.error('❌ QRコードのレンダリングがタイムアウト');
      qrContainer.innerHTML = '<div style="color: red; padding: 20px; line-height: 1.5;">QRコードの表示に失敗しました<br><small>ページを再読み込みしてください</small></div>';
      return false;
    };
    
    await checkRendering();
    
  } catch (error) {
    console.error('❌ QRコード生成エラー:', error);
    qrContainer.innerHTML = '<div style="color: red; padding: 20px; line-height: 1.5;">QRコード生成エラー<br><small>' + error.message + '</small></div>';
  }
  
  // モーダルの外側クリックで閉じる
  qrModal.addEventListener('click', function(e) {
    if (e.target === qrModal) {
      closeQRModal();
    }
  });
  
  console.log('🎨 ========== QRコード表示処理完了 ==========');
}

// 画像ダウンロード関数
function downloadReceiptImage(imageData) {
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

console.log('✅ receipt-display-functions-v5-qr-fixed.js 読み込み完了');
