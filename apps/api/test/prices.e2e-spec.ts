/**
 * Narxlar: kunlik sinxronlash (qayta urinishlar bilan), tarix, GET /prices, Excel yuklash, guruh narxi.
 * Manba soxta adapter bilan almashtiriladi — testlar tashqi saytga murojaat qilmaydi.
 */
import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, inArray, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DB, Db } from '../src/common/infra.module';
import { ingredients, priceSnapshots, priceSyncRuns } from '../src/db/schema';
import { PRICE_SOURCE, parseApiResponse, PriceItem, PriceSource } from '../src/modules/prices/price-source';
import { PricesService } from '../src/modules/prices/prices.module';
import { addDays, localDate, weekMonday } from '../src/domain/schedule';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixture = require('./fixtures/prices-api.json');

process.env.AUTH_TEST_PHONES = '*';
process.env.AUTH_TEST_CODE = '111111';
process.env.MEAL_LOCK_POLLER = 'off';
process.env.PRICES_SYNC_ENABLED = 'off';
process.env.TELEGRAM_BOT_USERNAME = 'taomdosh_bot';

class FakeSource implements PriceSource {
  readonly id = 'api' as const;
  calls = 0;
  fail = false;
  async fetch(): Promise<PriceItem[]> {
    this.calls++;
    if (this.fail) throw new Error('http_503');
    return parseApiResponse(fixture);
  }
}

// Kelajakdagi sanalar — haqiqiy ma'lumotga aralashmaydi; oxirida tozalanadi
const DAY1 = '2031-03-03';
const DAY2 = '2031-03-04';
const utc = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00Z`); // 08:00 Toshkent = 03:00 UTC

describe('Narxlar (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  let svc: PricesService;
  const source = new FakeSource();
  const http = () => request(app.getHttpServer());

  async function login(name: string) {
    const phone = `+99890${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    await http().post('/v1/auth/request-code').send({ phone }).expect(200);
    const res = await http().post('/v1/auth/verify').send({ phone, code: '111111', name }).expect(200);
    return { id: res.body.user.id as string, phone, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
  }

  const cleanup = async () => {
    await db.delete(priceSnapshots).where(inArray(priceSnapshots.date, [DAY1, DAY2]));
    await db.delete(priceSyncRuns).where(inArray(priceSyncRuns.date, [DAY1, DAY2]));
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PRICE_SOURCE).useValue(source).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    db = app.get(DB);
    svc = app.get(PricesService);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('08:00 dan oldin so‘rov yuborilmaydi', async () => {
    expect(await svc.syncIfDue(utc(DAY1, '02:30'))).toBe('skipped');
    expect(source.calls).toBe(0);
  });

  it('xatoda 15 daqiqadan 2 marta qayta urinadi, keyin kunni tashlab ketadi', async () => {
    source.fail = true;
    expect(await svc.syncIfDue(utc(DAY1, '03:00'))).toBe('retry');
    expect(await svc.syncIfDue(utc(DAY1, '03:05'))).toBe('skipped'); // 15 daqiqa o'tmagan
    expect(await svc.syncIfDue(utc(DAY1, '03:15'))).toBe('retry');
    expect(await svc.syncIfDue(utc(DAY1, '03:30'))).toBe('failed');
    expect(await svc.syncIfDue(utc(DAY1, '09:00'))).toBe('skipped');
    expect(source.calls).toBe(3);
    const [run] = await db.select().from(priceSyncRuns).where(eq(priceSyncRuns.date, DAY1));
    expect(run).toMatchObject({ status: 'failed', attempts: 3, error: 'http_503' });
    expect(await db.select().from(priceSnapshots).where(eq(priceSnapshots.date, DAY1))).toHaveLength(0);
  });

  it('server kech yonsa — o‘sha kun uchun bir marta oladi va tarixga yozadi', async () => {
    source.fail = false;
    source.calls = 0;
    expect(await svc.syncIfDue(utc(DAY2, '11:40'))).toBe('ok');
    expect(await svc.syncIfDue(utc(DAY2, '11:41'))).toBe('skipped');
    expect(await svc.syncIfDue(utc(DAY2, '15:00'))).toBe('skipped');
    expect(source.calls).toBe(1);
    const rows = await db.select().from(priceSnapshots).where(eq(priceSnapshots.date, DAY2));
    expect(rows).toHaveLength(30);
    expect(rows.find((r) => r.productId === 10)).toMatchObject({ name: 'Tuxum', unit: 'pcs', unitQty: 10, price: 12692, prevPrice: 12574 });
  });

  it('GET /prices — oxirgi narxlar sanasi bilan, manba ko‘rsatilmaydi', async () => {
    const u = await login('Narx');
    await http().get('/v1/prices').expect(401);
    const res = await http().get('/v1/prices').set(u.auth).expect(200);
    expect(res.body.date).toBe(DAY2);
    expect(res.body.items).toHaveLength(30);
    const beef = res.body.items.find((i: { productId: number }) => i.productId === 34);
    expect(beef).toMatchObject({ name: 'Mol go‘shti', unit: 'kg', unitQty: 1, price: 125711, date: DAY2 });
    expect(beef.ingredientIds.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(res.body)).not.toMatch(/narxtahlil|source/i);
  });

  it('masalliq narxi: bozor narxi, guruh narxi ustun', async () => {
    const u = await login('Guruh');
    const g = await http().post('/v1/groups').set(u.auth).send({ name: 'Narx guruhi', type: 'students' }).expect(201);
    const ing = await db.select().from(ingredients).where(inArray(ingredients.slug, ['egg', 'cumin', 'salt']));
    const id = (slug: string) => ing.find((i) => i.slug === slug)!.id;
    let p = await svc.pricesFor([id('egg'), id('cumin')], g.body.id);
    expect(p.get(id('egg'))).toMatchObject({ source: 'market', date: DAY2 });
    expect(p.get(id('egg'))!.perGram).toBeCloseTo(12692 / 550, 3);
    expect(p.has(id('cumin'))).toBe(false); // bozor narxi yo'q

    await http().put(`/v1/groups/${g.body.id}/prices/${id('cumin')}`).set(u.auth).send({ price: 120000 }).expect(200);
    await http().put(`/v1/groups/${g.body.id}/prices/${id('egg')}`).set(u.auth).send({ price: 15000, unit: 'pcs', unitQty: 10 }).expect(200);
    // "dona" narxi — dona og'irligi noma'lum masalliqda rad etiladi
    await http().put(`/v1/groups/${g.body.id}/prices/${id('salt')}`).set(u.auth).send({ price: 500, unit: 'pcs' }).expect(400);
    p = await svc.pricesFor([id('egg'), id('cumin')], g.body.id);
    expect(p.get(id('cumin'))).toMatchObject({ source: 'group', perGram: 120 });
    expect(p.get(id('egg'))).toMatchObject({ source: 'group' });
    const list = await http().get(`/v1/groups/${g.body.id}/prices`).set(u.auth).expect(200);
    expect(list.body).toHaveLength(2);
    // boshqa guruh a'zosi ko'ra olmaydi
    const other = await login('Begona');
    await http().get(`/v1/groups/${g.body.id}/prices`).set(other.auth).expect(404);
  });

  it('xarid ro‘yxatida taxminiy narx, jami summa va haftalik reja xarajati', async () => {
    const u = await login('Xaridor');
    const g = await http().post('/v1/groups').set(u.auth).send({ name: 'Xarid guruhi', type: 'students' }).expect(201);
    const gid = g.body.id as string;
    const cbs = await http().get('/v1/cookbooks').set(u.auth).expect(200);
    const cb = cbs.body.find((x: { slug: string }) => x.slug === 'talaba_hamyoni');
    const monday = addDays(weekMonday(localDate(new Date(), 'Asia/Tashkent')), 7);
    const plan = await http().post(`/v1/groups/${gid}/plans`).set(u.auth).send({ cookbookId: cb.id, weekStart: monday }).expect(201);

    type Row = { ingredientId: string; name: string; qtyG: number; estCost: number | null; priceSource: string | null; unitPrice: object | null };
    const list = await http().post(`/v1/groups/${gid}/shopping/regenerate`).set(u.auth).send({ from: monday, to: addDays(monday, 6) }).expect(201);
    const rows = list.body as Row[];
    const priced = rows.filter((r) => r.estCost !== null);
    const unpriced = rows.filter((r) => r.estCost === null);
    expect(priced.length).toBeGreaterThan(5);
    expect(unpriced.length).toBeGreaterThan(0);
    expect(priced.every((r) => r.priceSource === 'market' && r.estCost! > 0 && r.estCost! % 100 === 0)).toBe(true);
    expect(unpriced.every((r) => r.priceSource === null && r.unitPrice === null)).toBe(true);

    const est = await http().get(`/v1/groups/${gid}/shopping/estimate`).set(u.auth).expect(200);
    expect(est.body.asOf).toBe(DAY2);
    expect(est.body.total).toBe(priced.reduce((s, r) => s + r.estCost!, 0));
    expect(est.body.itemsCount).toBe(rows.length);
    expect(est.body.missing).toHaveLength(unpriced.length);

    // Narxi topilmagan masalliqqa guruh o'z narxini kiritadi — keyingi safar shu ishlatiladi
    const m = unpriced[0];
    await http().put(`/v1/groups/${gid}/prices/${m.ingredientId}`).set(u.auth).send({ price: 50000 }).expect(200);
    const again = (await http().get(`/v1/groups/${gid}/shopping`).set(u.auth).expect(200)).body as Row[];
    const row = again.find((r) => r.ingredientId === m.ingredientId)!;
    expect(row.priceSource).toBe('group');
    expect(row.estCost).toBe(Math.round((m.qtyG * 50) / 100) * 100);
    const est2 = await http().get(`/v1/groups/${gid}/shopping/estimate`).set(u.auth).expect(200);
    expect(est2.body.missing).toHaveLength(unpriced.length - 1);
    expect(est2.body.total).toBe(est.body.total + row.estCost!);

    // Haftalik reja: guruh va bir kishi hisobiga
    const pe = await http().get(`/v1/groups/${gid}/plans/${plan.body.plan.id}/estimate`).set(u.auth).expect(200);
    expect(pe.body).toMatchObject({ mealsCount: 21, people: 1, asOf: DAY2, weekStart: monday });
    expect(pe.body.total).toBeGreaterThan(0);
    expect(pe.body.perPerson).toBe(pe.body.total);
    const friend = await login('Sherik');
    await http().post('/v1/groups/join').set(friend.auth).send({ inviteCode: g.body.inviteCode });
    const pe2 = await http().get(`/v1/groups/${gid}/plans/${plan.body.plan.id}/estimate`).set(friend.auth).expect(200);
    expect(pe2.body.people).toBe(2);
    expect(pe2.body.total).toBeGreaterThan(pe.body.total);
    expect(pe2.body.perPerson).toBeLessThan(pe2.body.total);
    await http().get(`/v1/groups/${gid}/plans/${gid}/estimate`).set(u.auth).expect(404);
    await db.execute(sql`delete from groups where id = ${gid}`);
  });

  it('admin Excel faylni yuklaydi; oddiy foydalanuvchiga taqiq', async () => {
    const admin = await login('Admin');
    const user = await login('Oddiy');
    process.env.ADMIN_PHONES = `+998000000000, ${admin.phone}`;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Narxlar');
    ws.addRow(['Mahsulot', 'Birlik', 'Narx']);
    ws.addRow(['Mol go‘shti', '1 kg', 130000]);
    ws.addRow(['Tuxum (10 dona)', '', 13000]);
    ws.addRow(['Noma’lum mahsulot', '1 kg', 999]);
    const file = Buffer.from(await wb.xlsx.writeBuffer());

    await http().post('/v1/admin/prices/import').set(user.auth).attach('file', file, 'narx.xlsx').expect(403);
    await http().post('/v1/admin/prices/import').set(admin.auth).expect(400);
    await http().post('/v1/admin/prices/import').set(admin.auth).attach('file', Buffer.from('xlsx emas'), 'x.xlsx').expect(400);
    const res = await http().post('/v1/admin/prices/import').set(admin.auth).attach('file', file, 'narx.xlsx').expect(201);
    expect(res.body).toMatchObject({ rows: 3, saved: 2, skipped: 1 });
    const today = res.body.date as string;
    const rows = await db.select().from(priceSnapshots).where(eq(priceSnapshots.date, today));
    expect(rows.find((r) => r.productId === 34)).toMatchObject({ price: 130000, source: 'excel' });
    expect(rows.find((r) => r.productId === 10)).toMatchObject({ price: 13000, unit: 'pcs', unitQty: 10 });
    // bugungi sinov yozuvlarini tozalash
    await db.delete(priceSnapshots).where(eq(priceSnapshots.date, today));
    await db.delete(priceSyncRuns).where(eq(priceSyncRuns.date, today));
  });
});
