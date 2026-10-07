/**
 * Xarid ro'yxati uchun qulay ko'rinish: grammni kg / dona / litrga aylantirish.
 * Bozorda "1,2 kg" yoki "6 dona" o'qish "1180 g" dan qulayroq.
 */

export interface DisplayQty {
  qty: number;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs';
}

export function roundUpTo(n: number, step: number): number {
  // 1e-9 — suzuvchi nuqta xatosidan (1.2 / 0.1 = 11.999…) himoya
  return Math.ceil(n / step - 1e-9) * step;
}

export function toDisplay(qtyG: number, opts: { pieceWeightG?: number | null; density?: number | null }): DisplayQty {
  if (opts.pieceWeightG && opts.pieceWeightG > 0) {
    return { qty: Math.max(1, Math.ceil(qtyG / opts.pieceWeightG)), unit: 'pcs' };
  }
  if (opts.density && opts.density > 0) {
    const ml = qtyG / opts.density;
    if (ml >= 1000) return { qty: Math.round(roundUpTo(ml / 1000, 0.1) * 10) / 10, unit: 'l' };
    return { qty: roundUpTo(ml, 10), unit: 'ml' };
  }
  if (qtyG >= 1000) return { qty: Math.round(roundUpTo(qtyG / 1000, 0.1) * 10) / 10, unit: 'kg' };
  if (qtyG >= 100) return { qty: roundUpTo(qtyG, 50), unit: 'g' };
  return { qty: roundUpTo(Math.max(qtyG, 1), 5), unit: 'g' };
}
