import { useCallback, useEffect, useState } from 'react';
import { api, setSignedOutHandler, type AuthConfig, type Me } from './api';
import { Landing } from './views/Landing';
import { SignIn } from './views/SignIn';
import { Account } from './views/Account';
import { Books } from './views/Books';
import { BookView } from './views/Book';
import { Drill } from './views/Drill';
import { MapView } from './views/Map';
import { Canvas } from './views/Canvas';

type Route =
  | { name: 'books' }
  | { name: 'book'; bookId: string; questionId: string | null }
  | { name: 'canvas'; bookId: string; questionId?: string }
  | { name: 'outline'; bookId: string; questionId?: string }
  | { name: 'drill' };

const LAST_BOOK_KEY = 'pinball:lastBookId';

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'b' && parts[1]) {
    const bookId = parts[1];
    if (parts[2] === 'map') return { name: 'canvas', bookId, questionId: parts[3] === 'q' ? parts[4] : undefined };
    if (parts[2] === 'outline')
      return { name: 'outline', bookId, questionId: parts[3] === 'q' ? parts[4] : undefined };
    return { name: 'book', bookId, questionId: parts[2] === 'q' && parts[3] ? parts[3] : null };
  }
  if (parts[0] === 'drill') return { name: 'drill' };
  return { name: 'books' };
}

function readLastBookId(): string | null {
  try {
    return localStorage.getItem(LAST_BOOK_KEY);
  } catch {
    return null;
  }
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  const [due, setDue] = useState(0);
  const [currentBookId, setCurrentBookId] = useState<string | null>(readLastBookId);
  const [me, setMe] = useState<Me | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  // A failed OAuth round trip bounces back here with ?auth_error=… — that error
  // belongs on the sign-in screen, not buried behind the marketing page again.
  const [showSignIn, setShowSignIn] = useState(
    () => new URLSearchParams(location.search).has('auth_error'),
  );

  // Who is signed in decides what the whole shell renders, so it is resolved once
  // here rather than by each view discovering its own 401.
  useEffect(() => {
    setSignedOutHandler(() => setMe(null));
    void Promise.all([
      api.me().then((r) => r.user).catch(() => null),
      api.authConfig().catch(() => null),
    ]).then(([user, cfg]) => {
      setMe(user);
      setAuthConfig(cfg);
      setReady(true);
    });
    return () => setSignedOutHandler(null);
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parse(location.hash));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  // The book a route carries is the persisted "current book" — Explore and Map
  // both read it back from here, and it survives a reload via localStorage.
  useEffect(() => {
    if (!('bookId' in route)) return;
    setCurrentBookId(route.bookId);
    try {
      localStorage.setItem(LAST_BOOK_KEY, route.bookId);
    } catch {
      /* private mode, or storage disabled — the session default still works */
    }
  }, [route]);

  const refreshDue = useCallback(() => {
    void api
      .due()
      .then((d) => setDue(d.questions.length))
      .catch(() => setDue(0));
  }, []);

  useEffect(() => {
    if (me) refreshDue();
  }, [refreshDue, route.name, me]);

  // `replace: true` lands on a hash without pushing a history entry — used for
  // redirects that happen without the user asking for them (landing on a book's
  // first question), so the back button steps to what the user actually visited
  // instead of bouncing straight back to the same redirect.
  const go = useCallback((hash: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) {
      history.replaceState(null, '', hash);
      setRoute(parse(hash));
    } else {
      location.hash = hash;
    }
  }, []);

  const exploreHref = currentBookId ? `#/b/${currentBookId}` : '#/books';
  const mapHref = currentBookId ? `#/b/${currentBookId}/map` : '#/books';

  // Nothing renders until we know: flashing the app and then replacing it with a
  // sign-in screen looks like a bug and fires a round of doomed requests.
  // An empty dark rectangle is also what a broken app looks like, so say something.
  if (!ready)
    return (
      <div className="boot" role="status" aria-live="polite">
        <i className="ball" />
        <span>Loading Pinball Learn…</span>
      </div>
    );
  if (!me) {
    return showSignIn ? (
      <SignIn onSignedIn={setMe} />
    ) : (
      <Landing onContinue={() => setShowSignIn(true)} />
    );
  }

  return (
    <div className="app">
      {/* Five focusable items sit between the top of the page and the content on
          every route; a keyboard user should not have to tab through them twice. */}
      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <header className="topbar">
        <a className="brand" href="#/">
          <i className="ball" />
          <span className="brand-name">Pinball Learn</span>
          <small>learn.pinball.sh</small>
        </a>
        <nav className="nav">
          <a href="#/books" className={route.name === 'books' ? 'on' : ''}>
            Books
          </a>
          <a href={exploreHref} className={route.name === 'book' ? 'on' : ''}>
            Explore
          </a>
          <a href={mapHref} className={route.name === 'canvas' || route.name === 'outline' ? 'on' : ''}>
            Map
          </a>
          <a href="#/drill" className={route.name === 'drill' ? 'on' : ''}>
            Drill
            {due > 0 && <span className="count">{due}</span>}
          </a>
        </nav>

        <button
          className="account-btn"
          onClick={() => setShowAccount(true)}
          title={me.handle ? `${me.handle}.${authConfig?.base_domain ?? 'pinball.sh'}` : 'Account'}
        >
          {me.avatar_url ? (
            <img className="avatar" src={me.avatar_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar fallback">{(me.name ?? me.email)[0]?.toUpperCase()}</span>
          )}
          <span className="who mono">{me.handle ?? me.name ?? me.email.split('@')[0]}</span>
        </button>
      </header>

      {/* Absolutely positioned, so the skip link has a target without a wrapper
          element that would change the flex layout each route depends on. */}
      <span id="content" className="skip-target" tabIndex={-1} />

      {showAccount && (
        <Account
          me={me}
          config={authConfig}
          onClose={() => setShowAccount(false)}
          onChange={setMe}
        />
      )}

      {route.name === 'canvas' ? (
        <Canvas go={go} bookId={route.bookId} selectedId={route.questionId} />
      ) : route.name === 'book' ? (
        <BookView key={route.bookId} bookId={route.bookId} questionId={route.questionId} go={go} />
      ) : (
        <div className="main">
          {route.name === 'books' && <Books go={go} />}
          {route.name === 'outline' && (
            <MapView key={route.bookId} bookId={route.bookId} selectedId={route.questionId} go={go} />
          )}
          {route.name === 'drill' && <Drill go={go} onChanged={refreshDue} />}
        </div>
      )}
    </div>
  );
}
