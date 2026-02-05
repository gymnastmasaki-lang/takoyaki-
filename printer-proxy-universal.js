const express = require('express');
const cors = require('cors');
const axios = require('axios');
const os = require('os');
const net = require('net');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.text());

// プリンター設定
const PRINTERS = [
  {
    id: 'main',
    name: 'メインレジ',
    brand: 'star',           // star, epson, citizen, escpos
    model: 'mC-Print3',
    ip: process.env.PRINTER_IP || '192.168.244.41',
    port: null,              // StarはHTTP、その他は9100など
    width: 58,               // 用紙幅（mm）
    encoding: 'utf-8'
  },
  // 他のプリンターを追加可能
  // {
  //   id: 'kitchen',
  //   name: 'キッチン',
  //   brand: 'epson',
  //   model: 'TM-T88VI',
  //   ip: '192.168.1.101',
  //   port: 9100,
  //   width: 80,
  //   encoding: 'shift_jis'
  // }
];

const PORT = process.env.PORT || 3000;

// ローカルIPアドレスを取得
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ESC/POSコマンド生成（汎用）
class ESCPOSBuilder {
  constructor() {
    this.buffer = [];
    this.ESC = 0x1B;
    this.GS = 0x1D;
  }

  // 初期化
  init() {
    this.buffer.push(this.ESC, 0x40);
    return this;
  }

  // テキスト追加
  text(str, encoding = 'utf-8') {
    const buffer = Buffer.from(str, encoding);
    this.buffer.push(...buffer);
    return this;
  }

  // 改行
  newline(lines = 1) {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0A);
    }
    return this;
  }

  // 中央揃え
  alignCenter() {
    this.buffer.push(this.ESC, 0x61, 0x01);
    return this;
  }

  // 左揃え
  alignLeft() {
    this.buffer.push(this.ESC, 0x61, 0x00);
    return this;
  }

  // 右揃え
  alignRight() {
    this.buffer.push(this.ESC, 0x61, 0x02);
    return this;
  }

  // 太字ON
  bold(enable = true) {
    this.buffer.push(this.ESC, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  // サイズ変更（幅・高さ: 1-8）
  size(width = 1, height = 1) {
    const size = ((width - 1) << 4) | (height - 1);
    this.buffer.push(this.GS, 0x21, size);
    return this;
  }

  // 区切り線
  line(char = '-', length = 32) {
    this.text(char.repeat(length));
    this.newline();
    return this;
  }

  // カット
  cut() {
    this.buffer.push(this.GS, 0x56, 0x00);
    return this;
  }

  // バッファを取得
  getBuffer() {
    return Buffer.from(this.buffer);
  }
}

// Star WebPRNT用のビルダー（既存のコード用）
class StarWebPRNTBuilder {
  constructor() {
    this.commands = [];
  }

  init() {
    this.commands.push({ type: 'init' });
    return this;
  }

  text(str) {
    this.commands.push({ type: 'text', data: str });
    return this;
  }

  alignCenter() {
    this.commands.push({ type: 'align', position: 'center' });
    return this;
  }

  alignLeft() {
    this.commands.push({ type: 'align', position: 'left' });
    return this;
  }

  bold(enable = true) {
    this.commands.push({ type: 'emphasis', enable: enable });
    return this;
  }

  size(width, height) {
    this.commands.push({ type: 'size', width: width, height: height });
    return this;
  }

  line() {
    this.commands.push({ type: 'line', thickness: 'thin' });
    return this;
  }

  cut() {
    this.commands.push({ type: 'cut', feed: true });
    return this;
  }

  // Star WebPRNT形式のXMLに変換
  toXML() {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<root>\n';
    
    this.commands.forEach(cmd => {
      switch (cmd.type) {
        case 'init':
          xml += '  <initialization/>\n';
          break;
        case 'text':
          xml += `  <text>${this.escapeXML(cmd.data)}</text>\n`;
          break;
        case 'align':
          xml += `  <alignment position="${cmd.position}"/>\n`;
          break;
        case 'emphasis':
          xml += `  <emphasis enable="${cmd.enable}"/>\n`;
          break;
        case 'size':
          xml += `  <text width="${cmd.width}" height="${cmd.height}"/>\n`;
          break;
        case 'line':
          xml += `  <ruledline thickness="${cmd.thickness}"/>\n`;
          break;
        case 'cut':
          xml += '  <cutpaper feed="true"/>\n';
          break;
      }
    });
    
    xml += '</root>';
    return xml;
  }

  escapeXML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// プリンターに送信（ブランド別）
async function sendToPrinter(printer, data) {
  if (printer.brand === 'star') {
    // Star WebPRNT
    const url = `http://${printer.ip}/StarWebPRNT/SendMessage`;
    const response = await axios.post(url, data, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 10000
    });
    return response.data;
  } else {
    // ESC/POS (Epson, Citizen, その他)
    return new Promise((resolve, reject) => {
      const port = printer.port || 9100;
      const client = new net.Socket();
      
      client.connect(port, printer.ip, () => {
        console.log(`接続成功: ${printer.ip}:${port}`);
        client.write(data);
      });
      
      client.on('data', (data) => {
        console.log('プリンターからの応答:', data);
        client.destroy();
        resolve({ status: 'success' });
      });
      
      client.on('close', () => {
        resolve({ status: 'success' });
      });
      
      client.on('error', (err) => {
        reject(err);
      });
      
      // タイムアウト
      setTimeout(() => {
        client.destroy();
        resolve({ status: 'success', message: 'タイムアウト（印刷は完了した可能性あり）' });
      }, 5000);
    });
  }
}

// エンドポイント: プリンター一覧
app.get('/printers', (req, res) => {
  res.json({
    printers: PRINTERS.map(p => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      model: p.model,
      ip: p.ip,
      width: p.width
    }))
  });
});

// エンドポイント: 汎用印刷（JSON形式）
app.post('/print-json/:printerId?', async (req, res) => {
  try {
    const printerId = req.params.printerId || 'main';
    const printer = PRINTERS.find(p => p.id === printerId);
    
    if (!printer) {
      return res.status(404).json({ error: 'プリンターが見つかりません' });
    }
    
    console.log(`📄 JSON印刷リクエスト [${printer.name}]`);
    
    // JSON形式の印刷データ
    const { items, total, payment } = req.body;
    
    let printData;
    
    if (printer.brand === 'star') {
      // Star WebPRNT形式
      const builder = new StarWebPRNTBuilder();
      builder.init()
        .alignCenter()
        .bold(true).size(2, 2).text('粉もん屋 八\n')
        .bold(false).size(1, 1).text('下赤塚店\n')
        .line()
        .alignLeft();
      
      items.forEach(item => {
        builder.text(`${item.name} x${item.quantity}\n`);
        builder.text(`  ¥${item.price}\n`);
      });
      
      builder.line()
        .alignRight()
        .bold(true).size(2, 1).text(`合計 ¥${total}\n`)
        .bold(false).size(1, 1)
        .alignCenter()
        .text('\nありがとうございました\n\n')
        .cut();
      
      printData = builder.toXML();
    } else {
      // ESC/POS形式
      const builder = new ESCPOSBuilder();
      builder.init()
        .alignCenter()
        .bold(true).size(2, 2).text('粉もん屋 八\n')
        .bold(false).size(1, 1).text('下赤塚店\n')
        .line()
        .alignLeft();
      
      items.forEach(item => {
        builder.text(`${item.name} x${item.quantity}\n`);
        builder.text(`  ¥${item.price}\n`);
      });
      
      builder.line()
        .alignRight()
        .bold(true).text(`合計 ¥${total}\n`)
        .bold(false)
        .alignCenter()
        .newline()
        .text('ありがとうございました\n')
        .newline(2)
        .cut();
      
      printData = builder.getBuffer();
    }
    
    await sendToPrinter(printer, printData);
    
    console.log(`✅ 印刷成功 [${printer.name}]`);
    res.json({ status: 'success', printer: printer.name });
    
  } catch (error) {
    console.error('❌ 印刷エラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// エンドポイント: Star WebPRNT（既存のコード用）
app.post('/print/:printerId?', async (req, res) => {
  try {
    const printerId = req.params.printerId || 'main';
    const printer = PRINTERS.find(p => p.id === printerId);
    
    if (!printer) {
      return res.status(404).json({ error: 'プリンターが見つかりません' });
    }
    
    console.log(`📄 印刷リクエスト [${printer.name}]`);
    
    await sendToPrinter(printer, req.body);
    
    console.log(`✅ 印刷成功 [${printer.name}]`);
    res.json({ status: 'success' });
    
  } catch (error) {
    console.error('❌ 印刷エラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// ヘルスチェック
app.get('/health', (req, res) => {
  const localIP = getLocalIPAddress();
  res.json({ 
    status: 'ok',
    serverIP: localIP,
    serverPort: PORT,
    printers: PRINTERS.length,
    message: 'Multi-brand printer proxy server'
  });
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIPAddress();
  
  console.log('');
  console.log('🖨️  Multi-Brand Printer Proxy Server');
  console.log('=====================================');
  console.log(`✅ サーバー起動: http://${localIP}:${PORT}`);
  console.log('');
  console.log('🖨️  対応プリンター:');
  console.log('   - Star (mC-Print, TSP100, TSP650, etc.)');
  console.log('   - Epson (TM-T88, TM-T20, TM-m30, etc.)');
  console.log('   - Citizen (CT-S310, CT-S4000, etc.)');
  console.log('   - ESC/POS互換プリンター全般');
  console.log('');
  console.log('📱 登録済みプリンター:');
  PRINTERS.forEach(p => {
    console.log(`   - ${p.name} (${p.brand} ${p.model}) - ${p.ip}`);
  });
  console.log('');
  console.log(`🌐 アクセスURL: http://${localIP}:${PORT}`);
  console.log('');
});
