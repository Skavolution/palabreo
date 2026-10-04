import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { ColorKey } from './types';

export type Route =
  | { name: 'home' }
  | { name: 'deck'; deckId: string }
  | { name: 'add'; deckId?: string }
  | { name: 'study'; deckId: string; mode: StudyMode }
  | { name: 'settings' };
export type StudyMode = 'flip' | 'mc' | 'write' | 'match';

interface Nav {
  go: (r: Route) => void;
  toast: (msg: string) => void;
}
export const NavContext = createContext<Nav>({ go: () => {}, toast: () => {} });
export const useNav = () => useContext(NavContext);

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), Math.min(7000, 2200 + m.length * 35));
  }, []);
  return [msg ? <div className="toast" role="status">{msg}</div> : null, show];
}

export function Topbar({ back, title, right }: { back?: () => void; title?: string; right?: ReactNode }) {
  return (
    <div className="topbar">
      {back ? (
        <button className="backbtn" onClick={back}>‹ {title ?? 'Atrás'}</button>
      ) : (
        <div className="brand"><div className="mark">P</div><span className="name">Palabreo</span></div>
      )}
      <div className="spacer" />
      {right}
    </div>
  );
}

export const colorVars = (c: ColorKey) =>
  ({ ['--tab' as string]: `var(--${c})`, ['--tab-soft' as string]: `var(--${c}-soft)` }) as React.CSSProperties;

export function CardMedia({ imageUrl, emoji, size = 150 }: { imageUrl?: string; emoji?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (imageUrl && !broken) {
    return <img src={imageUrl} alt="" style={{ width: size, height: size }} onError={() => setBroken(true)} loading="lazy" />;
  }
  return <span>{emoji || '🖼️'}</span>;
}
