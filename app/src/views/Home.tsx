import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { isDue, isMastered } from '../srs';
import { Topbar, colorVars, useNav } from '../ui';

export function Home() {
  const { go } = useNav();
  const decks = useLiveQuery(() => db.decks.orderBy('createdAt').reverse().toArray(), []);
  const cards = useLiveQuery(() => db.cards.toArray(), []);
  if (!decks || !cards) return <Topbar />;

  const due = cards.filter((c) => isDue(c)).length;
  const mastered = cards.filter(isMastered).length;

  return (
    <>
      <Topbar right={<button className="iconbtn" aria-label="Ajustes" onClick={() => go({ name: 'settings' })}>⚙️</button>} />
      <div className="stat-row">
        <div className="stat-tile"><div className="num">{cards.length}</div><div className="lbl">Palabras</div></div>
        <div className="stat-tile"><div className="num">{due}</div><div className="lbl">Para hoy</div></div>
        <div className="stat-tile"><div className="num">{mastered}</div><div className="lbl">Dominadas</div></div>
      </div>

      {decks.length === 0 ? (
        <div className="empty-state">
          <div className="big">📸</div>
          <p style={{ marginBottom: 16 }}>Toma una foto de la página de vocabulario de tu libro o pega una lista de palabras: Palabreo arma las fichas solo.</p>
          <button className="btn btn-primary" onClick={() => go({ name: 'add' })}>Crear mi primer mazo</button>
        </div>
      ) : (
        <>
          <div className="section-title">Mis mazos</div>
          {decks.map((d) => {
            const dc = cards.filter((c) => c.deckId === d.id);
            const dd = dc.filter((c) => isDue(c)).length;
            return (
              <button key={d.id} className="deck-card" style={colorVars(d.color)} onClick={() => go({ name: 'deck', deckId: d.id })}>
                <div className="deck-emoji">{d.emoji}</div>
                <div className="deck-info">
                  <h3>{d.name}</h3>
                  <div className="deck-meta">
                    <span className="pill">{dc.length} palabras</span>
                    {dd > 0 && <span className="pill pill-due">{dd} para repasar</span>}
                  </div>
                </div>
                <span style={{ color: 'var(--ink-faint)' }}>›</span>
              </button>
            );
          })}
        </>
      )}
      <button className="fab" aria-label="Nuevo mazo" onClick={() => go({ name: 'add' })}>＋</button>
    </>
  );
}
