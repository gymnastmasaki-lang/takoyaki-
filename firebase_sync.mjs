import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import fs from 'fs';
import path from 'path';
import os from 'os';

// サービスアカウントキー（Pi上にのみ存在。Web公開ディレクトリに絶対置かないこと）
const serviceAccount = JSON.parse(
  readFileSync('/home/pi/pos-sync/serviceAccountKey.json', 'utf8')
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;

// ---- 互換ラッパー（以下、元のコードの呼び出し箇所は一切変更不要） ----
function toPath(segments) {
  return segments.filter(s => s !== undefined && s !== null && s !== '').join('/');
}
function collection(_db, ...segments) { return db.collection(toPath(segments)); }
function doc(_db, ...segments) { return db.doc(toPath(segments)); }
function where(field, op, value) { return { field, op, value }; }
function query(ref, ...constraints) {
  let q = ref;
  for (const c of constraints) if (c) q = q.where(c.field, c.op, c.value);
  return q;
}
async function getDocs(refOrQuery) { return await refOrQuery.get(); }
async function addDoc(colRef, data) { return await colRef.add(data); }
async function setDoc(docRef, data, options) { return await docRef.set(data, options || {}); }
async function updateDoc(docRef, data) { return await docRef.update(data); }
async function deleteDoc(docRef) { return await docRef.delete(); }
const OUT = '/var/www/pos';
const STORES_FILE = OUT + '/offline_stores.json';
const log = m => console.log('['+new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'] '+m);
const UPLOAD_DIR = path.join(os.homedir(), 'raspi_uploads');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}

// 🆕 このPiが同期すべき店舗を限定する設定ファイル。
// 存在しなければ従来通り全店舗を同期する（開発・検証用Piはこのままで動く）。
// 貸出先のPiには、このファイルに自分の店舗IDだけを書いて配置する。
// 例: ["高田"]
const STORE_SCOPE_FILE = '/home/pi/pos-sync/store_scope.json';
function loadStoreScope() {
  if (!fs.existsSync(STORE_SCOPE_FILE)) return null; // 制限なし（全店舗同期）
  try {
    const ids = JSON.parse(fs.readFileSync(STORE_SCOPE_FILE, 'utf8'));
    if (Array.isArray(ids) && ids.length) return ids;
  } catch (e) {
    log('⚠️ store_scope.jsonの読み込みに失敗しました。全店舗同期にフォールバックします: ' + e.message);
  }
  return null;
}

// ★追加: menu_offline.html等の商品画像は、以前からのFirebase Storage URLや
// GitHub Pages上のファイル名を指したままのことが多く、真にオフライン（インターネット
// 疎通なし）の時は読み込めなかった。ネットに繋がっているこの同期タイミングで
// あらかじめPiのローカル（raspi_local_api.pyの/uploadsと同じディレクトリ）に
// ミラー保存しておく。ファイル名はURLのハッシュから決定的に作るので、
// 表示側（menu_offline.html）でも同じ関数で同じファイル名を再現できる。
function hashImageUrl(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getImageExtension(url) {
  const m = url.match(/\.(jpg|jpeg|png|gif|webp)(?:\?|#|$)/i);
  return m ? m[1].toLowerCase() : 'jpg';
}

function resolveRemoteImageUrl(image) {
  if (!image) return null;
  return image.includes('http') ? image : `https://gymnastmasaki-lang.github.io/takoyaki-/${image}`;
}

async function mirrorMenuImages(menuItems) {
  let ok = 0, fail = 0;
  for (const m of menuItems) {
    if (!m.image) continue;
    const remoteUrl = resolveRemoteImageUrl(m.image);
    const localName = `mirror-${hashImageUrl(remoteUrl)}.${getImageExtension(remoteUrl)}`;
    const localPath = path.join(UPLOAD_DIR, localName);
    if (fs.existsSync(localPath)) continue; // 既にミラー済み
    try {
      const res = await fetch(remoteUrl);
      if (!res.ok) { fail++; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(localPath, buf);
      ok++;
    } catch (e) {
      fail++; // オフライン中は普通に失敗する。次回の同期サイクルで自動的に再試行される
    }
  }
  if (ok || fail) log(`💬 商品画像ミラー ${ok}件保存` + (fail ? `（${fail}件は未取得、次回再試行）` : ''));
}

async function syncStore(storeId, fileKey, storeName) {
  try {
    const getCol = c => {
      const m = {menus:'menu',employees:'kintai_employees',attendance:'kintai_attendance'};
      if (!storeId || storeId==='shimoarekasuka') return collection(db, m[c]||c);
      return collection(db,'stores',storeId,c);
    };
    const [menu,tables,emp,settings,top] = await Promise.all([
      getDocs(getCol('menus')).catch(()=>({docs:[]})),
      getDocs(getCol('tables')).catch(()=>({docs:[]})),
      getDocs(getCol('employees')).catch(()=>({docs:[]})),
      getDocs(getCol('settings')).catch(()=>({docs:[]})),
      getDocs(getCol('toppings')).catch(()=>({docs:[]})),
    ]);
    const data = {
      storeId, storeName, syncedAt: new Date().toISOString(),
      menuItems: menu.docs.map(d=>({id:d.id,...d.data()})),
      tables: tables.docs.map(d=>({id:d.id,...d.data()})),
      employees: emp.docs.map(d=>({id:d.id,...d.data()})),
      toppings: top.docs.map(d=>({id:d.id,...d.data()})),
      settings: Object.fromEntries(settings.docs.map(d=>[d.id,d.data()])),
    };
    fs.writeFileSync(OUT+'/offline_data_'+fileKey+'.json', JSON.stringify(data,null,2),'utf8');
    log('✅ '+storeName+': メニュー'+data.menuItems.length+'件 テーブル'+data.tables.length+'件');
    // ★追加: 商品画像のローカルミラー（失敗しても本体の同期は継続させるためtry/catch）
    try { await mirrorMenuImages(data.menuItems); } catch (e) { log('❌ 商品画像ミラーエラー: ' + e.message); }
    return true;
  } catch(e) { log('❌ '+storeName+': '+e.message); return false; }
}
// 🆕 注文のリアルタイム同期（Firebase → Piのローカルapi(SQLite)へ）
const LOCAL_API_BASE = 'http://localhost:3002';
// 🆕 FirebaseとPiで店舗IDが異なる場合の対応表（左: Firebase側のstoreId, 右: Pi側のstoreId）
// pos_offline.html等が実際に読みに行っている場所と一致させる必要がある
const STORE_ID_MAP_FOR_LOCAL = {
  '高田': '8340bd40605e4eeca6168a657a2754e9'
};
const lastOrderSyncTimes = {}; // storeId -> Date（店舗ごとに前回チェックした時刻）
function convertTimestampsForLocalApi(v) {
  if (v && typeof v.toDate === 'function') return { __ts: true, iso: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(convertTimestampsForLocalApi);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = convertTimestampsForLocalApi(v[k]); return o; }
  return v;
}
async function syncOrdersForStore(storeId) {
  try {
    const ordersCol = (!storeId || storeId === 'shimoarekasuka') ? collection(db, 'orders') : collection(db, 'stores', storeId, 'orders');
    const since = lastOrderSyncTimes[storeId] || new Date(Date.now() - 60 * 60 * 1000); // 初回は過去1時間分
    const q = query(ordersCol, where('timestamp', '>', Timestamp.fromDate(since)));
    const snap = await getDocs(q);
    // ★修正: 「同期サーバー自身の現在時刻」ではなく「実際に取得できた注文の中で最新のtimestamp」を
    // 次回の基準にする。同期サーバーのnew Date()を使うと、注文を出した端末の時計のズレや
    // Firestoreへの書き込み確定までの遅延で、次回のwhere('timestamp','>',since)条件から
    // その注文だけ漏れてしまうことがあった（=常に直近1件だけ無反応になる不具合の原因）。
    if (snap.empty) { return; }
    let maxTs = since;
    for (const d of snap.docs) {
      const t = d.data().timestamp;
      if (t && typeof t.toDate === 'function') {
        const dt = t.toDate();
        if (dt > maxTs) maxTs = dt;
      }
    }
    let ok = 0, ng = 0;
    for (const d of snap.docs) {
      // 🆕 ローカルAPI側の書き込み先は、対応表があればそちらのIDを使う
      const localStoreId = STORE_ID_MAP_FOR_LOCAL[storeId] || storeId;
      const orderPath = (!localStoreId || localStoreId === 'shimoarekasuka') ? `orders/${d.id}` : `stores/${localStoreId}/orders/${d.id}`;
      const converted = convertTimestampsForLocalApi(d.data());
      try {
        // 🆕 Piで既に「完了/キャンセル/会計/削除」になっている注文を、Firebase側の古い写し（まだそれらが無い）で
        // 丸ごと上書きして状態を消さない（消えると店員の完了ボタンが効かなかったように見え、2〜3回押し直すことになる）。
        // 取得に失敗・形式が違う場合は何もせず従来どおり書き込む。
        try {
          const cur = await fetch(`${LOCAL_API_BASE}/doc?path=${encodeURIComponent(orderPath)}`);
          if (cur.ok) {
            const cb = await cur.json();
            const ld = cb && cb.exists ? (cb.data || cb.doc || null) : null;
            if (ld) {
              const kept = [];
              for (const f of STATUS_FIELDS) {
                if (ld[f] !== undefined && ld[f] !== null && (converted[f] === undefined || converted[f] === null)) { converted[f] = ld[f]; kept.push(f); }
              }
              if (kept.length) log(`🛡 ${storeId}: 注文 ${d.id} のPi側の状態(${kept.join(',')})を保持して同期`);
            }
          }
        } catch (e) { /* 保護できなくても同期は続ける */ }
        const res = await fetch(`${LOCAL_API_BASE}/doc?path=${encodeURIComponent(orderPath)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(converted)
        });
        if (res.ok) ok++; else ng++;
      } catch (e) { ng++; }
    }
    if (ok || ng) log(`💬 ${storeId}: 注文同期 ${ok}件反映` + (ng ? `（${ng}件失敗、次回再試行）` : ''));
    if (!ng) lastOrderSyncTimes[storeId] = maxTs; // 失敗があれば基準時刻を進めず次回また拾う
  } catch (e) { log('❌ 注文同期エラー(' + storeId + '): ' + e.message); }
}
// 🆕 呼出・会計コール（staff_calls）のリアルタイム同期（Firebase → Pi）
// index.html/menu.htmlの「呼出」「お会計」ボタンは orders ではなく staff_calls コレクションに
// 書き込むため、注文と同じ仕組みで別途同期する必要がある。
const lastStaffCallSyncTimes = {}; // storeId -> Date（店舗ごとに前回チェックした時刻）
async function syncStaffCallsForStore(storeId) {
  try {
    const callsCol = (!storeId || storeId === 'shimoarekasuka') ? collection(db, 'staff_calls') : collection(db, 'stores', storeId, 'staff_calls');
    const since = lastStaffCallSyncTimes[storeId] || new Date(Date.now() - 60 * 60 * 1000); // 初回は過去1時間分
    const q = query(callsCol, where('timestamp', '>', Timestamp.fromDate(since)));
    const snap = await getDocs(q);
    // ★修正: syncOrdersForStoreと同じ理由で、次回の基準を同期サーバーのnew Date()ではなく
    // 実際に取得できたコールの中で最新のtimestampにする
    if (snap.empty) { return; }
    let maxTs = since;
    for (const d of snap.docs) {
      const t = d.data().timestamp;
      if (t && typeof t.toDate === 'function') {
        const dt = t.toDate();
        if (dt > maxTs) maxTs = dt;
      }
    }
    let ok = 0, ng = 0;
    for (const d of snap.docs) {
      const localStoreId = STORE_ID_MAP_FOR_LOCAL[storeId] || storeId;
      const callPath = (!localStoreId || localStoreId === 'shimoarekasuka') ? `staff_calls/${d.id}` : `stores/${localStoreId}/staff_calls/${d.id}`;
      const converted = Object.assign(convertTimestampsForLocalApi(d.data()), { _fromFirebase: true }); // 🆕 Firebase由来の印
      try {
        const res = await fetch(`${LOCAL_API_BASE}/doc?path=${encodeURIComponent(callPath)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(converted)
        });
        if (res.ok) ok++; else ng++;
      } catch (e) { ng++; }
    }
    if (ok || ng) log(`💬 ${storeId}: 呼出/会計同期 ${ok}件反映` + (ng ? `（${ng}件失敗、次回再試行）` : ''));
    if (!ng) lastStaffCallSyncTimes[storeId] = maxTs; // 失敗があれば基準時刻を進めず次回また拾う
  } catch (e) { log('❌ 呼出/会計同期エラー(' + storeId + '): ' + e.message); }
}

// 🆕 呼出・会計コール（staff_calls）の逆方向同期（Pi → Firebase）と、「対応完了」(削除)の双方向反映
//  - Piで作られた呼出(menu_offline等) → Firebaseにも作る
//  - Pi側で「対応完了」(削除) → Firebase側も削除 / Firebase側(controller等)で削除 → Pi側も削除
//  ※安全のため、フラグファイル /home/pi/pos-sync/staff_calls_sync_enabled が無い間は
//    「ドライラン」（何をするかをログに出すだけで、作成・削除は実行しない）。
const STAFF_CALL_STATE_FILE = '/home/pi/pos-sync/staff_calls_state.json';
const STAFF_CALL_ENABLE_FLAG = '/home/pi/pos-sync/staff_calls_sync_enabled';
const STAFF_CALL_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 古い呼出(12時間超)は逆方向に作らない
let staffCallState = {}; // storeId -> 前回「両側に存在した」呼出IDの配列
try { staffCallState = JSON.parse(fs.readFileSync(STAFF_CALL_STATE_FILE, 'utf8')); } catch (e) { staffCallState = {}; }
function saveStaffCallState() { try { fs.writeFileSync(STAFF_CALL_STATE_FILE, JSON.stringify(staffCallState)); } catch (e) {} }
function staffCallAgeMs(data) {
  const t = data && data.timestamp;
  let ms = 0;
  if (t && t.__ts && t.iso) ms = Date.parse(t.iso);
  else if (typeof t === 'string') ms = Date.parse(t);
  else if (t && typeof t.toDate === 'function') ms = t.toDate().getTime();
  return ms ? (Date.now() - ms) : 0;
}
async function reconcileStaffCallsForStore(storeId) {
  try {
    const live = fs.existsSync(STAFF_CALL_ENABLE_FLAG);
    const tag = live ? '' : '[ドライラン・実行はしません] ';
    const localStoreId = STORE_ID_MAP_FOR_LOCAL[storeId] || storeId;
    const localCol = (!localStoreId || localStoreId === 'shimoarekasuka') ? 'staff_calls' : `stores/${localStoreId}/staff_calls`;
    const fbCol = (!storeId || storeId === 'shimoarekasuka') ? collection(db, 'staff_calls') : collection(db, 'stores', storeId, 'staff_calls');
    const fbDocRef = (id) => (!storeId || storeId === 'shimoarekasuka') ? doc(db, 'staff_calls', id) : doc(db, 'stores', storeId, 'staff_calls', id);

    const res = await fetch(`${LOCAL_API_BASE}/collection?path=${encodeURIComponent(localCol)}`);
    if (!res.ok) return;
    const body = await res.json();
    const local = new Map((body.docs || []).filter(d => d.data).map(d => [d.id, d.data]));
    const fbSnap = await getDocs(fbCol);
    const fb = new Map(fbSnap.docs.map(d => [d.id, d.data()]));
    const prev = new Set(staffCallState[storeId] || []);
    const next = new Set();
    let created = 0, delLocal = 0, delFb = 0, ng = 0;

    for (const id of new Set([...local.keys(), ...fb.keys()])) {
      const inL = local.has(id), inF = fb.has(id);
      if (inL && inF) { next.add(id); continue; }
      try {
        if (inL && !inF) {
          const data = local.get(id);
          if (prev.has(id) || data._fromFirebase) {
            // Firebase側で「対応完了」された → Pi側も削除
            log(`💬 ${tag}${storeId}: 呼出 ${id} はFirebase側で対応済み → Pi側を削除`);
            if (live) { await fetch(`${LOCAL_API_BASE}/doc?path=${encodeURIComponent(localCol + '/' + id)}`, { method: 'DELETE' }); }
            delLocal++;
          } else if (staffCallAgeMs(data) <= STAFF_CALL_MAX_AGE_MS) {
            // Piで作られた呼出 → Firebaseにも作る
            log(`💬 ${tag}${storeId}: Piの呼出 ${id} をFirebaseへ作成`);
            if (live) {
              const clean = Object.assign({}, data); delete clean._fromFirebase;
              await setDoc(fbDocRef(id), convertLocalTsForFirestore(clean), { merge: true });
              next.add(id);
            }
            created++;
          }
        } else if (inF && !inL) {
          if (prev.has(id)) {
            // Pi側で「対応完了」された → Firebase側も削除
            log(`💬 ${tag}${storeId}: 呼出 ${id} はPi側で対応済み → Firebase側を削除`);
            if (live) { await deleteDoc(fbDocRef(id)); }
            delFb++;
          }
          // それ以外（Firebase側にだけある新しい呼出）は、Firebase→Piの同期が運ぶのでここでは何もしない
        }
      } catch (e) { ng++; log(`❌ 呼出の双方向同期(${storeId}): ${id} の処理に失敗: ${e.message}`); }
    }
    staffCallState[storeId] = [...next];
    saveStaffCallState();
    if (created || delLocal || delFb) log(`💬 ${tag}${storeId}: 呼出の双方向同期 作成${created}件 / Pi削除${delLocal}件 / Firebase削除${delFb}件` + (ng ? `（${ng}件失敗）` : ''));
  } catch (e) { log('❌ 呼出の双方向同期エラー(' + storeId + '): ' + e.message); }
}
// 🆕 逆方向の注文同期（Pi → Firebase）
// pos_offline.html等でローカルSQLiteに書き込まれた注文の変更（新規作成・completedAt/cancelledAt/
// paidAtなど）を対応するFirestoreの注文ドキュメントに反映する。
// 通常はupdateDocで差分だけ反映するが、店内端末でPi上に直接作成された注文（Wi-Fi遮断中など）は
// Firestore側にそもそもドキュメントが存在しない（ローカルAPIが独自のUUIDを発行するため）ため、
// updateDocはNOT_FOUNDで失敗する。その場合はローカルの全データをそのままの注文ID（=SQLite側の
// doc_id）でsetDoc（新規作成）する。これによりPi発の注文もFirestore側のIDと一致した状態で
// 双方向同期の対象になり、スタッフの個人端末（オンライン版）からも同じ注文として確認・操作できる。
const lastReverseSyncTimes = {}; // storeId -> Date（店舗ごとに前回チェックした時刻）
// 🆕 deleted / deletedAt も対象（Pi側の「削除」は注文を消さず deleted:true を付けるため、これが無いとオンライン側に注文が残り続けた）
const STATUS_FIELDS = ['completedAt', 'cancelledAt', 'paidAt', 'deleted', 'deletedAt'];

// JSTのISO文字列を、raspi_local_api.py の now_iso()（datetime.now(JST).isoformat()）と
// 同じ書式（YYYY-MM-DDTHH:MM:SS.mmmmmm+09:00）に揃える。文字列比較の基準に使うだけなので
// JS側はミリ秒までしか無い分を0埋めすれば、辞書順比較としては正しく機能する。
function toJstIsoString(date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const y = jst.getUTCFullYear();
  const mo = pad(jst.getUTCMonth() + 1);
  const da = pad(jst.getUTCDate());
  const h = pad(jst.getUTCHours());
  const mi = pad(jst.getUTCMinutes());
  const s = pad(jst.getUTCSeconds());
  const micro = pad(jst.getUTCMilliseconds(), 3) + '000'; // ミリ秒を6桁のマイクロ秒相当に0埋め
  return `${y}-${mo}-${da}T${h}:${mi}:${s}.${micro}+09:00`;
}

// ローカルAPI側の {__ts:true, iso:"..."} 形式をFirestoreのTimestampに戻す（オブジェクト全体を再帰的に変換）
function convertLocalTsForFirestore(v) {
  if (v && typeof v === 'object' && v.__ts === true && v.iso) {
    return Timestamp.fromDate(new Date(v.iso));
  }
  if (Array.isArray(v)) return v.map(convertLocalTsForFirestore);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k in v) o[k] = convertLocalTsForFirestore(v[k]);
    return o;
  }
  return v;
}

// ★修正: handy_offline.html等の店舗選択プルダウンが、トップレベルの
// 'stores'コレクションをFirestore互換の/collectionで読みに行くが、
// これまでPiのローカルSQLiteにはこのコレクションが一切書き込まれておらず
// 常に空になっていた（storesはこのファイル自身が店舗一覧をループするための
// 内部用JSONファイルにしか保存していなかった）。
// ローカル側のstoreIdはSTORE_ID_MAP_FOR_LOCALで変換したIDを使う必要があるため
// （例: Firestoreの'高田' → ローカルの'8340bd40605e4eeca6168a657a2754e9'）、
// 書き込み時にも同じ変換を通す。
// 🆕 Piでローカルに新規作成された店舗を、まだFirestoreに存在しなければ作成する。
// (Piを主に操作する運用のため、Firebase側は「保険」として常に完全に
//  追従している必要がある — 店舗一覧・削除に加えて新規作成も反映する)
async function syncNewStoresFromLocalToFirestore(firestoreStores) {
  try {
    const firestoreIds = new Set(firestoreStores.map(s => s.id));
    const known = loadKnownStoreIds(); // 🔧 BUG FIX: 過去に扱ったことのあるIDを「新規」扱いしないための参照
    const res = await fetch(`${LOCAL_API_BASE}/collection?path=stores`);
    const body = await res.json();
    const localStores = body.docs || [];

    const reverseMap = {};
    for (const [fsId, localId] of Object.entries(STORE_ID_MAP_FOR_LOCAL)) reverseMap[localId] = fsId;

    let created = 0;
    const createdIds = [];
    for (const d of localStores) {
      const localId = d.id;
      const fsId = reverseMap[localId] || localId; // マッピングがなければローカルIDをそのままFirestore IDとして使う
      if (fsId === 'shimoarekasuka') continue; // 実在のFirestore店舗ではなく毎回コードで注入される特別枠なので対象外
      if (firestoreIds.has(fsId)) continue; // 既にFirestoreに存在する
      // 🔧 BUG FIX: 過去に一度でも扱ったことのあるIDは「Firestoreで削除された」可能性があるため、
      // ここで無条件に作り直さない（新規作成扱いはsyncStoreDeletions()未経験の本当に初めてのIDだけに限る）。
      // 削除すべきかどうかの判断はsyncStoreDeletions()に任せる。
      if (known.has(fsId)) continue;
      try {
        await setDoc(doc(db, 'stores', fsId), {
          storeName: (d.data && d.data.storeName) || fsId,
          isActive: !(d.data && d.data.isActive === false),
          storePassword: (d.data && d.data.storePassword) || ''
        });
        created++;
        createdIds.push({ id: fsId, name: (d.data && d.data.storeName) || fsId, file_key: fsId, isActive: !(d.data && d.data.isActive === false), password: (d.data && d.data.storePassword) || '' });
      } catch (e) {}
    }
    if (created) log(`🆕 Pi→Firestore 新規店舗を${created}件反映`);
    // 呼び出し元が持っている店舗リスト配列に、たった今作成した分を反映しておく。
    // これをしないと、直後に動くsyncStoreDeletions()が「今作ったばかりの店舗がFirestoreにまだない」
    // と誤判定し、ローカルから削除し直してしまう（自分で作って自分で消す事故）。
    firestoreStores.push(...createdIds);
  } catch (e) {
    log('❌ Pi発の新規店舗同期エラー: ' + e.message);
  }
}

async function syncStoreListForLocal(stores) {
  try {
    let ok = 0, ng = 0;
    for (const s of stores) {
      const localStoreId = STORE_ID_MAP_FOR_LOCAL[s.id] || s.id;
      const data = { storeName: s.name, isActive: s.isActive !== false, storePassword: s.password || '' };
      try {
        const res = await fetch(`${LOCAL_API_BASE}/doc?path=${encodeURIComponent('stores/' + localStoreId)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        if (res.ok) ok++; else ng++;
      } catch (e) { ng++; }
    }
    if (ok || ng) log(`💬 店舗一覧同期 ${ok}件反映` + (ng ? `（${ng}件失敗）` : ''));
  } catch (e) { log('❌ 店舗一覧同期エラー: ' + e.message); }
}

// 🆕 店舗の削除をFirestore⇔Pi双方向に伝播する。
// 「差分だけ見て消す」方式だと、store_scope.jsonで1店舗に絞っている
// 本番Piが「ローカルにないから」という理由で他のお客様の店舗を誤って
// Firestoreから消してしまう事故が起き得る。それを避けるため、
// 「このPiが過去に一度でも扱ったことのある店舗ID」を known_store_ids.json
// に記録しておき、そのリストに載っている店舗だけを削除判定の対象にする。
const KNOWN_STORES_FILE = '/home/pi/pos-sync/known_store_ids.json';
function loadKnownStoreIds() {
  try { return new Set(JSON.parse(fs.readFileSync(KNOWN_STORES_FILE, 'utf8'))); }
  catch (e) { return new Set(); }
}
function saveKnownStoreIds(idsSet) {
  try { fs.writeFileSync(KNOWN_STORES_FILE, JSON.stringify([...idsSet], null, 2), 'utf8'); }
  catch (e) {}
}

async function syncStoreDeletions(firestoreStores) {
  try {
    const known = loadKnownStoreIds();
    const firestoreIds = new Set(firestoreStores.map(s => s.id));

    // 既知の店舗それぞれについて、ローカル(Pi)に実際に存在するか確認する。
    // 通信エラー時は「存在する」扱いにして誤削除を避ける（安全側に倒す）。
    const localExisting = new Set();
    for (const id of known) {
      const localStoreId = STORE_ID_MAP_FOR_LOCAL[id] || id;
      try {
        const res = await fetch(`${LOCAL_API_BASE}/doc?path=${encodeURIComponent('stores/' + localStoreId)}`);
        const body = await res.json();
        if (body && body.exists) localExisting.add(id);
      } catch (e) { localExisting.add(id); }
    }

    let deletedFromLocal = 0, deletedFromFirestore = 0;
    for (const id of known) {
      if (id === 'shimoarekasuka') continue; // 🔧 実在のFirestore店舗ではなく毎回コードで注入される特別枠なので対象外
      const inFirestore = firestoreIds.has(id);
      const inLocal = localExisting.has(id);
      if (!inFirestore && inLocal) {
        // Firestore側で削除された → ローカルからも削除
        const localStoreId = STORE_ID_MAP_FOR_LOCAL[id] || id;
        try {
          await fetch(`${LOCAL_API_BASE}/doc?path=${encodeURIComponent('stores/' + localStoreId)}`, { method: 'DELETE' });
          deletedFromLocal++;
          localExisting.delete(id);
        } catch (e) {}
      } else if (inFirestore && !inLocal) {
        // ローカル(kanripos_offline.html)側で削除された → Firestoreからも削除
        try {
          await deleteDoc(doc(db, 'stores', id));
          deletedFromFirestore++;
          firestoreIds.delete(id);
        } catch (e) {}
      }
    }

    // どちらか片方にでもまだ存在する店舗だけを、引き続き追跡対象として保存する
    saveKnownStoreIds(new Set([...firestoreIds, ...localExisting]));

    if (deletedFromLocal || deletedFromFirestore) {
      log(`🗑️ 店舗削除同期: ローカルから${deletedFromLocal}件削除` + (deletedFromFirestore ? ` / Firestoreから${deletedFromFirestore}件削除` : ''));
    }
  } catch (e) {
    log('❌ 店舗削除同期エラー: ' + e.message);
  }
}

// firebase-admin(Node)のgRPCエラーは、コードが文字列 'not-found' ではなく数値の 5 で、
// メッセージも "5 NOT_FOUND: No document to update: ..." の形で返る（Web SDKの 'not-found' とは別物）。
// 以前は e.code === 'not-found' だけで判定していたため、「Firebaseに無い注文を新規作成する」分岐が一度も動かず、
// その注文が毎回「失敗」として数えられ、基準時刻が進まないまま5秒ごとに再試行され続けていた。
function isNotFoundError(e) {
  return !!e && (e.code === 5 || e.code === 'not-found' || /NOT_FOUND/.test(String(e.message || '')));
}

async function syncOrderStatusToFirebase(storeId) {
  try {
    const localStoreId = STORE_ID_MAP_FOR_LOCAL[storeId] || storeId;
    const localOrdersPath = (!localStoreId || localStoreId === 'shimoarekasuka') ? 'orders' : `stores/${localStoreId}/orders`;
    const since = lastReverseSyncTimes[storeId] || new Date(Date.now() - 24 * 60 * 60 * 1000); // 初回（サービス起動直後）は過去24時間分（以前は1時間。削除などの取りこぼしを拾い直すため）
    const sinceStr = toJstIsoString(since);
    const checkedAt = new Date();

    const res = await fetch(`${LOCAL_API_BASE}/collection?path=${encodeURIComponent(localOrdersPath)}&sinceUpdatedAt=${encodeURIComponent(sinceStr)}`);
    if (!res.ok) { log(`❌ 逆同期取得失敗(${storeId}): HTTP ${res.status}`); return; }
    const body = await res.json();
    // 🆕 完了/キャンセル/会計フラグの有無で絞らず、直近更新された注文はすべて対象にする。
    // これにより新規作成直後の注文（まだ状態フラグが付いていない）もFirebase側に複製され、
    // スタッフの個人端末（オンライン版）から作成直後の注文も見えるようになる。
    const candidates = (body.docs || []).filter(d => d.data);

    if (!candidates.length) { lastReverseSyncTimes[storeId] = checkedAt; return; }

    let ok = 0, ng = 0, created = 0;
    for (const d of candidates) {
      const patch = {};
      for (const f of STATUS_FIELDS) {
        if (d.data[f] !== undefined && d.data[f] !== null) patch[f] = convertLocalTsForFirestore(d.data[f]);
      }
      // 🆕 statusはローカルのstatusフィールドをそのまま転送しない。
      // pos_offline.html側はstatusを'pending'のまま更新しない実装なので、そのまま送ると
      // 常に'pending'に巻き戻ってしまう。ここではcancelledAt/completedAtの有無から導出する。
      // paidAtだけがある場合（テイクアウトの先会計→後で調理完了、等）はstatusを変更しない
      // ＝オンライン側の待ち件数からはまだ外れない（＝調理中として扱われる）。
      if (d.data.cancelledAt) patch.status = 'cancelled';
      else if (d.data.completedAt) patch.status = 'completed';
      // 🆕 削除を取り消した（deleted:false）場合は、Firebase側の削除日時も外す
      if (d.data.deleted === false) patch.deletedAt = null;
      const firestoreDocRef = (!storeId || storeId === 'shimoarekasuka')
        ? doc(db, 'orders', d.id)
        : doc(db, 'stores', storeId, 'orders', d.id);
      try {
        if (Object.keys(patch).length === 0) {
          // 更新すべき状態フィールドが無い（作成直後の注文など）。Firestore SDKは update({}) を
          // 「少なくとも1項目が必要」として通信前に例外にするため、以前はこれが毎回「失敗」として数えられ、
          // 基準時刻が進まず、同じ注文を5秒ごとに最大1時間再試行し続けていた（"1件失敗、次回再試行"の正体）。
          // 更新は不要なので、Firebaseにまだ無い場合だけ新規作成し、すでにあればそのまま次へ進む。
          const snap = await firestoreDocRef.get();
          if (!snap.exists) {
            await setDoc(firestoreDocRef, convertLocalTsForFirestore(d.data), { merge: true });
            created++;
          }
          continue;
        }
        await updateDoc(firestoreDocRef, patch);
        ok++;
      } catch (e) {
        if (isNotFoundError(e)) {
          // 🆕 店内端末でPi上に直接作成された注文（Firestoreにまだ存在しない）は、
          // ローカルの最新の全データをそのままの注文ID（=SQLite側のdoc_id）で新規作成する。
          // これで以降はforward/reverse両方向の同期対象になり、スタッフの個人端末（オンライン版）
          // からも同じ注文として確認・操作できるようになる。
          try {
            await setDoc(firestoreDocRef, convertLocalTsForFirestore(d.data), { merge: true });
            created++;
          } catch (e2) { ng++; log(`❌ 逆同期(${storeId}): ${d.id} の新規作成に失敗: ${e2.message}`); }
        } else { ng++; log(`❌ 逆同期(${storeId}): ${d.id} の更新に失敗: ${e.message}`); }
      }
    }
    if (ok || ng || created) {
      log(`💬 ${storeId}: 逆同期(状態) ${ok}件反映` + (created ? `（Firebaseへ新規作成: ${created}件）` : '') + (ng ? `（${ng}件失敗、次回再試行）` : ''));
    }
    if (!ng) lastReverseSyncTimes[storeId] = checkedAt; // 通信エラー等の失敗のみ基準時刻を進めず次回また拾う
  } catch (e) { log('❌ 逆同期エラー(' + storeId + '): ' + e.message); }
}

// 🆕 レシート・領収書QR用の画像(receipt_images)を Pi → Firebase へ複製する
// pos_offline.html等は、レシート/領収書の画像をローカルAPIの receipt_images/{id} に保存する。
// しかしお客様がLTEで読むQR（GitHub Pagesの receipt-view-firestore.html）はFirebaseを読むため、
// ここでFirebase側の receipt_images/{id} に複製しないと「レシート・領収書が見つかりません」になる。
// receipt_images は店舗別ではなくトップレベルのコレクション（オンライン版pos.htmlと同じ場所）。
const RECEIPT_IMAGE_MAX_BYTES = 950 * 1000; // Firestoreの1ドキュメント上限(約1MiB)を超えるものは送れない
let lastReceiptImageSyncTime = null;
const skippedReceiptImageIds = new Set(); // 期限切れ・サイズ超過など、送れないIDを毎回リトライしないための記録
async function syncReceiptImagesToFirebase() {
  try {
    // 初回は過去7日分（QRの有効期限内）。すでにFirebaseにあるIDは送らないので、再起動しても二重送信にならない
    const since = lastReceiptImageSyncTime || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sinceStr = toJstIsoString(since);
    const checkedAt = new Date();
    const res = await fetch(`${LOCAL_API_BASE}/collection?path=receipt_images&sinceUpdatedAt=${encodeURIComponent(sinceStr)}`);
    if (!res.ok) { log(`❌ レシート画像同期: 取得失敗 HTTP ${res.status}`); return; }
    const body = await res.json();
    const candidates = (body.docs || []).filter(d => d.data && !skippedReceiptImageIds.has(d.id));
    if (!candidates.length) { lastReceiptImageSyncTime = checkedAt; return; }

    let ok = 0, ng = 0, skipped = 0, existed = 0;
    for (const d of candidates) {
      try {
        const ref = doc(db, 'receipt_images', d.id);
        const existing = await ref.get();
        if (existing.exists) { existed++; continue; }
        const converted = convertLocalTsForFirestore(d.data);
        // 有効期限切れは送らない
        const exp = (converted.expiresAt && typeof converted.expiresAt.toDate === 'function') ? converted.expiresAt.toDate() : null;
        if (exp && exp < new Date()) { skipped++; skippedReceiptImageIds.add(d.id); continue; }
        // サイズ超過はFirestoreが拒否するため、無限リトライを避けてスキップ（ログに残す）
        const bytes = Buffer.byteLength(JSON.stringify(d.data), 'utf8');
        if (bytes > RECEIPT_IMAGE_MAX_BYTES) {
          log(`⚠️ レシート画像同期: ${d.id} は ${Math.round(bytes / 1024)}KB でFirestoreの上限を超えるためスキップ`);
          skipped++; skippedReceiptImageIds.add(d.id); continue;
        }
        await setDoc(ref, converted);
        ok++;
      } catch (e) {
        ng++;
        log(`❌ レシート画像同期失敗(${d.id}): ${e.message}`);
      }
    }
    if (ok || ng || skipped) {
      log(`🧾 レシート画像同期: ${ok}件反映` + (skipped ? `（${skipped}件スキップ）` : '') + (ng ? `（${ng}件失敗、次回再試行）` : ''));
    }
    if (!ng) lastReceiptImageSyncTime = checkedAt; // 通信エラー等の失敗があれば基準時刻を進めず次回また拾う
  } catch (e) { log('❌ レシート画像同期エラー: ' + e.message); }
}

async function uploadPending() {
  const f = OUT+'/pending_sync.json';
  if (!fs.existsSync(f)) return;
  try {
    const pending = JSON.parse(fs.readFileSync(f,'utf8'));
    if (!pending||!pending.length) return;
    log('未送信: '+pending.length+'件');
    const failed=[];
    for(const item of pending){
      try { await addDoc(collection(db,item.collection||'orders'),{...item.data,syncedFromOffline:true}); }
      catch(e){ failed.push(item); }
    }
    fs.writeFileSync(f,JSON.stringify(failed,null,2),'utf8');
  } catch(e){}
}
async function main() {
  log('=== Firebase同期サービス起動 ===');
  const scope = loadStoreScope();

  // 🆕 修正: 以前はキャッシュファイルが存在すると、Firestoreへの
  // 再取得を二度と行わない不具合があった（新規店舗が永久に反映されない
  // 原因）。常にFirestoreから最新の店舗一覧を取得するようにし、
  // 万一Firestoreに接続できない起動直後だけキャッシュにフォールバックする。
  let stores = [];
  async function fetchStoresFromFirestore() {
    const snap = await getDocs(collection(db,'stores'));
    let list = snap.docs.map(d=>({id:d.id,name:d.data().storeName||d.id,file_key:d.id,isActive:d.data().isActive!==false,password:d.data().storePassword||''}));
    list.unshift({id:'shimoarekasuka',name:'下赤塚',file_key:'shimoarekasuka_0',isActive:true,password:'K12290619T'});
    if (scope) {
      const before = list.length;
      list = list.filter(s => scope.includes(s.id));
      log('🔒 店舗スコープ制限: [' + scope.join(', ') + '] ('+before+'件中'+list.length+'件に絞り込み)');
      if (!list.length) {
        log('⚠️ store_scope.jsonで指定された店舗がFirestore上に見つかりませんでした。IDを確認してください。');
      }
    }
    return list;
  }
  // 店舗一覧を再取得し、既存のstores配列の中身だけを差し替える
  // （配列自体を作り直すと、他の関数が古い配列を参照したままになるため）
  async function refreshStoreList() {
    try {
      const fresh = await fetchStoresFromFirestore();
      stores.length = 0;
      stores.push(...fresh);
      fs.writeFileSync(STORES_FILE, JSON.stringify(stores, null, 2), 'utf8');
      log('🔄 店舗リスト更新: '+stores.length+'店舗');
    } catch(e) {
      log('⚠️ 店舗リストの更新に失敗しました（次回の定期更新で再試行します）: '+e.message);
    }
  }

  try {
    stores = await fetchStoresFromFirestore();
    fs.writeFileSync(STORES_FILE, JSON.stringify(stores, null, 2), 'utf8');
    log('店舗リスト取得: '+stores.length+'店舗');
  } catch(e) {
    log('⚠️ 起動時の店舗リスト取得に失敗しました。キャッシュを使用します: '+e.message);
    if (fs.existsSync(STORES_FILE)) {
      try { stores = JSON.parse(fs.readFileSync(STORES_FILE,'utf8')); } catch(e2){}
    }
  }
  const sync = async () => {
    await refreshStoreList();
    await syncNewStoresFromLocalToFirestore(stores);
    await syncStoreListForLocal(stores);
    await syncStoreDeletions(stores);
    for(const s of stores){
      await syncStore(s.id, s.file_key, s.name);
      await new Promise(r=>setTimeout(r,500));
    }
    await uploadPending();
  };
  // 🆕 注文だけは短い間隔で（全店舗分）
  let ordersSyncRunning = false;
  const syncOrdersAll = async () => {
    if (ordersSyncRunning) return; // 前回の実行がまだ終わっていなければスキップ（通信不安定時の多重実行防止）
    ordersSyncRunning = true;
    try {
      for (const s of stores) {
        // 🔍 一時診断ログ: 注文同期が毎回スキップされている原因の切り分け用
        if (s.isActive === false) { log(`⏭️ ${s.id}: isActive=false のため注文同期をスキップ`); continue; }
        await syncOrdersForStore(s.id);
      }
    } finally { ordersSyncRunning = false; }
  };
  // 🆕 逆方向（Pi→Firebase）の注文ステータス同期も同じ短い間隔で（全店舗分）
  let orderStatusSyncRunning = false;
  const syncOrderStatusAll = async () => {
    if (orderStatusSyncRunning) return; // 前回の実行がまだ終わっていなければスキップ
    orderStatusSyncRunning = true;
    try {
      for (const s of stores) {
        if (s.isActive === false) continue;
        await syncOrderStatusToFirebase(s.id);
      }
    } finally { orderStatusSyncRunning = false; }
  };
  // 🆕 呼出・会計コール（staff_calls）も注文と同じ短い間隔で（全店舗分）
  let staffCallsSyncRunning = false;
  const syncStaffCallsAll = async () => {
    if (staffCallsSyncRunning) return; // 前回の実行がまだ終わっていなければスキップ
    staffCallsSyncRunning = true;
    try {
      for (const s of stores) {
        if (s.isActive === false) continue;
        await syncStaffCallsForStore(s.id);
      }
    } finally { staffCallsSyncRunning = false; }
  };
  // 🆕 呼出・会計コールの逆方向同期と削除の双方向反映（フラグファイルが無い間はドライラン）
  let staffCallsReconcileRunning = false;
  const reconcileStaffCallsAll = async () => {
    if (staffCallsReconcileRunning) return;
    staffCallsReconcileRunning = true;
    try {
      for (const s of stores) {
        if (s.isActive === false) continue;
        await reconcileStaffCallsForStore(s.id);
      }
    } finally { staffCallsReconcileRunning = false; }
  };
  // 🆕 レシート・領収書QR用の画像（Pi → Firebase）も短い間隔で
  let receiptImagesSyncRunning = false;
  const syncReceiptImagesAll = async () => {
    if (receiptImagesSyncRunning) return; // 前回の実行がまだ終わっていなければスキップ
    receiptImagesSyncRunning = true;
    try { await syncReceiptImagesToFirebase(); } finally { receiptImagesSyncRunning = false; }
  };
  await sync();
  await syncOrdersAll();
  await syncOrderStatusAll();
  await syncStaffCallsAll();
  await reconcileStaffCallsAll();
  await syncReceiptImagesAll();
  setInterval(sync, 5*60*1000);
  setInterval(syncOrdersAll, 5*1000);
  setInterval(syncOrderStatusAll, 5*1000);
  setInterval(syncStaffCallsAll, 5*1000);
  setInterval(reconcileStaffCallsAll, 5*1000);
  setInterval(syncReceiptImagesAll, 5*1000);
  log('定期同期開始（全体: 5分間隔 / 注文: 5秒間隔 / 注文状態の逆同期: 5秒間隔 / 呼出・会計: 5秒間隔 / レシート画像: 5秒間隔）');
}
main().catch(e=>{ console.error(e); process.exit(1); });
