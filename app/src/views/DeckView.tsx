import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteDeck } from '../db';
import { isDue } from '../srs';
import { speakWord } from '../speech';
import { CardMedia, Topbar, useNav, type StudyMode } from '../ui';

const MODES: { mode: StudyMode; ic: string; ti: string; de: string }[] = [
  { mode: 'flip', ic: '🃏', ti: 'Fichas', de: 'Repaso espaciado: voltea y califica' },
  { mode: 'mc', ic: '🔘', ti: 'Opción múltiple', de: 'Elige la traducción correcta' },
  { mode: 'write', ic: '✍️', ti: 'Escribir', de: 'Escribe la palabra en inglés' },
  { mode: 'match', ic: '🧩', ti: 'Emparejar', de: 'Une inglés con español' },
];

export function DeckView({ deckId }: { deckId: string }) {
  const { go, toast } = useNav();
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId]);
  const cards = useLiveQuery(() => db.cards.where('deckId').equals(deckId).sortBy('createdAt'), [deckId]);
  if (!deck || !cards) return <Topbar back={() => go({ name: 'home' })} title="Mazos" />;
  const due = cards.filter((c) => isDue(c)).length;

  async function remove() {
    if (!confirm(`¿Borrar el mazo "${deck!.name}" y sus ${cards!.length} fichas?`)) return;
    await deleteDeck(deckId);
    toast('Mazo borrado');
    go({ name: 'home' });
  }

  return (
    <>
      <Topbar back={() => go({ name: 'home' })} title="Mazos" right={<button className="iconbtn" aria-label="Borrar mazo" onClick={remove}>🗑️</button>} />
      <h2 style={{ marginBottom: 4 }}>{deck.emoji} {deck.name}</h2>
      <p style={{ color: 'var(--ink-soft)', marginBottom: 16 }}>{cards.length} palabras · {due} para repasar hoy</p>

      {cards.length > 0 && (
        <div className="mode-grid" style={{ marginBottom: 8 }}>
          {MODES.map((m) => (
            <button key={m.mode} className="mode-tile" onClick={() => go({ name: 'study', deckId, mode: m.mode })}>
              <span className="ic">{m.ic}</span><span className="ti">{m.ti}</span><span className="de">{m.de}</span>
            </button>
          ))}
        </div>
      )}

      <div className="section-title">Palabras</div>
      <button className="btn btn-soft btn-block" style={{ marginBottom: 12 }} onClick={() => go({ name: 'add', deckId })}>＋ Añadir palabras (lista o foto)</button>
      {cards.length > 0 && (
        <div className="list-card">
          {cards.map((c) => (
            <div className="word-row" key={c.id}>
              <div className="word-thumb"><CardMedia imageUrl={c.imageUrl} emoji={c.emoji} size={42} /></div>
              <div className="word-main">
                <div className="word-en">{c.en}</div>
                {c.ipa && <div className="word-ipa">{c.ipa}</div>}
                <div className="word-es">{c.es}</div>
              </div>
              <button className="speak-btn" aria-label={`Escuchar ${c.en}`} onClick={() => speakWord(c.en, c.audioUrl)}>🔊</button>
              <button className="iconbtn" aria-label={`Borrar ${c.en}`} onClick={() => db.cards.delete(c.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
