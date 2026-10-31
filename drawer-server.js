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
const { exec, execFile } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// 設定
const CONFIG = {
  PORT: 3000,
  SERIAL_PATH: '/dev/ttyUSB0',
  BAUD_RATE: 9600,
  DEFAULT_DURATION: 500,
  WIFI_CONFIG_PATH: '/etc/wpa_supplicant/wpa_supplicant.conf',
  // 🆕 ドロアのUSB（USB-シリアル変換）は自動で探して接続する。環境変数で固定も可能
  SERIAL_PATH_FIXED: process.env.DRAWER_SERIAL_PATH || null,
  // 🆕 Piが出しているWi-Fi（アクセスポイント）の設定ファイル
  AP_CONF: process.env.AP_CONF || '/etc/hostapd/hostapd.conf',
  AP_TEST_MODE: !!process.env.AP_CONF   // テスト時は sudo を使わず、サービス再起動もしない
};

// ESC/POSコマンド: ドロアを開く
const DRAWER_OPEN_COMMAND = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);

let serialPort = null;

// 🆕 コマンドを「シェルを通さず」に実行する（入力文字をコマンドとして解釈させないため）
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, Object.assign({ timeout: 20000 }, opts), (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; reject(err); } else resolve({ stdout, stderr });
    });
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 🆕 USB-シリアル機器（ドロア）の候補を探す。/dev/serial/by-id の名前があれば表示名に使う
function listSerialDevices() {
  const found = [];
  try {
    for (const n of fs.readdirSync('/dev')) {
      if (/^tty(USB|ACM)\d+$/.test(n)) found.push({ path: '/dev/' + n, name: n });
    }
  } catch (e) { /* ignore */ }
  try {
    for (const n of fs.readdirSync('/dev/serial/by-id')) {
      let real = null;
      try { real = fs.realpathSync('/dev/serial/by-id/' + n); } catch (e) { /* ignore */ }
      const hit = found.find(d => d.path === real);
      if (hit) hit.name = n;
    }
  } catch (e) { /* by-id が無い機器もある */ }
  return found.sort((x, y) => x.path.localeCompare(y.path));
}

let serialConnecting = false;

// シリアルポートを初期化（指定パスへ接続）
async function initSerialPort(devicePath) {
  if (serialConnecting) return false;
  serialConnecting = true;
  try {
    const p = devicePath || CONFIG.SERIAL_PATH_FIXED || CONFIG.SERIAL_PATH;
    console.log('🔌 シリアルポート接続中...', p);
    const port = new SerialPort({
      path: p,
      baudRate: CONFIG.BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none'
    });
    port.on('open', () => { console.log('✅ シリアルポート接続完了', p); });
    port.on('error', (err) => { console.error('⚠️  シリアルポートエラー:', err.message); });
    port.on('close', () => {
      console.log('🔌 シリアルポートが閉じました:', p);
      if (serialPort === port) serialPort = null;
    });
    serialPort = port;
    return true;
  } catch (error) {
    console.error('⚠️  シリアルポート初期化失敗:', error.message);
    console.log('💡 ドロア未接続の可能性があります（WiFi設定は可能）');
    return false;
  } finally {
    serialConnecting = false;
  }
}

// 🆕 3秒ごとに見回って、ドロアのUSBを抜き差しされても自動で接続し直す（サービスの再起動は不要）
async function ensureSerial() {
  try {
    if (serialPort && serialPort.isOpen) {
      if (!fs.existsSync(serialPort.path)) {
        console.log('🔌 ドロアのUSBが抜かれました:', serialPort.path);
        try { serialPort.close(); } catch (e) { /* ignore */ }
        serialPort = null;
      }
      return;
    }
    if (serialPort && !serialPort.isOpen && !serialPort.opening) { serialPort = null; }
    if (serialPort) return; // 接続処理中
    const devs = listSerialDevices();
    if (!devs.length) return;
    const fixed = CONFIG.SERIAL_PATH_FIXED && devs.find(d => d.path === CONFIG.SERIAL_PATH_FIXED);
    const target = fixed || devs[0];
    console.log('🔎 ドロアらしいUSB機器を検出:', target.path, '(' + target.name + ')');
    await initSerialPort(target.path);
  } catch (e) {
    console.error('⚠️  ドロア自動接続エラー:', e.message);
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

// WiFi設定を更新（NetworkManager / nmcli 対応）
// 🆕 名前・パスワードはシェルを通さずに渡す（以前は文字列に埋め込んでおり、細工した入力でPiを操作できた）
function validateWifiInput(ssid, password) {
  if (typeof ssid !== 'string' || typeof password !== 'string') return 'SSIDとパスワードが必要です';
  if (!ssid || Buffer.byteLength(ssid, 'utf8') > 32 || /[\x00-\x1f\x7f]/.test(ssid)) return 'WiFi名（SSID）は1〜32バイトで、制御文字を含めないでください';
  if (password.length < 8 || password.length > 63 || /[\x00-\x1f\x7f]/.test(password)) return 'WiFiパスワードは8〜63文字で入力してください';
  return null;
}

async function updateWiFiConfig(ssid, password) {
  console.log('📡 WiFi設定を更新中（NetworkManager）...');
  console.log(`   SSID: ${ssid}`);

  const bad = validateWifiInput(ssid, password);
  if (bad) throw new Error(bad);

  try {
    // 既存の同名接続を削除（エラーは無視）
    try {
      await run('sudo', ['nmcli', 'connection', 'delete', ssid]);
    } catch (e) { /* 存在しない場合は無視 */ }

    // 新しいWiFi接続を追加して接続
    await run('sudo', ['nmcli', 'connection', 'add', 'type', 'wifi', 'ssid', ssid, 'wifi-sec.key-mgmt', 'wpa-psk', 'wifi-sec.psk', password, 'con-name', ssid, 'ifname', 'wlan0']);
    await run('sudo', ['nmcli', 'connection', 'up', ssid]);
    console.log('✅ WiFi接続コマンド実行完了');

    // 接続状態を確認（5秒待つ）
    await sleep(5000);

    const { stdout } = await run('nmcli', ['-t', '-f', 'ACTIVE,SSID', 'dev', 'wifi']);
    const connected = stdout.split('\n').some(l => l === 'yes:' + ssid);

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

// 🆕 周辺のWi-Fi一覧（プルダウン用）。nmcli -t の出力は ':' と '\\' が '\\:' '\\\\' にエスケープされる
function splitTerse(line) {
  const out = []; let cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && i + 1 < line.length) { cur += line[i + 1]; i++; }
    else if (c === ':') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function parseWifiList(stdout, ownApSsid) {
  const best = new Map();
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const [inUse, ssid, signal, security] = splitTerse(line);
    if (!ssid || ssid === ownApSsid) continue;
    const sig = parseInt(signal, 10) || 0;
    const cur = best.get(ssid);
    if (!cur || sig > cur.signal) best.set(ssid, { ssid, signal: sig, secured: !!(security && security !== '--'), inUse: inUse === '*' || (cur && cur.inUse) });
    else if (inUse === '*') cur.inUse = true;
  }
  return Array.from(best.values()).sort((a, b) => (b.inUse - a.inUse) || (b.signal - a.signal));
}
async function scanWifi(rescan) {
  const own = await getApInfo().then(i => i.ssid).catch(() => null);
  const base = ['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list'];
  let r;
  try { r = await run('nmcli', base.concat(['ifname', 'wlan0', '--rescan', rescan ? 'yes' : 'auto'])); }
  catch (e) { r = await run('nmcli', base); }
  return parseWifiList(r.stdout, own);
}

// ===== 🆕 Pi自身のWi-Fi（アクセスポイント: hostapd）の名前・パスワード =====
const apFailures = [];   // パスワード間違いの記録（総当たり対策）
async function readApConf() {
  if (CONFIG.AP_TEST_MODE) return fs.readFileSync(CONFIG.AP_CONF, 'utf8');
  const { stdout } = await run('sudo', ['cat', CONFIG.AP_CONF]);
  return stdout;
}
function apConfGet(text, key) {
  const line = text.split('\n').find(l => l.startsWith(key + '='));
  return line ? line.slice(key.length + 1).trim() : null;
}
async function getApInfo() {
  const text = await readApConf();
  return { ssid: apConfGet(text, 'ssid'), pass: apConfGet(text, 'wpa_passphrase'), text };
}
function validateApInput(newSsid, newPassword) {
  if (typeof newSsid !== 'string' || !newSsid || Buffer.byteLength(newSsid, 'utf8') > 32 || /[\x00-\x1f\x7f]/.test(newSsid)) return '接続先名は1〜32バイトで、制御文字を含めないでください';
  if (newSsid !== newSsid.trim()) return '接続先名の前後に空白は使えません';
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 63 || !/^[\x20-\x7e]+$/.test(newPassword)) return 'パスワードは半角の英数字・記号で8〜63文字にしてください';
  return null;
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && require('crypto').timingSafeEqual(x, y);
}
function buildApConf(text, newSsid, newPassword) {
  return text.split('\n').map(l => l.startsWith('ssid=') ? 'ssid=' + newSsid : (l.startsWith('wpa_passphrase=') ? 'wpa_passphrase=' + newPassword : l)).join('\n');
}
async function installApConf(content) {
  if (CONFIG.AP_TEST_MODE) { fs.writeFileSync(CONFIG.AP_CONF, content, { mode: 0o600 }); return; }
  const tmp = '/tmp/hostapd.conf.new';
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  try { await run('sudo', ['install', '-m', '600', '-o', 'root', '-g', 'root', tmp, CONFIG.AP_CONF]); }
  finally { try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ } }
}
// hostapd を再起動して、起動できたか確認。だめなら元の設定に戻す
// 結果（成功・失敗とその理由）は AP_RESULT_FILE に残し、/ap/status で画面に伝える
const AP_RESULT_FILE = process.env.AP_RESULT_FILE || '/home/pi/drawer-server/ap_last_change.json';
function saveApResult(obj) {
  try { fs.writeFileSync(AP_RESULT_FILE, JSON.stringify(Object.assign({ at: new Date().toISOString() }, obj))); } catch (e) { /* ignore */ }
}
function loadApResult() {
  try { return JSON.parse(fs.readFileSync(AP_RESULT_FILE, 'utf8')); } catch (e) { return null; }
}
async function restartApWithRollback(backupText, expectSsid) {
  if (CONFIG.AP_TEST_MODE) return { ok: true, skipped: true };
  const restart = async () => {
    await run('sudo', ['systemctl', 'restart', 'hostapd']);
    await sleep(2000);
    await run('sudo', ['systemctl', 'restart', 'dnsmasq']).catch(() => {}); // ap0が作り直されるため、DHCPも入れ直す
  };
  const check = async () => {
    await sleep(8000);
    const reasons = [];
    try { const a = await run('systemctl', ['is-active', 'hostapd']); if (a.stdout.trim() !== 'active') reasons.push('hostapdが起動していません(' + a.stdout.trim() + ')'); }
    catch (e) { reasons.push('hostapdの状態を取得できません: ' + (e.stdout || e.message).toString().trim()); }
    try { const ip = await run('ip', ['-br', 'addr', 'show', 'ap0']); if (!ip.stdout.includes('192.168.10.1')) reasons.push('ap0に192.168.10.1が付いていません: ' + ip.stdout.trim()); }
    catch (e) { reasons.push('ap0がありません'); }
    // 実際に電波に乗っている名前の確認（ログ用。これだけでは失敗扱いにしない）
    try { const iw = await run('iw', ['dev', 'ap0', 'info']); const line = iw.stdout.split('\n').map(l => l.trim()).find(l => l.startsWith('ssid ')); console.log('📡 ap0の現在の名前:', line || '(取得できず)', ' / 期待:', expectSsid || '-'); } catch (e) { console.log('📡 iwでap0の情報を取得できません:', e.message); }
    if (reasons.length) {
      console.error('⚠️  アクセスポイントの確認で問題:', reasons.join(' / '));
      try { const j = await run('sudo', ['journalctl', '-u', 'hostapd', '-n', '15', '--no-pager']); console.error('--- hostapdのログ ---\n' + j.stdout); } catch (e) { /* ignore */ }
    }
    return reasons;
  };
  let reasons = [];
  try { await restart(); reasons = await check(); if (!reasons.length) { saveApResult({ ok: true, ssid: expectSsid || null }); return { ok: true }; } }
  catch (e) { console.error('❌ hostapd再起動エラー:', e.message); reasons = ['hostapdの再起動に失敗: ' + e.message]; }
  console.error('⚠️  新しい設定で起動できなかったため、元の設定に戻します');
  let restored = false;
  try { await installApConf(backupText); await restart(); const r2 = await check(); restored = r2.length === 0; if (!restored) console.error('❌ 元の設定に戻した後も問題があります:', r2.join(' / ')); }
  catch (e) { console.error('❌ 元の設定への復旧にも失敗:', e.message); }
  saveApResult({ ok: false, restored, reasons });
  return { ok: false };
}

// 現在のWiFi情報を取得
async function getCurrentWiFi() {
  try {
    const { stdout } = await execPromise('nmcli -t -f ACTIVE,SSID dev wifi');
    const match = stdout.split('\n').find(line => line.startsWith('yes:'));
    const ssid = match ? match.replace('yes:', '') : null;
    
    const { stdout: ipInfo } = await execPromise('hostname -I');
    const ip = ipInfo.trim().split(' ')[0];
    
    return { ssid, ip };
  } catch (error) {
    return { ssid: null, ip: null };
  }
}

// 🆕 リクエストの本文(JSON)を読む（大きすぎる本文は拒否）
function readJsonBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > limit) { reject(new Error('リクエストが大きすぎます')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(new Error('JSONの形式が正しくありません')); } });
    req.on('error', reject);
  });
}
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
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
          
          const badInput = validateWifiInput(ssid, password);
          if (badInput) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: badInput 
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

  // 🆕 周辺のWi-Fi一覧（プルダウン用）。?rescan=1 で再検索
  if (req.url.startsWith('/wifi/scan') && req.method === 'GET') {
    try {
      const rescan = /[?&]rescan=1/.test(req.url);
      const networks = await scanWifi(rescan);
      sendJson(res, 200, { success: true, networks });
    } catch (error) {
      sendJson(res, 500, { success: false, error: 'Wi-Fiの検索に失敗しました: ' + error.message });
    }
    return;
  }

  // 🆕 ドロア（USB）の接続状態。抜き差しに自動で追従する
  if (req.url === '/usb/status' && req.method === 'GET') {
    const devices = listSerialDevices();
    sendJson(res, 200, {
      success: true,
      connected: !!(serialPort && serialPort.isOpen),
      path: serialPort && serialPort.isOpen ? serialPort.path : null,
      devices
    });
    return;
  }

  // 🆕 Pi自身のWi-Fi（アクセスポイント）の名前。パスワードは返さない
  if (req.url === '/ap/status' && req.method === 'GET') {
    try {
      const info = await getApInfo();
      sendJson(res, 200, { success: true, ssid: info.ssid, lastChange: loadApResult() });
    } catch (error) {
      sendJson(res, 500, { success: false, error: '接続先名を取得できませんでした: ' + error.message });
    }
    return;
  }

  // 🆕 Pi自身のWi-Fiの名前・パスワードの変更。現在のパスワードが必要。dryRun:true なら変更せずに内容だけ返す
  if (req.url === '/ap/configure' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      const { currentPassword, newSsid, newPassword, dryRun } = data;

      const now = Date.now();
      while (apFailures.length && now - apFailures[0] > 10 * 60 * 1000) apFailures.shift();
      if (apFailures.length >= 5) {
        sendJson(res, 429, { success: false, error: '現在のパスワードの入力ミスが続いたため、10分間お試しいただけません' });
        return;
      }

      const info = await getApInfo();
      if (!info.pass || typeof currentPassword !== 'string' || !safeEqual(currentPassword, info.pass)) {
        apFailures.push(now);
        sendJson(res, 403, { success: false, error: '現在のパスワードが違います' });
        return;
      }
      const bad = validateApInput(newSsid, newPassword);
      if (bad) { sendJson(res, 400, { success: false, error: bad }); return; }

      const plan = {
        currentSsid: info.ssid,
        newSsid,
        ssidChanged: newSsid !== info.ssid,
        passwordChanged: newPassword !== info.pass,
        note: '変更を実行すると、このPOSとのWi-Fi接続が一度切れます。新しい接続先名とパスワードで、タブレット・スマホ・レジのWi-Fi接続をやり直してください。'
      };
      if (dryRun) { sendJson(res, 200, { success: true, dryRun: true, plan }); return; }
      if (!plan.ssidChanged && !plan.passwordChanged) { sendJson(res, 400, { success: false, error: '変更がありません' }); return; }

      // バックアップ → 書き換え → 応答 → 再起動（起動に失敗したら自動で元に戻す）
      const backupText = info.text;
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const backupPath = CONFIG.AP_CONF + '.bak-' + stamp;
      if (CONFIG.AP_TEST_MODE) fs.writeFileSync(backupPath, backupText, { mode: 0o600 });
      else await run('sudo', ['cp', '-p', CONFIG.AP_CONF, backupPath]);
      await installApConf(buildApConf(info.text, newSsid, newPassword));
      console.log('📡 アクセスポイントの設定を変更しました（接続先名: ' + newSsid + '、バックアップ: ' + backupPath + '）');
      sendJson(res, 200, { success: true, message: '設定を変更しました。数秒後にWi-Fiが切れます。新しい接続先名とパスワードでつなぎ直してください', backup: backupPath });
      setTimeout(() => { restartApWithRollback(backupText, newSsid).then(r => console.log(r.ok ? '✅ アクセスポイント再起動完了' : '⚠️  元の設定に戻しました')); }, 1500);
    } catch (error) {
      console.error('❌ アクセスポイント設定エラー:', error.message);
      sendJson(res, 500, { success: false, error: '変更に失敗しました: ' + error.message });
    }
    return;
  }

  // ステータス確認エンドポイント
  if (req.url === '/status' && req.method === 'GET') {
    const wifiInfo = await getCurrentWiFi();
    const status = {
      server: 'running',
      version: '2.1.0-business',
      serialPort: {
        connected: !!(serialPort && serialPort.isOpen),
        path: serialPort && serialPort.isOpen ? serialPort.path : null,
        devices: listSerialDevices(),
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
      <div class="version">Business Edition v2.1.0</div>
      
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
  console.log('📦 Business Edition v2.1.0');
  console.log('');

  // シリアルポート初期化（ドロアのUSBを自動で探して接続。以後3秒ごとに見回り、抜き差しにも自動で追従）
  await ensureSerial();
  setInterval(ensureSerial, 3000);

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
