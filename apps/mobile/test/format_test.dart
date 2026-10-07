import 'package:flutter_test/flutter_test.dart';
import 'package:taomdosh/format.dart';

void main() {
  test('pul va raqamlar', () {
    expect(groupDigits(1240000), '1 240 000');
    expect(groupDigits(950), '950');
    expect(groupDigits(-89300), '−89 300');
    expect(money(420000), '420 000 so‘m');
    expect(dec(1.5), '1,5');
    expect(dec(2.0), '2');
    expect(dec(82.04), '82');
  });

  test('bozor uchun miqdor', () {
    expect(displayQty({'qty': 1.2, 'unit': 'kg'}), '1,2 kg');
    expect(displayQty({'qty': 6, 'unit': 'pcs'}), '6 dona');
    expect(displayQty({'qty': 350, 'unit': 'g'}), '350 g');
    expect(recipeQty(null, 'g', 1500), '1,5 kg');
    expect(recipeQty(2, 'pcs', 110), '2 dona');
  });

  test('sana va vaqt', () {
    final d = DateTime(2026, 10, 7, 9, 5);
    expect(ymd(d), '2026-10-07');
    expect(hhmm(d), '09:05');
    expect(parseYmd('2026-10-07'), DateTime(2026, 10, 7));
    expect(mondayOf(d), DateTime(2026, 10, 5));
    expect(longDate(d), 'Chorshanba, 7-oktabr');
    expect(duration(const Duration(minutes: 69)), '1 soat 9 daqiqa');
  });

  test('bosh harflar', () {
    expect(initials('Aziz'), 'A');
    expect(initials('Do‘stlar uyi'), 'DU');
    expect(initials(''), '?');
  });
}
