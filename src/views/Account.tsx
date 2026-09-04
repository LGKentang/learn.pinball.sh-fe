import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type AuthConfig, type BookSummary, type Me } from '../api';

/**
 * Account panel: who you are, the handle your published site lives on, and which
 * books are on it.
 *
 * Claiming a handle is deliberately a one-way door — every published URL contains
 * it, and letting someone change it would break other people's links and free the
 * old name for whoever wanted to impersonate them.
 */
export function Account({
  me,
  config,
  onClose,
  onChange,
}: {
  me: Me;
  config: AuthConfig | null;
  onClose: () => void;
  onChange: (me: Me) => void;
}) {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [handle, setHandle] = useState(me.handle ?? '');
  const [check, setCheck] = useState<{ available: boolean; reason?: string; url?: string } | null>(
    null,
  );
  const [bio, setBio] = useState(me.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Publishing is a network round trip. Without this the button stayed live and a
  // double click published then immediately unpublished.
  const [publishing, setPublishing] = useState<string | null>(null);
  // Unpublishing takes a live URL offline, so it asks once — inline, rather than
  // stacking a confirm dialog on top of a dialog.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.books().then(setBooks).catch(() => undefined);
  }, []);

  /**
   * A dialog that does not trap focus is one keyboard users tab straight out of,
   * into a page they cannot see behind the scrim. Also restores focus to whatever
   * opened it, and stops the page behind from scrolling.
   */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const visible = (el: HTMLElement) => el.getClientRects().length > 0;
    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter(visible);

    focusable()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  // Debounced availability check, so typing a handle is not trial and error.
  useEffect(() => {
    if (me.handle) return;
    const value = handle.trim().toLowerCase();
    if (value.length < 3) {
      setCheck(null);
      return;
    }
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void api
        .checkHandle(value)
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [handle, me.handle]);

  async function claim() {
    const value = handle.trim().toLowerCase();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.updateMe({ handle: value });
      onChange(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not claim that handle');
    } finally {
      setBusy(false);
    }
  }

  async function saveBio() {
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.updateMe({ bio: bio.trim() || null });
      onChange(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not save');
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(book: BookSummary) {
    const wasPublished = !!book.published_at;

    if (wasPublished && confirming !== book.id) {
      setConfirming(book.id);
      window.setTimeout(() => setConfirming((id) => (id === book.id ? null : id)), 4000);
      return;
    }

    setConfirming(null);
    setError(null);
    setStatus(null);
    setPublishing(book.id);
    try {
      const res = await api.publishBook(book.id, { published: !wasPublished });
      setBooks((bs) =>
        bs.map((b) =>
          b.id === book.id
            ? { ...b, published_at: res.published ? (res.published_at ?? new Date().toISOString()) : null, slug: res.slug }
            : b,
        ),
      );
      setStatus(
        res.published
          ? `“${book.title}” is live at ${res.url}`
          : `“${book.title}” is private again.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not change that');
    } finally {
      setPublishing(null);
    }
  }

  function copy(url: string) {
    void navigator.clipboard?.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 1600);
  }

  const domain = config?.base_domain ?? 'pinball.sh';
  const published = books.filter((b) => b.published_at);

  return createPortal(
    <div className="modal-scrim" onMouseDown={onClose}>
      <div
        ref={dialog}
        className="modal account"
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            {me.avatar_url ? (
              <img className="avatar lg" src={me.avatar_url} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar lg fallback">{(me.name ?? me.email)[0]?.toUpperCase()}</span>
            )}
            <div>
              <strong>{me.name ?? me.email}</strong>
              <div className="small dimmer">{me.email}</div>
            </div>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {error && <div className="signin-error">{error}</div>}
        {status && (
          <p className="small ok" role="status">
            {status}
          </p>
        )}

        <section>
          <p className="eyebrow">Your site</p>
          {me.handle ? (
            <div className="site-claimed">
              <a href={me.site_url ?? '#'} target="_blank" rel="noreferrer noopener" className="mono">
                {me.handle}.{domain}
              </a>
              <button className="btn ghost small" onClick={() => copy(me.site_url ?? '')}>
                {copied === me.site_url ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <>
              <p className="small dimmer" style={{ margin: '0 0 10px' }}>
                Pick the address your published books will live on. It cannot be changed later —
                every published link contains it.
              </p>
              <div className="handle-row">
                <input
                  className="field"
                  placeholder="your-name"
                  value={handle}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  onKeyDown={(e) => e.key === 'Enter' && check?.available && void claim()}
                />
                <span className="mono dimmer">.{domain}</span>
              </div>
              {check && (
                <p className={`small ${check.available ? 'ok' : 'bad'}`}>
                  {check.available ? `${handle}.${domain} is available` : check.reason}
                </p>
              )}
              <button
                className="btn primary"
                style={{ marginTop: 10 }}
                disabled={busy || !check?.available}
                onClick={() => void claim()}
              >
                Claim this address
              </button>
            </>
          )}
        </section>

        <section>
          <p className="eyebrow">Bio</p>
          <textarea
            className="field"
            rows={2}
            placeholder="One line about what you are working to understand."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            onBlur={() => bio.trim() !== (me.bio ?? '') && void saveBio()}
          />
          <p className="small dimmer">Shown at the top of your published site.</p>
        </section>

        <section>
          <p className="eyebrow">
            Published books <span className="dimmer">— {published.length} of {books.length}</span>
          </p>
          {!me.handle && (
            <p className="small dimmer">Claim an address above before publishing anything.</p>
          )}
          <div className="publish-list">
            {books.map((b) => {
              const live = !!b.published_at;
              const url = live && me.handle ? `https://${me.handle}.${domain}/${b.slug}` : null;
              return (
                <div key={b.id} className={`publish-row ${live ? 'live' : ''}`}>
                  <div className="pr-main">
                    <span className="t">{b.title}</span>
                    {url ? (
                      <a className="s mono" href={url} target="_blank" rel="noreferrer noopener">
                        /{b.slug}
                      </a>
                    ) : (
                      <span className="s dimmer">
                        {b.question_count} question{b.question_count === 1 ? '' : 's'} · private
                      </span>
                    )}
                  </div>
                  <button
                    className={`btn small ${live ? (confirming === b.id ? 'danger' : '') : 'primary'}`}
                    disabled={!me.handle || publishing === b.id}
                    aria-busy={publishing === b.id}
                    onClick={() => void togglePublish(b)}
                  >
                    {publishing === b.id
                      ? 'Working…'
                      : live
                        ? confirming === b.id
                          ? 'Confirm'
                          : 'Unpublish'
                        : 'Publish'}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="small dimmer" style={{ marginTop: 10 }}>
            Published pages show each question and your current answer. Your revision history,
            drill ratings and parked rabbit holes stay private.
          </p>
        </section>

        <footer className="modal-foot">
          <button
            className="btn ghost"
            onClick={() => {
              void api.logout().finally(() => location.reload());
            }}
          >
            Sign out
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
