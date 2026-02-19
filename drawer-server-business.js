#!/usr/bin/env node

/**
 * キャッシュドロア制御サーバー with WiFi自動設定機能
 * 
 * ビジネスモデル用の特別版:
 * - POSからWiFi設定を受け取って自動設定
 * - ユーザーはPOS画面でSSID/パスワード入力するだけ
 * - SDカード量産用に最適化
 */

const http = require('http');
const { SerialPort } = require('serialport');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// 設定
const CONFIG = {
  PORT: 3000,
  SERIAL_PATH: '/dev/ttyUSB0',
  BAUD_RATE: 9600,
  DEFAULT_DURATION: 500,
  WIFI_CONFIG_PATH: '/etc/wpa_supplicant/wpa_supplicant.conf'
};

// ESC/POSコマンド: ドロアを開く
const DRAWER_OPEN_COMMAND = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);

let serialPort = null;

// シリアルポートを初期化
async function initSerialPort() {
  try {
    console.log('🔌 シリアルポート初期化中...');
    
    serialPort = new SerialPort({
      path: CONFIG.SERIAL_PATH,
      baudRate: CONFIG.BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none'
    });

    serialPort.on('open', () => {
      console.log('✅ シリアルポート接続完了');
    });

    serialPort.on('error', (err) => {
      console.error('⚠️  シリアルポートエラー:', err.message);
    });

    return true;
  } catch (error) {
    console.error('⚠️  シリアルポート初期化失敗:', error.message);
    console.log('💡 ドロア未接続の可能性があります（WiFi設定は可能）');
    return false;
  }
}

// ドロアを開く
function openDrawer(duration = CONFIG.DEFAULT_DURATION) {
  return new Promise((resolve, reject) => {
    if (!serialPort || !serialPort.isOpen) {
      reject(new Error('シリアルポートが開いていません'));
      return;
    }

    console.log(`💰 ドロアを開きます（${duration}ms）...`);

    serialPort.write(DRAWER_OPEN_COMMAND, (err) => {
      if (err) {
        console.error('❌ 書き込みエラー:', err.message);
        reject(err);
      } else {
        console.log('✅ ドロアコマンド送信完了');
        setTimeout(() => {
          resolve({ success: true, duration });
        }, 100);
      }
    });
  });
}

// WiFi設定を更新
async function updateWiFiConfig(ssid, password) {
  console.log('📡 WiFi設定を更新中...');
  console.log(`   SSID: ${ssid}`);
  
  const config = `country=JP
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

network={
    ssid="${ssid}"
    psk="${password}"
    key_mgmt=WPA-PSK
}
`;

  try {
    // 設定ファイルを書き込み
    fs.writeFileSync(CONFIG.WIFI_CONFIG_PATH, config, { encoding: 'utf8' });
    console.log('✅ WiFi設定ファイル更新完了');
    
    // wpa_supplicantを再起動
    await execPromise('sudo wpa_cli -i wlan0 reconfigure');
    console.log('✅ WiFi接続を再構成しました');
    
    // 接続状態を確認（5秒待つ）
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const { stdout } = await execPromise('iwconfig wlan0');
    const connected = stdout.includes(`ESSID:"${ssid}"`);
    
    if (connected) {
      console.log('✅ WiFi接続成功！');
      return { success: true, message: 'WiFi接続に成功しました' };
    } else {
      console.log('⚠️  WiFi接続確認中...');
      return { success: true, message: 'WiFi設定を保存しました（接続確認中）' };
    }
  } catch (error) {
    console.error('❌ WiFi設定エラー:', error.message);
    throw error;
  }
}

// 現在のWiFi情報を取得
async function getCurrentWiFi() {
  try {
    const { stdout } = await execPromise('iwconfig wlan0');
    const ssidMatch = stdout.match(/ESSID:"([^"]*)"/);
    const ssid = ssidMatch ? ssidMatch[1] : null;
    
    const { stdout: ipInfo } = await execPromise('hostname -I');
    const ip = ipInfo.trim().split(' ')[0];
    
    return { ssid, ip };
  } catch (error) {
    return { ssid: null, ip: null };
  }
}

// HTTPサーバーを作成
const server = http.createServer(async (req, res) => {
  // CORS対応
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`📨 ${req.method} ${req.url}`);

  // ドロアを開くエンドポイント
  if (req.url === '/open' && req.method === 'POST') {
    try {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        let duration = CONFIG.DEFAULT_DURATION;

        if (body) {
          try {
            const data = JSON.parse(body);
            if (data.duration && !isNaN(data.duration)) {
              duration = parseInt(data.duration);
            }
          } catch (e) {
            console.log('⚠️  JSONパース失敗、デフォルト値を使用');
          }
        }

        try {
          const result = await openDrawer(duration);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            message: 'ドロアを開きました',
            duration: result.duration 
          }));
        } catch (error) {
          console.error('❌ ドロア開放エラー:', error.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: error.message 
          }));
        }
      });
    } catch (error) {
      console.error('❌ リクエスト処理エラー:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // 🆕 WiFi設定エンドポイント
  if (req.url === '/wifi/configure' && req.method === 'POST') {
    try {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const { ssid, password } = data;
          
          if (!ssid || !password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: 'SSIDとパスワードが必要です' 
            }));
            return;
          }

          const result = await updateWiFiConfig(ssid, password);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            message: result.message 
          }));
        } catch (error) {
          console.error('❌ WiFi設定エラー:', error.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'WiFi設定に失敗しました: ' + error.message 
          }));
        }
      });
    } catch (error) {
      console.error('❌ リクエスト処理エラー:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // 🆕 WiFi情報取得エンドポイント
  if (req.url === '/wifi/status' && req.method === 'GET') {
    try {
      const wifiInfo = await getCurrentWiFi();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        wifi: wifiInfo 
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: error.message 
      }));
    }
    return;
  }

  // ステータス確認エンドポイント
  if (req.url === '/status' && req.method === 'GET') {
    const wifiInfo = await getCurrentWiFi();
    const status = {
      server: 'running',
      version: '2.0.0-business',
      serialPort: {
        connected: serialPort && serialPort.isOpen,
        path: CONFIG.SERIAL_PATH,
        baudRate: CONFIG.BAUD_RATE
      },
      wifi: wifiInfo,
      config: {
        port: CONFIG.PORT,
        defaultDuration: CONFIG.DEFAULT_DURATION
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
    return;
  }

  // ルートパス - 管理画面
  if (req.url === '/' && req.method === 'GET') {
    const wifiInfo = await getCurrentWiFi();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>キャッシュドロア制御システム</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 30px;
      margin-bottom: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    h1 { 
      color: #667eea; 
      font-size: 28px; 
      margin-bottom: 10px;
      text-align: center;
    }
    .version {
      text-align: center;
      color: #999;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .status {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 10px;
      margin: 20px 0;
    }
    .status-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e9ecef;
    }
    .status-item:last-child { border-bottom: none; }
    .status-label { font-weight: 600; color: #495057; }
    .status-value { color: #6c757d; }
    .status-ok { color: #28a745; font-weight: bold; }
    .status-error { color: #dc3545; font-weight: bold; }
    button {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 15px 30px;
      font-size: 16px;
      border-radius: 10px;
      cursor: pointer;
      width: 100%;
      margin: 10px 0;
      font-weight: 600;
      transition: transform 0.2s;
    }
    button:hover { transform: translateY(-2px); }
    button:active { transform: translateY(0); }
    .result {
      margin: 20px 0;
      padding: 15px;
      border-radius: 10px;
      display: none;
    }
    .success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    .info-box {
      background: #e7f3ff;
      border-left: 4px solid #2196F3;
      padding: 15px;
      margin: 20px 0;
      border-radius: 5px;
    }
    .info-box h3 {
      color: #2196F3;
      margin-bottom: 10px;
      font-size: 18px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>🏪 キャッシュドロア制御システム</h1>
      <div class="version">Business Edition v2.0.0</div>
      
      <div class="status">
        <div class="status-item">
          <span class="status-label">サーバー状態</span>
          <span class="status-value status-ok">✅ 稼働中</span>
        </div>
        <div class="status-item">
          <span class="status-label">ドロア接続</span>
          <span class="status-value ${serialPort && serialPort.isOpen ? 'status-ok">✅ 接続済み' : 'status-error">❌ 未接続'}</span>
        </div>
        <div class="status-item">
          <span class="status-label">WiFi SSID</span>
          <span class="status-value">${wifiInfo.ssid || '未接続'}</span>
        </div>
        <div class="status-item">
          <span class="status-label">IPアドレス</span>
          <span class="status-value">${wifiInfo.ip || '取得中...'}</span>
        </div>
      </div>

      <button onclick="testDrawer()">💰 ドロアテスト</button>
      
      <div id="result" class="result"></div>

      <div class="info-box">
        <h3>📱 POSシステムから設定する</h3>
        <p>POSの設定画面で以下を入力してください:</p>
        <ul style="margin: 10px 0 0 20px;">
          <li><strong>IPアドレス:</strong> ${wifiInfo.ip || '取得中...'}</li>
        </ul>
      </div>

      <div class="info-box">
        <h3>🔧 サポート情報</h3>
        <p><strong>SDカード交換:</strong> 故障時は新しいSDカードに交換するだけ</p>
        <p><strong>問い合わせ:</strong> TeamViewer/Zoom で遠隔サポート可能</p>
      </div>
    </div>
  </div>

  <script>
    async function testDrawer() {
      const resultDiv = document.getElementById('result');
      resultDiv.style.display = 'block';
      resultDiv.className = 'result';
      resultDiv.textContent = '⏳ テスト中...';
      
      try {
        const response = await fetch('/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration: 500 })
        });
        
        const data = await response.json();
        
        if (data.success) {
          resultDiv.className = 'result success';
          resultDiv.textContent = '✅ ' + data.message;
        } else {
          resultDiv.className = 'result error';
          resultDiv.textContent = '❌ エラー: ' + data.error;
        }
      } catch (error) {
        resultDiv.className = 'result error';
        resultDiv.textContent = '❌ 接続エラー: ' + error.message;
      }
    }
  </script>
</body>
</html>
    `);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// サーバー起動
async function start() {
  console.log('');
  console.log('🚀 キャッシュドロア制御システム起動中...');
  console.log('📦 Business Edition v2.0.0');
  console.log('');

  // シリアルポート初期化
  await initSerialPort();

  // WiFi情報を表示
  const wifiInfo = await getCurrentWiFi();
  console.log('');
  console.log('📡 WiFi情報:');
  console.log(`   SSID: ${wifiInfo.ssid || '未接続'}`);
  console.log(`   IP: ${wifiInfo.ip || '取得中...'}`);
  console.log('');

  // HTTPサーバー起動
  server.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log('✅ サーバー起動完了！');
    console.log('');
    console.log(`🌐 管理画面: http://${wifiInfo.ip || 'localhost'}:${CONFIG.PORT}`);
    console.log('');
    console.log('💡 ユーザー向け機能:');
    console.log('   - POSからWiFi設定が可能');
    console.log('   - ドロア自動制御');
    console.log('   - SDカード交換で簡単復旧');
    console.log('');
  });
}

// エラーハンドリング
process.on('uncaughtException', (err) => {
  console.error('❌ 予期しないエラー:', err);
});

process.on('SIGINT', () => {
  console.log('');
  console.log('👋 サーバーを停止します...');
  if (serialPort && serialPort.isOpen) {
    serialPort.close();
  }
  process.exit(0);
});

// 起動
start();
