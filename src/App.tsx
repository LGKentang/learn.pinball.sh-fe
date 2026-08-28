import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
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

  useEffect(refreshDue, [refreshDue, route.name]);

  const go = useCallback((hash: string) => {
    location.hash = hash;
  }, []);

  const exploreHref = currentBookId ? `#/b/${currentBookId}` : '#/books';
  const mapHref = currentBookId ? `#/b/${currentBookId}/map` : '#/books';

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <i className="ball" />
          Pinball Learn
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
      </header>

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
