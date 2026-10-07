/**
 * Xarajatni bo'lish va qarzlarni soddalashtirish.
 *  - Oila (shared_pot): umumiy qozon — ulush hisoblanmaydi.
 *  - Talabalar va jamoa (by_portion): davrdagi porsiyalar ulushiga qarab;
 *    mehmon porsiyasi uni olib kelgan a'zoga yoziladi.
 * Pul — butun so'm; yaxlitlash qoldig'i "eng katta qoldiq" usulida taqsimlanadi.
 */

export interface Weight {
  userId: string;
  weight: number; // masalan, davrdagi porsiyalar kaloriyasi yig'indisi
}

/** amount ni og'irliklarga proporsional butun sonlarga bo'ladi; yig'indi aynan amount ga teng. */
export function splitByWeights(amount: number, weights: Weight[]): Map<string, number> {
  const positive = weights.filter((w) => w.weight > 0);
  const result = new Map<string, number>();
  if (positive.length === 0) return result;
  const total = positive.reduce((s, w) => s + w.weight, 0);
  const raw = positive.map((w) => ({ userId: w.userId, exact: (amount * w.weight) / total }));
  let assigned = 0;
  for (const r of raw) {
    const floor = Math.floor(r.exact);
    result.set(r.userId, floor);
    assigned += floor;
  }
  let remainder = amount - assigned;
  const byFraction = [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1) || a.userId.localeCompare(b.userId));
  for (let i = 0; remainder > 0; i = (i + 1) % byFraction.length, remainder--) {
    const id = byFraction[i].userId;
    result.set(id, result.get(id)! + 1);
  }
  return result;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * Sof balanslar (musbat — unga qarzdor, manfiy — u qarzdor) → minimal o'tkazmalar.
 * Ochko'z usul: eng katta qarzdor eng katta haqdorga to'laydi. Natija ≤ n−1 o'tkazma.
 */
export function simplifyDebts(balances: Map<string, number>): Transfer[] {
  const creditors = [...balances].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debtors = [...balances].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const sort = (a: { id: string; v: number }, b: { id: string; v: number }) => b.v - a.v || a.id.localeCompare(b.id);
  const transfers: Transfer[] = [];
  creditors.sort(sort);
  debtors.sort(sort);
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    if (pay > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].v -= pay;
    creditors[j].v -= pay;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return transfers;
}

/**
 * Balanslarni hisoblash: to'lagan summa − ulushi; yopilgan qarzlar hisobga olinadi.
 */
export function computeBalances(
  expenses: { paidBy: string; shares: { userId: string; amount: number }[] }[],
  settlements: { from: string; to: string; amount: number }[],
): Map<string, number> {
  const b = new Map<string, number>();
  const add = (id: string, v: number) => b.set(id, (b.get(id) ?? 0) + v);
  for (const e of expenses) {
    const total = e.shares.reduce((s, x) => s + x.amount, 0);
    add(e.paidBy, total);
    for (const s of e.shares) add(s.userId, -s.amount);
  }
  for (const s of settlements) {
    add(s.from, s.amount);
    add(s.to, -s.amount);
  }
  for (const [k, v] of b) if (v === 0) b.delete(k);
  return b;
}
