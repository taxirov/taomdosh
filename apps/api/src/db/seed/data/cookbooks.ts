/**
 * Tayyor haftalik cookbooklar. Kun: 0 = dushanba. Taomlar slug orqali; `sides` — qo'shimcha (salat).
 */
import type { MealType } from '../../schema';

type T3 = { uz: string; ru: string; en: string };

export interface CookbookSeed {
  slug: string;
  title: T3;
  desc: T3;
  /** [kun, mahal, asosiy taomlar, qo'shimchalar?] */
  meals: [number, MealType, string[], string[]?][];
}

export const COOKBOOKS: CookbookSeed[] = [
  {
    slug: 'klassik_ozbek_haftasi',
    title: { uz: "Klassik o'zbek haftasi", ru: 'Классическая узбекская неделя', en: 'Classic Uzbek week' },
    desc: {
      uz: "Palov, lag'mon, manti va sho'rva — oilaviy dasturxonning eng sevimli taomlari.",
      ru: 'Плов, лагман, манты и шурпа — самые любимые блюда семейного стола.',
      en: 'Plov, lagman, manti and shurpa — the family table favourites.',
    },
    meals: [
      [0, 'breakfast', ['qaymoq_non']], [0, 'lunch', ['mastava'], ['achchiq_chuchuk']], [0, 'dinner', ['qovurma'], ['karam_salat']],
      [1, 'breakfast', ['shirguruch']], [1, 'lunch', ['lagmon']], [1, 'dinner', ['dimlama']],
      [2, 'breakfast', ['tuxum_pomidor']], [2, 'lunch', ['shorva']], [2, 'dinner', ['manti'], ['bodring_pomidor']],
      [3, 'breakfast', ['suli_botqa']], [3, 'lunch', ['palov'], ['achchiq_chuchuk']], [3, 'dinner', ['moshxorda']],
      [4, 'breakfast', ['quymoq']], [4, 'lunch', ['chuchvara']], [4, 'dinner', ['qozon_kabob'], ['turp_salat']],
      [5, 'breakfast', ['omlet']], [5, 'lunch', ['somsa'], ['suzma_salat']], [5, 'dinner', ['norin']],
      [6, 'breakfast', ['qaymoq_non']], [6, 'lunch', ['palov'], ['achchiq_chuchuk']], [6, 'dinner', ['xonim']],
    ],
  },
  {
    slug: 'talaba_hamyoni',
    title: { uz: 'Talaba hamyoni', ru: 'Студенческий бюджет', en: 'Student budget' },
    desc: {
      uz: "Arzon, tez va to'yimli: yotoqxona va ijaradagi talabalar uchun.",
      ru: 'Дёшево, быстро и сытно: для студентов в общежитии и на съёмной квартире.',
      en: 'Cheap, quick and filling: for students in dorms and shared flats.',
    },
    meals: [
      [0, 'breakfast', ['suli_botqa']], [0, 'lunch', ['makaron_qiyma'], ['karam_salat']], [0, 'dinner', ['moshkichiri']],
      [1, 'breakfast', ['tuxum_pomidor']], [1, 'lunch', ['yasmiq_shorva']], [1, 'dinner', ['kotlet'], ['grechka']],
      [2, 'breakfast', ['manka']], [2, 'lunch', ['mastava']], [2, 'dinner', ['xonim']],
      [3, 'breakfast', ['omlet']], [3, 'lunch', ['tovuq_shorva']], [3, 'dinner', ['qovurma'], ['karam_salat']],
      [4, 'breakfast', ['tariq_botqa']], [4, 'lunch', ['moshxorda']], [4, 'dinner', ['makaron_qiyma']],
      [5, 'breakfast', ['quymoq']], [5, 'lunch', ['palov'], ['achchiq_chuchuk']], [5, 'dinner', ['jigar_qovurma'], ['kartoshka_pyure']],
      [6, 'breakfast', ['tuxum_pomidor']], [6, 'lunch', ['loviya_shorva']], [6, 'dinner', ['tovuq_qovurma']],
    ],
  },
  {
    slug: 'yengil_hafta',
    title: { uz: 'Yengil hafta', ru: 'Лёгкая неделя', en: 'Light week' },
    desc: {
      uz: "Ko'proq sabzavot, baliq va tovuq; kechki ovqat yengil.",
      ru: 'Больше овощей, рыбы и курицы; лёгкие ужины.',
      en: 'More vegetables, fish and chicken; light dinners.',
    },
    meals: [
      [0, 'breakfast', ['suli_botqa']], [0, 'lunch', ['tovuq_shorva']], [0, 'dinner', ['tovuq_grill'], ['bodring_pomidor']],
      [1, 'breakfast', ['tvorog_smetana']], [1, 'lunch', ['yasmiq_shorva']], [1, 'dinner', ['baliq_qovurma'], ['karam_salat']],
      [2, 'breakfast', ['omlet']], [2, 'lunch', ['sabzavot_dimlama']], [2, 'dinner', ['tovuq_grill'], ['grechka']],
      [3, 'breakfast', ['tariq_botqa']], [3, 'lunch', ['shorva']], [3, 'dinner', ['dolma']],
      [4, 'breakfast', ['sirniki']], [4, 'lunch', ['tovuq_qovurma']], [4, 'dinner', ['baliq_qovurma'], ['vinegret']],
      [5, 'breakfast', ['suli_botqa']], [5, 'lunch', ['mastava']], [5, 'dinner', ['sabzavot_dimlama'], ['suzma_salat']],
      [6, 'breakfast', ['omlet']], [6, 'lunch', ['palov'], ['achchiq_chuchuk']], [6, 'dinner', ['yasmiq_shorva']],
      [2, 'snack', ['mevali_salat']], [4, 'snack', ['yogurt_yongoq']],
    ],
  },
];
