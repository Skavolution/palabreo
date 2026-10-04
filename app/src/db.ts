import Dexie, { type EntityTable } from 'dexie';
import type { Card, CardContent, Deck } from './types';
import { EMPTY_CONTENT } from './types';
import { newSrs } from './srs';

interface CacheEntry {
  key: string; // e.g. "dict:kitchen"
  value: unknown;
  at: number;
}

export const db = new Dexie('palabreo') as Dexie & {
  decks: EntityTable<Deck, 'id'>;
  cards: EntityTable<Card, 'id'>;
  cache: EntityTable<CacheEntry, 'key'>;
};

db.version(1).stores({
  decks: 'id, createdAt',
  cards: 'id, deckId, createdAt, srs.dueAt',
  cache: 'key',
});

export const uid = () => 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export async function addDeck(data: Omit<Deck, 'id' | 'createdAt'>): Promise<string> {
  const id = uid();
  await db.decks.add({ id, createdAt: Date.now(), ...data });
  return id;
}

export async function addCards(deckId: string, contents: Partial<CardContent>[]): Promise<void> {
  const now = Date.now();
  await db.cards.bulkAdd(
    contents.map((c, i) => ({ ...EMPTY_CONTENT, ...c, id: uid(), deckId, createdAt: now + i, srs: newSrs(now) })),
  );
}

export async function deleteDeck(id: string): Promise<void> {
  await db.transaction('rw', db.decks, db.cards, async () => {
    await db.cards.where('deckId').equals(id).delete();
    await db.decks.delete(id);
  });
}

/** Read-through cache for free-source lookups, so a word is fetched at most once. */
export async function cached<T>(key: string, fetcher: () => Promise<T>, maxAgeDays = 180): Promise<T> {
  const hit = await db.cache.get(key).catch(() => undefined);
  if (hit && Date.now() - hit.at < maxAgeDays * 86_400_000) return hit.value as T;
  const value = await fetcher();
  await db.cache.put({ key, value, at: Date.now() }).catch(() => {});
  return value;
}
