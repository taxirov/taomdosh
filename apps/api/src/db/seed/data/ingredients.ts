/**
 * Masalliqlar: 100 g dagi kkal, oqsil, yog', uglevod (xom holatda, taxminiy — USDA va
 * mahalliy oziq-ovqat jadvallari asosida). pieceG — 1 dona og'irligi, density — g/ml (suyuqliklar).
 */
import type { ingredientCategory } from '../../schema';

type Category = (typeof ingredientCategory.enumValues)[number];

export interface IngredientSeed {
  slug: string;
  category: Category;
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
  pieceG?: number;
  density?: number;
  uz: string;
  ru: string;
  en: string;
}

// [slug, category, kcal, protein, fat, carb, uz, ru, en, pieceG?, density?]
type Row = [string, Category, number, number, number, number, string, string, string, number?, number?];

const rows: Row[] = [
  // go'sht
  ['beef', 'meat', 218, 18.6, 16, 0, "Mol go'shti", 'Говядина', 'Beef'],
  ['beef_lean', 'meat', 158, 22, 7, 0, "Mol go'shti (yog'siz)", 'Говядина постная', 'Lean beef'],
  ['lamb', 'meat', 294, 24.5, 21, 0, "Qo'y go'shti", 'Баранина', 'Lamb'],
  ['lamb_fat', 'meat', 750, 2, 81, 0, 'Dumba', 'Курдючный жир', 'Lamb tail fat'],
  ['minced_beef', 'meat', 254, 17, 20, 0, 'Qiyma', 'Фарш говяжий', 'Ground beef'],
  ['horse_meat', 'meat', 133, 21, 5, 0, "Ot go'shti", 'Конина', 'Horse meat'],
  ['beef_liver', 'meat', 135, 20, 3.6, 3.9, 'Jigar', 'Печень говяжья', 'Beef liver'],
  ['beef_bones', 'meat', 150, 15, 10, 0, 'Suyakli go\'sht', 'Мясо на кости', 'Beef on the bone'],
  ['sausage', 'meat', 260, 12, 23, 1.5, 'Kolbasa (qaynatilgan)', 'Колбаса варёная', 'Boiled sausage'],
  // parranda
  ['chicken', 'poultry', 190, 20, 12, 0, 'Tovuq', 'Курица', 'Chicken'],
  ['chicken_breast', 'poultry', 113, 23.6, 1.9, 0.4, "Tovuq to'shi", 'Куриная грудка', 'Chicken breast'],
  ['chicken_thigh', 'poultry', 185, 18, 12, 0, 'Tovuq soni', 'Куриное бедро', 'Chicken thigh'],
  ['chicken_wings', 'poultry', 203, 18, 14, 0, 'Tovuq qanoti', 'Куриные крылья', 'Chicken wings'],
  ['turkey', 'poultry', 144, 20, 7, 0, 'Kurka', 'Индейка', 'Turkey'],
  // baliq
  ['fish', 'fish', 84, 18.4, 1.1, 0, 'Baliq (sudak)', 'Судак', 'Pike perch'],
  ['carp', 'fish', 112, 16, 5.3, 0, 'Zog\'ora baliq', 'Карп', 'Carp'],
  ['salmon', 'fish', 208, 20, 13, 0, 'Losos', 'Лосось', 'Salmon'],
  ['canned_tuna', 'fish', 116, 26, 1, 0, 'Konserva tunets', 'Тунец консервированный', 'Canned tuna'],
  // sut mahsulotlari
  ['milk', 'dairy', 60, 3.2, 3.2, 4.7, 'Sut', 'Молоко', 'Milk', undefined, 1.03],
  ['kefir', 'dairy', 53, 3, 2.5, 4, 'Kefir', 'Кефир', 'Kefir', undefined, 1.03],
  ['katyk', 'dairy', 63, 2.9, 3.2, 4.1, 'Qatiq', 'Катык', 'Katyk (yogurt drink)', undefined, 1.03],
  ['suzma', 'dairy', 160, 12, 10, 4, 'Suzma', 'Сюзьма', 'Strained yogurt'],
  ['sour_cream', 'dairy', 206, 2.8, 20, 3.2, 'Smetana', 'Сметана', 'Sour cream'],
  ['cream', 'dairy', 337, 2.2, 35, 3, 'Qaymoq', 'Каймак (сливки)', 'Clotted cream'],
  ['butter', 'dairy', 717, 0.9, 81, 0.1, "Sariyog'", 'Сливочное масло', 'Butter'],
  ['cheese', 'dairy', 350, 25, 27, 0, 'Pishloq', 'Сыр', 'Cheese'],
  ['brynza', 'dairy', 260, 18, 20, 0.5, 'Brinza', 'Брынза', 'Feta cheese'],
  ['tvorog', 'dairy', 121, 17, 5, 1.8, 'Tvorog', 'Творог', 'Cottage cheese'],
  ['yogurt', 'dairy', 66, 5, 3.2, 3.5, 'Yogurt', 'Йогурт', 'Yogurt'],
  // tuxum
  ['egg', 'eggs', 157, 12.7, 11.5, 0.7, 'Tuxum', 'Яйцо куриное', 'Egg', 55],
  ['quail_egg', 'eggs', 168, 11.9, 13.1, 0.6, 'Bedana tuxumi', 'Перепелиное яйцо', 'Quail egg', 11],
  // sabzavot
  ['onion', 'vegetables', 40, 1.1, 0.1, 9.3, 'Piyoz', 'Лук репчатый', 'Onion', 100],
  ['carrot', 'vegetables', 41, 0.9, 0.2, 9.6, 'Sabzi', 'Морковь', 'Carrot', 100],
  ['yellow_carrot', 'vegetables', 41, 0.9, 0.2, 9.6, 'Sariq sabzi', 'Жёлтая морковь', 'Yellow carrot', 100],
  ['potato', 'vegetables', 77, 2, 0.1, 17, 'Kartoshka', 'Картофель', 'Potato', 150],
  ['tomato', 'vegetables', 18, 0.9, 0.2, 3.9, 'Pomidor', 'Помидор', 'Tomato', 120],
  ['cucumber', 'vegetables', 15, 0.7, 0.1, 3.6, 'Bodring', 'Огурец', 'Cucumber', 120],
  ['bell_pepper', 'vegetables', 27, 1, 0.3, 6, 'Bolgar qalampiri', 'Болгарский перец', 'Bell pepper', 150],
  ['chili', 'vegetables', 40, 1.9, 0.4, 8.8, 'Achchiq qalampir', 'Острый перец', 'Chili pepper', 10],
  ['garlic', 'vegetables', 149, 6.4, 0.5, 33, 'Sarimsoq', 'Чеснок', 'Garlic', 40],
  ['cabbage', 'vegetables', 27, 1.3, 0.1, 6, 'Karam', 'Капуста', 'Cabbage'],
  ['cauliflower', 'vegetables', 25, 1.9, 0.3, 5, 'Gulkaram', 'Цветная капуста', 'Cauliflower'],
  ['radish', 'vegetables', 21, 0.7, 0.1, 4.1, 'Turp', 'Редис', 'Radish'],
  ['green_radish', 'vegetables', 32, 2, 0.2, 6.5, "Ko'k turp", 'Зелёная редька', 'Green radish', 400],
  ['eggplant', 'vegetables', 24, 1, 0.2, 5.9, 'Baqlajon', 'Баклажан', 'Eggplant', 250],
  ['zucchini', 'vegetables', 24, 0.6, 0.3, 4.6, 'Qovoqcha', 'Кабачок', 'Zucchini', 300],
  ['pumpkin', 'vegetables', 26, 1, 0.1, 6.5, 'Oshqovoq', 'Тыква', 'Pumpkin'],
  ['beet', 'vegetables', 43, 1.6, 0.2, 9.6, 'Lavlagi', 'Свёкла', 'Beetroot', 200],
  ['turnip', 'vegetables', 28, 0.9, 0.1, 6.4, "Sholg'om", 'Репа', 'Turnip', 200],
  ['green_beans', 'vegetables', 31, 1.8, 0.2, 7, "Loviya (ko'k)", 'Стручковая фасоль', 'Green beans'],
  ['green_peas', 'vegetables', 81, 5.4, 0.4, 14.5, "Ko'k no'xat", 'Зелёный горошек', 'Green peas'],
  ['mushroom', 'vegetables', 22, 3.1, 0.3, 3.3, "Qo'ziqorin", 'Шампиньоны', 'Mushrooms'],
  ['celery', 'vegetables', 16, 0.7, 0.2, 3, 'Selderey', 'Сельдерей', 'Celery'],
  ['pickled_cucumber', 'vegetables', 11, 0.5, 0.2, 2.3, 'Tuzlangan bodring', 'Огурцы солёные', 'Pickled cucumber', 80],
  ['corn', 'vegetables', 86, 3.3, 1.4, 19, "Makkajo'xori", 'Кукуруза', 'Corn'],
  // ko'katlar
  ['dill', 'greens', 43, 3.5, 1.1, 7, 'Shivit', 'Укроп', 'Dill'],
  ['parsley', 'greens', 36, 3, 0.8, 6.3, 'Petrushka', 'Петрушка', 'Parsley'],
  ['coriander', 'greens', 23, 2.1, 0.5, 3.7, 'Kashnich', 'Кинза', 'Coriander leaves'],
  ['green_onion', 'greens', 32, 1.8, 0.2, 7.3, "Ko'k piyoz", 'Зелёный лук', 'Green onion'],
  ['basil', 'greens', 23, 3.2, 0.6, 2.7, 'Rayhon', 'Базилик', 'Basil'],
  ['mint', 'greens', 70, 3.8, 0.9, 15, 'Yalpiz', 'Мята', 'Mint'],
  ['spinach', 'greens', 23, 2.9, 0.4, 3.6, 'Ismaloq', 'Шпинат', 'Spinach'],
  ['lettuce', 'greens', 15, 1.4, 0.2, 2.9, 'Salat bargi', 'Листья салата', 'Lettuce'],
  // mevalar
  ['apple', 'fruits', 52, 0.3, 0.2, 14, 'Olma', 'Яблоко', 'Apple', 180],
  ['pear', 'fruits', 57, 0.4, 0.1, 15, 'Nok', 'Груша', 'Pear', 180],
  ['banana', 'fruits', 89, 1.1, 0.3, 23, 'Banan', 'Банан', 'Banana', 120],
  ['orange', 'fruits', 47, 0.9, 0.1, 12, 'Apelsin', 'Апельсин', 'Orange', 180],
  ['lemon', 'fruits', 29, 1.1, 0.3, 9, 'Limon', 'Лимон', 'Lemon', 100],
  ['pomegranate', 'fruits', 83, 1.7, 1.2, 19, 'Anor', 'Гранат', 'Pomegranate', 250],
  ['quince', 'fruits', 57, 0.4, 0.1, 15, 'Behi', 'Айва', 'Quince', 250],
  ['grapes', 'fruits', 69, 0.7, 0.2, 18, 'Uzum', 'Виноград', 'Grapes'],
  ['melon', 'fruits', 34, 0.8, 0.2, 8, 'Qovun', 'Дыня', 'Melon'],
  ['watermelon', 'fruits', 30, 0.6, 0.2, 7.6, 'Tarvuz', 'Арбуз', 'Watermelon'],
  ['apricot', 'fruits', 48, 1.4, 0.4, 11, "O'rik", 'Абрикос', 'Apricot'],
  ['persimmon', 'fruits', 70, 0.6, 0.2, 18.6, 'Xurmo', 'Хурма', 'Persimmon', 200],
  ['strawberry', 'fruits', 33, 0.7, 0.3, 7.7, 'Qulupnay', 'Клубника', 'Strawberry'],
  ['raisins', 'fruits', 299, 3.1, 0.5, 79, 'Mayiz', 'Изюм', 'Raisins'],
  ['dried_apricot', 'fruits', 241, 3.4, 0.5, 63, 'Turshak (qayroqi)', 'Курага', 'Dried apricots'],
  ['dates', 'fruits', 282, 2.5, 0.4, 75, 'Xurmo (quruq)', 'Финики', 'Dates'],
  ['barberry', 'fruits', 300, 4, 4, 60, 'Zirk', 'Барбарис', 'Barberry'],
  // don
  ['rice_devzira', 'grains', 344, 7, 0.6, 76, 'Guruch (devzira)', 'Рис девзира', 'Devzira rice'],
  ['rice', 'grains', 344, 6.7, 0.7, 78, 'Guruch', 'Рис', 'Rice'],
  ['buckwheat', 'grains', 343, 12.6, 3.3, 62, 'Grechka', 'Гречка', 'Buckwheat'],
  ['oats', 'grains', 366, 12.3, 6.1, 59.5, 'Suli yormasi', 'Овсяные хлопья', 'Rolled oats'],
  ['semolina', 'grains', 360, 10.3, 1, 73, 'Manka', 'Манная крупа', 'Semolina'],
  ['millet', 'grains', 348, 11.5, 3.3, 69, 'Tariq', 'Пшено', 'Millet'],
  ['bulgur', 'grains', 342, 12.3, 1.3, 76, 'Bulgur', 'Булгур', 'Bulgur'],
  ['barley', 'grains', 352, 9.3, 1.1, 73, 'Arpa yormasi', 'Перловка', 'Pearl barley'],
  // dukkaklilar
  ['mung_bean', 'legumes', 347, 23.9, 1.2, 63, 'Mosh', 'Маш', 'Mung beans'],
  ['chickpeas', 'legumes', 364, 19.3, 6, 61, "No'xat", 'Нут', 'Chickpeas'],
  ['red_lentils', 'legumes', 352, 24, 1.1, 60, 'Qizil yasmiq', 'Красная чечевица', 'Red lentils'],
  ['beans', 'legumes', 333, 21, 2, 60, 'Loviya', 'Фасоль', 'Beans'],
  // un va makaron
  ['flour', 'flour', 364, 10.3, 1, 76, 'Un', 'Мука пшеничная', 'Wheat flour'],
  ['corn_flour', 'flour', 361, 7, 3.9, 77, "Makkajo'xori uni", 'Кукурузная мука', 'Corn flour'],
  ['pasta', 'pasta', 350, 12, 1.5, 72, 'Makaron', 'Макароны', 'Pasta'],
  ['vermicelli', 'pasta', 350, 11, 1.3, 72, 'Vermishel', 'Вермишель', 'Vermicelli'],
  // yog'lar
  ['cotton_oil', 'oils', 899, 0, 99.9, 0, "Paxta yog'i", 'Хлопковое масло', 'Cottonseed oil', undefined, 0.92],
  ['sunflower_oil', 'oils', 899, 0, 99.9, 0, "Kungaboqar yog'i", 'Подсолнечное масло', 'Sunflower oil', undefined, 0.92],
  ['olive_oil', 'oils', 884, 0, 100, 0, "Zaytun yog'i", 'Оливковое масло', 'Olive oil', undefined, 0.92],
  // ziravorlar
  ['salt', 'spices', 0, 0, 0, 0, 'Tuz', 'Соль', 'Salt'],
  ['black_pepper', 'spices', 251, 10, 3.3, 64, 'Qora murch', 'Чёрный перец', 'Black pepper'],
  ['red_pepper', 'spices', 282, 13, 15, 50, 'Qizil qalampir (quruq)', 'Красный перец молотый', 'Ground red pepper'],
  ['cumin', 'spices', 375, 17.8, 22, 44, 'Zira', 'Зира', 'Cumin'],
  ['coriander_seeds', 'spices', 298, 12.4, 17.8, 55, 'Kashnich urug\'i', 'Кориандр (семена)', 'Coriander seeds'],
  ['paprika', 'spices', 282, 14, 13, 54, 'Paprika', 'Паприка', 'Paprika'],
  ['turmeric', 'spices', 312, 9.7, 3.3, 67, 'Zarchava', 'Куркума', 'Turmeric'],
  ['bay_leaf', 'spices', 313, 7.6, 8.4, 75, 'Dafna yaprog\'i', 'Лавровый лист', 'Bay leaf'],
  ['cinnamon', 'spices', 247, 4, 1.2, 81, 'Dolchin', 'Корица', 'Cinnamon'],
  ['ginger', 'spices', 80, 1.8, 0.8, 18, 'Zanjabil', 'Имбирь', 'Ginger'],
  // souslar
  ['tomato_paste', 'sauces', 82, 4.3, 0.5, 19, 'Tomat pastasi', 'Томатная паста', 'Tomato paste'],
  ['mayonnaise', 'sauces', 680, 1, 75, 0.6, 'Mayonez', 'Майонез', 'Mayonnaise'],
  ['soy_sauce', 'sauces', 53, 8, 0.6, 4.9, 'Soya sousi', 'Соевый соус', 'Soy sauce', undefined, 1.1],
  ['vinegar', 'sauces', 18, 0, 0, 0.6, 'Sirka', 'Уксус', 'Vinegar', undefined, 1.0],
  ['mustard', 'sauces', 66, 4.4, 4, 5.3, 'Xantal', 'Горчица', 'Mustard'],
  ['ketchup', 'sauces', 112, 1.7, 0.1, 26, 'Ketchup', 'Кетчуп', 'Ketchup'],
  // yong'oqlar
  ['walnuts', 'nuts', 654, 15, 65, 14, "Yong'oq", 'Грецкий орех', 'Walnuts'],
  ['almonds', 'nuts', 579, 21, 50, 22, 'Bodom', 'Миндаль', 'Almonds'],
  ['peanuts', 'nuts', 567, 26, 49, 16, 'Yer yong\'oq', 'Арахис', 'Peanuts'],
  ['pistachio', 'nuts', 562, 20, 45, 28, 'Pista', 'Фисташки', 'Pistachios'],
  ['sesame', 'nuts', 573, 17.7, 49.7, 23, 'Kunjut', 'Кунжут', 'Sesame'],
  ['sunflower_seeds', 'nuts', 584, 20.8, 51.5, 20, 'Kungaboqar pistasi', 'Семечки', 'Sunflower seeds'],
  // shirinliklar
  ['sugar', 'sweets', 387, 0, 0, 100, 'Shakar', 'Сахар', 'Sugar'],
  ['honey', 'sweets', 304, 0.3, 0, 82, 'Asal', 'Мёд', 'Honey'],
  ['jam', 'sweets', 250, 0.4, 0.1, 64, 'Murabbo', 'Варенье', 'Jam'],
  ['halva', 'sweets', 516, 12, 30, 54, 'Holva', 'Халва', 'Halva'],
  ['cocoa', 'sweets', 228, 19.6, 13.7, 58, 'Kakao', 'Какао', 'Cocoa powder'],
  // non
  ['non', 'bakery', 260, 8.5, 1.5, 53, 'Non', 'Лепёшка', 'Uzbek flatbread', 250],
  ['bread', 'bakery', 265, 9, 3.2, 49, 'Buxanka non', 'Хлеб', 'Bread', 600],
  // ichimliklar
  ['water', 'drinks', 0, 0, 0, 0, 'Suv', 'Вода', 'Water', undefined, 1.0],
  ['green_tea', 'drinks', 1, 0.2, 0, 0, "Ko'k choy", 'Зелёный чай', 'Green tea'],
  ['black_tea', 'drinks', 1, 0.1, 0, 0.3, 'Qora choy', 'Чёрный чай', 'Black tea'],
  // boshqa
  ['yeast', 'other', 325, 40, 7.6, 41, 'Xamirturush (quruq)', 'Дрожжи сухие', 'Dry yeast'],
  ['baking_soda', 'other', 0, 0, 0, 0, 'Soda', 'Сода', 'Baking soda'],
  ['starch', 'other', 343, 0.1, 0.1, 85, 'Kraxmal', 'Крахмал', 'Starch'],
];

export const INGREDIENTS: IngredientSeed[] = rows.map(([slug, category, kcal, protein, fat, carb, uz, ru, en, pieceG, density]) => ({
  slug,
  category,
  kcal,
  protein,
  fat,
  carb,
  pieceG,
  density,
  uz,
  ru,
  en,
}));
