import 'package:flutter/material.dart';

import '../i18n/strings.dart';
import '../theme.dart';
import 'cookbooks/cookbooks.dart';
import 'dishes/dishes.dart';
import 'group/group.dart';
import 'profile/profile.dart';
import 'today/today.dart';

/// Pastki menyuli asosiy qobiq: Bugun · Cookbook · Taomlar · Guruh · Profil
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  /// Boshqa ekrandan (ustiga ochilgan sahifadan ham) tabni almashtirish: HomeShell.go(context, 3)
  static final _requests = ValueNotifier<int?>(null);
  static void go(BuildContext context, int tab) {
    _requests.value = null; // bir xil tab qayta so'ralsa ham xabar berilsin
    _requests.value = tab;
  }

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  // Tab qayta tanlanganda ekran yangilanishi uchun kalitlar
  final _keys = List.generate(5, (_) => UniqueKey());

  @override
  void initState() {
    super.initState();
    HomeShell._requests.addListener(_onRequest);
  }

  @override
  void dispose() {
    HomeShell._requests.removeListener(_onRequest);
    super.dispose();
  }

  void _onRequest() {
    final tab = HomeShell._requests.value;
    // Tashqaridan so'ralgan tab har doim yangilanadi (masalan, reja qo'llangandan keyin "Bugun")
    if (tab != null && mounted) {
      setState(() {
        _keys[tab] = UniqueKey();
        _tab = tab;
      });
    }
  }

  void go(int tab) => setState(() {
    if (tab == _tab) _keys[tab] = UniqueKey();
    _tab = tab;
  });

  @override
  Widget build(BuildContext context) {
    final items = [
      (Icons.soup_kitchen_outlined, t('Bugun')),
      (Icons.menu_book_outlined, t('Cookbook')),
      (Icons.restaurant_outlined, t('Taomlar')),
      (Icons.groups_outlined, t('Guruh')),
      (Icons.person_outline_rounded, t('Profil')),
    ];
    final pages = [
      TodayScreen(key: _keys[0]),
      CookbooksScreen(key: _keys[1]),
      DishesScreen(key: _keys[2]),
      GroupScreen(key: _keys[3]),
      ProfileScreen(key: _keys[4]),
    ];
    return Scaffold(
      body: IndexedStack(index: _tab, children: pages),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: C.card,
          border: Border(top: BorderSide(color: C.line)),
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 64,
            child: Row(
              children: [
                for (var i = 0; i < items.length; i++)
                  Expanded(
                    child: Semantics(
                      selected: i == _tab,
                      button: true,
                      child: InkWell(
                        onTap: () => go(i),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(items[i].$1, size: 24, color: i == _tab ? C.terracotta : C.navMuted),
                            const SizedBox(height: 4),
                            Text(
                              items[i].$2,
                              style: sans(
                                11,
                                weight: i == _tab ? FontWeight.w800 : FontWeight.w600,
                                color: i == _tab ? C.terracotta : C.navMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
