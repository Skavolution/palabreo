import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { gradeCard, isDue } from '../srs';
import { speakWord } from '../speech';
import { CardMedia, Topbar, useNav, type StudyMode } from '../ui';
import type { Card, Grade } from '../types';
import { getSettings, saveSettings } from '../settings';
import { InkPad } from '../handwriting/InkPad';
import { gradeHandwriting } from '../handwriting/grade';
import { googleRecognizer, nativeRecognizer, OfflineError, recognizeInk, recognizeWith } from '../handwriting/recognize';
import type { Ink } from '../handwriting/ink';

const shuffle = <T,>(a: T[]) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const normalize = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const FALLBACK_ES = ['casa', 'agua', 'amigo', 'correr', 'feliz', 'libro', 'comer', 'tiempo', 'trabajo', 'ciudad', 'familia', 'escuela'];

/** Same session rules as the artifact: due cards + fresh ones up to 20 for flip; 10 random otherwise. */
export function buildPool(all: Card[], mode: StudyMode, now = Date.now()): Card[] {
  if (mode === 'flip') {
    const due = all.filter((c) => isDue(c, now));
    const fresh = all.filter((c) => (c.srs?.reps ?? 0) === 0 && !due.includes(c));
    const pool = due.length ? shuffle([...due, ...shuffle(fresh).slice(0, Math.max(0, 20 - due.length))]) : shuffle(all).slice(0, 20);
    return pool;
  }
  if (mode === 'mc') {
    const tr = all.filter((c) => c.es.trim());
    const src = tr.length >= 2 ? tr : all;
    return shuffle(src).slice(0, 10);
  }
  return shuffle(all).slice(0, mode === 'match' ? 6 : 10);
}

export function Study({ deckId, mode }: { deckId: string; mode: StudyMode }) {
  const { go } = useNav();
  const all = useLiveQuery(() => db.cards.where('deckId').equals(deckId).toArray(), [deckId]);
  const [pool, setPool] = useState<Card[] | null>(null);
  const [i, setI] = useState(0);
  const [score, setScore] = useState({ ok: 0, bad: 0 });
  useEffect(() => {
    if (all && !pool) setPool(buildPool(all, mode));
  }, [all, pool, mode]);

  const exit = () => go({ name: 'deck', deckId });
  if (!pool) return <Topbar back={exit} title="Salir" />;
  if (!pool.length) {
    return (<><Topbar back={exit} title="Mazo" /><div className="empty-state"><div className="big">🙌</div><p>No hay palabras para esta sesión.</p></div></>);
  }

  const next = (ok: boolean) => {
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), bad: s.bad + (ok ? 0 : 1) }));
    setI((n) => n + 1);
  };

  if (mode === 'match') {
    return <Match cards={pool} exit={exit} onDone={(ok, bad) => { setScore({ ok, bad }); setI(pool.length); }} done={i >= pool.length} score={score} />;
  }
  if (i >= pool.length) return <Summary mode={mode} score={score} total={pool.length} exit={exit} again={() => { setPool(null); setI(0); setScore({ ok: 0, bad: 0 }); }} />;

  const card = pool[i];
  const pct = Math.round((i / pool.length) * 100);
  return (
    <>
      <Topbar back={exit} title="Salir" />
      <div className="session-top">
        <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        <div className="progress-count">{i}/{pool.length}</div>
      </div>
      {mode === 'flip' && <Flip key={card.id} card={card} onGraded={() => next(true)} />}
      {mode === 'mc' && <MultipleChoice key={card.id} card={card} others={all ?? []} onDone={next} />}
      {mode === 'write' && <Write key={card.id} card={card} onDone={next} />}
    </>
  );
}

function SentenceIpa({ card }: { card: Card }) {
  const [native, setNative] = useState(false);
  if (!card.example || !(card.exampleIpaWords || card.exampleIpaNative)) return null;
  const both = !!(card.exampleIpaWords && card.exampleIpaNative);
  const text = native && card.exampleIpaNative ? card.exampleIpaNative : card.exampleIpaWords || card.exampleIpaNative;
  return (
    <>
      {both && (
        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setNative(!native); }}>
          {native ? '🔤 Ver por palabra' : '🗣️ Ver habla nativa'}
        </button>
      )}
      <div className="card-example-ipa">{text}</div>
    </>
  );
}

function useRecorder() {
  const [rec, setRec] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const mr = useRef<MediaRecorder | null>(null);
  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && 'MediaRecorder' in window;
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); mr.current?.stream.getTracks().forEach((t) => t.stop()); }, [url]);
  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setUrl(URL.createObjectURL(new Blob(chunks, { type: r.mimeType })));
      setRec(false);
    };
    mr.current = r;
    r.start();
    setRec(true);
  }
  return { supported, rec, url, start, stop: () => mr.current?.stop() };
}

function Practice({ card }: { card: Card }) {
  const { toast } = useNav();
  const r = useRecorder();
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="row" style={{ justifyContent: 'center' }} onClick={stop}>
      <button className="speak-btn" aria-label="Escuchar" onClick={async () => { if (!(await speakWord(card.en, card.audioUrl))) toast('Este navegador no puede reproducir voz.'); }}>🔊</button>
      {r.supported && (r.rec
        ? <button className="speak-btn rec" aria-label="Detener" onClick={r.stop}>⏹️</button>
        : <button className="speak-btn" aria-label="Grabar mi voz" onClick={() => r.start().catch(() => toast('No se pudo usar el micrófono. Revisa los permisos.'))}>🎙️</button>)}
      {r.url && <button className="speak-btn" aria-label="Escuchar mi grabación" onClick={() => new Audio(r.url!).play()}>▶️</button>}
    </div>
  );
}

function Flip({ card, onGraded }: { card: Card; onGraded: () => void }) {
  const [flipped, setFlipped] = useState(false);
  async function grade(g: Grade) {
    await db.cards.update(card.id, { srs: gradeCard(card.srs, g) });
    onGraded();
  }
  return (
    <div className="stage">
      <div className={`flashcard${flipped ? ' flipped' : ''}`} role="button" tabIndex={0} onClick={() => setFlipped(!flipped)}>
        <div className="flashcard-inner">
          <div className="face">
            <div className="card-media"><CardMedia imageUrl={card.imageUrl} emoji={card.emoji} /></div>
            <div className="card-word">{card.en}</div>
            {card.ipa && <div className="card-ipa">{card.ipa}</div>}
            <Practice card={card} />
            {card.imageCredit && <div className="credit">📷 {card.imageCredit}</div>}
            <div className="tap-hint">Toca para voltear</div>
          </div>
          <div className="face face-back">
            <div className="card-es">{card.es || '—'}</div>
            {card.pos && <div className="card-pos">{card.pos}</div>}
            {card.example && <div className="card-example">“{card.example}”</div>}
            <SentenceIpa card={card} />
            {card.exampleEs && <div className="card-example-es">{card.exampleEs}</div>}
          </div>
        </div>
      </div>
      {flipped ? (
        <div className="grade-row">
          <button className="grade-btn grade-again" onClick={() => grade('again')}>Otra vez<span className="sub">&lt;10 min</span></button>
          <button className="grade-btn grade-hard" onClick={() => grade('hard')}>Difícil<span className="sub">pronto</span></button>
          <button className="grade-btn grade-good" onClick={() => grade('good')}>Bien<span className="sub">unos días</span></button>
          <button className="grade-btn grade-easy" onClick={() => grade('easy')}>Fácil<span className="sub">más tiempo</span></button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setFlipped(true)}>Voltear ficha</button>
      )}
    </div>
  );
}

function MultipleChoice({ card, others, onDone }: { card: Card; others: Card[]; onDone: (ok: boolean) => void }) {
  const options = useMemo(() => {
    const deckEs = others.filter((c) => c.id !== card.id && c.es).map((c) => c.es);
    const src = deckEs.length >= 3 ? deckEs : [...deckEs, ...FALLBACK_ES];
    const distractors = shuffle([...new Set(src.filter((e) => normalize(e) !== normalize(card.es)))]).slice(0, 3);
    return shuffle([card.es || '—', ...distractors]);
  }, [card, others]);
  const [picked, setPicked] = useState<string | null>(null);
  const ok = picked !== null && normalize(picked) === normalize(card.es);
  return (
    <div className="stage">
      <div className="card-media" style={{ marginBottom: 8 }}><CardMedia imageUrl={card.imageUrl} emoji={card.emoji} size={110} /></div>
      <div className="card-word">{card.en}</div>
      {card.ipa && <div className="card-ipa" style={{ marginBottom: 8 }}>{card.ipa}</div>}
      <button className="speak-btn" style={{ marginBottom: 18 }} onClick={() => speakWord(card.en, card.audioUrl)}>🔊</button>
      <div className="mc-options">
        {options.map((o) => {
          let cls = 'mc-opt';
          if (picked !== null) {
            if (normalize(o) === normalize(card.es)) cls += ' correct';
            else if (o === picked) cls += ' wrong';
          }
          return <button key={o} className={cls} disabled={picked !== null} onClick={() => setPicked(o)}>{o}</button>;
        })}
      </div>
      {picked !== null && <button className="btn btn-primary btn-block" style={{ marginTop: 18, maxWidth: 420 }} onClick={() => onDone(ok)}>Siguiente</button>}
    </div>
  );
}

function Write({ card, onDone }: { card: Card; onDone: (ok: boolean) => void }) {
  const { toast } = useNav();
  // Handwriting first: it's the reason this mode exists. The choice is remembered.
  const [mode, setMode] = useState<'draw' | 'type'>(() => getSettings().writeInput || 'draw');
  const [value, setValue] = useState('');
  const [stage, setStage] = useState<'idle' | 'retry' | 'done'>('idle');
  const [firstTry, setFirstTry] = useState(true);
  const [read, setRead] = useState<{ text: string; close?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const [tip, setTip] = useState(() => !getSettings().gboardTipDismissed);
  const previewSeq = useRef(0);

  const pass = () => setStage('done');
  const miss = () => { setStage('retry'); setFirstTry(false); };

  function switchMode(m: 'draw' | 'type') {
    setMode(m);
    saveSettings({ writeInput: m });
    setRead(null);
  }

  const checkTyped = () => (normalize(value) === normalize(card.en) ? pass() : miss());

  // Free preview while the pen rests: if it already reads right, accept without a tap.
  async function preview(ink: Ink) {
    const seq = ++previewSeq.current;
    try {
      const cands = await recognizeWith([nativeRecognizer, googleRecognizer], ink, async () => null);
      if (seq !== previewSeq.current || stage === 'done') return;
      setRead({ text: cands[0] ?? '' });
      if (gradeHandwriting(cands, card.en).kind === 'correct') pass();
    } catch {
      /* preview is best-effort; "Comprobar" reports errors */
    }
  }

  async function checkInk(ink: Ink, png: () => Promise<Blob | null>) {
    previewSeq.current++;
    setBusy(true);
    try {
      const v = gradeHandwriting(await recognizeInk(ink, png), card.en);
      setRead({ text: v.read, close: v.kind === 'close' });
      if (v.kind === 'wrong') { miss(); setPadKey((k) => k + 1); }
      else pass();
    } catch (e) {
      toast(e instanceof OfflineError
        ? 'Para leer tu letra necesito internet. Mientras tanto usa ⌨️ Teclado.'
        : 'No pude leer tu letra. Inténtalo de nuevo o usa ⌨️ Teclado.');
    } finally {
      setBusy(false);
    }
  }

  const done = stage === 'done';
  return (
    <div className="stage">
      <div className="card-media"><CardMedia imageUrl={card.imageUrl} emoji={card.emoji} size={100} /></div>
      <div className="card-es" style={{ margin: '8px 0' }}>{card.es || '—'}</div>
      <Practice card={card} />

      <div className="write-box">
        <div className="seg-toggle" role="tablist">
          <button role="tab" aria-selected={mode === 'draw'} className={`seg-btn${mode === 'draw' ? ' active' : ''}`} disabled={done} onClick={() => switchMode('draw')}>✏️ A mano</button>
          <button role="tab" aria-selected={mode === 'type'} className={`seg-btn${mode === 'type' ? ' active' : ''}`} disabled={done} onClick={() => switchMode('type')}>⌨️ Teclado</button>
        </div>

        {stage === 'retry' && (
          <div className="write-reveal">
            <div className="write-reveal-label">
              {mode === 'draw' && read?.text ? <>Leí «{read.text}». </> : 'No era así. '}La palabra es:
            </div>
            <div className="write-reveal-word">{card.en}</div>
            <div className="write-reveal-label">Escríbela para continuar</div>
          </div>
        )}

        {mode === 'draw' ? (
          <>
            <InkPad key={padKey} disabled={done} busy={busy} onIdle={preview} onSubmit={checkInk} />
            {!done && <div className="canvas-hint">{read?.text ? <>Leo: <strong>«{read.text}»</strong></> : 'Escribe la palabra en inglés con el lápiz'}</div>}
          </>
        ) : (
          <>
            <input
              className={`write-input${done ? ' correct' : stage === 'retry' ? ' wrong' : ''}`}
              placeholder="Escribe en inglés…" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              enterKeyHint="done" inputMode="text"
              value={value} disabled={done} onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !done) checkTyped(); }}
            />
            {!done && <button className="btn btn-primary btn-block" onClick={checkTyped}>Comprobar</button>}
            {tip && !done && (
              <div className="stylus-tip">
                <span>✒️</span>
                <span>
                  ¿Quieres escribir con el lápiz aquí? Activa la escritura a mano de Gboard: <strong>Ajustes de Gboard → Idiomas → English → Escritura a mano</strong>. Luego toca el ícono 🌐 o ✍️ del teclado para cambiar a ese modo.
                </span>
                <button className="iconbtn" aria-label="Cerrar consejo" onClick={() => { setTip(false); saveSettings({ gboardTipDismissed: true }); }}>✕</button>
              </div>
            )}
          </>
        )}

        {done && (
          <>
            <p className="feedback correct">
              {read?.close ? <>Lo leí como «{read.text}», pero tu letra también encaja con «{card.en}». ¡Correcto! 🎉</>
                : firstTry ? '¡Correcto! 🎉' : '¡Bien! Ya la escribiste correctamente 💪'}
            </p>
            <button className="btn btn-primary btn-block" onClick={() => onDone(firstTry)}>Siguiente</button>
          </>
        )}
      </div>
    </div>
  );
}

function Match({ cards, exit, onDone, done, score }: { cards: Card[]; exit: () => void; onDone: (ok: number, bad: number) => void; done: boolean; score: { ok: number; bad: number } }) {
  const tiles = useMemo(
    () => shuffle(cards.flatMap((c) => [{ key: c.id, text: c.en }, { key: c.id, text: `${c.emoji ? c.emoji + ' ' : ''}${c.es || c.en}` }])),
    [cards],
  );
  const [picked, setPicked] = useState<number | null>(null);
  const [solved, setSolved] = useState<number[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [shake, setShake] = useState<number | null>(null);

  if (done) return <Summary mode="match" score={score} total={cards.length} exit={exit} again={exit} />;

  function tap(idx: number) {
    if (picked === null) return setPicked(idx);
    if (picked === idx) return setPicked(null);
    if (tiles[picked].key === tiles[idx].key) {
      const s = [...solved, picked, idx];
      setSolved(s);
      setPicked(null);
      if (s.length === tiles.length) setTimeout(() => onDone(cards.length, mistakes), 350);
    } else {
      setMistakes((m) => m + 1);
      setShake(idx);
      setPicked(null);
      setTimeout(() => setShake(null), 400);
    }
  }
  return (
    <>
      <Topbar back={exit} title="Salir" />
      <div className="match-stats" style={{ display: 'flex', justifyContent: 'center', gap: 18, marginBottom: 14, fontWeight: 700, color: 'var(--ink-soft)' }}>
        <span>✅ {solved.length / 2}/{cards.length}</span><span>✗ {mistakes}</span>
      </div>
      <div className="match-grid">
        {tiles.map((t, idx) => (
          <button key={idx} disabled={solved.includes(idx)}
            className={`match-tile${solved.includes(idx) ? ' solved' : picked === idx ? ' picked' : ''}${shake === idx ? ' shake' : ''}`}
            onClick={() => tap(idx)}>{t.text}</button>
        ))}
      </div>
    </>
  );
}

function Summary({ mode, score, total, exit, again }: { mode: StudyMode; score: { ok: number; bad: number }; total: number; exit: () => void; again: () => void }) {
  return (
    <>
      <Topbar back={exit} title="Mazo" />
      <div className="summary-hero">
        <div className="big">🎉</div>
        <h2>¡Sesión terminada!</h2>
        <p style={{ color: 'var(--ink-soft)', marginTop: 6 }}>
          {mode === 'flip' ? `Repasaste ${total} fichas. Tu progreso quedó guardado para el repaso espaciado.`
            : mode === 'match' ? `Emparejaste ${score.ok} palabras con ${score.bad} errores.`
            : `${score.ok} correctas · ${score.bad} para practicar`}
        </p>
      </div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
        <button className="btn btn-ghost" onClick={exit}>Volver al mazo</button>
        <button className="btn btn-primary" onClick={again}>Otra ronda</button>
      </div>
    </>
  );
}
