import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Home } from './views/Home';
import { ExplorationView } from './views/Exploration';
import { Drill } from './views/Drill';
import { MapView } from './views/Map';
import { Canvas } from './views/Canvas';

type Route =
  | { name: 'home' }
  | { name: 'exploration'; explorationId: string; questionId: string | null }
  | { name: 'drill' }
  | { name: 'map' }
  /** Topic scope and selection both live in the URL, so back steps through both. */
  | { name: 'walk'; explorationId?: string; id?: string };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'e' && parts[1])
    return {
      name: 'exploration',
      explorationId: parts[1],
      questionId: parts[2] === 'q' && parts[3] ? parts[3] : null,
    };
  if (parts[0] === 'drill') return { name: 'drill' };
  if (parts[0] === 'map') return { name: 'map' };
  if (parts[0] === 'walk') return { name: 'walk', explorationId: parts[1], id: parts[2] };
  return { name: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  const [due, setDue] = useState(0);

  useEffect(() => {
    const onHash = () => setRoute(parse(location.hash));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

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

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <i className="ball" />
          Pinball Learn
          <small>learn.pinball.sh</small>
        </a>
        <nav className="nav">
          <a href="#/" className={route.name === 'home' || route.name === 'exploration' ? 'on' : ''}>
            Explore
          </a>
          <a href="#/walk" className={route.name === 'map' || route.name === 'walk' ? 'on' : ''}>
            Map
          </a>
          <a href="#/drill" className={route.name === 'drill' ? 'on' : ''}>
            Drill
            {due > 0 && <span className="count">{due}</span>}
          </a>
        </nav>
      </header>

      {route.name === 'walk' ? (
        <Canvas go={go} explorationId={route.explorationId} selectedId={route.id} />
      ) : route.name === 'exploration' ? (
        <ExplorationView
          key={route.explorationId}
          explorationId={route.explorationId}
          questionId={route.questionId}
          go={go}
        />
      ) : (
        <div className="main">
          {route.name === 'home' && <Home go={go} />}
          {route.name === 'map' && <MapView go={go} />}
          {route.name === 'drill' && <Drill go={go} onChanged={refreshDue} />}
        </div>
      )}
    </div>
  );
}
