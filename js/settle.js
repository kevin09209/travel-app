// 分帳結算：純函式，不碰 DOM 與 store，方便單獨驗證。

// 把支出換算成本國幣別（home）。rate = 1 local 幣值多少 home 幣。
export function toHome(amount, currency, trip, rate) {
  if (currency === trip.homeCurrency) return amount;
  return amount * rate;
}

// 回傳 { [memberId]: 淨額 }，正 = 該收錢，負 = 該付錢（以 home 幣計）。
// 已還款（settlements）視為 from 付給 to 的一筆錢，直接沖銷淨額。
export function computeBalances(trip, rate) {
  const balances = {};
  trip.members.forEach((m) => (balances[m.id] = 0));
  for (const exp of trip.expenses) {
    const total = toHome(exp.amount, exp.currency, trip, rate);
    const share = total / exp.splitIds.length;
    if (balances[exp.payerId] !== undefined) {
      balances[exp.payerId] += total;
    }
    for (const id of exp.splitIds) {
      if (balances[id] !== undefined) balances[id] -= share;
    }
  }
  for (const s of trip.settlements) {
    if (balances[s.fromId] !== undefined) balances[s.fromId] += s.amount;
    if (balances[s.toId] !== undefined) balances[s.toId] -= s.amount;
  }
  return balances;
}

// 貪婪法產生最少筆數的轉帳清單：[{ fromId, toId, amount }]
export function computeTransfers(balances) {
  const EPS = 0.005;
  const creditors = [];
  const debtors = [];
  for (const [id, bal] of Object.entries(balances)) {
    if (bal > EPS) creditors.push({ id, amount: bal });
    else if (bal < -EPS) debtors.push({ id, amount: -bal });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci].amount, debtors[di].amount);
    transfers.push({ fromId: debtors[di].id, toId: creditors[ci].id, amount: pay });
    creditors[ci].amount -= pay;
    debtors[di].amount -= pay;
    if (creditors[ci].amount <= EPS) ci++;
    if (debtors[di].amount <= EPS) di++;
  }
  return transfers;
}

// 分類統計：回傳 { total, byCategory: { [cat]: amount } }（以 home 幣計）
export function computeCategoryStats(trip, rate) {
  const byCategory = {};
  let total = 0;
  for (const exp of trip.expenses) {
    const amt = toHome(exp.amount, exp.currency, trip, rate);
    byCategory[exp.category] = (byCategory[exp.category] || 0) + amt;
    total += amt;
  }
  return { total, byCategory };
}
