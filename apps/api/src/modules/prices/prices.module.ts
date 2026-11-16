import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Delete,
  UploadedFile,
  UseInterceptors,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { AuthUser, CurrentUser, requireAdmin, requireMember } from '../../common/auth';
import { Db, InjectDb, InjectRedis } from '../../common/infra.module';
import { groupIngredientPrices, ingredientPriceLinks, ingredients, priceSnapshots, priceSyncRuns } from '../../db/schema';
import { Locale, normalizeLocale, uzLatinToCyrillic } from '../../domain/i18n';
import { afterFailure, nameKey, pricePerGram, PRICES_TZ, shouldSyncNow } from '../../domain/prices';
import { localDate } from '../../domain/schedule';
import type { PriceUnit } from '../../domain/units';
import { DEFAULT_SOURCE_URL, ExcelSource, NarxtahlilApiSource, PRICE_SOURCE, PriceItem, PriceSource } from './price-source';

const TICK_MS = 60_000;
const GROUP_UNITS = ['kg', 'l', 'pcs'] as const;

class GroupPriceDto {
  /** Narx (so'm) — `unitQty` `unit` uchun: masalan 1 kg, 1 litr yoki 10 dona */
  @IsInt() @Min(1) @Max(100_000_000) price: number;
  @IsOptional() @IsIn(GROUP_UNITS) unit?: (typeof GROUP_UNITS)[number];
  @IsOptional() @IsNumber() @Min(0.01) @Max(1000) unitQty?: number;
}

/** Masalliqning 1 gramm narxi va qayerdan olingani */
export interface IngredientPrice {
  perGram: number;
  source: 'market' | 'group';
  /** Bozor narxi sanasi (guruh narxida — null) */
  date: string | null;
  price: number;
  unit: PriceUnit;
  unitQty: number;
}

@Injectable()
export class PricesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Prices');
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    @InjectDb() private readonly db: Db,
    @InjectRedis() private readonly redis: Redis,
    private readonly cfg: ConfigService,
    @Inject(PRICE_SOURCE) private readonly source: PriceSource,
  ) {}

  // ─────────── kunlik sinxronlash ───────────

  private get enabled() {
    return ['on', 'true', '1'].includes(String(this.cfg.get('PRICES_SYNC_ENABLED') ?? '').toLowerCase());
  }

  onModuleInit() {
    if (!this.enabled) return;
    // Darhol bir marta: server 08:00 da o'chiq bo'lgan bo'lsa, yonganda bugungi narxlar olinadi
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.syncIfDue(new Date());
    } catch (e) {
      this.log.error('Narxlarni sinxronlashda xato', e as Error);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Vaqti kelgan bo'lsa manbaga BITTA so'rov yuboradi. Xatoda 15 daqiqadan keyin qayta urinadi
   * (ko'pi bilan 2 marta), so'ng kun tashlab ketiladi — oxirgi saqlangan narxlar ishlatilaveradi.
   * Qaytaradi: 'skipped' (vaqti emas) | 'ok' | 'retry' | 'failed'.
   */
  async syncIfDue(now: Date): Promise<'skipped' | 'ok' | 'retry' | 'failed'> {
    const date = localDate(now, PRICES_TZ);
    const [run] = await this.db.select().from(priceSyncRuns).where(eq(priceSyncRuns.date, date));
    if (!shouldSyncNow(now, run)) return 'skipped';
    // Bir nechta API nusxasi bo'lsa ham kuniga bitta so'rov ketishi uchun
    const lock = await this.redis.set(`prices:sync:${date}`, '1', 'EX', 120, 'NX');
    if (!lock) return 'skipped';
    try {
      const items = await this.source.fetch();
      const n = await this.saveSnapshots(items, date, this.source.id);
      await this.setRun(date, { status: 'ok', attempts: (run?.attempts ?? 0) + 1, nextAttemptAt: null }, this.source.id, null);
      this.log.log(`${date}: ${n} ta narx saqlandi`);
      return 'ok';
    } catch (e) {
      const next = afterFailure(now, run?.attempts ?? 0);
      await this.setRun(date, next, this.source.id, String((e as Error).message).slice(0, 300));
      this.log.warn(`${date}: narxlar olinmadi (${next.attempts}-urinish): ${(e as Error).message}`);
      return next.status as 'retry' | 'failed';
    } finally {
      await this.redis.del(`prices:sync:${date}`);
    }
  }

  private async setRun(
    date: string,
    run: { status: 'ok' | 'retry' | 'failed'; attempts: number; nextAttemptAt: Date | null },
    source: string,
    error: string | null,
  ) {
    const values = { date, ...run, source, error };
    await this.db.insert(priceSyncRuns).values(values).onConflictDoUpdate({ target: priceSyncRuns.date, set: values });
  }

  /** Kunlik natijani tarixga yozadi; shu kun uchun qayta yozilsa — yangilanadi */
  async saveSnapshots(items: PriceItem[], date: string, source: string): Promise<number> {
    const withId = items.filter((i): i is PriceItem & { productId: number } => i.productId !== null);
    const noId = items.filter((i) => i.productId === null);
    if (noId.length) {
      // Excel: mahsulot raqami yo'q — oldin saqlangan nomlar bo'yicha topamiz
      const known = await this.db
        .selectDistinctOn([priceSnapshots.productId], { productId: priceSnapshots.productId, name: priceSnapshots.name })
        .from(priceSnapshots)
        .orderBy(priceSnapshots.productId, desc(priceSnapshots.date));
      const byName = new Map(known.map((k) => [nameKey(k.name), k.productId]));
      for (const i of noId) {
        const productId = byName.get(nameKey(i.name));
        if (productId !== undefined) withId.push({ ...i, productId });
      }
    }
    const uniq = [...new Map(withId.map((i) => [i.productId, i])).values()];
    for (const i of uniq) {
      const values = { productId: i.productId, name: i.name, unit: i.unit, unitQty: i.unitQty, price: i.price, prevPrice: i.prevPrice, date, source };
      await this.db
        .insert(priceSnapshots)
        .values(values)
        .onConflictDoUpdate({ target: [priceSnapshots.productId, priceSnapshots.date], set: values });
    }
    return uniq.length;
  }

  /** Admin: Excel faylni qo'lda yuklash (zaxira yo'l) */
  async importExcel(userId: string, file: Buffer | undefined) {
    await requireAdmin(this.db, userId);
    if (!file?.length) throw new BadRequestException('file_required');
    let items: PriceItem[];
    try {
      items = await new ExcelSource(file).fetch();
    } catch (e) {
      throw new BadRequestException(`excel_invalid:${(e as Error).message}`);
    }
    const date = localDate(new Date(), PRICES_TZ);
    const saved = await this.saveSnapshots(items, date, 'excel');
    if (saved > 0) {
      const [run] = await this.db.select().from(priceSyncRuns).where(eq(priceSyncRuns.date, date));
      await this.setRun(date, { status: 'ok', attempts: run?.attempts ?? 0, nextAttemptAt: null }, 'excel', null);
    }
    return { date, rows: items.length, saved, skipped: items.length - saved };
  }

  /** Admin: navbatni kutmasdan hozir olish (bugungi holat qayta o'rnatiladi) */
  async syncNow(userId: string) {
    await requireAdmin(this.db, userId);
    const now = new Date();
    await this.db.delete(priceSyncRuns).where(eq(priceSyncRuns.date, localDate(now, PRICES_TZ)));
    const date = localDate(now, PRICES_TZ);
    try {
      const items = await this.source.fetch();
      const saved = await this.saveSnapshots(items, date, this.source.id);
      await this.setRun(date, { status: 'ok', attempts: 1, nextAttemptAt: null }, this.source.id, null);
      return { status: 'ok', date, saved };
    } catch (e) {
      await this.setRun(date, afterFailure(now, 0), this.source.id, String((e as Error).message).slice(0, 300));
      return { status: 'failed', date, saved: 0 };
    }
  }

  // ─────────── o'qish ───────────

  /** Har mahsulotning oxirgi saqlangan narxi */
  private latestSnapshots() {
    return this.db
      .selectDistinctOn([priceSnapshots.productId])
      .from(priceSnapshots)
      .orderBy(priceSnapshots.productId, desc(priceSnapshots.date));
  }

  /** GET /prices — oxirgi narxlar, sanasi bilan (manba ko'rsatilmaydi) */
  async latest(locale: Locale) {
    const rows = await this.latestSnapshots();
    const links = await this.db.select().from(ingredientPriceLinks);
    const byProduct = new Map<number, string[]>();
    for (const l of links) byProduct.set(l.productId, [...(byProduct.get(l.productId) ?? []), l.ingredientId]);
    const date = rows.reduce<string | null>((max, r) => (!max || r.date > max ? r.date : max), null);
    return {
      date,
      items: rows
        .map((r) => ({
          productId: r.productId,
          name: locale === 'uz-Cyrl' ? uzLatinToCyrillic(r.name) : r.name,
          unit: r.unit,
          unitQty: r.unitQty,
          price: r.price,
          prevPrice: r.prevPrice,
          changePct: r.prevPrice ? Math.round(((r.price - r.prevPrice) / r.prevPrice) * 1000) / 10 : null,
          date: r.date,
          ingredientIds: byProduct.get(r.productId) ?? [],
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * Masalliqlar narxi (1 gramm uchun). Ustuvorlik: guruhning o'z narxi → oxirgi bozor narxi.
   * Narxi topilmagan masalliq natijada bo'lmaydi.
   */
  async pricesFor(ingredientIds: string[], groupId?: string): Promise<Map<string, IngredientPrice>> {
    const out = new Map<string, IngredientPrice>();
    const ids = [...new Set(ingredientIds)];
    if (!ids.length) return out;
    const ings = await this.db
      .select({ id: ingredients.id, pieceWeightG: ingredients.pieceWeightG, density: ingredients.density })
      .from(ingredients)
      .where(inArray(ingredients.id, ids));
    const ingById = new Map(ings.map((i) => [i.id, i]));

    const links = await this.db.select().from(ingredientPriceLinks).where(inArray(ingredientPriceLinks.ingredientId, ids));
    if (links.length) {
      const snaps = await this.db
        .selectDistinctOn([priceSnapshots.productId])
        .from(priceSnapshots)
        .where(inArray(priceSnapshots.productId, [...new Set(links.map((l) => l.productId))]))
        .orderBy(priceSnapshots.productId, desc(priceSnapshots.date));
      const snapById = new Map(snaps.map((s) => [s.productId, s]));
      for (const l of links) {
        const s = snapById.get(l.productId);
        const ing = ingById.get(l.ingredientId);
        if (!s || !ing) continue;
        const unit = s.unit as PriceUnit;
        const perGram = pricePerGram({ price: s.price, unit, unitQty: s.unitQty }, ing);
        if (perGram) out.set(l.ingredientId, { perGram, source: 'market', date: s.date, price: s.price, unit, unitQty: s.unitQty });
      }
    }
    if (groupId) {
      const own = await this.db
        .select()
        .from(groupIngredientPrices)
        .where(and(eq(groupIngredientPrices.groupId, groupId), inArray(groupIngredientPrices.ingredientId, ids)));
      for (const g of own) {
        const ing = ingById.get(g.ingredientId);
        if (!ing) continue;
        const unit = g.unit as PriceUnit;
        const perGram = pricePerGram({ price: g.price, unit, unitQty: g.unitQty }, ing);
        if (perGram) out.set(g.ingredientId, { perGram, source: 'group', date: null, price: g.price, unit, unitQty: g.unitQty });
      }
    }
    return out;
  }

  /** Oxirgi bozor narxlari sanasi ("DD.MM holatida" uchun) */
  async latestDate(): Promise<string | null> {
    const [r] = await this.db.select({ d: sql<string | null>`max(${priceSnapshots.date})` }).from(priceSnapshots);
    return r?.d ?? null;
  }

  // ─────────── guruhning o'z narxlari ───────────

  async groupPrices(groupId: string, userId: string) {
    await requireMember(this.db, groupId, userId);
    return this.db.select().from(groupIngredientPrices).where(eq(groupIngredientPrices.groupId, groupId));
  }

  async setGroupPrice(groupId: string, userId: string, ingredientId: string, dto: GroupPriceDto) {
    await requireMember(this.db, groupId, userId);
    const [ing] = await this.db.select().from(ingredients).where(eq(ingredients.id, ingredientId));
    if (!ing) throw new BadRequestException('ingredient_not_found');
    const unit = dto.unit ?? 'kg';
    // "Dona" narxi faqat dona og'irligi ma'lum masalliqda grammga o'tadi
    if (unit === 'pcs' && !ing.pieceWeightG) throw new BadRequestException('unit_not_supported');
    const values = { groupId, ingredientId, price: dto.price, unit, unitQty: dto.unitQty ?? 1, updatedBy: userId };
    await this.db
      .insert(groupIngredientPrices)
      .values(values)
      .onConflictDoUpdate({ target: [groupIngredientPrices.groupId, groupIngredientPrices.ingredientId], set: values });
    return values;
  }

  async deleteGroupPrice(groupId: string, userId: string, ingredientId: string) {
    await requireMember(this.db, groupId, userId);
    await this.db
      .delete(groupIngredientPrices)
      .where(and(eq(groupIngredientPrices.groupId, groupId), eq(groupIngredientPrices.ingredientId, ingredientId)));
    return { ok: true };
  }
}

@ApiTags('prices')
@ApiBearerAuth()
@Controller()
export class PricesController {
  constructor(private readonly svc: PricesService) {}

  /** Oxirgi narxlar (respublika o'rtachasi), sanasi bilan */
  @Get('prices')
  latest(@CurrentUser() u: AuthUser) {
    return this.svc.latest(normalizeLocale(u.locale));
  }

  /** Admin: Excel (.xlsx) faylni qo'lda yuklash — `file` maydoni */
  @Post('admin/prices/import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importExcel(@CurrentUser() u: AuthUser, @UploadedFile() file?: { buffer: Buffer }) {
    return this.svc.importExcel(u.id, file?.buffer);
  }

  /** Admin: narxlarni hozir yangilash */
  @Post('admin/prices/sync')
  syncNow(@CurrentUser() u: AuthUser) {
    return this.svc.syncNow(u.id);
  }

  @Get('groups/:id/prices')
  groupPrices(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.groupPrices(id, u.id);
  }

  /** Guruhning o'z narxi: keyingi hisob-kitoblarda bozor narxi o'rniga shu ishlatiladi */
  @Put('groups/:id/prices/:ingredientId')
  setGroupPrice(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ingredientId', ParseUUIDPipe) ingredientId: string,
    @Body() dto: GroupPriceDto,
  ) {
    return this.svc.setGroupPrice(id, u.id, ingredientId, dto);
  }

  @Delete('groups/:id/prices/:ingredientId')
  deleteGroupPrice(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ingredientId', ParseUUIDPipe) ingredientId: string,
  ) {
    return this.svc.deleteGroupPrice(id, u.id, ingredientId);
  }
}

@Module({
  controllers: [PricesController],
  providers: [
    PricesService,
    {
      provide: PRICE_SOURCE,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): PriceSource => new NarxtahlilApiSource(cfg.get('PRICES_SOURCE_URL') || DEFAULT_SOURCE_URL),
    },
  ],
  exports: [PricesService],
})
export class PricesModule {}
