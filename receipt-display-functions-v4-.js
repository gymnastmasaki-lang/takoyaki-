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
  
  // 小計（商品合計）と合計金額
  const subTotal = receiptData.totalPrice || 0;
  const totalPrice = subTotal;
  
  // 受け取り金額と釣り銭
  const receivedAmount = receiptData.receivedAmount || 0;
  const changeAmount = receiptData.changeAmount || 0;
  
  // レシート画像用のHTML生成（スクリーンショット用）
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
  
  // 一時的にDOMに追加してスクリーンショットを撮る
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
  
  // 一時DOMを削除
  document.body.removeChild(tempDiv);
  
  // Firebaseに画像とデータを保存してQRコードURLを生成
  let qrUrl = null;
  if (imageDataUrl && window.currentStoreId) {
    try {
      console.log('☁️ Firebase保存開始');
      
      // 画像をBlobに変換
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      
      // ランダムなID生成
      const receiptId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      // Storageに画像を保存
      const imageRef = window.ref(window.storage, `receipts/${window.currentStoreId}/${receiptId}.png`);
      await window.uploadBytes(imageRef, blob);
      const imageUrl = await window.getDownloadURL(imageRef);
      
      console.log('✅ 画像アップロード完了:', imageUrl);
      
      // Firestoreにメタデータを保存
      const receiptDoc = {
        storeId: window.currentStoreId,
        orderNumber: orderNum,
        timestamp: now.getTime(),
        dateString: dateStr,
        imageUrl: imageUrl,
        totalPrice: totalPrice,
        items: receiptData.items || [],
        createdAt: window.serverTimestamp(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7日後
      };
      
      const docRef = await window.addDoc(
        window.collection(window.db, 'receipts'), 
        receiptDoc
      );
      
      console.log('✅ Firestore保存完了:', docRef.id);
      
      // QRコードURL生成（receipt.htmlページへのリンク）
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
  
  // モーダルの外側クリックで閉じる
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeReceiptModal(uniqueId);
    }
  });
}

// 領収書表示関数
async function showInvoiceDisplay(receiptData) {
  console.log('📄 ==== 領収書表示開始 ====');
  
  // 同じレシート表示関数を使用
  await showReceiptDisplay(receiptData);
}

// QRコード表示モーダル（修正版 - モバイル対応強化）
async function showQRCodeModal(qrUrl, imageData) {
  console.log('🎨 QRコードモーダル表示開始');
  console.log('🔗 QR URL:', qrUrl);
  
  const existingQRModal = document.getElementById('qrDisplayModal');
  if (existingQRModal) {
    existingQRModal.remove();
    console.log('🗑️ 既存QRモーダルを削除');
  }
  
  // グローバル変数に保存
  window.currentReceiptImageData = imageData;
  
  // モーダルを作成
  const qrModal = document.createElement('div');
  qrModal.id = 'qrDisplayModal';
  qrModal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(0,0,0,0.9) !important; z-index: 999999999 !important; display: flex !important; align-items: center !important; justify-content: center !important; overflow: hidden !important;';
  
  qrModal.innerHTML = `
    <div style="background: white; border-radius: 20px; padding: 30px; max-width: 600px; width: 95%; text-align: center; max-height: 90vh; overflow-y: auto;">
      <h2 style="margin: 0 0 20px 0; font-size: 24px;">QRコード</h2>
      <div id="qrCodeContainerModal" style="width: 280px; height: 280px; margin: 20px auto; background: white; border: 2px solid #ddd; border-radius: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative;">
        <div style="color: #999; font-size: 14px;">QRコード生成中...</div>
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
  console.log('✅ QRモーダルをDOMに追加');
  
  // QRCodeライブラリの読み込みを待つ（最大5秒）
  let attempts = 0;
  const maxAttempts = 50;
  console.log('⏳ QRCodeライブラリの読み込み待機開始...');
  
  while (typeof QRCode === 'undefined' && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
    if (attempts % 10 === 0) {
      console.log(`⏳ 待機中... ${attempts * 100}ms / ${maxAttempts * 100}ms`);
    }
  }
  
  if (typeof QRCode === 'undefined') {
    console.error('❌ QRCodeライブラリの読み込みタイムアウト');
    const qrContainer = document.getElementById('qrCodeContainerModal');
    if (qrContainer) {
      qrContainer.innerHTML = '<div style="color: red; padding: 20px;">QRCodeライブラリが読み込めませんでした</div>';
    }
    return;
  }
  
  console.log('✅ QRCodeライブラリ読み込み完了');
  
  // QRコード生成
  const qrContainer = document.getElementById('qrCodeContainerModal');
  if (!qrContainer) {
    console.error('❌ QRコンテナが見つかりません');
    return;
  }
  
  try {
    console.log('🔨 QRコード生成開始...');
    
    // コンテナをクリア
    qrContainer.innerHTML = '';
    
    // QRコードを生成
    const qrcode = new QRCode(qrContainer, {
      text: qrUrl,
      width: 256,
      height: 256,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    
    console.log('✅ QRCode生成コマンド実行完了');
    
    // 生成された要素の表示を保証（修正版）
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const allElements = qrContainer.querySelectorAll('*');
    console.log('📦 コンテナ内の全要素数:', allElements.length);
    
    allElements.forEach((el, index) => {
      console.log(`要素 ${index}:`, el.tagName, el.style.display);
      
      // すべての子要素を強制表示
      el.style.display = 'block';
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      el.style.position = 'static';
      
      // canvas要素の場合
      if (el.tagName === 'CANVAS') {
        el.style.width = '256px';
        el.style.height = '256px';
        el.style.margin = '0 auto';
        console.log('🎨 Canvas要素を設定');
      }
      
      // img要素の場合
      if (el.tagName === 'IMG') {
        el.style.width = '256px';
        el.style.height = '256px';
        el.style.margin = '0 auto';
        el.style.display = 'block';
        console.log('🖼️ Img要素を設定');
      }
    });
    
    // コンテナ自体のスタイルも再設定
    qrContainer.style.display = 'flex';
    qrContainer.style.alignItems = 'center';
    qrContainer.style.justifyContent = 'center';
    qrContainer.style.overflow = 'visible';
    
    console.log('✅ QRコード表示設定完了');
    
  } catch (error) {
    console.error('❌ QRコード生成エラー:', error);
    qrContainer.innerHTML = '<div style="color: red; padding: 20px;">QRコード生成に失敗しました:<br>' + error.message + '</div>';
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
