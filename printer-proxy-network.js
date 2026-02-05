const express = require('express');
const cors = require('cors');
const axios = require('axios');
const os = require('os');
const app = express();

// CORSを有効化（全てのオリジンを許可）
app.use(cors());
app.use(express.json());
app.use(express.text());

// プリンター設定（複数プリンターに対応）
const PRINTERS = {
  // デフォルトプリンター
  default: process.env.PRINTER_IP || '192.168.244.41',
  
  // 複数プリンターを登録可能
  // kitchen: '192.168.1.101',  // キッチン用プリンター
  // bar: '192.168.1.102',      // バー用プリンター
  // receipt: '192.168.1.103',  // レシート用プリンター
};

const PORT = process.env.PORT || 3000;

// ローカルIPアドレスを取得
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4で、内部アドレスでないものを取得
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ヘルスチェック用エンドポイント
app.get('/health', (req, res) => {
  const localIP = getLocalIPAddress();
  res.json({ 
    status: 'ok',
    serverIP: localIP,
    serverPort: PORT,
    accessURL: `http://${localIP}:${PORT}`,
    printers: PRINTERS,
    message: 'Printer proxy server is running'
  });
});

// プリンター一覧を取得
app.get('/printers', (req, res) => {
  res.json({
    printers: Object.keys(PRINTERS).map(name => ({
      name: name,
      ip: PRINTERS[name],
      url: `http://${PRINTERS[name]}/StarWebPRNT/SendMessage`
    }))
  });
});

// 指定したプリンターで印刷
app.post('/print/:printerName?', async (req, res) => {
  try {
    // プリンター名が指定されていない場合はdefaultを使用
    const printerName = req.params.printerName || 'default';
    const printerIP = PRINTERS[printerName];
    
    if (!printerIP) {
      return res.status(404).json({
        error: 'プリンターが見つかりません',
        availablePrinters: Object.keys(PRINTERS),
        message: `プリンター "${printerName}" は登録されていません`
      });
    }
    
    console.log(`📄 印刷リクエスト受信 [${printerName}]`);
    console.log(`プリンターIP: ${printerIP}`);
    console.log(`リクエスト元: ${req.ip}`);
    
    // プリンターのStarWebPRNTエンドポイントにリクエストを転送
    const printerUrl = `http://${printerIP}/StarWebPRNT/SendMessage`;
    console.log(`転送先URL: ${printerUrl}`);
    
    // リクエストボディをそのまま転送
    const response = await axios.post(printerUrl, req.body, {
      headers: {
        'Content-Type': req.headers['content-type'] || 'text/xml'
      },
      timeout: 10000 // 10秒タイムアウト
    });
    
    console.log(`✅ 印刷成功 [${printerName}]`);
    
    // プリンターからのレスポンスをそのまま返す
    res.status(response.status).send(response.data);
    
  } catch (error) {
    console.error('❌ 印刷エラー:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      res.status(503).json({ 
        error: 'プリンターに接続できません',
        printerIP: PRINTERS[req.params.printerName || 'default'],
        message: 'プリンターの電源とネットワーク接続を確認してください'
      });
    } else if (error.code === 'ETIMEDOUT') {
      res.status(504).json({ 
        error: 'プリンターへの接続がタイムアウトしました',
        printerIP: PRINTERS[req.params.printerName || 'default']
      });
    } else {
      res.status(500).json({ 
        error: '印刷処理でエラーが発生しました',
        message: error.message 
      });
    }
  }
});

// ESC/POS形式の印刷にも対応（Loyverse互換）
app.post('/print-escpos/:printerName?', async (req, res) => {
  try {
    const printerName = req.params.printerName || 'default';
    const printerIP = PRINTERS[printerName];
    
    if (!printerIP) {
      return res.status(404).json({
        error: 'プリンターが見つかりません',
        availablePrinters: Object.keys(PRINTERS)
      });
    }
    
    console.log(`📄 ESC/POS印刷リクエスト受信 [${printerName}]`);
    
    // ESC/POSコマンドを直接プリンターに送信
    // 注: この実装はプリンターがESC/POSをサポートしている場合のみ動作
    const printerUrl = `http://${printerIP}:9100`; // 多くのプリンターは9100ポートを使用
    
    const response = await axios.post(printerUrl, req.body, {
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      timeout: 10000
    });
    
    console.log(`✅ ESC/POS印刷成功 [${printerName}]`);
    res.json({ status: 'success', message: '印刷しました' });
    
  } catch (error) {
    console.error('❌ ESC/POS印刷エラー:', error.message);
    res.status(500).json({ 
      error: 'ESC/POS印刷でエラーが発生しました',
      message: error.message 
    });
  }
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIPAddress();
  
  console.log('');
  console.log('🖨️  Printer Proxy Server (Network-wide)');
  console.log('=========================================');
  console.log(`✅ サーバー起動: http://${localIP}:${PORT}`);
  console.log('');
  console.log('📱 ネットワーク内のデバイスからアクセス:');
  console.log(`   http://${localIP}:${PORT}`);
  console.log('');
  console.log('🖨️  登録されているプリンター:');
  Object.entries(PRINTERS).forEach(([name, ip]) => {
    console.log(`   - ${name}: ${ip}`);
  });
  console.log('');
  console.log('📝 使い方:');
  console.log(`   1. スマホ・タブレット・PCから以下のURLにアクセス:`);
  console.log(`      http://${localIP}:${PORT}/health`);
  console.log('');
  console.log(`   2. pos.htmlで以下のように設定:`);
  console.log(`      const PRINTER_PROXY_URL = 'http://${localIP}:${PORT}/print';`);
  console.log('');
  console.log('🌐 エンドポイント:');
  console.log(`   GET  /health              - サーバー状態確認`);
  console.log(`   GET  /printers            - プリンター一覧`);
  console.log(`   POST /print               - デフォルトプリンターで印刷`);
  console.log(`   POST /print/:printerName  - 指定プリンターで印刷`);
  console.log('');
});
