// ======================================
// 外税対応: 価格計算ヘルパー関数
// pos.htmlの最初のscriptセクション(247行目付近)に追加
// ======================================

/**
 * 商品の表示価格を計算（お客様が見る価格）
 * @param {Object} item - 商品オブジェクト
 * @param {number} item.price - 登録価格（内税なら税込、外税なら税抜）
 * @param {number} item.taxRate - 税率 (8 or 10)
 * @param {string} item.taxType - 税区分 ('inclusive' or 'exclusive')
 * @returns {number} 表示価格（税込）
 */
function getDisplayPrice(item) {
  const taxType = item.taxType || 'inclusive';  // デフォルトは内税
  
  if (taxType === 'exclusive') {
    // 外税: 税抜価格に税を加算
    return Math.floor(item.price * (1 + item.taxRate / 100));
  } else {
    // 内税: そのまま
    return item.price;
  }
}

/**
 * 商品の税抜価格を計算
 * @param {Object} item - 商品オブジェクト
 * @returns {number} 税抜価格
 */
function getPreTaxPrice(item) {
  const taxType = item.taxType || 'inclusive';
  
  if (taxType === 'exclusive') {
    // 外税: 登録価格がそのまま税抜価格
    return item.price;
  } else {
    // 内税: 税込価格から税抜価格を逆算
    return Math.floor(item.price / (1 + item.taxRate / 100));
  }
}

/**
 * 商品の税額を計算
 * @param {Object} item - 商品オブジェクト
 * @param {number} quantity - 数量
 * @returns {number} 税額
 */
function getTaxAmount(item, quantity = 1) {
  const taxType = item.taxType || 'inclusive';
  const basePrice = item.price + (item.toppingPrice || 0);
  
  if (taxType === 'exclusive') {
    // 外税: 税抜価格 × 税率
    return Math.floor(basePrice * quantity * item.taxRate / 100);
  } else {
    // 内税: 税込価格から税額を逆算
    const totalWithTax = basePrice * quantity;
    const totalWithoutTax = Math.floor(totalWithTax / (1 + item.taxRate / 100));
    return totalWithTax - totalWithoutTax;
  }
}

/**
 * 商品の合計金額を計算（お客様支払い額）
 * @param {Object} item - 商品オブジェクト  
 * @param {number} quantity - 数量
 * @returns {number} 合計金額（税込）
 */
function getItemTotal(item, quantity = 1) {
  const taxType = item.taxType || 'inclusive';
  const basePrice = item.price + (item.toppingPrice || 0);
  
  if (taxType === 'exclusive') {
    // 外税: (税抜価格 + トッピング) × 数量 × (1 + 税率)
    return Math.floor(basePrice * quantity * (1 + item.taxRate / 100));
  } else {
    // 内税: (税込価格 + トッピング) × 数量
    return basePrice * quantity;
  }
}

/**
 * 注文全体の合計を計算
 * @param {Array} items - 商品配列
 * @returns {Object} { total, tax8Total, tax10Total, tax8Inclusive, tax10Inclusive, tax8Exclusive, tax10Exclusive }
 */
function calculateOrderTotals(items) {
  let total = 0;
  let tax8Total = 0;
  let tax10Total = 0;
  let tax8Inclusive = 0;   // 8%内税の税額
  let tax10Inclusive = 0;  // 10%内税の税額
  let tax8Exclusive = 0;   // 8%外税の税額
  let tax10Exclusive = 0;  // 10%外税の税額
  
  items.forEach(item => {
    const quantity = item.quantity || 1;
    const itemTotal = getItemTotal(item, quantity);
    const itemTax = getTaxAmount(item, quantity);
    const taxType = item.taxType || 'inclusive';
    
    total += itemTotal;
    
    if (item.taxRate === 8) {
      tax8Total += itemTax;
      if (taxType === 'exclusive') {
        tax8Exclusive += itemTax;
      } else {
        tax8Inclusive += itemTax;
      }
    } else {
      tax10Total += itemTax;
      if (taxType === 'exclusive') {
        tax10Exclusive += itemTax;
      } else {
        tax10Inclusive += itemTax;
      }
    }
  });
  
  return {
    total,
    tax8Total,
    tax10Total,
    tax8Inclusive,
    tax10Inclusive,
    tax8Exclusive,
    tax10Exclusive
  };
}

// 使用例:
// const item = {
//   name: "たこ焼き",
//   price: 500,
//   taxRate: 10,
//   taxType: "exclusive",  // 外税
//   toppingPrice: 50,
//   quantity: 2
// };
//
// const displayPrice = getDisplayPrice(item);  // 550円（税込表示）
// const total = getItemTotal(item, 2);  // 1100円（2個分）
// const tax = getTaxAmount(item, 2);  // 100円（税額）
