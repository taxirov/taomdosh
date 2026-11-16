/**
 * Admin panel API: ruxsat, ko'rsatkichlar, foydalanuvchini bloklash, guruhlar, katalog holati, masalliqlar va narx bog'lanishi.
 */
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import Redis from 'ioredis';
import { DB, Db, REDIS } from '../src/common/infra.module';
import { priceSnapshots } from '../src/db/schema';

process.env.AUTH_TEST_PHONES = '*';
process.env.AUTH_TEST_CODE = '111111';
process.env.MEAL_LOCK_POLLER = 'off';
process.env.PRICES_SYNC_ENABLED = 'off';
process.env.TELEGRAM_BOT_USERNAME = 'taomdosh_bot';

describe('Admin panel API (e2e)', () => {
  let app: NestExpressApplication;
  let db: Db;
  const http = () => request(app.getHttpServer());
  type U = { id: string; phone: string; auth: { Authorization: string }; refresh: string };
  let admin: U;
  let user: U;
  let groupId: string;
  let dishId: string;
  let ingredientId: string;
  const slug = `test-ing-${Date.now()}`;

  async function login(name: string): Promise<U> {
    const phone = `+99891${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    await http().post('/v1/auth/request-code').send({ phone }).expect(200);
    const res = await http().post('/v1/auth/verify').send({ phone, code: '111111', name }).expect(200);
    return { id: res.body.user.id, phone, auth: { Authorization: `Bearer ${res.body.accessToken}` }, refresh: res.body.refreshToken };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get(DB);
    [admin, user] = await Promise.all([login('Bosh admin'), login('Oddiy foydalanuvchi')]);
    process.env.ADMIN_PHONES = admin.phone;
    const g = await http().post('/v1/groups').set(user.auth).send({ name: 'Admin test guruhi', type: 'students' }).expect(201);
    groupId = g.body.id;
    const ing = (await http().get('/v1/ingredients').set(user.auth).expect(200)).body as { id: string; slug: string }[];
    const d = await http()
      .post('/v1/dishes')
      .set(user.auth)
      .send({
        title: 'Admin test oshi',
        groupId,
        submitPublic: true,
        activeMin: 30,
        baseServings: 2,
        ingredients: [{ ingredientId: ing.find((i) => i.slug === 'rice')!.id, qtyG: 300 }],
        steps: ['Pishiring'],
      })
      .expect(201);
    dishId = d.body.id;
    // Narx mahsuloti (sinov uchun): ikki kunlik tarix
    const snap = { productId: 990001, name: 'Sinov guruchi (1 kg)', unit: 'kg' as const, unitQty: 1, source: 'api' };
    await db.insert(priceSnapshots).values([
      { ...snap, price: 18000, prevPrice: 17000, date: '2026-01-01' },
      { ...snap, price: 19000, prevPrice: 18000, date: '2026-01-02' },
    ]);
  });

  afterAll(async () => {
    try {
      await db.execute(sql`delete from groups where id = ${groupId}`);
      await db.execute(sql`delete from ingredients where slug = ${slug}`);
      await db.execute(sql`delete from price_snapshots where product_id = 990001`);
    } finally {
      await app.close();
    }
  });

  it('oddiy foydalanuvchiga admin API yopiq', async () => {
    for (const path of ['stats', 'users', 'groups', 'dishes', 'cookbooks', 'ingredients', 'prices']) {
      await http().get(`/v1/admin/${path}`).set(user.auth).expect(403);
    }
    await http().get('/v1/admin/stats').expect(401);
  });

  it('ko\'rsatkichlar', async () => {
    const s = (await http().get('/v1/admin/stats').set(admin.auth).expect(200)).body;
    expect(s.users.total).toBeGreaterThanOrEqual(2);
    expect(s.groups.total).toBeGreaterThanOrEqual(1);
    expect(s.catalog.pendingDishes).toBeGreaterThanOrEqual(1);
    expect(s.ingredients.total).toBeGreaterThanOrEqual(100);
    expect(Array.isArray(s.signups)).toBe(true);
    expect(s.prices).toHaveProperty('syncEnabled', false);
  });

  it('foydalanuvchilar: qidiruv, tafsilot, bloklash (sessiyalar bekor), qayta faollashtirish', async () => {
    const list = (await http().get('/v1/admin/users').query({ q: user.phone.slice(-7) }).set(admin.auth).expect(200)).body;
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ id: user.id, status: 'active', isAdmin: false, groupsCount: 1 });

    const me = (await http().get(`/v1/admin/users/${admin.id}`).set(admin.auth).expect(200)).body;
    expect(me).toMatchObject({ isAdmin: true, envAdmin: true });
    // O'zini o'zgartira olmaydi (o'zini bloklab qo'ymasligi uchun)
    await http().patch(`/v1/admin/users/${admin.id}`).set(admin.auth).send({ status: 'blocked' }).expect(403);

    const detail = (await http().get(`/v1/admin/users/${user.id}`).set(admin.auth).expect(200)).body;
    expect(detail.groups).toHaveLength(1);
    expect(detail.activeSessions).toBeGreaterThanOrEqual(1);
    expect(detail).not.toHaveProperty('profile');

    const blocked = (await http().patch(`/v1/admin/users/${user.id}`).set(admin.auth).send({ status: 'blocked' }).expect(200)).body;
    expect(blocked).toMatchObject({ status: 'blocked', activeSessions: 0 });
    await http().post('/v1/auth/refresh').send({ refreshToken: user.refresh }).expect(401);
    const redis = app.get<Redis>(REDIS);
    const freshCode = async () => {
      await redis.del(`otp:cooldown:${user.phone}`);
      await http().post('/v1/auth/request-code').send({ phone: user.phone }).expect(200);
    };
    await freshCode();
    const denied = await http().post('/v1/auth/verify').send({ phone: user.phone, code: '111111' }).expect(401);
    expect(denied.body.message).toBe('account_blocked');

    await http().patch(`/v1/admin/users/${user.id}`).set(admin.auth).send({ status: 'active' }).expect(200);
    await freshCode();
    const again = await http().post('/v1/auth/verify').send({ phone: user.phone, code: '111111' }).expect(200);
    user.auth = { Authorization: `Bearer ${again.body.accessToken}` };

    const filtered = (await http().get('/v1/admin/users').query({ status: 'blocked' }).set(admin.auth).expect(200)).body;
    expect(filtered.items.find((x: { id: string }) => x.id === user.id)).toBeUndefined();
  });

  it('foydalanuvchiga admin roli berish va olish', async () => {
    await http().patch(`/v1/admin/users/${user.id}`).set(admin.auth).send({ role: 'admin' }).expect(200);
    await http().get('/v1/admin/stats').set(user.auth).expect(200);
    await http().patch(`/v1/admin/users/${user.id}`).set(admin.auth).send({ role: 'user' }).expect(200);
    await http().get('/v1/admin/stats').set(user.auth).expect(403);
  });

  it('guruhlar ro\'yxati va tafsiloti', async () => {
    const list = (await http().get('/v1/admin/groups').query({ q: 'Admin test' }).set(admin.auth).expect(200)).body;
    expect(list.items[0]).toMatchObject({ id: groupId, membersCount: 1, type: 'students' });
    const g = (await http().get(`/v1/admin/groups/${groupId}`).set(admin.auth).expect(200)).body;
    expect(g.members[0]).toMatchObject({ id: user.id, role: 'admin' });
    await http().get('/v1/admin/groups/00000000-0000-4000-8000-000000000000').set(admin.auth).expect(404);
  });

  it('taomlar: filtr, holatni o\'rnatish, o\'chirish va qaytarish', async () => {
    const pending = (await http().get('/v1/admin/dishes').query({ status: 'pending', q: 'Admin test' }).set(admin.auth).expect(200)).body;
    expect(pending.items[0]).toMatchObject({ id: dishId, moderationStatus: 'pending', authorName: 'Oddiy foydalanuvchi', groupName: 'Admin test guruhi' });

    await http().put(`/v1/admin/dishes/${dishId}/moderation`).set(admin.auth).send({ status: 'approved' }).expect(200);
    let d = (await http().get('/v1/admin/dishes').query({ q: 'Admin test' }).set(admin.auth).expect(200)).body.items[0];
    expect(d).toMatchObject({ moderationStatus: 'approved', visibility: 'public' });
    // Admin tahriri moderatsiya holatini o'zgartirmaydi (muallif tahriri esa qayta navbatga tushiradi)
    await http().patch(`/v1/dishes/${dishId}`).set(admin.auth).send({ description: 'Admin tuzatdi' }).expect(200);
    d = (await http().get('/v1/admin/dishes').query({ q: 'Admin test' }).set(admin.auth).expect(200)).body.items[0];
    expect(d.moderationStatus).toBe('approved');
    await http().patch(`/v1/dishes/${dishId}`).set(user.auth).send({ description: 'Muallif o‘zgartirdi' }).expect(200);
    d = (await http().get('/v1/admin/dishes').query({ q: 'Admin test' }).set(admin.auth).expect(200)).body.items[0];
    expect(d.moderationStatus).toBe('pending');
    await http().put(`/v1/admin/dishes/${dishId}/moderation`).set(admin.auth).send({ status: 'approved' }).expect(200);
    // Tasdiqlangan taomni ham keyinchalik ommadan olib tashlash mumkin
    await http().put(`/v1/admin/dishes/${dishId}/moderation`).set(admin.auth).send({ status: 'rejected' }).expect(200);
    d = (await http().get('/v1/admin/dishes').query({ q: 'Admin test' }).set(admin.auth).expect(200)).body.items[0];
    expect(d).toMatchObject({ moderationStatus: 'rejected', visibility: 'group' });
    await http().put(`/v1/admin/dishes/${dishId}/moderation`).set(admin.auth).send({ status: 'bad' }).expect(400);

    await http().delete(`/v1/dishes/${dishId}`).set(admin.auth).expect(200);
    expect((await http().get('/v1/admin/dishes').query({ q: 'Admin test' }).set(admin.auth).expect(200)).body.total).toBe(0);
    expect((await http().get('/v1/admin/dishes').query({ q: 'Admin test', deleted: 'yes' }).set(admin.auth).expect(200)).body.total).toBe(1);
    await http().post(`/v1/admin/dishes/${dishId}/restore`).set(admin.auth).expect(201);
    expect((await http().get('/v1/admin/dishes').query({ q: 'Admin test' }).set(admin.auth).expect(200)).body.total).toBe(1);
    await http().put(`/v1/admin/spoons/${dishId}/moderation`).set(admin.auth).send({ status: 'approved' }).expect(404);

    const cbs = (await http().get('/v1/admin/cookbooks').set(admin.auth).expect(200)).body;
    expect(cbs.total).toBeGreaterThanOrEqual(3);
  });

  it('masalliq: yaratish, tahrirlash (kaloriya taomlarda qayta hisoblanadi), narx bog\'lanishi', async () => {
    await http().post('/v1/admin/ingredients').set(admin.auth).send({ slug, category: 'grains' }).expect(400);
    const created = (
      await http()
        .post('/v1/admin/ingredients')
        .set(admin.auth)
        .send({ slug, category: 'grains', kcal100g: 100, protein100g: 2, names: { uz: 'Sinov donasi', ru: 'Тестовое зерно' } })
        .expect(201)
    ).body;
    ingredientId = created.id;
    expect(created.names).toEqual({ uz: 'Sinov donasi', ru: 'Тестовое зерно' });
    await http().post('/v1/admin/ingredients').set(admin.auth).send({ slug, category: 'grains', kcal100g: 1, names: { uz: 'x' } }).expect(400);

    // Taomga qo'shib, kaloriyasini o'zgartiramiz → taom kaloriyasi qayta hisoblanadi
    await http()
      .patch(`/v1/dishes/${dishId}`)
      .set(admin.auth)
      .send({ ingredients: [{ ingredientId, qtyG: 400 }] })
      .expect(200);
    const before = (await http().get('/v1/admin/dishes').query({ q: 'Admin test' }).set(admin.auth).expect(200)).body.items[0].kcalPerServing;
    expect(before).toBe(200); // 400 g × 100 kkal / 2 porsiya
    const upd = (await http().patch(`/v1/admin/ingredients/${ingredientId}`).set(admin.auth).send({ kcal100g: 150, names: { en: 'Test grain' } }).expect(200)).body;
    expect(upd).toMatchObject({ kcal100g: 150, recomputedDishes: 1, names: { uz: 'Sinov donasi', en: 'Test grain' } });
    const after = (await http().get('/v1/admin/dishes').query({ q: 'Admin test' }).set(admin.auth).expect(200)).body.items[0].kcalPerServing;
    expect(after).toBe(300);

    const list = (await http().get('/v1/admin/ingredients').query({ q: 'Sinov donasi' }).set(admin.auth).expect(200)).body;
    expect(list.items[0]).toMatchObject({ id: ingredientId, usedInDishes: 1, price: null });

    // Narx bog'lanishi: mavjud bo'lmagan mahsulot — rad; keyin olib tashlash
    await http().put(`/v1/admin/ingredients/${ingredientId}/price-link`).set(admin.auth).send({ productId: 987654 }).expect(400);
    const p = { product_id: 990001 };
    {
      await http().put(`/v1/admin/ingredients/${ingredientId}/price-link`).set(admin.auth).send({ productId: p.product_id }).expect(200);
      const linked = (await http().get('/v1/admin/ingredients').query({ q: 'Sinov donasi' }).set(admin.auth).expect(200)).body.items[0];
      expect(linked.price).toMatchObject({ productId: p.product_id, price: 19000, date: '2026-01-02' });
      const prices = (await http().get('/v1/admin/prices').set(admin.auth).expect(200)).body;
      expect(prices.products.find((x: { productId: number }) => x.productId === p.product_id).ingredients.map((i: { id: string }) => i.id)).toContain(ingredientId);
      const h = (await http().get(`/v1/admin/prices/${p.product_id}/history`).set(admin.auth).expect(200)).body;
      expect(h.history.map((x: { price: number }) => x.price)).toEqual([18000, 19000]);
    }
    await http().put(`/v1/admin/ingredients/${ingredientId}/price-link`).set(admin.auth).send({ productId: null }).expect(200);
    expect((await http().get('/v1/admin/ingredients').query({ q: 'Sinov donasi', linked: 'no' }).set(admin.auth).expect(200)).body.total).toBe(1);
    await http().get('/v1/admin/prices/987654/history').set(admin.auth).expect(404);
  });
});
