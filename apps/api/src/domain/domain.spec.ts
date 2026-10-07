import { computeTarget, mifflinStJeor, ageOn } from './nutrition';
import { computePortions, portionFactor, scaleRecipe, totalServingsByDish, updateFactor, dishNutrition } from './portions';
import { computeMealTimes, zonedTime, weekMonday, addDays, localDate } from './schedule';
import { splitByWeights, simplifyDebts, computeBalances } from './money';
import { autoDutyUser, resolveDuty } from './duty';
import { uzLatinToCyrillic, pickTranslation, normalizeLocale } from './i18n';
import { toDisplay } from './units';

describe('nutrition', () => {
  const on = new Date('2026-10-07T00:00:00Z');

  it('Mifflin–St Jeor formulasi', () => {
    // 30 yosh erkak, 80 kg, 180 sm: 10*80 + 6.25*180 − 5*30 + 5 = 1780
    expect(mifflinStJeor('male', 80, 180, 30)).toBe(1780);
    expect(mifflinStJeor('female', 60, 165, 30)).toBeCloseTo(1320.25, 2);
  });

  it('yoshni tug‘ilgan kunni hisobga olib hisoblaydi', () => {
    expect(ageOn('1996-10-08', on)).toBe(29);
    expect(ageOn('1996-10-07', on)).toBe(30);
  });

  it('kattalar: faollik va ozish tuzatmasi', () => {
    const t = computeTarget(
      { birthDate: '1996-01-01', sex: 'male', heightCm: 180, weightKg: 80, activityLevel: 'moderate', goal: 'lose' },
      on,
    );
    // 1780 × 1.55 × 0.85 = 2345
    expect(t.kcal).toBe(2345);
    expect(t.proteinG).toBe(128); // 80 × 1.6
    expect(t.isChild).toBe(false);
    expect(t.isEstimate).toBe(false);
  });

  it('18 yoshgacha ozish tuzatmasi qo‘llanmaydi', () => {
    const lose = computeTarget({ birthDate: '2014-01-01', sex: 'male', goal: 'lose' }, on);
    const keep = computeTarget({ birthDate: '2014-01-01', sex: 'male', goal: 'maintain' }, on);
    expect(lose.isChild).toBe(true);
    expect(lose.kcal).toBe(keep.kcal);
  });

  it('profil to‘liq bo‘lmasa standart 2000 kkal', () => {
    const t = computeTarget({}, on);
    expect(t.kcal).toBe(2000);
    expect(t.isEstimate).toBe(true);
  });
});

describe('portions', () => {
  const plov = { dishId: 'plov', kcalPerServing: 700, gramsPerServing: 400 };
  const salad = { dishId: 'salad', kcalPerServing: 100, gramsPerServing: 150 };

  it('Pᵢ = Eᵢ × sₘ × kᵢ / ΣK_d', () => {
    // 2400 × 0.35 × 1 / 800 = 1.05
    expect(portionFactor({ userId: 'a', dailyKcal: 2400, factor: 1 }, 0.35, [plov, salad])).toBe(1.05);
  });

  it('porsiya chegaralari: 0.4–2.5', () => {
    expect(portionFactor({ userId: 'a', dailyKcal: 500, factor: 0.7 }, 0.1, [plov])).toBe(0.4);
    expect(portionFactor({ userId: 'a', dailyKcal: 6000, factor: 1.3 }, 0.5, [salad])).toBe(2.5);
  });

  it('mehmon porsiyasi olib kelgan a‘zoga yoziladi va qozon hajmi to‘g‘ri', () => {
    const rows = computePortions(
      [
        { userId: 'aziz', dailyKcal: 2400, factor: 1 },
        { userId: 'lola', dailyKcal: 1600, factor: 1 },
      ],
      new Map([['aziz', 1]]),
      0.35,
      [plov],
    );
    expect(rows).toHaveLength(3);
    const guest = rows.find((r) => r.userId === null)!;
    expect(guest.hostUserId).toBe('aziz');
    expect(guest.factor).toBe(1);
    // aziz: 2400×.35/700 = 1.2; lola: 1600×.35/700 = 0.8; mehmon 1 → 3
    expect(totalServingsByDish(rows).get('plov')).toBe(3);
    expect(rows.find((r) => r.userId === 'aziz')!.grams).toBe(480);
  });

  it('retseptni masshtablash', () => {
    expect(scaleRecipe([{ ingredientId: 'rice', qtyG: 1000 }], 4, 6)).toEqual([{ ingredientId: 'rice', qtyG: 1500 }]);
  });

  it('kᵢ ni o‘rganish: ±5%, 0.7–1.3, ozishda oshmaydi', () => {
    expect(updateFactor(1, 'not_enough', 'maintain')).toEqual({ factor: 1.05, suggestLightSide: false });
    expect(updateFactor(1, 'too_much', 'maintain').factor).toBe(0.95);
    expect(updateFactor(1.3, 'not_enough', 'gain').factor).toBe(1.3);
    expect(updateFactor(0.7, 'too_much', 'gain').factor).toBe(0.7);
    expect(updateFactor(1, 'not_enough', 'lose')).toEqual({ factor: 1, suggestLightSide: true });
  });

  it('taom kaloriyasini masalliqlardan hisoblash', () => {
    expect(dishNutrition([{ qtyG: 1000, kcal100g: 130 }, { qtyG: 500, kcal100g: 0 }], 5)).toEqual({
      kcalPerServing: 260,
      gramsPerServing: 300,
    });
  });
});

describe('schedule', () => {
  it('Toshkent vaqtini UTC ga o‘giradi (+05:00)', () => {
    expect(zonedTime('2026-10-07', '19:00', 'Asia/Tashkent').toISOString()).toBe('2026-10-07T14:00:00.000Z');
  });

  it('yozgi vaqt bo‘lgan zonada ham to‘g‘ri (Istanbul +03, Berlin yoz/qish)', () => {
    expect(zonedTime('2026-07-01', '12:00', 'Europe/Berlin').toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(zonedTime('2026-12-01', '12:00', 'Europe/Berlin').toISOString()).toBe('2026-12-01T11:00:00.000Z');
  });

  it('pishirish boshlanishi, eslatma, qulflash va oldindan tayyorgarlik', () => {
    const t = computeMealTimes('2026-10-07', '19:00', 'Asia/Tashkent', [
      { activeMin: 40, passiveMin: 50, prepAheadMin: 0 },
      { activeMin: 15, passiveMin: 0, prepAheadMin: 480 },
    ]);
    expect(t.eatAt.toISOString()).toBe('2026-10-07T14:00:00.000Z');
    expect(t.startAt.toISOString()).toBe('2026-10-07T12:30:00.000Z'); // 17:30 mahalliy
    expect(t.remindAt.toISOString()).toBe('2026-10-07T12:00:00.000Z'); // 17:00
    expect(t.lockAt).toEqual(t.startAt);
    expect(t.prepAt!.toISOString()).toBe('2026-10-06T15:00:00.000Z'); // kecha 20:00
  });

  it('sana yordamchilari', () => {
    expect(weekMonday('2026-10-07')).toBe('2026-10-05');
    expect(weekMonday('2026-10-11')).toBe('2026-10-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(localDate(new Date('2026-10-07T20:30:00Z'), 'Asia/Tashkent')).toBe('2026-10-08');
  });
});

describe('money', () => {
  it('butun so‘mlarga bo‘lish, yig‘indi saqlanadi', () => {
    const r = splitByWeights(100_000, [
      { userId: 'a', weight: 1 },
      { userId: 'b', weight: 1 },
      { userId: 'c', weight: 1 },
    ]);
    expect([...r.values()].reduce((s, v) => s + v, 0)).toBe(100_000);
    expect(r.get('a')).toBe(33_334);
  });

  it('porsiyaga proporsional', () => {
    const r = splitByWeights(90_000, [
      { userId: 'a', weight: 2000 },
      { userId: 'b', weight: 1000 },
      { userId: 'c', weight: 0 },
    ]);
    expect(r.get('a')).toBe(60_000);
    expect(r.get('b')).toBe(30_000);
    expect(r.has('c')).toBe(false);
  });

  it('qarzlarni minimal o‘tkazmalarga soddalashtirish', () => {
    // Jasur 90 000 to'ladi, hammasi 30 000 dan → Bekzod va Aziz Jasurga 30 000 dan
    const balances = computeBalances(
      [{ paidBy: 'jasur', shares: [{ userId: 'jasur', amount: 30_000 }, { userId: 'bekzod', amount: 30_000 }, { userId: 'aziz', amount: 30_000 }] }],
      [],
    );
    const t = simplifyDebts(balances);
    expect(t).toHaveLength(2);
    expect(t.every((x) => x.to === 'jasur' && x.amount === 30_000)).toBe(true);
  });

  it('yopilgan qarzlar balansni nolga keltiradi', () => {
    const balances = computeBalances(
      [{ paidBy: 'a', shares: [{ userId: 'a', amount: 50 }, { userId: 'b', amount: 50 }] }],
      [{ from: 'b', to: 'a', amount: 50 }],
    );
    expect(balances.size).toBe(0);
    expect(simplifyDebts(balances)).toEqual([]);
  });
});

describe('duty', () => {
  it('har kuni navbat keyingi a‘zoga o‘tadi', () => {
    const order = ['a', 'b', 'c'];
    const d1 = autoDutyUser(order, '2026-10-07');
    const d2 = autoDutyUser(order, '2026-10-08');
    const d4 = autoDutyUser(order, '2026-10-10');
    expect(order.indexOf(d2!)).toBe((order.indexOf(d1!) + 1) % 3);
    expect(d4).toBe(d1);
  });

  it('qo‘lda almashtirish ustun turadi', () => {
    expect(resolveDuty(['a', 'b'], '2026-10-07', new Map([['2026-10-07', 'z']]))).toEqual({ userId: 'z', isManual: true });
  });
});

describe('i18n', () => {
  it('lotindan kirillga', () => {
    expect(uzLatinToCyrillic("O'zbek oshi")).toBe('Ўзбек оши');
    expect(uzLatinToCyrillic('Choyxona palovi')).toBe('Чойхона палови');
    expect(uzLatinToCyrillic("Mastava va g'o'sht")).toBe('Мастава ва ғўшт');
    expect(uzLatinToCyrillic('Yerga ekin')).toBe('Ерга экин');
  });

  it('tarjima tanlash va kirillga avtomatik o‘tish', () => {
    const rows = [
      { locale: 'uz', title: 'Palov' },
      { locale: 'ru', title: 'Плов' },
    ];
    expect(pickTranslation(rows, 'uz-Cyrl', ['title'])!.title).toBe('Палов');
    expect(pickTranslation(rows, 'en', ['title'])!.title).toBe('Palov');
    expect(normalizeLocale('uz-Cyrl')).toBe('uz-Cyrl');
    expect(normalizeLocale('ru-RU')).toBe('ru');
  });
});

describe('units', () => {
  it('bozor uchun qulay ko‘rinish', () => {
    expect(toDisplay(1180, {})).toEqual({ qty: 1.2, unit: 'kg' });
    expect(toDisplay(330, { pieceWeightG: 55 })).toEqual({ qty: 6, unit: 'pcs' });
    expect(toDisplay(1500, { density: 0.92 })).toEqual({ qty: 1.7, unit: 'l' });
    expect(toDisplay(120, {})).toEqual({ qty: 150, unit: 'g' });
    expect(toDisplay(12, {})).toEqual({ qty: 15, unit: 'g' });
  });
});
