/**
 * ====================================================
 *  raspi_bridge.js  v2.0
 *
 *  ① POS起動時にRaspberryPiを検出
 *     → あり: オフラインモード（RasPi + Firebase 二重保存）
 *     → なし: Firebaseモード（今まで通り）
 *
 *  ② 閉店処理完了 → 自動ログアウト
 *
 *  ③ 途中でRasPiが切断 → 自動でFirebaseモードに切り替え
 *
 *  ④ 1年以上前のデータ → RasPiから取得
 *  ⑤ Firebaseの1年後自動削除
 * ====================================================
 */

const RASPI_CONFIG = {
  baseUrl:       'http://192.168.1.100:8000', // ← RaspberryPiのIPに変更
  retentionDays: 365,
  timeout:       5000,
  retryInterval: 30000,
};

// ============================================================
// モード管理
// ============================================================
const RaspiMode = {
  _mode: 'firebase',
  _storeId: '',
  get isOffline()  { return this._mode === 'offline'; },
  get isFirebase() { return this._mode === 'firebase'; },
  setOffline(storeId) {
    this._mode = 'offline';
    this._storeId = storeId;
    console.log('🟢 オフラインモード（RaspberryPi）:', storeId);
    showModeIndicator('offline');
  },
  setFirebase() {
    this._mode = 'firebase';
    console.log('🔵 Firebaseモード');
    showModeIndicator('firebase');
  },
};

// ============================================================
// モード表示（画面右下に小さく表示）
// ============================================================
function showModeIndicator(mode) {
  let el = document.getElementById('raspi-mode-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'raspi-mode-indicator';
    el.style.cssText = `
      position: fixed; bottom: 12px; right: 12px;
      padding: 4px 10px; border-radius: 20px;
      font-size: 11px; font-weight: bold;
      z-index: 99999; opacity: 0.85; pointer-events: none;
    `;
    document.body.appendChild(el);
  }
  if (mode === 'offline') {
    el.textContent = '🟢 RasPiモード';
    el.style.background = '#2e7d32';
    el.style.color = '#fff';
  } else {
    el.textContent = '🔵 Firebaseモード';
    el.style.background = '#1565c0';
    el.style.color = '#fff';
  }
}

// ============================================================
// RaspberryPi 接続確認
// ============================================================
async function checkRaspiConnection() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${RASPI_CONFIG.baseUrl}/ping`, {
      signal: controller.signal, cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ============================================================
// RaspberryPiへの送信
// ============================================================
async function postToRaspi(endpoint, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RASPI_CONFIG.timeout);
  try {
    const res = await fetch(`${RASPI_CONFIG.baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch { clearTimeout(timer); return false; }
}

// ============================================================
// 切断監視（30秒ごと）
// ============================================================
let _watcherTimer = null;
let _reconnectTimer = null;

function startDisconnectWatcher() {
  if (_watcherTimer) return;
  _watcherTimer = setInterval(async () => {
    if (!RaspiMode.isOffline) return;
    const res = await checkRaspiConnection();
    if (!res) {
      console.warn('⚠️ RaspberryPi切断 → Firebaseモードに切り替え');
      RaspiMode.setFirebase();
      stopDisconnectWatcher();
      showAlert('RaspberryPiとの接続が切れました。Firebaseモードで継続します。');
      startReconnectWatcher();
    }
  }, RASPI_CONFIG.retryInterval);
}

function stopDisconnectWatcher() {
  clearInterval(_watcherTimer);
  _watcherTimer = null;
}

function startReconnectWatcher() {
  if (_reconnectTimer) return;
  _reconnectTimer = setInterval(async () => {
    const res = await checkRaspiConnection();
    if (res) {
      console.log('✅ RaspberryPi再接続 → オフラインモードに復帰');
      RaspiMode.setOffline(res.store_id);
      clearInterval(_reconnectTimer);
      _reconnectTimer = null;
      startDisconnectWatcher();
    }
  }, RASPI_CONFIG.retryInterval);
}

function showAlert(msg) {
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: #e65100; color: white; padding: 12px 24px;
    border-radius: 8px; font-size: 14px; z-index: 99999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// ============================================================
// コレクション名 → APIエンドポイント
// ============================================================
function colToEndpoint(colName) {
  const map = {
    'orders':      'mirror/orders',
    'dailySales':  'mirror/daily_sales',
    'attendance':  'mirror/attendance',
    'expenses':    'mirror/expenses',
    'settlements': 'mirror/settlements',
    'redSlips':    'mirror/red_slips',
  };
  return map[colName] || null;
}

function getCollectionName(ref) {
  try { return ref.id || ref.path?.split('/').pop() || ''; } catch { return ''; }
}

// ============================================================
// 閉店処理完了 → 自動ログアウト
// ============================================================
function hookSettlementLogout() {
  const _orig = window.confirmSettlement;
  if (!_orig) {
    // まだ定義されていなければ少し待つ
    setTimeout(hookSettlementLogout, 1000);
    return;
  }
  window.confirmSettlement = async function() {
    await _orig.apply(this, arguments);
    console.log('🏁 閉店処理完了 → 3秒後に自動ログアウト');
    showAlert('閉店処理が完了しました。自動ログアウトします...');
    setTimeout(async () => {
      try {
        await window.signOut(window.auth);
        console.log('✅ 自動ログアウト完了');
      } catch(e) {
        console.warn('⚠️ ログアウト失敗 → リロード:', e);
        location.reload();
      }
    }, 3000);
  };
  console.log('✅ 閉店処理フック登録完了');
}

// ============================================================
// 二重保存: addDoc（RasPiモード時はRasPiにも保存）
// ============================================================
window.addDocDual = async function(collectionRef, data) {
  // Firebase保存（常に実行）
  const docRef = await window._originalAddDoc(collectionRef, data);

  // RasPiモードなら追加でRasPiにも保存
  if (RaspiMode.isOffline) {
    const colName  = getCollectionName(collectionRef);
    const endpoint = colToEndpoint(colName);
    if (endpoint) {
      const ok = await postToRaspi(endpoint, [{
        id:         docRef.id,
        store_id:   RaspiMode._storeId,
        data:       _serializeData(data),
        created_at: new Date().toISOString(),
        date_str:   data.date || data.businessDate || new Date().toISOString().split('T')[0],
      }]);
      if (!ok) console.warn('⚠️ RasPi保存失敗（Firebase保存済み）:', colName);
      else     console.log('✅ RasPi二重保存:', colName, docRef.id);
    }
  }
  return docRef;
};

// Timestamp等をJSON化できる形に変換
function _serializeData(data) {
  const result = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v.toDate === 'function') {
      result[k] = v.toDate().toISOString();
    } else if (v instanceof Date) {
      result[k] = v.toISOString();
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ============================================================
// 日付ユーティリティ
// ============================================================
function getRetentionBoundary() {
  const d = new Date();
  d.setDate(d.getDate() - RASPI_CONFIG.retentionDays);
  return d;
}
function toDateStr(date) { return date.toISOString().split('T')[0]; }

// ============================================================
// 過去データ取得（Firebase or RasPi 自動切り替え）
// ============================================================
async function fetchFromRaspi(endpoint, params = {}) {
  const url = new URL(`${RASPI_CONFIG.baseUrl}/${endpoint}`);
  url.searchParams.set('store_id', RaspiMode._storeId || window.currentStoreId || '');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RASPI_CONFIG.timeout);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch(e) { clearTimeout(timer); throw e; }
}

window.getDailySalesBridge = async function(startDate, endDate) {
  const boundary = toDateStr(getRetentionBoundary());
  if (startDate >= boundary) return await getDailySalesFromFirebase(startDate, endDate);
  if (endDate < boundary) {
    const ok = await checkRaspiConnection();
    if (!ok) throw new Error('RaspberryPiに接続できません');
    return await fetchFromRaspi('sales/daily', { start_date: startDate, end_date: endDate });
  }
  const [newData, oldData] = await Promise.allSettled([
    getDailySalesFromFirebase(boundary, endDate),
    (async () => {
      const ok = await checkRaspiConnection();
      if (!ok) return [];
      return await fetchFromRaspi('sales/daily', { start_date: startDate, end_date: boundary });
    })(),
  ]);
  return [
    ...(oldData.status === 'fulfilled' ? oldData.value : []),
    ...(newData.status === 'fulfilled' ? newData.value : []),
  ];
};

async function getDailySalesFromFirebase(startDate, endDate) {
  const { getDocs, query, where, orderBy } = window;
  const col = window.getStoreCollection('dailySales');
  const q = query(col, where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ============================================================
// CSVダウンロード
// ============================================================
window.downloadSalesCSV = async function(startDate, endDate, filename) {
  try {
    showLoadingMessage('データを取得中...');
    const data = await window.getDailySalesBridge(startDate, endDate);
    if (!data?.length) { alert('該当期間のデータがありません'); hideLoadingMessage(); return; }
    const headers = ['日付','売上合計','現金','電子決済','客数'];
    const rows = data.map(d => {
      const item = d.data || d;
      return [d.date_str||d.id||'', item.totalSales||0, item.cashSales||0, item.cardSales||0, item.customerCount||0];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || `売上_${startDate}_${endDate}.csv`; a.click();
    URL.revokeObjectURL(url);
    hideLoadingMessage();
  } catch(e) { hideLoadingMessage(); alert('データ取得に失敗: ' + e.message); }
};

function showLoadingMessage(msg) {
  let el = document.getElementById('raspi-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'raspi-loading';
    el.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      background:rgba(0,0,0,0.8); color:white; padding:20px 40px;
      border-radius:12px; font-size:16px; z-index:99999;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg; el.style.display = 'block';
}
function hideLoadingMessage() {
  const el = document.getElementById('raspi-loading');
  if (el) el.style.display = 'none';
}

// ============================================================
// Firebaseの1年以上前データを自動削除
// ============================================================
async function autoCleanupOldFirebaseData() {
  const CLEANUP_KEY = 'last_firebase_cleanup';
  const today = toDateStr(new Date());
  if (localStorage.getItem(CLEANUP_KEY) === today) return;
  try {
    const boundary = getRetentionBoundary();
    const boundaryStr = toDateStr(boundary);
    const { getDocs, deleteDoc, query, where, Timestamp } = window;
    for (const colName of ['orders','attendance','redSlips','settlements']) {
      try {
        const col = window.getStoreCollection(colName);
        const q = query(col, where('createdAt', '<', Timestamp.fromDate(boundary)));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
        if (snap.docs.length) console.log(`🗑️ ${colName}: ${snap.docs.length}件削除`);
      } catch(e) { console.warn(`⚠️ ${colName}削除スキップ:`, e.message); }
    }
    try {
      const col = window.getStoreCollection('dailySales');
      const q = query(col, where('date', '<', boundaryStr));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      if (snap.docs.length) console.log(`🗑️ dailySales: ${snap.docs.length}件削除`);
    } catch(e) { console.warn('⚠️ dailySales削除スキップ:', e.message); }
    localStorage.setItem(CLEANUP_KEY, today);
    console.log('✅ Firebase古いデータ削除完了');
  } catch(e) { console.warn('⚠️ Firebase削除エラー:', e.message); }
}

// ============================================================
// 初期化
// ============================================================
(async function init() {
  // Firebase初期化を待つ
  await new Promise(resolve => {
    if (window.firebaseReady) return resolve();
    window.addEventListener('firebaseReady', resolve, { once: true });
  });

  // オリジナル関数を退避
  window._originalAddDoc    = window.addDoc;
  window._originalUpdateDoc = window.updateDoc;

  // ① RaspberryPi検出
  const raspiInfo = await checkRaspiConnection();

  if (raspiInfo?.store_id) {
    RaspiMode.setOffline(raspiInfo.store_id);
    if (!window.currentStoreId) window.currentStoreId = raspiInfo.store_id;
    startDisconnectWatcher();
    console.log('🟢 オフラインモードで起動');
  } else {
    RaspiMode.setFirebase();
    console.log('🔵 Firebaseモードで起動（RaspberryPi未検出）');
  }

  // ② 閉店処理フック
  hookSettlementLogout();

  // ③ Firebase古いデータ削除（バックグラウンド）
  setTimeout(autoCleanupOldFirebaseData, 5000);

  console.log('✅ raspi_bridge v2.0 初期化完了');
})();
