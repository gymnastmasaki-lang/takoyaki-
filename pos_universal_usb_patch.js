// ========================================
// 汎用USBレシートプリンター対応パッチ
// ESC/POS標準コマンド対応プリンター用
// ========================================

// グローバル変数
window.usbPrinter = null;
window.printerEndpoint = null;

// 汎用USBプリンターを検索して接続
async function connectUSBPrinter() {
  if (!navigator.usb) {
    throw new Error('このブラウザはWebUSB APIに対応していません。ChromeまたはEdgeをご使用ください。');
  }
  
  try {
    console.log('🔍 USBプリンターを検索中...');
    
    // フィルターなしで全USBデバイスを表示（ユーザーが選択）
    const device = await navigator.usb.requestDevice({
      filters: [
        // 主要なプリンターメーカーのVendor ID
        { vendorId: 0x0519 }, // Star Micronics
        { vendorId: 0x04b8 }, // EPSON/Seiko Epson
        { vendorId: 0x1504 }, // Citizen
        { vendorId: 0x0416 }, // Intermec
        { vendorId: 0x1fc9 }, // Bixolon
        { vendorId: 0x0dd4 }, // Custom Engineering
        { vendorId: 0x0525 }, // NetChip Technology
        { vendorId: 0x20d1 }, // RONGTA (中国製)
        { vendorId: 0x6868 }, // Zjiang (中国製)
        { vendorId: 0x0483 }, // 汎用チップ
        { vendorId: 0x1a86 }, // QinHeng Electronics (CH340など)
        { vendorId: 0x067b }, // Prolific
      ]
    });
    
    console.log('✅ USBデバイス検出:', device);
    console.log('   製品名:', device.productName || '不明');
    console.log('   メーカー:', device.manufacturerName || '不明');
    console.log('   Vendor ID:', '0x' + device.vendorId.toString(16).padStart(4, '0'));
    console.log('   Product ID:', '0x' + device.productId.toString(16).padStart(4, '0'));
    
    // デバイスを開く
    await device.open();
    console.log('📂 デバイスをオープンしました');
    
    // コンフィグレーションを選択
    if (device.configuration === null) {
      await device.selectConfiguration(1);
      console.log('⚙️ コンフィグレーション選択完了');
    }
    
    // 最初のインターフェースを取得
    const interfaces = device.configuration.interfaces;
    console.log('📋 利用可能なインターフェース数:', interfaces.length);
    
    if (interfaces.length === 0) {
      throw new Error('利用可能なインターフェースがありません');
    }
    
    // インターフェースをクレーム
    await device.claimInterface(0);
    console.log('🔗 インターフェース #0 接続完了');
    
    // 出力エンドポイントを検索
    const iface = interfaces[0];
    let endpoint = null;
    
    for (const alt of iface.alternates) {
      for (const ep of alt.endpoints) {
        console.log(`  エンドポイント: ${ep.endpointNumber} (${ep.direction}) - タイプ: ${ep.type}`);
        if (ep.direction === 'out' && ep.type === 'bulk') {
          endpoint = ep.endpointNumber;
          console.log('✅ 出力エンドポイント発見:', endpoint);
          break;
        }
      }
      if (endpoint) break;
    }
    
    if (!endpoint) {
      // 出力エンドポイントが見つからない場合はデフォルトで1を使用
      endpoint = 1;
      console.warn('⚠️ 出力エンドポイントが見つかりません。デフォルト(1)を使用します');
    }
    
    window.usbPrinter = device;
    window.printerEndpoint = endpoint;
    
    alert(`プリンターとの接続に成功しました!\n\n製品: ${device.productName || '不明'}\nメーカー: ${device.manufacturerName || '不明'}`);
    return device;
    
  } catch (error) {
    console.error('❌ USB接続エラー:', error);
    
    let errorMsg = 'プリンターへの接続に失敗しました。\n\n';
    
    if (error.name === 'NotFoundError') {
      errorMsg += '確認事項:\n';
      errorMsg += '1. USBケーブルが接続されているか\n';
      errorMsg += '2. プリンターの電源が入っているか\n';
      errorMsg += '3. デバイス選択ダイアログでプリンターを選んだか';
    } else if (error.name === 'SecurityError') {
      errorMsg += 'セキュリティエラー:\n';
      errorMsg += 'ブラウザでUSBアクセスが許可されていません。\n';
      errorMsg += 'HTTPSまたはlocalhostで実行してください。';
    } else {
      errorMsg += 'エラー: ' + error.message;
    }
    
    alert(errorMsg);
    throw error;
  }
}

// バイト配列を結合するヘルパー関数
function appendBytes(array1, array2) {
  const tmp = new Uint8Array(array1.length + array2.length);
  tmp.set(array1, 0);
  tmp.set(array2, array1.length);
  return tmp;
}

// ESC/POSコマンドでデータを送信
async function sendToUSBPrinter(data) {
  if (!window.usbPrinter) {
    throw new Error('プリンターが接続されていません');
  }
  
  const endpoint = window.printerEndpoint || 1;
  
  try {
    console.log(`📤 印刷データ送信中... (${data.length} bytes, endpoint: ${endpoint})`);
    
    // データを送信
    const result = await window.usbPrinter.transferOut(endpoint, data);
    
    if (result.status !== 'ok') {
      throw new Error('データ送信に失敗: ' + result.status);
    }
    
    console.log('✅ 送信完了:', result.bytesWritten, 'bytes');
    return result;
    
  } catch (error) {
    console.error('❌ 送信エラー:', error);
    
    // 接続が切れている可能性があるのでリセット
    window.usbPrinter = null;
    window.printerEndpoint = null;
    
    throw error;
  }
}

// お会計伝票を印刷（汎用ESC/POS版）
async function printBillToUSB(storeName, branchName, dateStr, tableNumber, itemsData, grandTotal, itemCount) {
  let device = window.usbPrinter;
  
  // デバイスが未接続の場合は接続を試みる
  if (!device) {
    device = await connectUSBPrinter();
  }
  
  try {
    const encoder = new TextEncoder();
    
    // ESC/POS標準コマンドを生成
    let commands = new Uint8Array([
      0x1B, 0x40, // ESC @ - プリンター初期化
    ]);
    
    // ===== ヘッダー =====
    // センター揃え
    commands = appendBytes(commands, [0x1B, 0x61, 0x01]); // ESC a 1
    
    // 倍角（メーカーによって異なる場合があるので両方試す）
    commands = appendBytes(commands, [0x1D, 0x21, 0x11]); // GS ! 17 (倍角)
    commands = appendBytes(commands, encoder.encode(storeName + '\n'));
    
    // 通常サイズ
    commands = appendBytes(commands, [0x1D, 0x21, 0x00]); // GS ! 0
    commands = appendBytes(commands, encoder.encode(branchName + '\n'));
    
    // タイトル（縦倍角）
    commands = appendBytes(commands, [0x1D, 0x21, 0x10]); // GS ! 16
    commands = appendBytes(commands, encoder.encode('\nお会計伝票\n\n'));
    commands = appendBytes(commands, [0x1D, 0x21, 0x00]);
    
    // ===== 罫線 =====
    commands = appendBytes(commands, encoder.encode('--------------------------------\n'));
    
    // ===== 日時・テーブル情報 =====
    commands = appendBytes(commands, [0x1B, 0x61, 0x00]); // 左揃え
    commands = appendBytes(commands, encoder.encode(`日時: ${dateStr}\n`));
    commands = appendBytes(commands, encoder.encode(`テーブル: ${tableNumber}\n`));
    commands = appendBytes(commands, encoder.encode('--------------------------------\n'));
    
    // ===== 商品リスト =====
    let currentOrder = null;
    itemsData.forEach(item => {
      if (item.orderNumber !== currentOrder) {
        commands = appendBytes(commands, encoder.encode(`\n[注文 #${item.orderNumber}]\n`));
        currentOrder = item.orderNumber;
      }
      
      // 商品名（32文字幅に調整）
      const itemName = item.name.length > 16 ? item.name.substring(0, 15) + '…' : item.name;
      commands = appendBytes(commands, encoder.encode(itemName + '\n'));
      
      // 価格と数量
      const priceInfo = `@${item.price} x${item.quantity}`;
      const displaySubtotal = item.price * item.quantity;
      const subtotalStr = `${displaySubtotal.toLocaleString()}円`;
      const spaces = ' '.repeat(Math.max(1, 32 - priceInfo.length - subtotalStr.length));
      commands = appendBytes(commands, encoder.encode(`${priceInfo}${spaces}${subtotalStr}\n`));
      
      // トッピング表示
      if (item.toppingDetails && item.toppingDetails.length > 0) {
        const groupedBySet = {};
        item.toppingDetails.forEach(detail => {
          if (!groupedBySet[detail.setName]) {
            groupedBySet[detail.setName] = [];
          }
          groupedBySet[detail.setName].push(detail.optionName);
        });
        
        Object.entries(groupedBySet).forEach(([setName, options]) => {
          commands = appendBytes(commands, encoder.encode(` ${setName}\n`));
          options.forEach(opt => {
            commands = appendBytes(commands, encoder.encode(`  ・${opt}\n`));
          });
        });
      } else if (item.toppings && item.toppings !== 'なし') {
        commands = appendBytes(commands, encoder.encode(` TP:${item.toppings}\n`));
      }
    });
    
    // ===== 合計セクション =====
    commands = appendBytes(commands, encoder.encode('================================\n'));
    commands = appendBytes(commands, encoder.encode(`点数: ${itemCount}点\n`));
    commands = appendBytes(commands, encoder.encode('================================\n'));
    
    // センター揃え
    commands = appendBytes(commands, [0x1B, 0x61, 0x01]);
    
    // 合計金額（倍角）
    commands = appendBytes(commands, [0x1D, 0x21, 0x11]);
    commands = appendBytes(commands, encoder.encode(`合計 ${grandTotal.toLocaleString()}円\n`));
    commands = appendBytes(commands, [0x1D, 0x21, 0x00]);
    
    commands = appendBytes(commands, encoder.encode('================================\n'));
    commands = appendBytes(commands, encoder.encode('\n\nレジまでお持ちください\n\n\n'));
    
    // ===== 用紙カット =====
    // 3行フィードしてからカット（プリンターによって対応が異なる）
    commands = appendBytes(commands, [0x1B, 0x64, 0x03]); // ESC d 3 - 3行フィード
    
    // 部分カット（メーカーによって異なる）
    commands = appendBytes(commands, [0x1D, 0x56, 0x01]); // GS V 1 - 部分カット
    
    // データ送信
    await sendToUSBPrinter(commands);
    
    console.log('✅ 印刷完了');
    
  } catch (error) {
    console.error('❌ 印刷エラー:', error);
    throw error;
  }
}

// 既存のprintBill関数を上書き
window.printBill = async function() {
  const tableNumber = document.getElementById('tableSelect').value;
  if (!tableNumber) {
    alert('テーブルを選択してください');
    return;
  }
  
  try {
    // 選択されたテーブルの全注文を取得
    const ordersSnapshot = await window.getDocs(window.getStoreCollection('orders'));
    const tableOrders = [];
    
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      if (order.tableNumber === tableNumber && !order.paidAt && !order.deleted && !order.cancelledAt) {
        tableOrders.push({
          id: doc.id,
          ...order
        });
      }
    });
    
    if (tableOrders.length === 0) {
      alert('このテーブルに未会計の注文がありません');
      return;
    }
    
    // 注文番号でソート
    tableOrders.sort((a, b) => (a.orderNumber || 0) - (b.orderNumber || 0));
    
    // 伝票データを準備
    let grandTotal = 0;
    let itemCount = 0;
    const storeName = window.receiptSettings?.storeName || '粉もん屋 八';
    const branchName = window.receiptSettings?.branchName || '下赤塚店';
    
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // 商品データ集計
    const itemsData = [];
    tableOrders.forEach(order => {
      order.items.forEach(item => {
        const subtotal = item.price * item.quantity;
        grandTotal += subtotal;
        itemCount += item.quantity;
        
        let displayPrice = item.price;
        if (item.taxType === 'exclusive') {
          const taxRate = item.taxRate || 10;
          displayPrice = Math.floor(item.price * (1 + taxRate / 100));
        }
        
        itemsData.push({
          name: item.name,
          price: displayPrice,
          quantity: item.quantity,
          toppings: item.toppings,
          toppingDetails: item.toppingDetails,
          orderNumber: order.orderNumber
        });
      });
    });
    
    // USB接続のプリンターで印刷
    await printBillToUSB(storeName, branchName, dateStr, tableNumber, itemsData, grandTotal, itemCount);
    
    if (typeof showToast === 'function') {
      showToast('お会計伝票を印刷しました');
    } else {
      alert('お会計伝票を印刷しました');
    }
    
  } catch (e) {
    console.error('印刷エラー:', e);
    alert('印刷に失敗しました: ' + e.message);
  }
};

// プリンター接続テスト用の関数
window.testUSBPrinterConnection = async function() {
  try {
    await connectUSBPrinter();
  } catch (error) {
    console.error('接続テスト失敗:', error);
  }
};

// テスト印刷用の関数
window.testUSBPrint = async function() {
  try {
    if (!window.usbPrinter) {
      await connectUSBPrinter();
    }
    
    const encoder = new TextEncoder();
    let commands = new Uint8Array([0x1B, 0x40]); // 初期化
    
    commands = appendBytes(commands, [0x1B, 0x61, 0x01]); // センター揃え
    commands = appendBytes(commands, encoder.encode('\nテスト印刷\n\n'));
    commands = appendBytes(commands, encoder.encode('プリンターは正常に\n'));
    commands = appendBytes(commands, encoder.encode('動作しています\n\n\n'));
    commands = appendBytes(commands, [0x1B, 0x64, 0x03]); // フィード
    commands = appendBytes(commands, [0x1D, 0x56, 0x01]); // カット
    
    await sendToUSBPrinter(commands);
    alert('テスト印刷を送信しました');
    
  } catch (error) {
    console.error('テスト印刷エラー:', error);
    alert('テスト印刷に失敗しました: ' + error.message);
  }
};

// プリンター情報を表示
window.showPrinterInfo = function() {
  if (!window.usbPrinter) {
    alert('プリンターが接続されていません');
    return;
  }
  
  const device = window.usbPrinter;
  const info = `
【接続中のプリンター情報】

製品名: ${device.productName || '不明'}
メーカー: ${device.manufacturerName || '不明'}
Vendor ID: 0x${device.vendorId.toString(16).padStart(4, '0')}
Product ID: 0x${device.productId.toString(16).padStart(4, '0')}
出力エンドポイント: ${window.printerEndpoint || '不明'}
  `.trim();
  
  alert(info);
  console.log('📋 プリンター情報:', device);
};

console.log('✅ 汎用USBプリンター対応パッチを読み込みました');
console.log('💡 使い方:');
console.log('  - testUSBPrinterConnection() : プリンター接続');
console.log('  - testUSBPrint() : テスト印刷');
console.log('  - showPrinterInfo() : プリンター情報表示');
