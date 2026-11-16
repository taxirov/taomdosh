/**
 * Hisobni o'chirish: shaxsiy ma'lumot tozalanadi, sessiya bekor bo'ladi, guruh adminsiz qolmaydi,
 * xarajat tarixi saqlanadi, o'sha raqam bilan yangi hisob ochish mumkin.
 */
import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import Redis from 'ioredis';
import { DB, Db, REDIS } from '../src/common/infra.module';
import { userProfiles, users } from '../src/db/schema';

process.env.AUTH_TEST_PHONES = '*';
process.env.AUTH_TEST_CODE = '111111';
process.env.MEAL_LOCK_POLLER = 'off';
process.env.PRICES_SYNC_ENABLED = 'off';
process.env.TELEGRAM_BOT_USERNAME = 'taomdosh_bot';

describe('Hisobni o‘chirish (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  let groupId: string;
  const http = () => request(app.getHttpServer());

  async function login(name: string, phone = `+99890${Math.floor(1_000_000 + Math.random() * 8_999_999)}`) {
    await http().post('/v1/auth/request-code').send({ phone }).expect(200);
    const res = await http().post('/v1/auth/verify').send({ phone, code: '111111', name }).expect(200);
    return { id: res.body.user.id as string, phone, refresh: res.body.refreshToken as string, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get(DB);
  });

  afterAll(async () => {
    if (groupId) await db.execute(sql`delete from groups where id = ${groupId}`);
    await app.close();
  });

  it('DELETE /me', async () => {
    const owner = await login('Egasi');
    const mate = await login('Sherik');
    await http().put('/v1/me/profile').set(owner.auth).send({ sex: 'male', heightCm: 178, weightKg: 80, birthDate: '1995-04-01' }).expect(200);
    const g = await http().post('/v1/groups').set(owner.auth).send({ name: 'O‘chirish guruhi', type: 'family' }).expect(201);
    groupId = g.body.id;
    await http().post('/v1/groups/join').set(mate.auth).send({ inviteCode: g.body.inviteCode }).expect(201);
    const child = await http().post(`/v1/groups/${groupId}/managed-members`).set(owner.auth).send({ name: 'Bola' }).expect(201);
    const exp = await http().post(`/v1/groups/${groupId}/expenses`).set(owner.auth).send({ amount: 50000, category: 'groceries' }).expect(201);

    await http().delete('/v1/me').expect(401);
    await http().delete('/v1/me').set(owner.auth).expect(200);

    // Shaxsiy ma'lumotlar tozalangan, bola hisobi ham o'chirilgan
    const [u] = await db.select().from(users).where(eq(users.id, owner.id));
    expect(u).toMatchObject({ status: 'deleted', phone: null, name: 'O‘chirilgan hisob' });
    expect(await db.select().from(userProfiles).where(eq(userProfiles.userId, owner.id))).toHaveLength(0);
    const kids = await db.select().from(users).where(eq(users.managedBy, owner.id));
    expect(kids.every((k) => k.status === 'deleted')).toBe(true);
    expect(child.body).toBeDefined();

    // Sessiya bekor: refresh ishlamaydi
    await http().post('/v1/auth/refresh').send({ refreshToken: owner.refresh }).expect(401);

    // Guruh adminsiz qolmadi, a'zolar ro'yxatida o'chirilgan hisob yo'q, xarajat tarixi saqlangan
    const group = await http().get(`/v1/groups/${groupId}`).set(mate.auth).expect(200);
    expect(group.body.myRole).toBe('admin');
    expect(group.body.members.map((m: { userId: string }) => m.userId)).toEqual([mate.id]);
    const expenses = await http().get(`/v1/groups/${groupId}/expenses`).set(mate.auth).expect(200);
    expect(JSON.stringify(expenses.body)).toContain(exp.body.id);

    // O'sha raqam bilan qayta ro'yxatdan o'tish — yangi, bo'sh hisob (kod so'rash oralig'i cheklovini tozalab)
    const redis = app.get<Redis>(REDIS);
    const keys = await redis.keys(`otp:*${owner.phone}*`);
    if (keys.length) await redis.del(...keys);
    const again = await login('Qaytgan', owner.phone);
    expect(again.id).not.toBe(owner.id);
    expect((await http().get('/v1/groups').set(again.auth).expect(200)).body).toHaveLength(0);
  });
});
