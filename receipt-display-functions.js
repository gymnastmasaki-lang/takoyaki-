// レシート・領収書表示システム
// プリンター印刷を廃止し、画面表示+QRコード発行に変更

// QRコード生成ライブラリとhtml2canvasをロード
function loadLibraries() {
  return new Promise((resolve) => {
    const libs = [
      'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    ];
    
    let loaded = 0;
    libs.forEach(src => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        loaded++;
        if (loaded === libs.length) resolve();
      };
      document.head.appendChild(script);
    });
  });
}

// Wi-Fiドロア開閉
async function openCashDrawer() {
  const drawerIp = localStorage.getItem('drawerIp') || '192.168.1.100';
  try {
    await fetch(`http://${drawerIp}/open`, { method: 'POST' });
    console.log('ドロア開放成功');
  } catch (e) {
    console.error('ドロア開放エラー:', e);
  }
}

// レシート表示モーダル
function showReceiptDisplay(receiptData) {
  const modal = document.createElement('div');
  modal.id = 'receipt-display-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); display: flex; align-items: center;
    justify-content: center; z-index: 10000;
  `;
  
  const content = `
    <div style="background: white; border-radius: 12px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 20px;">
      <div id="receipt-content" style="font-family: 'Courier New', monospace;">
        ${generateReceiptHTML(receiptData)}
      </div>
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button onclick="saveReceiptPNG()" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
          保存
        </button>
        <button onclick="issueReceiptQR()" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
          発行
        </button>
        <button onclick="closeReceiptDisplay()" style="padding: 15px 20px; background: #666; color: white; border: none; border-radius: 8px; cursor: pointer;">
          閉じる
        </button>
      </div>
      <div id="qr-container" style="margin-top: 20px; text-align: center; display: none;">
        <p style="font-weight: bold; margin-bottom: 10px;">お客様にスキャンしていただいてください</p>
        <div id="qrcode"></div>
      </div>
    </div>
  `;
  
  modal.innerHTML = content;
  document.body.appendChild(modal);
}

// 領収書表示モーダル
function showInvoiceDisplay(invoiceData) {
  const modal = document.createElement('div');
  modal.id = 'invoice-display-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); display: flex; align-items: center;
    justify-content: center; z-index: 10000;
  `;
  
  const content = `
    <div style="background: white; border-radius: 12px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 20px;">
      <div id="invoice-content" style="font-family: 'Courier New', monospace;">
        ${generateInvoiceHTML(invoiceData)}
      </div>
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button onclick="saveInvoicePNG()" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
          保存
        </button>
        <button onclick="issueInvoiceQR()" style="flex: 1; padding: 15px; background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
          発行
        </button>
        <button onclick="closeInvoiceDisplay()" style="padding: 15px 20px; background: #666; color: white; border: none; border-radius: 8px; cursor: pointer;">
          閉じる
        </button>
      </div>
      <div id="qr-container-invoice" style="margin-top: 20px; text-align: center; display: none;">
        <p style="font-weight: bold; margin-bottom: 10px;">お客様にスキャンしていただいてください</p>
        <div id="qrcode-invoice"></div>
      </div>
    </div>
  `;
  
  modal.innerHTML = content;
  document.body.appendChild(modal);
}

// レシートHTML生成
function generateReceiptHTML(data) {
  const { storeName, address, phone, orderNum, items, tax8Total, tax10Total, total, timestamp } = data;
  
  const dateStr = new Date(timestamp).toLocaleString('ja-JP');
  
  let itemsHTML = '';
  items.forEach(item => {
    itemsHTML += `
      <div style="display: flex; justify-content: space-between; margin: 8px 0; padding: 8px 0; border-bottom: 1px dashed #ddd;">
        <div style="flex: 1;">
          <div style="font-weight: bold;">${item.name}</div>
          <div style="font-size: 12px; color: #666;">トッピング: ${item.toppings || 'なし'}</div>
          <div style="font-size: 12px; color: #666;">単価: ¥${item.price.toLocaleString()} × ${item.quantity}</div>
        </div>
        <div style="font-weight: bold;">¥${(item.price * item.quantity).toLocaleString()}</div>
      </div>
    `;
  });
  
  const tax8Excluded = Math.floor(tax8Total / 1.08);
  const tax10Excluded = Math.floor(tax10Total / 1.10);
  const tax8Amount = tax8Total - tax8Excluded;
  const tax10Amount = tax10Total - tax10Excluded;
  const totalTax = tax8Amount + tax10Amount;
  
  return `
    <div style="text-align: center;">
      <div style="border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 15px;">
        <div style="font-weight: bold; font-size: 20px; margin-bottom: 5px;">${storeName}</div>
        <div style="font-size: 12px;">${address}</div>
        <div style="font-size: 12px;">TEL: ${phone}</div>
      </div>
      
      <div style="text-align: left; margin: 20px 0;">
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>日時:</span><span>${dateStr}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>注文番号:</span><span style="font-weight: bold; font-size: 18px;">#${orderNum}</span>
        </div>
      </div>
      
      <div style="border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 15px 0; margin: 15px 0;">
        ${itemsHTML}
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
          <span>消費税合計:</span><span>¥${totalTax.toLocaleString()}</span>
        </div>
      </div>
      
      <div style="text-align: right; font-size: 24px; font-weight: bold; margin: 20px 0;">
        合計: ¥${total.toLocaleString()}
      </div>
      
      <div style="border-top: 2px solid #000; padding-top: 15px; margin-top: 20px; font-size: 12px;">
        <div>ご来店ありがとうございました</div>
        <div>またのお越しをお待ちしております</div>
      </div>
    </div>
  `;
}

// 領収書HTML生成
function generateInvoiceHTML(data) {
  const { storeName, address, phone, orderNum, total, timestamp } = data;
  const dateStr = new Date(timestamp).toLocaleString('ja-JP');
  
  return `
    <div style="text-align: center; padding: 20px;">
      <h2 style="margin: 0 0 30px 0; font-size: 28px; letter-spacing: 8px;">領収書</h2>
      
      <div style="text-align: left; margin: 30px 0;">
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">
          金額: ¥${total.toLocaleString()}
        </div>
        <div style="border-top: 1px solid #000; margin-top: 5px;"></div>
      </div>
      
      <div style="text-align: left; margin: 20px 0;">
        <div>上記正に領収いたしました</div>
      </div>
      
      <div style="text-align: left; margin: 30px 0; font-size: 14px;">
        <div>発行日: ${dateStr}</div>
        <div>注文番号: #${orderNum}</div>
      </div>
      
      <div style="text-align: right; margin: 30px 0;">
        <div style="font-weight: bold; font-size: 18px;">${storeName}</div>
        <div style="font-size: 12px; margin-top: 5px;">${address}</div>
        <div style="font-size: 12px;">TEL: ${phone}</div>
        <div style="margin-top: 20px; padding: 10px; border: 2px solid #000; width: 150px; height: 80px; display: inline-block;">
          <div style="text-align: center; line-height: 60px; font-size: 12px;">印</div>
        </div>
      </div>
      
      <div style="border-top: 2px solid #000; padding-top: 10px; margin-top: 30px; font-size: 10px; color: #666;">
        <div>この領収書は再発行できません</div>
      </div>
    </div>
  `;
}

// PNG保存
async function saveReceiptPNG() {
  const element = document.getElementById('receipt-content');
  const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2 });
  const link = document.createElement('a');
  link.download = `receipt_${Date.now()}.png`;
  link.href = canvas.toDataURL();
  link.click();
  alert('レシートを保存しました');
}

async function saveInvoicePNG() {
  const element = document.getElementById('invoice-content');
  const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2 });
  const link = document.createElement('a');
  link.download = `invoice_${Date.now()}.png`;
  link.href = canvas.toDataURL();
  link.click();
  alert('領収書を保存しました');
}

// QRコード発行
async function issueReceiptQR() {
  const element = document.getElementById('receipt-content');
  const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2 });
  const imageData = canvas.toDataURL();
  
  // 画像データをサーバーに保存（または直接QRコードに埋め込む）
  // ここでは簡易的にlocalStorageを使用
  const receiptId = Date.now();
  localStorage.setItem(`receipt_${receiptId}`, imageData);
  
  // QRコード生成
  const url = `${window.location.origin}/receipt-view.html?id=${receiptId}`;
  document.getElementById('qr-container').style.display = 'block';
  document.getElementById('qrcode').innerHTML = '';
  new QRCode(document.getElementById('qrcode'), {
    text: url,
    width: 256,
    height: 256
  });
}

async function issueInvoiceQR() {
  const element = document.getElementById('invoice-content');
  const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2 });
  const imageData = canvas.toDataURL();
  
  const invoiceId = Date.now();
  localStorage.setItem(`invoice_${invoiceId}`, imageData);
  
  const url = `${window.location.origin}/receipt-view.html?id=${invoiceId}&type=invoice`;
  document.getElementById('qr-container-invoice').style.display = 'block';
  document.getElementById('qrcode-invoice').innerHTML = '';
  new QRCode(document.getElementById('qrcode-invoice'), {
    text: url,
    width: 256,
    height: 256
  });
}

// モーダルを閉じる
function closeReceiptDisplay() {
  document.getElementById('receipt-display-modal')?.remove();
}

function closeInvoiceDisplay() {
  document.getElementById('invoice-display-modal')?.remove();
}

// 初期化
document.addEventListener('DOMContentLoaded', loadLibraries);
