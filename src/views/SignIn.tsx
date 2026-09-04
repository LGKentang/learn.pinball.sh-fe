import { useCallback, useEffect, useState } from 'react';
import { api, type AuthConfig, type Me } from '../api';

const ERRORS: Record<string, string> = {
  not_allowed: 'That Google account is not on the list yet. Pinball Learn is invite-only while it is early.',
  unverified_email: 'Google has not verified that address, so it cannot be used to sign in.',
  state_mismatch: 'That sign-in link expired. Try again.',
  missing_code: 'Google did not send a sign-in code back. Try again.',
  exchange_failed: 'Google refused the sign-in. Try again in a moment.',
  access_denied: 'Sign-in was cancelled.',
};

/**
 * The whole app is behind this. Sign-in is a full page redirect to Google rather
 * than a popup, so it works identically on mobile and in browsers that block
 * third-party storage.
 */
export function SignIn({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  // A server that cannot be reached and a server with no Google credentials used
  // to render the same message, which told visitors to go and edit environment
  // variables when the truth was that the API was down. They are separate states.
  const [status, setStatus] = useState<'loading' | 'ready' | 'unreachable'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setStatus('loading');
    void api
      .authConfig()
      .then((c) => {
        setConfig(c);
        setStatus('ready');
      })
      .catch(() => {
        setConfig(null);
        setStatus('unreachable');
      });
  }, []);

  useEffect(() => {
    // The OAuth callback bounces back here with ?auth_error=… when it refuses.
    const params = new URLSearchParams(location.search);
    const code = params.get('auth_error');
    if (code) {
      setError(ERRORS[code] ?? `Sign-in failed (${code}).`);
      history.replaceState(null, '', location.pathname + location.hash);
    }
    load();
  }, [load]);

  function google() {
    setBusy(true);
    const back = encodeURIComponent(location.origin + location.pathname + location.hash);
    location.href = `/api/auth/google/start?return_to=${back}`;
  }

  async function dev() {
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.devLogin();
      onSignedIn(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'sign-in failed');
      setBusy(false);
    }
  }

  return (
    <div className="signin">
      <div className="signin-card">
        <div className="signin-brand">
          <i className="ball" />
          <div>
            <strong>Pinball Learn</strong>
            <small>learn.pinball.sh</small>
          </div>
        </div>

        <h1>Learning is not linear.</h1>
        <p className="muted">
          Ask a question. Answer it badly. Follow the question that answer raises, and come back to
          fix what you thought you knew. Pinball Learn keeps the whole trail — including the parts
          you got wrong.
        </p>

        {error && <div className="signin-error">{error}</div>}

        <div className="signin-actions">
          {status === 'loading' && (
            <button className="btn" disabled aria-busy="true">
              Checking sign-in…
            </button>
          )}

          {status === 'unreachable' && (
            <div className="signin-offline">
              <p>
                <strong>Can’t reach the server.</strong> The page loaded, but the API did not
                answer. This is usually temporary.
              </p>
              <button className="btn" onClick={load}>
                Try again
              </button>
            </div>
          )}

          {config?.google && (
            <button className="btn google" onClick={google} disabled={busy}>
              <GoogleMark />
              Continue with Google
            </button>
          )}

          {config?.dev && (
            <button className="btn" onClick={() => void dev()} disabled={busy}>
              Sign in as the local developer
            </button>
          )}

          {status === 'ready' && config && !config.google && !config.dev && (
            <p className="small dimmer">
              The server answered, but no sign-in method is configured. If this is your server,
              set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>, or{' '}
              <code>PINBALL_DEV_LOGIN</code> for local work.
            </p>
          )}
        </div>

        <p className="small dimmer signin-foot">
          Invite-only for now. Publish what you learn to your own{' '}
          <span className="mono">name.{config?.base_domain ?? 'pinball.sh'}</span>.
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-4H24v7.5h12c-.2 2-1.5 5-4.4 7l6.8 5.3C42.4 36.2 45 30.6 45 24z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.3c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.9-12.5-9.2l-7.1 5.5C8 40.9 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.8-2.9-.8-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z" />
      <path fill="#EA4335" d="M24 10.8c3.3 0 5.5 1.4 6.8 2.6l5.9-5.8C33.1 4.3 29.9 2 24 2 15.4 2 8 7.1 4.4 14.1l7.1 5.5C13.3 14.4 18.2 10.8 24 10.8z" />
    </svg>
  );
}
