/**
 * To'liq oqim: kirish → guruh → cookbook qo'llash → qatnashuv → qulflash → xarid → xarajat → qarzlar.
 * Haqiqiy PostgreSQL va Redis kerak (.env dagi DATABASE_URL, REDIS_URL); seed oldindan qo'llangan bo'lishi shart.
 *   npm run db:migrate && npm run db:seed && npm run test:e2e
 */
import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DB, Db, REDIS } from '../src/common/infra.module';
import { addDays, localDate, weekMonday } from '../src/domain/schedule';
import { MealsService } from '../src/modules/meals/meals.module';

process.env.AUTH_TEST_PHONES = '*';
process.env.AUTH_TEST_CODE = '111111';
process.env.MEAL_LOCK_POLLER = 'off';

interface Member {
  id: string;
  token: string;
}

describe('Taomdosh oqimi (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  let groupId: string;
  let a: Member;
  let b: Member;
  let c: Member;
  const nextMonday = addDays(weekMonday(localDate(new Date(), 'Asia/Tashkent')), 7);

  const http = () => request(app.getHttpServer());
  const as = (m: Member) => ({ Authorization: `Bearer ${m.token}` });

  async function login(name: string): Promise<Member> {
    const phone = `+99890${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    await http().post('/v1/auth/request-code').send({ phone }).expect(200);
    const res = await http().post('/v1/auth/verify').send({ phone, code: '111111', name }).expect(200);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get(DB);
    // IP bo'yicha cheklov testlar qayta-qayta ishga tushganda xalaqit bermasin
    const redis = app.get<Redis>(REDIS);
    const keys = await redis.keys('otp:rate:ip:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    if (groupId) await db.execute(sql`delete from groups where id = ${groupId}`);
    await app.close();
  });

  it('kirish va profil', async () => {
    a = await login('Aziz');
    b = await login('Bekzod');
    c = await login('Sardor');
    const me = await http()
      .put('/v1/me/profile')
      .set(as(a))
      .send({ birthDate: '2004-03-01', sex: 'male', heightCm: 178, weightKg: 72, activityLevel: 'moderate', goal: 'maintain' })
      .expect(200);
    expect(me.body.target.kcal).toBeGreaterThan(2000);
    await http()
      .put('/v1/me/profile')
      .set(as(b))
      .send({ birthDate: '2005-05-10', sex: 'male', heightCm: 170, weightKg: 60, activityLevel: 'light', goal: 'lose' })
      .expect(200);
  });

  it('guruh: yaratish va qo‘shilish', async () => {
    const g = await http().post('/v1/groups').set(as(a)).send({ name: 'Yotoqxona 312', type: 'students' }).expect(201);
    groupId = g.body.id;
    expect(g.body.splitMode).toBe('by_portion');
    await http().post('/v1/groups/join').set(as(b)).send({ inviteCode: g.body.inviteCode }).expect(201);
    const joined = await http().post('/v1/groups/join').set(as(c)).send({ inviteCode: g.body.inviteCode }).expect(201);
    expect(joined.body.members).toHaveLength(3);
  });

  let lunchId: string;
  let breakfastId: string;

  it('cookbookni keyingi haftaga qo‘llash', async () => {
    const list = await http().get('/v1/cookbooks').set(as(a)).expect(200);
    const cb = list.body.find((x: { slug: string }) => x.slug === 'talaba_hamyoni');
    expect(cb).toBeDefined();

    // Oddiy a'zo reja qo'ya olmaydi
    await http().post(`/v1/groups/${groupId}/plans`).set(as(b)).send({ cookbookId: cb.id, weekStart: nextMonday }).expect(403);

    const res = await http()
      .post(`/v1/groups/${groupId}/plans`)
      .set(as(a))
      .send({ cookbookId: cb.id, weekStart: addDays(nextMonday, 2) }) // hafta o'rtasi → dushanbaga keltiriladi
      .expect(201);
    expect(res.body.plan.weekStart).toBe(nextMonday);
    expect(res.body.created).toBe(21);
    expect(res.body.meals).toHaveLength(21);

    const meals = await http()
      .get(`/v1/groups/${groupId}/meals`)
      .query({ from: nextMonday, to: addDays(nextMonday, 6) })
      .set(as(a))
      .expect(200);
    const lunch = meals.body.find((m: { date: string; mealType: string }) => m.date === nextMonday && m.mealType === 'lunch');
    breakfastId = meals.body.find((m: { date: string; mealType: string }) => m.date === nextMonday && m.mealType === 'breakfast').id;
    lunchId = lunch.id;
    expect(lunch.dishes.map((d: { title: string }) => d.title)).toContain('Qiymali makaron');
    expect(new Date(lunch.lockAt).getTime()).toBeLessThan(new Date(lunch.eatAt).getTime());
    expect(lunch.cookUserId).not.toBeNull();
    expect(lunch.status).toBe('planned');
  });

  it('qatnashuv: yemayman va mehmonlar', async () => {
    await http().put(`/v1/meals/${lunchId}/attendance`).set(as(b)).send({ status: 'not_eating' }).expect(200);
    const res = await http().put(`/v1/meals/${lunchId}/attendance`).set(as(c)).send({ status: 'eating', guests: 2 }).expect(200);
    expect(res.body.eatingCount).toBe(2);
    expect(res.body.guestsCount).toBe(2);
    expect(res.body.myAttendance).toEqual({ status: 'eating', guests: 2 });
  });

  let pastaId: string;

  it('zaxira va xarid ro‘yxati', async () => {
    const ings = await http().get('/v1/ingredients').query({ q: 'Makaron' }).set(as(a)).expect(200);
    pastaId = ings.body.find((i: { slug: string }) => i.slug === 'pasta').id;
    await http().put(`/v1/groups/${groupId}/pantry/${pastaId}`).set(as(a)).send({ qtyG: 200 }).expect(200);

    const before = await http()
      .post(`/v1/groups/${groupId}/shopping/regenerate`)
      .set(as(a))
      .send({ from: nextMonday, to: nextMonday })
      .expect(201);
    const pasta = before.body.find((x: { ingredientId: string }) => x.ingredientId === pastaId);
    expect(pasta).toBeDefined();
    expect(pasta.status).toBe('pending');

    // Qo'lda qo'shish
    const teaId = (await http().get('/v1/ingredients').query({ q: "Ko'k choy" }).set(as(a)).expect(200)).body[0].id;
    await http().post(`/v1/groups/${groupId}/shopping`).set(as(b)).send({ ingredientId: teaId, qtyG: 100 }).expect(201);

    // "Olindi" → zaxiraga
    await http().patch(`/v1/groups/${groupId}/shopping/${pasta.id}`).set(as(c)).send({ status: 'bought', qtyG: 1000 }).expect(200);
    await http().patch(`/v1/groups/${groupId}/shopping/${pasta.id}`).set(as(c)).send({ status: 'bought' }).expect(409);
    const pantry = await http().get(`/v1/groups/${groupId}/pantry`).set(as(a)).expect(200);
    expect(pantry.body.find((p: { ingredientId: string }) => p.ingredientId === pastaId).qtyG).toBe(1200);

    // Qayta tuzishda qo'lda qo'shilgan va olingan saqlanadi, makaron endi kerak emas
    const after = await http()
      .post(`/v1/groups/${groupId}/shopping/regenerate`)
      .set(as(a))
      .send({ from: nextMonday, to: nextMonday })
      .expect(201);
    expect(after.body.some((x: { isManual: boolean }) => x.isManual)).toBe(true);
    expect(after.body.filter((x: { ingredientId: string; status: string }) => x.ingredientId === pastaId && x.status === 'pending')).toHaveLength(0);
  });

  it('oshpaz ko‘rinishi (qulflashdan oldin — taxmin)', async () => {
    const res = await http().get(`/v1/meals/${lunchId}/cook-view`).set(as(b)).expect(200);
    expect(res.body.isFinal).toBe(false);
    const main = res.body.dishes.find((d: { isSide: boolean }) => !d.isSide);
    expect(main.portions).toHaveLength(4); // Aziz, Sardor + 2 mehmon
    expect(main.portions.filter((p: { isGuest: boolean }) => p.isGuest)).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toMatch(/weight|goal|kcal/i);
  });

  it('qulflash: porsiyalar muzlatiladi, zaxiradan ayiriladi', async () => {
    const meal = (await http().get(`/v1/meals/${lunchId}`).set(as(a)).expect(200)).body;
    const meals = app.get(MealsService);
    const locked = await meals.lockDue(new Date(new Date(meal.lockAt).getTime() + 1000));
    expect(locked).toBeGreaterThanOrEqual(2); // nonushta va tushlik

    const after = (await http().get(`/v1/meals/${lunchId}`).set(as(a)).expect(200)).body;
    expect(after.status).toBe('locked');
    expect(after.myPortions.length).toBe(2);
    expect(after.dishes.every((d: { totalServings: number }) => d.totalServings > 0)).toBe(true);
    const bView = (await http().get(`/v1/meals/${lunchId}`).set(as(b)).expect(200)).body;
    expect(bView.myPortions).toHaveLength(0);

    // Qulflangandan keyin qatnashuvni o'zgartirib bo'lmaydi
    await http().put(`/v1/meals/${lunchId}/attendance`).set(as(b)).send({ status: 'eating' }).expect(409);

    const pantry = await http().get(`/v1/groups/${groupId}/pantry`).set(as(a)).expect(200);
    const pasta = pantry.body.find((p: { ingredientId: string }) => p.ingredientId === pastaId);
    expect(pasta === undefined || pasta.qtyG < 1200).toBe(true);
    const mv = await http().get(`/v1/groups/${groupId}/pantry/movements`).set(as(a)).expect(200);
    expect(mv.body.some((m: { reason: string; refId: string }) => m.reason === 'cooking' && m.refId === lunchId)).toBe(true);

    const cook = await http().get(`/v1/meals/${lunchId}/cook-view`).set(as(a)).expect(200);
    expect(cook.body.isFinal).toBe(true);
    const main = cook.body.dishes.find((d: { isSide: boolean }) => !d.isSide);
    expect(main.portions).toHaveLength(4);
    expect(main.ingredients.find((i: { ingredientId: string }) => i.ingredientId === pastaId).qtyG).toBeGreaterThan(0);
  });

  it('baho: kᵢ yangilanadi', async () => {
    const r = await http().post(`/v1/meals/${lunchId}/feedback`).set(as(a)).send({ verdict: 'not_enough' }).expect(201);
    expect(r.body).toEqual({ factor: 1.05, suggestLightSide: false });
    await http().post(`/v1/meals/${lunchId}/feedback`).set(as(a)).send({ verdict: 'enough' }).expect(409);
    await http().post(`/v1/meals/${lunchId}/feedback`).set(as(b)).send({ verdict: 'enough' }).expect(403);
    // Ozish maqsadidagi a'zo: "yetmadi" kᵢ ni oshirmaydi
    const rb = await http().post(`/v1/meals/${breakfastId}/feedback`).set(as(b)).send({ verdict: 'not_enough' }).expect(201);
    expect(rb.body).toEqual({ factor: 1, suggestLightSide: true });
  });

  it('xarajat, balanslar va qarzni yopish', async () => {
    const e = await http()
      .post(`/v1/groups/${groupId}/expenses`)
      .set(as(a))
      .send({ amount: 300_000, note: 'Bozor', periodStart: nextMonday, periodEnd: addDays(nextMonday, 6) })
      .expect(201);
    const shares: { userId: string; amount: number }[] = e.body.shares;
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(300_000);
    const shareOf = (m: Member) => shares.find((s) => s.userId === m.id)?.amount ?? 0;
    // Sardor 2 mehmon olib kelgan — ulushi Bekzodnikidan katta
    expect(shareOf(c)).toBeGreaterThan(shareOf(b));

    const bal = (await http().get(`/v1/groups/${groupId}/balances`).set(as(b)).expect(200)).body;
    const balOf = (m: Member) => bal.balances.find((x: { userId: string }) => x.userId === m.id)?.balance ?? 0;
    expect(balOf(a)).toBe(300_000 - shareOf(a));
    expect(bal.transfers.every((t: { to: string }) => t.to === a.id)).toBe(true);
    expect(bal.transfers.reduce((s: number, t: { amount: number }) => s + t.amount, 0)).toBe(300_000 - shareOf(a));

    await http().post(`/v1/groups/${groupId}/settlements`).set(as(c)).send({ toUser: a.id, amount: shareOf(c) }).expect(201);
    const bal2 = (await http().get(`/v1/groups/${groupId}/balances`).set(as(a)).expect(200)).body;
    expect(bal2.balances.find((x: { userId: string }) => x.userId === c.id)).toBeUndefined();
    expect(bal2.transfers).toEqual([expect.objectContaining({ from: b.id, to: a.id, amount: shareOf(b) })]);
  });

  it('rejani bekor qilish: qulflangan mahallar qoladi', async () => {
    const plans = (await http().get(`/v1/groups/${groupId}/plans`).set(as(a)).expect(200)).body;
    const r = await http().delete(`/v1/groups/${groupId}/plans/${plans[0].id}`).set(as(a)).expect(200);
    expect(r.body.removedMeals).toBe(19);
    const meals = await http()
      .get(`/v1/groups/${groupId}/meals`)
      .query({ from: nextMonday, to: addDays(nextMonday, 6) })
      .set(as(a))
      .expect(200);
    expect(meals.body).toHaveLength(2);
  });
});
