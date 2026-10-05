import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button, Card, ErrorBox, Field, Input, Notice } from '../components/ui';
import { otpStart, otpVerify, signInGoogle, signOut } from '../lib/api';
import { useAuth } from '../lib/auth';

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';

interface GoogleId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
}
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

function useGoogleButton(onCredential: (idToken: string) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const render = () => {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => cb.current(r.credential) });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', text: 'signin_with', width: 280 });
    };
    if (window.google) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, []);
  return ref;
}

/** Same sign-in as the app: Google (ID token -> /v1/auth/google) or mobile OTP. Your role is read from the server after sign-in. */
export default function Login() {
  const { me, load } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function finish(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      await signOut();
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const gRef = useGoogleButton((idToken) => void finish(() => signInGoogle(idToken)));

  if (me) return <Navigate to="/" replace />;
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Notra <span className="text-accent">Admin</span></h1>
          <p className="mt-1 text-sm text-muted">Sign in with the account that was given staff access.</p>
        </div>
        <Card>
          <div className="space-y-4">
            {GOOGLE_CLIENT_ID && (
              <div>
                <div ref={gRef} className="flex justify-center" aria-label="Sign in with Google" />
                <p className="my-3 text-center text-xs text-muted">or</p>
              </div>
            )}
            {!sent ? (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void (async () => { setBusy(true); setError(null); try { await otpStart(phone); setSent(true); } catch (er) { setError(er); } finally { setBusy(false); } })(); }}>
                <Field label="Mobile number" hint="We send a one-time code by SMS.">
                  <Input inputMode="numeric" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </Field>
                <Button type="submit" variant="primary" className="w-full" disabled={busy || phone.replace(/\D/g, '').length < 10}>Send code</Button>
              </form>
            ) : (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void finish(() => otpVerify(phone, code)); }}>
                <Field label="6-digit code">
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
                </Field>
                <Button type="submit" variant="primary" className="w-full" disabled={busy || code.length !== 6}>Sign in</Button>
                <Button variant="ghost" className="w-full" onClick={() => { setSent(false); setCode(''); }}>Use a different number</Button>
              </form>
            )}
            {error != null && <ErrorBox error={error} />}
          </div>
        </Card>
        <Notice>
          This panel shows account details and anonymous totals only. It cannot open anyone’s diary entries.
        </Notice>
      </div>
    </div>
  );
}
