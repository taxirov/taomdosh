/// O'zbek lotin → kirill (backenddagi `domain/i18n.ts` bilan bir xil qoidalar).
/// Avval ko'p harfli birikmalar, keyin bittalik harflar; so'z boshidagi "e" → "э".
library;

final _multi = <(RegExp, String)>[
  (RegExp("O['‘’ʻ`]"), 'Ў'),
  (RegExp("o['‘’ʻ`]"), 'ў'),
  (RegExp("G['‘’ʻ`]"), 'Ғ'),
  (RegExp("g['‘’ʻ`]"), 'ғ'),
  (RegExp('Sh|SH'), 'Ш'),
  (RegExp('sh'), 'ш'),
  (RegExp('Ch|CH'), 'Ч'),
  (RegExp('ch'), 'ч'),
  (RegExp('Yo|YO'), 'Ё'),
  (RegExp('yo'), 'ё'),
  (RegExp('Yu|YU'), 'Ю'),
  (RegExp('yu'), 'ю'),
  (RegExp('Ya|YA'), 'Я'),
  (RegExp('ya'), 'я'),
  (RegExp('Ye|YE'), 'Е'),
  (RegExp('ye'), 'е'),
  (RegExp('Ts(?=[aeiou])'), 'Ц'),
  (RegExp('ts(?=[aeiou])'), 'ц'),
  (RegExp("['‘’ʻ`]"), 'ъ'),
];

const _single = {
  'A': 'А',
  'a': 'а',
  'B': 'Б',
  'b': 'б',
  'D': 'Д',
  'd': 'д',
  'E': 'Э',
  'e': 'э',
  'F': 'Ф',
  'f': 'ф',
  'G': 'Г',
  'g': 'г',
  'H': 'Ҳ',
  'h': 'ҳ',
  'I': 'И',
  'i': 'и',
  'J': 'Ж',
  'j': 'ж',
  'K': 'К',
  'k': 'к',
  'L': 'Л',
  'l': 'л',
  'M': 'М',
  'm': 'м',
  'N': 'Н',
  'n': 'н',
  'O': 'О',
  'o': 'о',
  'P': 'П',
  'p': 'п',
  'Q': 'Қ',
  'q': 'қ',
  'R': 'Р',
  'r': 'р',
  'S': 'С',
  's': 'с',
  'T': 'Т',
  't': 'т',
  'U': 'У',
  'u': 'у',
  'V': 'В',
  'v': 'в',
  'X': 'Х',
  'x': 'х',
  'Y': 'Й',
  'y': 'й',
  'Z': 'З',
  'z': 'з',
  'C': 'С',
  'c': 'с',
  'W': 'В',
  'w': 'в',
};

final _letter = RegExp(r'\p{L}', unicode: true);

String uzLatinToCyrillic(String input) {
  var s = input;
  for (final (re, rep) in _multi) {
    s = s.replaceAll(re, rep);
  }
  final out = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    final ch = s[i];
    final prev = i > 0 ? s[i - 1] : ' ';
    final wordStart = !_letter.hasMatch(prev);
    if ((ch == 'e' || ch == 'E') && !wordStart) {
      out.write(ch == 'e' ? 'е' : 'Е');
    } else {
      out.write(_single[ch] ?? ch);
    }
  }
  return out.toString();
}
