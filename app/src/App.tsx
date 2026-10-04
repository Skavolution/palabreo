import { useEffect, useMemo, useState } from 'react';
import { NavContext, useToast, type Route } from './ui';
import { getSettings } from './settings';
import { Home } from './views/Home';
import { DeckView } from './views/DeckView';
import { AddWords } from './views/AddWords';
import { Study } from './views/Study';
import { SettingsView } from './views/SettingsView';

export function applyTheme(theme = getSettings().theme) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [toastEl, toast] = useToast();
  const nav = useMemo(() => ({ go: (r: Route) => { setRoute(r); window.scrollTo(0, 0); }, toast }), [toast]);

  useEffect(() => applyTheme(), []);

  return (
    <NavContext.Provider value={nav}>
      <div id="app">
        {route.name === 'home' && <Home />}
        {route.name === 'deck' && <DeckView deckId={route.deckId} />}
        {route.name === 'add' && <AddWords deckId={route.deckId} />}
        {route.name === 'study' && <Study key={route.deckId + route.mode} deckId={route.deckId} mode={route.mode} />}
        {route.name === 'settings' && <SettingsView />}
      </div>
      {toastEl}
    </NavContext.Provider>
  );
}
