import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, errorText, setTokens, Tokens } from '../api';
import { Button } from '../ui';

type Step = 'choose' | 'telegram' | 'phone' | 'code';

/** Kirish: @taomdosh_bot orqali (asosiy) yoki telefon + kod (zaxira) */
export function LoginPage({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('choose');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tg, setTg] = useState<{ token: string; url: string } | null>(null);
  const [phone, setPhone] = useState('+998');
  const [code, setCode] = useState('');
  const poll = useRef<number | undefined>(undefined);

  const finish = (t: Tokens) => {
    setTokens({ accessToken: t.accessToken, refreshToken: t.refreshToken });
    onDone();
  };

  useEffect(() => () => window.clearInterval(poll.current), []);

  const startTelegram = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ token: string; url: string }>('/auth/telegram/start', { method: 'POST', auth: false });
      setTg(r);
      setStep('telegram');
      window.open(r.url, '_blank', 'noopener');
      window.clearInterval(poll.current);
      poll.current = window.setInterval(async () => {
        try {
          const c = await api<{ status: string } & Partial<Tokens>>('/auth/telegram/check', {
            method: 'POST',
            auth: false,
            body: { token: r.token, deviceName: 'Admin panel (veb)' },
          });
          if (c.status === 'ok') {
            window.clearInterval(poll.current);
            finish(c as Tokens);
          }
        } catch (e) {
          window.clearInterval(poll.current);
          setError(errorText(e));
          setStep('choose');
        }
      }, 2500);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/auth/request-code', { method: 'POST', auth: false, body: { phone: phone.replace(/\s/g, '') } });
      setStep('code');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      finish(await api<Tokens>('/auth/verify', { method: 'POST', auth: false, body: { phone: phone.replace(/\s/g, ''), code: code.trim(), deviceName: 'Admin panel (veb)' } }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-art" aria-hidden>
        <div className="plate">
          <span />
        </div>
        <h2>Taomdosh</h2>
        <p>Platforma boshqaruvi: moderatsiya, katalog, narxlar va foydalanuvchilar.</p>
      </div>
      <div className="login-card">
        <h1>Admin panelga kirish</h1>
        <p className="muted">Faqat platforma adminlari uchun.</p>

        {step === 'choose' && (
          <div className="stack">
            <Button kind="primary" onClick={startTelegram} disabled={busy}>
              <svg viewBox="0 0 24 24" aria-hidden className="tg">
                <path d="M21 4 3 11l6 2 2 6 3-4 5 4z" />
              </svg>
              Telegram (@taomdosh_bot) orqali kirish
            </Button>
            <Button kind="ghost" onClick={() => setStep('phone')}>
              Telefon raqam va kod bilan
            </Button>
          </div>
        )}

        {step === 'telegram' && tg && (
          <div className="stack">
            <div className="hint-box">
              Botda <b>Start</b> ni bosing va <b>«Raqamni yuborish»</b> tugmasi bilan raqamingizni yuboring. Tasdiqlangach, sahifa o'zi ochiladi.
            </div>
            <a className="btn primary" href={tg.url} target="_blank" rel="noopener">
              Botni ochish
            </a>
            <div className="waiting">
              <span className="dot-pulse" /> Bot tasdig'i kutilmoqda…
            </div>
            <Button kind="ghost" onClick={() => (window.clearInterval(poll.current), setStep('choose'))}>
              Orqaga
            </Button>
          </div>
        )}

        {step === 'phone' && (
          <form className="stack" onSubmit={requestCode}>
            <label className="field">
              Telefon raqam
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoFocus required />
            </label>
            <Button kind="primary" type="submit" disabled={busy}>
              Kod yuborish
            </Button>
            <Button kind="ghost" onClick={() => setStep('choose')}>
              Orqaga
            </Button>
          </form>
        )}

        {step === 'code' && (
          <form className="stack" onSubmit={verify}>
            <p className="muted">
              Kod <b>{phone}</b> raqamiga Telegram orqali yuborildi.
            </p>
            <label className="field">
              Tasdiqlash kodi
              <input className="input code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={8} autoFocus required />
            </label>
            <Button kind="primary" type="submit" disabled={busy}>
              Kirish
            </Button>
            <Button kind="ghost" onClick={() => setStep('phone')}>
              Raqamni o'zgartirish
            </Button>
          </form>
        )}

        {error && <div className="form-error">{error}</div>}
      </div>
    </div>
  );
}
