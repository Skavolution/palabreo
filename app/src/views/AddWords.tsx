import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addCards, addDeck, db } from '../db';
import { enrichMany, type EnrichResult } from '../enrich';
import { ocrImage, parseVocabulary } from '../ocr';
import { aiExtract } from '../ai';
import { getSettings } from '../settings';
import { CardMedia, Topbar, useNav } from '../ui';
import type { CardContent, ColorKey } from '../types';

type Step = 'input' | 'working' | 'review';
const MAX_WORDS = 80;
const FIELD_ES: Partial<Record<keyof CardContent, string>> = {
  es: 'traducción', ipa: 'IPA', pos: 'categoría', emoji: 'emoji', example: 'ejemplo', exampleEs: 'traducción del ejemplo', exampleIpaWords: 'IPA del ejemplo',
};

export function parseWordList(raw: string): { en: string; es?: string }[] {
  const seen = new Set<string>();
  const out: { en: string; es?: string }[] = [];
  for (const part of raw.split(/[\n,;]+/)) {
    const [enRaw, esRaw] = part.split(/\s*(?:=|–|—|\t|\s-\s)\s*/);
    const en = (enRaw ?? '').trim();
    if (!en || seen.has(en.toLowerCase())) continue;
    seen.add(en.toLowerCase());
    out.push(esRaw?.trim() ? { en, es: esRaw.trim() } : { en });
  }
  return out;
}

export function AddWords({ deckId }: { deckId?: string }) {
  const { go, toast } = useNav();
  const deck = useLiveQuery(() => (deckId ? db.decks.get(deckId) : undefined), [deckId]);
  const [step, setStep] = useState<Step>('input');
  const [text, setText] = useState('');
  const [deckName, setDeckName] = useState('');
  const [progress, setProgress] = useState('');
  const [items, setItems] = useState<EnrichResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { proxyUrl } = getSettings();

  async function readPhotos(files: FileList, useAi: boolean) {
    setStep('working');
    const found: { en: string; es?: string }[] = parseWordList(text);
    let title = '';
    try {
      for (const [i, f] of [...files].entries()) {
        const label = files.length > 1 ? ` (${i + 1}/${files.length})` : '';
        if (useAi) {
          setProgress(`Leyendo la foto con IA${label}…`);
          const r = await aiExtract(f);
          title ||= r.title;
          found.push(...r.words);
        } else {
          setProgress(`Leyendo la foto${label}… la primera vez descarga el lector (unos 10 MB)`);
          const raw = await ocrImage(f, (p) => setProgress(`Leyendo la foto${label}… ${p}%`));
          const r = parseVocabulary(raw);
          title ||= r.title;
          found.push(...r.words);
        }
      }
    } catch {
      toast(useAi ? 'La IA no pudo leer la foto. Revisa el Worker en Ajustes.' : 'No se pudo leer la foto. Prueba con más luz y la página derecha.');
    }
    const unique = parseWordList(found.map((w) => (w.es ? `${w.en} = ${w.es}` : w.en)).join('\n'));
    setText(unique.map((w) => (w.es ? `${w.en} = ${w.es}` : w.en)).join('\n'));
    if (title && !deckName) setDeckName(title);
    setStep('input');
    toast(unique.length ? `Encontré ${unique.length} palabras. Revisa la lista, borra lo que sobre y continúa.` : 'No encontré palabras en la foto.');
  }

  async function generate() {
    const words = parseWordList(text);
    if (!words.length) return toast('Escribe o pega al menos una palabra.');
    if (words.length > MAX_WORDS) return toast(`Máximo ${MAX_WORDS} palabras por vez; divide la lista.`);
    setStep('working');
    setProgress(`Buscando 0 de ${words.length}…`);
    const res = await enrichMany(words, (done, total) => setProgress(`Buscando ${done} de ${total}…`));
    setItems(res);
    setStep('review');
  }

  function patch(i: number, p: Partial<CardContent>) {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, content: { ...it.content, ...p } } : it)));
  }

  async function save() {
    let id = deckId;
    if (!id) {
      const colors: ColorKey[] = ['accent', 'gold', 'coral', 'indigo', 'sage'];
      id = await addDeck({
        name: deckName.trim() || 'Nuevo mazo',
        emoji: items.find((i) => i.content.emoji)?.content.emoji || '📚',
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    await addCards(id, items.map((i) => i.content));
    toast(`${items.length} fichas creadas ✨`);
    go({ name: 'deck', deckId: id });
  }

  const back = () => go(deckId ? { name: 'deck', deckId } : { name: 'home' });

  if (step === 'working') {
    return (
      <>
        <Topbar back={back} title="Cancelar" />
        <div className="empty-state"><div className="big">⏳</div><p>{progress}</p></div>
      </>
    );
  }

  if (step === 'review') {
    const complete = items.filter((i) => !i.missing.length).length;
    return (
      <>
        <Topbar back={() => setStep('input')} title="Editar lista" />
        <h2 style={{ marginBottom: 6 }}>Revisa tus fichas</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginBottom: 16 }}>
          {complete} de {items.length} quedaron completas con fuentes gratis. Corrige lo que quieras y toca la imagen que mejor represente cada palabra.
        </p>
        {items.map((it, i) => (
          <div className="review-item" key={i}>
            <div className="review-head">
              <div className="word-thumb" style={{ width: 56, height: 56 }}><CardMedia imageUrl={it.content.imageUrl} emoji={it.content.emoji} size={56} /></div>
              <div className="word-main">
                <div className="word-en">{it.content.en} <span className="word-ipa">{it.content.ipa}</span></div>
                <div className="deck-meta">
                  {it.missing.map((m) => <span key={m} className="pill pill-bad">falta {FIELD_ES[m] ?? m}</span>)}
                  {it.usedAi && <span className="pill pill-ai">completada con IA</span>}
                </div>
              </div>
              <button className="iconbtn" aria-label="Quitar" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
            </div>
            <div className="review-fields">
              <input aria-label="Traducción" placeholder="traducción" value={it.content.es ?? ''} onChange={(e) => patch(i, { es: e.target.value })} />
              <input aria-label="IPA" placeholder="/aɪ piː eɪ/" value={it.content.ipa ?? ''} onChange={(e) => patch(i, { ipa: e.target.value })} />
              <input className="wide" aria-label="Ejemplo" placeholder="oración de ejemplo" value={it.content.example ?? ''} onChange={(e) => patch(i, { example: e.target.value })} />
              <input className="wide" aria-label="Traducción del ejemplo" placeholder="traducción del ejemplo" value={it.content.exampleEs ?? ''} onChange={(e) => patch(i, { exampleEs: e.target.value })} />
            </div>
            {it.images.length > 0 && (
              <div className="img-strip">
                {it.images.map((img) => (
                  <button key={img.full} className={img.full === it.content.imageUrl ? 'sel' : ''} onClick={() => patch(i, { imageUrl: img.full, imageCredit: img.credit })}>
                    <img src={img.thumb} alt="" loading="lazy" />
                  </button>
                ))}
                <button className={!it.content.imageUrl ? 'sel' : ''} onClick={() => patch(i, { imageUrl: '', imageCredit: '' })} style={{ width: 82, fontSize: 30 }}>
                  {it.content.emoji || '∅'}
                </button>
              </div>
            )}
          </div>
        ))}
        <button className="btn btn-primary btn-block" disabled={!items.length} onClick={save}>Guardar {items.length} fichas</button>
      </>
    );
  }

  return (
    <>
      <Topbar back={back} title={deck ? deck.name : 'Mazos'} />
      <h2 style={{ marginBottom: 6 }}>{deck ? 'Añadir palabras' : 'Nuevo mazo'}</h2>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginBottom: 16 }}>
        Toma una foto de la página del libro o escribe las palabras. Palabreo busca gratis en internet la traducción, la pronunciación (IPA y audio), un ejemplo real y una imagen.
      </p>
      <div className="form-card">
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>📸 Foto del libro</button>
          {proxyUrl && (
            <button className="btn btn-ghost" onClick={() => { fileRef.current!.dataset.ai = '1'; fileRef.current?.click(); }}>✨ Leer con IA</button>
          )}
        </div>
        <input
          ref={fileRef} className="hidden-input" type="file" accept="image/*" multiple
          onChange={(e) => {
            const useAi = e.target.dataset.ai === '1';
            delete e.target.dataset.ai;
            if (e.target.files?.length) readPhotos(e.target.files, useAi);
            e.target.value = '';
          }}
        />
        {!deckId && (
          <div className="field">
            <label htmlFor="deck-name">Nombre del mazo</label>
            <input id="deck-name" type="text" placeholder="Unidad 8 – Lesson A" value={deckName} onChange={(e) => setDeckName(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="words">Palabras en inglés</label>
          <textarea id="words" style={{ minHeight: 180 }} placeholder={'kitchen\nliving room\nbedroom = dormitorio'} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="field-hint">Una por línea o separadas por comas. Si ya sabes la traducción escribe «palabra = traducción».</div>
        </div>
        <button className="btn btn-primary btn-block" onClick={generate}>✨ Crear fichas ({parseWordList(text).length})</button>
      </div>
    </>
  );
}
