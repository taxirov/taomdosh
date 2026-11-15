/**
 * Katalog: taomni tahrirlash/o'chirish, rasm yuklash (siqish + statik), cookbook tahriri, moderatsiya.
 */
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DB, Db } from '../src/common/infra.module';
import { serveUploads } from '../src/common/uploads';

process.env.AUTH_TEST_PHONES = '*';
process.env.AUTH_TEST_CODE = '111111';
process.env.MEAL_LOCK_POLLER = 'off';
process.env.PRICES_SYNC_ENABLED = 'off';
process.env.TELEGRAM_BOT_USERNAME = 'taomdosh_bot';
const uploads = mkdtempSync(join(tmpdir(), 'taomdosh-uploads-'));
process.env.UPLOADS_DIR = uploads;

describe('Katalog: tahrirlash, rasm, moderatsiya (e2e)', () => {
  let app: NestExpressApplication;
  let db: Db;
  const http = () => request(app.getHttpServer());
  type U = { id: string; phone: string; auth: { Authorization: string } };
  let author: U;
  let mate: U; // muallif guruhidagi a'zo
  let stranger: U;
  let admin: U;
  let groupId: string;
  let dishId: string;
  let ing: { id: string; slug: string }[];

  async function login(name: string): Promise<U> {
    const phone = `+99890${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    await http().post('/v1/auth/request-code').send({ phone }).expect(200);
    const res = await http().post('/v1/auth/verify').send({ phone, code: '111111', name }).expect(200);
    return { id: res.body.user.id, phone, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('v1');
    serveUploads(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get(DB);
    [author, mate, stranger, admin] = await Promise.all([login('Muallif'), login('Sherik'), login('Begona'), login('Admin')]);
    process.env.ADMIN_PHONES = admin.phone;
    const g = await http().post('/v1/groups').set(author.auth).send({ name: 'Katalog guruhi', type: 'family' }).expect(201);
    groupId = g.body.id;
    await http().post('/v1/groups/join').set(mate.auth).send({ inviteCode: g.body.inviteCode }).expect(201);
    ing = (await http().get('/v1/ingredients').set(author.auth).expect(200)).body;
  });

  afterAll(async () => {
    try {
      // Tashqi kalit tartibi: rejalar (mahallar bilan) → cookbooklar → guruh (taomlari bilan)
      await db.execute(sql`delete from group_plans where group_id = ${groupId}`);
      await db.execute(sql`delete from cookbooks where author_id in (${author.id}, ${mate.id})`);
      await db.execute(sql`delete from groups where id = ${groupId}`);
    } finally {
      await app.close();
      rmSync(uploads, { recursive: true, force: true });
    }
  });

  const ingId = (slug: string) => ing.find((i) => i.slug === slug)!.id;

  it('taom yaratish → muallif tahrirlaydi, boshqalar tahrirlay olmaydi', async () => {
    const res = await http()
      .post('/v1/dishes')
      .set(author.auth)
      .send({
        title: 'Uy palovi',
        groupId,
        activeMin: 40,
        baseServings: 4,
        ingredients: [
          { ingredientId: ingId('rice'), qtyG: 600 },
          { ingredientId: ingId('beef'), qtyG: 500 },
        ],
        steps: ['Go‘shtni qovuring', 'Guruchni soling'],
        videoUrl: 'https://youtu.be/abc123',
      })
      .expect(201);
    dishId = res.body.id;
    expect(res.body).toMatchObject({ title: 'Uy palovi', canEdit: true, videoUrl: 'https://youtu.be/abc123' });
    const kcalBefore = res.body.kcalPerServing;

    // Guruhdosh ko'radi, lekin tahrirlay olmaydi; begona umuman ko'rmaydi
    const seen = await http().get(`/v1/dishes/${dishId}`).set(mate.auth).expect(200);
    expect(seen.body.canEdit).toBe(false);
    await http().patch(`/v1/dishes/${dishId}`).set(mate.auth).send({ title: 'Buzildi' }).expect(403);
    await http().delete(`/v1/dishes/${dishId}`).set(mate.auth).expect(403);
    await http().get(`/v1/dishes/${dishId}`).set(stranger.auth).expect(404);
    await http().patch(`/v1/dishes/${dishId}`).set(stranger.auth).send({ title: 'Buzildi' }).expect(403);

    const upd = await http()
      .patch(`/v1/dishes/${dishId}`)
      .set(author.auth)
      .send({
        title: 'Uy palovi (yangilangan)',
        baseServings: 5,
        ingredients: [
          { ingredientId: ingId('rice'), qtyG: 600 },
          { ingredientId: ingId('beef'), qtyG: 500 },
          { ingredientId: ingId('carrot'), qtyG: 600 },
        ],
        steps: ['Zirvak', 'Guruch', 'Dimlash'],
        videoUrl: '',
      })
      .expect(200);
    expect(upd.body).toMatchObject({ title: 'Uy palovi (yangilangan)', baseServings: 5, videoUrl: null });
    expect(upd.body.ingredients).toHaveLength(3);
    expect(upd.body.steps.map((s: { text: string }) => s.text)).toEqual(['Zirvak', 'Guruch', 'Dimlash']);
    expect(upd.body.kcalPerServing).not.toBe(kcalBefore);
    await http().patch(`/v1/dishes/${dishId}`).set(author.auth).send({ videoUrl: 'javascript:alert(1)' }).expect(400);
  });

  it('rasm yuklash: 1280 px JPEG ga siqiladi va statik orqali beriladi', async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 60 } } })
      .png()
      .toBuffer();
    await http().post(`/v1/dishes/${dishId}/image`).set(mate.auth).attach('file', big, 'osh.png').expect(403);
    await http().post(`/v1/dishes/${dishId}/image`).set(author.auth).expect(400);
    await http().post(`/v1/dishes/${dishId}/image`).set(author.auth).attach('file', Buffer.from('rasm emas'), 'x.jpg').expect(400);

    const res = await http().post(`/v1/dishes/${dishId}/image`).set(author.auth).attach('file', big, 'osh.png').expect(201);
    const url: string = res.body.imageUrl;
    expect(url).toMatch(/^\/uploads\/dishes\/[0-9a-f-]+\.jpg$/);
    // Statik fayl token talab qilmaydi (Image.network uchun)
    const img = await http().get(`/v1${url}`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(img.body as Buffer).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 1280, height: 853 });

    // Qayta yuklansa eski fayl o'chadi; rasmni olib tashlash ham mumkin
    const res2 = await http().post(`/v1/dishes/${dishId}/image`).set(author.auth).attach('file', big, 'osh.png').expect(201);
    expect(res2.body.imageUrl).not.toBe(url);
    expect(readdirSync(join(uploads, 'dishes'))).toHaveLength(1);
    await http().get(`/v1${url}`).expect(404);
    const res3 = await http().delete(`/v1/dishes/${dishId}/image`).set(author.auth).expect(200);
    expect(res3.body.imageUrl).toBeNull();
    expect(readdirSync(join(uploads, 'dishes'))).toHaveLength(0);
    // Papkadan tashqariga chiqib bo'lmaydi
    await http().get('/v1/uploads/..%2F..%2Fpackage.json').expect(404);
  });

  it('moderatsiya: kutilayotganlar, tasdiqlash va rad etish', async () => {
    await http().get('/v1/admin/moderation').set(author.auth).expect(403);
    expect((await http().get('/v1/me').set(admin.auth).expect(200)).body.isAdmin).toBe(true);
    expect((await http().get('/v1/me').set(author.auth).expect(200)).body.isAdmin).toBe(false);

    // Muallif ommaga chiqarishni so'raydi
    await http().patch(`/v1/dishes/${dishId}`).set(author.auth).send({ submitPublic: true }).expect(200);
    const cb = await http()
      .post('/v1/cookbooks')
      .set(author.auth)
      .send({ title: 'Mening haftam', submitPublic: true, meals: [{ dayIndex: 0, mealType: 'lunch', dishIds: [dishId] }] })
      .expect(201);
    const list = await http().get('/v1/admin/moderation').set(admin.auth).expect(200);
    expect(list.body.dishes.find((d: { id: string }) => d.id === dishId)).toMatchObject({
      title: 'Uy palovi (yangilangan)',
      authorName: 'Muallif',
      ingredientsCount: 3,
      stepsCount: 3,
    });
    expect(list.body.cookbooks.find((c: { id: string }) => c.id === cb.body.id)).toMatchObject({ title: 'Mening haftam', mealsCount: 1 });
    // Tasdiqlanmaguncha begona ko'rmaydi; admin ko'ra oladi
    await http().get(`/v1/dishes/${dishId}`).set(stranger.auth).expect(404);
    await http().get(`/v1/cookbooks/${cb.body.id}`).set(stranger.auth).expect(404);
    await http().get(`/v1/dishes/${dishId}`).set(admin.auth).expect(200);

    await http().post(`/v1/admin/moderation/dishes/${dishId}/approve`).set(author.auth).expect(403);
    await http().post(`/v1/admin/moderation/dishes/${dishId}/approve`).set(admin.auth).expect(201);
    await http().post(`/v1/admin/moderation/dishes/${dishId}/approve`).set(admin.auth).expect(400); // endi kutilmayapti
    await http().post(`/v1/admin/moderation/cookbooks/${cb.body.id}/reject`).set(admin.auth).expect(201);
    await http().post(`/v1/admin/moderation/boshqa/${dishId}/approve`).set(admin.auth).expect(404);

    const pub = await http().get(`/v1/dishes/${dishId}`).set(stranger.auth).expect(200);
    expect(pub.body).toMatchObject({ visibility: 'public', moderationStatus: 'approved', canEdit: false });
    await http().get(`/v1/cookbooks/${cb.body.id}`).set(stranger.auth).expect(404);
    const mine = await http().get(`/v1/cookbooks/${cb.body.id}`).set(author.auth).expect(200);
    expect(mine.body).toMatchObject({ moderationStatus: 'rejected', visibility: 'private', canEdit: true });
    const after = await http().get('/v1/admin/moderation').set(admin.auth).expect(200);
    expect(after.body.dishes.some((d: { id: string }) => d.id === dishId)).toBe(false);

    // Ommaviy taom mazmuni o'zgarsa — qayta moderatsiyaga tushadi
    await http().patch(`/v1/dishes/${dishId}`).set(author.auth).send({ title: 'Uy palovi 2' }).expect(200);
    await http().get(`/v1/dishes/${dishId}`).set(stranger.auth).expect(404);
    await http().post(`/v1/admin/moderation/dishes/${dishId}/approve`).set(admin.auth).expect(201);
  });

  it('cookbookni tahrirlash va o‘chirish; taomni o‘chirish', async () => {
    const cb = await http()
      .post('/v1/cookbooks')
      .set(author.auth)
      .send({ title: 'Qisqa reja', meals: [{ dayIndex: 0, mealType: 'dinner', dishIds: [dishId] }] })
      .expect(201);
    const id = cb.body.id;
    await http().patch(`/v1/cookbooks/${id}`).set(mate.auth).send({ title: 'x' }).expect(403);
    const upd = await http()
      .patch(`/v1/cookbooks/${id}`)
      .set(author.auth)
      .send({
        title: 'Uzun reja',
        meals: [
          { dayIndex: 0, mealType: 'dinner', dishIds: [dishId] },
          { dayIndex: 2, mealType: 'lunch', dishIds: [dishId] },
        ],
      })
      .expect(200);
    expect(upd.body).toMatchObject({ title: 'Uzun reja', days: 3 });
    expect(upd.body.meals).toHaveLength(2);
    await http()
      .patch(`/v1/cookbooks/${id}`)
      .set(author.auth)
      .send({ meals: [{ dayIndex: 0, mealType: 'dinner', dishIds: ['018f0000-0000-7000-8000-000000000000'] }] })
      .expect(400);

    // Cookbook guruhga qo'llangan bo'lsa ham o'chiriladi — reja va mahallar qoladi
    const plan = await http().post(`/v1/groups/${groupId}/plans`).set(author.auth).send({ cookbookId: id, weekStart: '2031-03-03' }).expect(201);
    expect(plan.body.created).toBe(2);
    await http().delete(`/v1/cookbooks/${id}`).set(mate.auth).expect(403);
    await http().delete(`/v1/cookbooks/${id}`).set(author.auth).expect(200);
    await http().get(`/v1/cookbooks/${id}`).set(author.auth).expect(404);
    expect((await http().get('/v1/cookbooks').set(author.auth).expect(200)).body.some((c: { id: string }) => c.id === id)).toBe(false);
    const meals = await http().get(`/v1/groups/${groupId}/meals`).query({ from: '2031-03-03', to: '2031-03-09' }).set(author.auth).expect(200);
    expect(meals.body).toHaveLength(2);

    // Taom o'chirilgach katalogda yo'q, rejalashtirilgan mahalda nomi saqlanadi
    await http().delete(`/v1/dishes/${dishId}`).set(author.auth).expect(200);
    await http().get(`/v1/dishes/${dishId}`).set(author.auth).expect(404);
    await http().delete(`/v1/dishes/${dishId}`).set(author.auth).expect(404);
    expect((await http().get('/v1/dishes').query({ q: 'Uy palovi' }).set(author.auth).expect(200)).body).toHaveLength(0);
    const still = await http().get(`/v1/groups/${groupId}/meals`).query({ from: '2031-03-03', to: '2031-03-09' }).set(author.auth).expect(200);
    expect(still.body[0].dishes[0].title).toBe('Uy palovi 2');
  });
});
