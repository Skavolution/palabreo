import { db, uid } from './db';
import { newSrs } from './srs';
import type { Card, Deck } from './types';
import { EMPTY_CONTENT } from './types';

/** JSON backup. Also accepts an export of the original Palabreo artifact's `decks`/`cards`. */
export interface Backup {
  app: 'palabreo';
  version: 1;
  exportedAt: number;
  decks: Deck[];
  cards: Card[];
}

export async function exportBackup(): Promise<Blob> {
  const data: Backup = {
    app: 'palabreo', version: 1, exportedAt: Date.now(),
    decks: await db.decks.toArray(), cards: await db.cards.toArray(),
  };
  return new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
}

type Loose = Record<string, unknown>;

/** Normalize decks/cards from any supported shape; returns how many were imported. */
export function normalizeImport(raw: unknown): { decks: Deck[]; cards: Card[] } {
  const obj = (raw ?? {}) as Loose;
  const rawDecks = (Array.isArray(obj.decks) ? obj.decks : []) as Loose[];
  const rawCards = (Array.isArray(obj.cards) ? obj.cards : []) as Loose[];
  const idMap = new Map<string, string>();
  const decks: Deck[] = rawDecks.map((d) => {
    const id = uid();
    idMap.set(String(d.id ?? ''), id);
    return {
      id,
      name: String(d.name ?? 'Mazo importado'),
      emoji: String(d.emoji ?? '📚'),
      color: (['accent', 'gold', 'coral', 'indigo', 'sage'].includes(String(d.color)) ? d.color : 'accent') as Deck['color'],
      category: d.category ? String(d.category) : undefined,
      createdAt: Number(d.createdAt) || Date.now(),
    };
  });
  const cards: Card[] = [];
  for (const c of rawCards) {
    const deckId = idMap.get(String(c.deckId ?? ''));
    if (!deckId || !c.en) continue;
    const pick = (k: keyof typeof EMPTY_CONTENT) => (typeof c[k] === 'string' ? (c[k] as string) : '');
    const srs = c.srs as Card['srs'] | undefined;
    cards.push({
      ...EMPTY_CONTENT,
      en: pick('en'), es: pick('es'), ipa: pick('ipa'), pos: pick('pos'), emoji: pick('emoji'),
      example: pick('example'), exampleEs: pick('exampleEs'), exampleIpaWords: pick('exampleIpaWords'),
      exampleIpaNative: pick('exampleIpaNative'), imageUrl: pick('imageUrl'), imageCredit: pick('imageCredit'),
      audioUrl: pick('audioUrl'),
      id: uid(), deckId, createdAt: Number(c.createdAt) || Date.now(),
      srs: srs && typeof srs.dueAt === 'number' ? srs : newSrs(),
    });
  }
  return { decks, cards };
}

export async function importBackup(file: Blob): Promise<{ decks: number; cards: number }> {
  const { decks, cards } = normalizeImport(JSON.parse(await file.text()));
  await db.transaction('rw', db.decks, db.cards, async () => {
    await db.decks.bulkAdd(decks);
    await db.cards.bulkAdd(cards);
  });
  return { decks: decks.length, cards: cards.length };
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
