import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Ip,
  Injectable,
  Logger,
  Module,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { and, eq, gt, isNull } from 'drizzle-orm';
import Redis from 'ioredis';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Public } from '../../common/auth';
import { Db, InjectDb, InjectRedis } from '../../common/infra.module';
import { refreshTokens, users } from '../../db/schema';
import { normalizeLocale } from '../../domain/i18n';
import { TelegramBotService, TG_LOGIN_TTL_SEC } from './telegram-bot.service';

const CODE_TTL_SEC = 300; // kod 5 daqiqa amal qiladi
const RESEND_COOLDOWN_SEC = 60;
const MAX_SENDS_PER_PHONE_HOUR = 5;
const MAX_SENDS_PER_IP_HOUR = 20;
const MAX_VERIFY_ATTEMPTS = 5;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Telefon raqamini E.164 ga keltiradi: "90 123 45 67" → "+998901234567" (O'zbekiston standart). */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 9) return `+998${digits}`;
  return `+${digits}`;
}

// ───────────────────── Telegram Gateway ─────────────────────

/** https://core.telegram.org/gateway/api — tasdiqlash kodini Telegram orqali yuborish */
@Injectable()
export class TelegramGatewayService {
  private readonly log = new Logger('TelegramGateway');
  constructor(private readonly cfg: ConfigService) {}

  get enabled(): boolean {
    return !!this.cfg.get('TELEGRAM_GATEWAY_TOKEN');
  }

  async sendCode(phone: string, code: string): Promise<void> {
    const token = this.cfg.get<string>('TELEGRAM_GATEWAY_TOKEN');
    if (!token) {
      // Token yo'q — ishlab chiqish rejimi: kodni logga yozamiz
      this.log.warn(`TELEGRAM_GATEWAY_TOKEN yo'q. ${phone} uchun kod: ${code}`);
      return;
    }
    const res = await fetch('https://gatewayapi.telegram.org/sendVerificationMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phone, code, ttl: CODE_TTL_SEC }),
    }).catch((e) => {
      this.log.error(`Gateway so'rovi bajarilmadi: ${e}`);
      return null;
    });
    const json = res ? ((await res.json().catch(() => null)) as { ok: boolean; error?: string } | null) : null;
    if (!json?.ok) {
      this.log.error(`Gateway xatosi: ${json?.error ?? res?.status}`);
      // PHONE_NUMBER_NOT_FOUND va h.k. — raqamda Telegram yo'q
      throw new ServiceUnavailableException(json?.error === 'PHONE_NUMBER_INVALID' ? 'phone_invalid' : 'code_send_failed');
    }
  }
}

// ───────────────────── DTO ─────────────────────

class RequestCodeDto {
  @IsString()
  @Matches(/^\+?[\d\s()-]{9,20}$/)
  phone: string;
}

class VerifyCodeDto {
  @IsString()
  @Matches(/^\+?[\d\s()-]{9,20}$/)
  phone: string;

  @IsString()
  @Length(4, 8)
  code: string;

  /** Yangi foydalanuvchi uchun ism (birinchi kirishda) */
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  deviceName?: string;
}

class TelegramCheckDto {
  @IsString()
  @Length(10, 64)
  token: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  deviceName?: string;
}

class RefreshDto {
  @IsString()
  refreshToken: string;
}

// ───────────────────── Service ─────────────────────

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectRedis() private readonly redis: Redis,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly gateway: TelegramGatewayService,
    private readonly bot: TelegramBotService,
  ) {}

  private isTestPhone(phone: string): boolean {
    const list = (this.cfg.get<string>('AUTH_TEST_PHONES') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return list.includes('*') || list.includes(phone);
  }

  private async hit(key: string, ttl: number): Promise<number> {
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, ttl);
    return n;
  }

  async requestCode(rawPhone: string, ip: string) {
    const phone = normalizePhone(rawPhone);
    if (!/^\+\d{10,15}$/.test(phone)) throw new BadRequestException('phone_invalid');
    if (await this.redis.get(`otp:cooldown:${phone}`)) throw new BadRequestException('too_soon');
    if ((await this.hit(`otp:rate:phone:${phone}`, 3600)) > MAX_SENDS_PER_PHONE_HOUR) throw new BadRequestException('too_many_requests');
    if ((await this.hit(`otp:rate:ip:${ip}`, 3600)) > MAX_SENDS_PER_IP_HOUR) throw new BadRequestException('too_many_requests');

    const test = this.isTestPhone(phone);
    const code = test ? this.cfg.get<string>('AUTH_TEST_CODE') ?? '111111' : String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!test) await this.gateway.sendCode(phone, code);

    await this.redis.set(`otp:code:${phone}`, sha256(code), 'EX', CODE_TTL_SEC);
    await this.redis.del(`otp:attempts:${phone}`);
    await this.redis.set(`otp:cooldown:${phone}`, '1', 'EX', RESEND_COOLDOWN_SEC);

    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
    return { phone, expiresIn: CODE_TTL_SEC, resendIn: RESEND_COOLDOWN_SEC, isNewUser: !existing, channel: 'telegram' };
  }

  async verifyCode(dto: VerifyCodeDto) {
    const phone = normalizePhone(dto.phone);
    const stored = await this.redis.get(`otp:code:${phone}`);
    if (!stored) throw new UnauthorizedException('code_expired');
    if ((await this.hit(`otp:attempts:${phone}`, CODE_TTL_SEC)) > MAX_VERIFY_ATTEMPTS) {
      await this.redis.del(`otp:code:${phone}`);
      throw new UnauthorizedException('too_many_attempts');
    }
    const ok = timingSafeEqual(Buffer.from(stored), Buffer.from(sha256(dto.code.trim())));
    if (!ok) throw new UnauthorizedException('code_invalid');
    await this.redis.del(`otp:code:${phone}`, `otp:attempts:${phone}`);

    return this.loginByPhone(phone, dto.name, dto.locale, dto.deviceName);
  }

  /** Tasdiqlangan raqam bilan kirish: foydalanuvchi bo'lmasa — yaratiladi */
  private async loginByPhone(phone: string, name: string | undefined, locale: string | undefined, deviceName: string | undefined) {
    let [user] = await this.db.select().from(users).where(eq(users.phone, phone));
    const isNew = !user;
    if (!user) {
      [user] = await this.db
        .insert(users)
        .values({ phone, name: name?.trim() || 'Foydalanuvchi', locale: normalizeLocale(locale) })
        .returning();
    }
    if (user.status !== 'active') throw new UnauthorizedException('account_blocked');
    return { ...(await this.issueTokens(user.id, user.locale, deviceName)), user, isNewUser: isNew };
  }

  // ─────────── Telegram bot orqali kirish (bepul) ───────────

  /** Bir martalik token va bot havolasi */
  async startTelegram(ip: string) {
    const bot = this.bot.username;
    if (!bot) throw new ServiceUnavailableException('telegram_bot_disabled');
    if ((await this.hit(`tg:rate:ip:${ip}`, 3600)) > 60) throw new BadRequestException('too_many_requests');
    const token = randomBytes(18).toString('base64url');
    await this.bot.createLogin(token);
    return { token, url: `https://t.me/${bot}?start=${token}`, expiresIn: TG_LOGIN_TTL_SEC };
  }

  /** Ilova shu so'rovni bir necha soniyada bir yuboradi: bot tasdiqlaguncha "pending" */
  async checkTelegram(dto: TelegramCheckDto) {
    const login = await this.bot.getLogin(dto.token);
    if (!login) throw new UnauthorizedException('login_expired');
    if (login.status !== 'confirmed' || !login.phone) return { status: 'pending' as const };
    await this.bot.consumeLogin(dto.token);
    return { status: 'ok' as const, ...(await this.loginByPhone(login.phone, login.name, dto.locale, dto.deviceName)) };
  }

  async refresh(token: string) {
    const hash = sha256(token);
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())));
    if (!row) throw new UnauthorizedException('refresh_invalid');
    // Aylanma tokenlar: eskisi bekor qilinadi
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
    const [user] = await this.db.select().from(users).where(eq(users.id, row.userId));
    if (!user || user.status !== 'active') throw new UnauthorizedException('account_blocked');
    return this.issueTokens(user.id, user.locale, row.deviceName ?? undefined);
  }

  async logout(token: string) {
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, sha256(token)));
    return { ok: true };
  }

  private async issueTokens(userId: string, locale: string, deviceName?: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, loc: locale, typ: 'access' },
      { expiresIn: (this.cfg.get('JWT_ACCESS_TTL') ?? '15m') as never },
    );
    const refreshToken = randomBytes(32).toString('base64url');
    const days = Number(this.cfg.get('JWT_REFRESH_TTL_DAYS') ?? 30);
    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash: sha256(refreshToken),
      deviceName,
      expiresAt: new Date(Date.now() + days * 86_400_000),
    });
    return { accessToken, refreshToken };
  }
}

// ───────────────────── Controller ─────────────────────

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Telegram orqali tasdiqlash kodini yuborish */
  @Post('request-code')
  @HttpCode(200)
  requestCode(@Body() dto: RequestCodeDto, @Ip() ip: string) {
    return this.auth.requestCode(dto.phone, ip);
  }

  /** Kodni tekshirish → access + refresh token (yangi raqam bo'lsa — hisob yaratiladi) */
  @Post('verify')
  @HttpCode(200)
  verify(@Body() dto: VerifyCodeDto) {
    return this.auth.verifyCode(dto);
  }

  /** Telegram bot orqali kirishni boshlash → t.me havolasi */
  @Post('telegram/start')
  @HttpCode(200)
  telegramStart(@Ip() ip: string) {
    return this.auth.startTelegram(ip);
  }

  /** Bot tasdiqladimi? → pending yoki tokenlar */
  @Post('telegram/check')
  @HttpCode(200)
  telegramCheck(@Body() dto: TelegramCheckDto) {
    return this.auth.checkTelegram(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }
}

@Module({
  controllers: [AuthController],
  providers: [AuthService, TelegramGatewayService, TelegramBotService],
  exports: [TelegramBotService],
})
export class AuthModule {}
