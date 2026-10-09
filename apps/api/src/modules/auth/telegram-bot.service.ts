/**
 * Telegram bot orqali bepul kirish (@taomdosh_bot):
 *   1. Ilova POST /auth/telegram/start → bir martalik token va t.me/<bot>?start=<token> havolasi
 *   2. Foydalanuvchi botda Start bosadi; bot raqamini so'raydi ("Raqamni yuborish" tugmasi)
 *   3. Raqam kelgach token "tasdiqlandi" bo'ladi; ilova POST /auth/telegram/check bilan kiradi
 * Raqami ma'lum foydalanuvchi keyingi safar faqat Start bosadi.
 *
 * Yangilanishlar long polling (getUpdates) bilan olinadi — ochiq URL yoki webhook kerak emas.
 * Bir vaqtda faqat bitta API nusxasi polling qilishi kerak (MVP da bitta konteyner).
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { InjectRedis } from '../../common/infra.module';

export const TG_LOGIN_TTL_SEC = 600; // havola 10 daqiqa amal qiladi
const API = 'https://api.telegram.org';

export interface TgLogin {
  status: 'pending' | 'confirmed';
  phone?: string;
  name?: string;
}

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    from?: TgUser;
    text?: string;
    contact?: { phone_number: string; user_id?: number; first_name?: string; last_name?: string };
  };
}

/** Bot matnlari: rus tilidagi Telegram uchun ruscha, qolganiga o'zbekcha */
const TEXTS = {
  uz: {
    askContact: 'Taomdosh’ga kirish uchun pastdagi “Raqamni yuborish” tugmasini bosing.',
    button: 'Raqamni yuborish',
    confirmed: 'Tasdiqlandi ✅ Ilovaga qayting — kirish avtomatik bo‘ladi.',
    expired: 'Havola eskirgan. Ilovada “Telegram orqali kirish” tugmasini qaytadan bosing.',
    hello: 'Assalomu alaykum! Kirish uchun Taomdosh ilovasida “Telegram orqali kirish” tugmasini bosing.',
    notOwn: 'Iltimos, o‘zingizning raqamingizni tugma orqali yuboring.',
    saved: 'Raqamingiz saqlandi. Endi ilovada “Telegram orqali kirish” tugmasini bosing.',
  },
  ru: {
    askContact: 'Чтобы войти в Taomdosh, нажмите кнопку «Отправить номер» ниже.',
    button: 'Отправить номер',
    confirmed: 'Подтверждено ✅ Вернитесь в приложение — вход произойдёт автоматически.',
    expired: 'Ссылка устарела. Нажмите «Войти через Telegram» в приложении ещё раз.',
    hello: 'Здравствуйте! Чтобы войти, нажмите «Войти через Telegram» в приложении Taomdosh.',
    notOwn: 'Пожалуйста, отправьте свой номер кнопкой.',
    saved: 'Номер сохранён. Теперь нажмите «Войти через Telegram» в приложении.',
  },
};

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('TelegramBot');
  private stopped = false;
  private readonly inflight = new Set<AbortController>();
  private botUsername: string | undefined;

  constructor(
    private readonly cfg: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  private get token() {
    return this.cfg.get<string>('TELEGRAM_BOT_TOKEN') || undefined;
  }

  /** Bot nomi (havola uchun): getMe dan yoki TELEGRAM_BOT_USERNAME dan */
  get username(): string | undefined {
    return this.botUsername ?? (this.cfg.get<string>('TELEGRAM_BOT_USERNAME') || undefined);
  }

  async onModuleInit() {
    if (!this.token || this.cfg.get('TELEGRAM_BOT_POLLING') === 'off') return;
    const me = await this.call<{ username: string }>('getMe').catch(() => null);
    if (!me) {
      this.log.error('TELEGRAM_BOT_TOKEN noto‘g‘ri yoki Telegram bilan aloqa yo‘q — bot o‘chiq');
      return;
    }
    this.botUsername = me.username;
    // Webhook o'rnatilgan bo'lsa, getUpdates ishlamaydi
    await this.call('deleteWebhook').catch(() => null);
    this.log.log(`@${me.username} ishga tushdi`);
    void this.poll();
  }

  onModuleDestroy() {
    this.stopped = true;
    for (const c of this.inflight) c.abort();
  }

  private async poll() {
    let offset = 0;
    while (!this.stopped) {
      try {
        const updates = await this.call<TgUpdate[]>('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 35_000);
        for (const u of updates) {
          offset = u.update_id + 1;
          await this.handleUpdate(u).catch((e) => this.log.error(`Xabarni qayta ishlashda xato: ${e}`));
        }
      } catch (e) {
        if (this.stopped) return;
        this.log.warn(`getUpdates: ${e}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  private async call<T = unknown>(method: string, body: object = {}, timeoutMs = 15_000): Promise<T> {
    const ctrl = new AbortController();
    this.inflight.add(ctrl);
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${API}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = (await res.json()) as { ok: boolean; result: T; description?: string };
      if (!json.ok) throw new Error(json.description ?? `HTTP ${res.status}`);
      return json.result;
    } finally {
      clearTimeout(timer);
      this.inflight.delete(ctrl);
    }
  }

  private async send(chatId: number, text: string, replyMarkup?: object) {
    if (!this.token) return; // testlar va token yo'q holat
    await this.call('sendMessage', { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
  }

  private loginKey = (token: string) => `tg:login:${token}`;

  async createLogin(token: string) {
    await this.redis.set(this.loginKey(token), JSON.stringify({ status: 'pending' } satisfies TgLogin), 'EX', TG_LOGIN_TTL_SEC);
  }

  async getLogin(token: string): Promise<TgLogin | null> {
    const raw = await this.redis.get(this.loginKey(token));
    return raw ? (JSON.parse(raw) as TgLogin) : null;
  }

  async consumeLogin(token: string) {
    await this.redis.del(this.loginKey(token));
  }

  private async confirm(token: string, phone: string, name: string) {
    const v: TgLogin = { status: 'confirmed', phone, name };
    await this.redis.set(this.loginKey(token), JSON.stringify(v), 'KEEPTTL');
  }

  /** Bitta Telegram yangilanishini qayta ishlash (testlarda to'g'ridan-to'g'ri chaqiriladi) */
  async handleUpdate(u: TgUpdate) {
    const msg = u.message;
    if (!msg?.from) return;
    const chatId = msg.chat.id;
    const from = msg.from;
    const tx = from.language_code === 'ru' ? TEXTS.ru : TEXTS.uz;
    const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || 'Foydalanuvchi';
    const knownPhoneKey = `tg:user:${from.id}`;
    const chatTokenKey = `tg:chat:${chatId}`;

    if (msg.text?.startsWith('/start')) {
      const token = msg.text.split(/\s+/)[1];
      if (!token) return this.send(chatId, tx.hello);
      const login = await this.getLogin(token);
      if (!login || login.status !== 'pending') return this.send(chatId, tx.expired);
      const phone = await this.redis.get(knownPhoneKey);
      if (phone) {
        await this.confirm(token, phone, fullName);
        return this.send(chatId, tx.confirmed, { remove_keyboard: true });
      }
      await this.redis.set(chatTokenKey, token, 'EX', TG_LOGIN_TTL_SEC);
      return this.send(chatId, tx.askContact, {
        keyboard: [[{ text: tx.button, request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      });
    }

    if (msg.contact) {
      // Faqat o'z raqami: kontakt yuborgan odamning o'zi bo'lishi shart
      if (msg.contact.user_id !== from.id) return this.send(chatId, tx.notOwn);
      const digits = msg.contact.phone_number.replace(/\D/g, '');
      const phone = `+${digits}`;
      await this.redis.set(knownPhoneKey, phone);
      const token = await this.redis.get(chatTokenKey);
      await this.redis.del(chatTokenKey);
      const login = token ? await this.getLogin(token) : null;
      if (token && login?.status === 'pending') {
        await this.confirm(token, phone, fullName);
        return this.send(chatId, tx.confirmed, { remove_keyboard: true });
      }
      return this.send(chatId, tx.saved, { remove_keyboard: true });
    }

    return this.send(chatId, tx.hello);
  }
}
