import { cached } from './db';
import type { CardContent } from './types';
import { lookupDictionary } from './sources/dictionary';
import { translateWord, myMemory } from './sources/translate';
import { findExample } from './sources/tatoeba';
import { cmuIpa, sentenceIpaWords } from './sources/cmudict';
import { emojiFor } from './sources/emoji';
import { searchImages, type ImageCandidate } from './sources/images';
import { soft } from './sources/http';
import { aiFill } from './ai';
import { getSettings } from './settings';

export type Filled = Partial<CardContent>;

export interface EnrichResult {
  content: Filled;
  images: ImageCandidate[];
  /** Fields still empty after every source (shown as "faltan" in the review screen). */
  missing: (keyof CardContent)[];
  usedAi: boolean;
}

const WANTED: (keyof CardContent)[] = ['es', 'ipa', 'pos', 'emoji', 'example', 'exampleEs', 'exampleIpaWords'];

/**
 * Fill a card from free sources, in parallel, each result cached in IndexedDB.
 * Anything the user already typed (`given`) is kept as is.
 */
export async function enrichWord(en: string, given: Filled = {}): Promise<EnrichResult> {
  const word = en.trim();
  const key = word.toLowerCase();
  const single = !/\s/.test(word);

  const [dict, es, ex, cmu, emoji, images] = await Promise.all([
    single ? soft(cached(`dict:${key}`, () => lookupDictionary(word))) : null,
    given.es ? given.es : soft(cached(`es:${key}`, () => translateWord(word))),
    soft(cached(`ex:${key}`, () => findExample(word))),
    single ? soft(cmuIpa(word)) : soft(sentenceIpaWords(word).then(joinPhraseIpa)),
    soft(phraseEmoji(word)),
    soft(cached(`img:${key}`, () => searchImages(word))),
  ]);

  const content: Filled = {
    en: word,
    es: es ?? '',
    ipa: dict?.ipa || cmu || '',
    pos: dict?.pos || (single ? '' : 'frase'),
    emoji: emoji ?? '',
    audioUrl: dict?.audioUrl ?? '',
    example: ex?.en || dict?.example || '',
    exampleEs: ex?.es || '',
    ...stripEmpty(given),
  };

  // A dictionary example has no translation: machine-translate just that sentence.
  if (content.example && !content.exampleEs) {
    content.exampleEs = (await soft(cached(`mt:${content.example}`, () => myMemory(content.example!)))) ?? '';
  }
  if (content.example && !content.exampleIpaWords) {
    content.exampleIpaWords = (await soft(sentenceIpaWords(content.example))) ?? '';
  }
  if (images?.length && !content.imageUrl) {
    content.imageUrl = images[0].full;
    content.imageCredit = images[0].credit;
  }

  let missing = WANTED.filter((k) => !content[k]);
  let usedAi = false;
  const { aiFallback, proxyUrl } = getSettings();
  if (aiFallback && proxyUrl && (missing.length || !content.exampleIpaNative)) {
    const ai = await soft(aiFill(content, [...missing, 'exampleIpaNative']));
    if (ai) {
      for (const [k, v] of Object.entries(ai) as [keyof CardContent, string][]) {
        if (v && !content[k]) content[k] = v;
      }
      usedAi = true;
      missing = WANTED.filter((k) => !content[k]);
    }
  }
  return { content, images: images ?? [], missing, usedAi };
}

/** "/ˈlɪvɪŋ/ /ruːm/" → "/ˈlɪvɪŋ ruːm/" (a phrase reads as one unit). */
export const joinPhraseIpa = (s: string) => (s ? `/${s.replace(/\//g, '').replace(/\s+/g, ' ').trim()}/` : '');

/** Emoji for a phrase: the whole phrase, else its head word (last word first: "living room" → room). */
async function phraseEmoji(phrase: string): Promise<string> {
  const whole = await emojiFor(phrase);
  if (whole) return whole;
  for (const w of phrase.split(/\s+/).reverse()) {
    const e = await emojiFor(w, true);
    if (e) return e;
  }
  return '';
}

function stripEmpty(o: Filled): Filled {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Filled;
}

/** Enrich many words with limited concurrency, reporting progress after each one. */
export async function enrichMany(
  items: { en: string; es?: string }[],
  onProgress: (done: number, total: number, last: EnrichResult) => void,
  concurrency = 3,
): Promise<EnrichResult[]> {
  const results: EnrichResult[] = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const it = items[i];
      results[i] = await enrichWord(it.en, it.es ? { es: it.es } : {});
      onProgress(++done, items.length, results[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
