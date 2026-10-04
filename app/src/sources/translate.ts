import { getJson } from './http';

/**
 * English → Spanish. Wiktionary's translation tables first (curated, dictionary quality),
 * then MyMemory (free machine translation with a daily quota) for phrases and misses.
 */

/** Pull the Spanish terms out of an English Wiktionary page's wikitext. */
export function parseWiktionarySpanish(wikitext: string): string[] {
  const out: string[] = [];
  for (const line of wikitext.split('\n')) {
    if (!/^\*\s*Spanish\s*:/.test(line)) continue;
    for (const m of line.matchAll(/\{\{tt?\+?\|es\|([^|}]+)/g)) {
      const term = m[1].trim();
      if (term && !out.includes(term)) out.push(term);
    }
  }
  return out;
}

export async function wiktionarySpanish(word: string): Promise<string[]> {
  const url =
    'https://en.wiktionary.org/w/api.php?action=parse&format=json&prop=wikitext&formatversion=2&origin=*&page=' +
    encodeURIComponent(word.toLowerCase());
  const data = await getJson<{ parse?: { wikitext?: string } }>(url);
  return parseWiktionarySpanish(data.parse?.wikitext ?? '');
}

export async function myMemory(text: string, from = 'en', to = 'es'): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?langpair=${from}|${to}&q=${encodeURIComponent(text)}`;
  const data = await getJson<{ responseData?: { translatedText?: string }; responseStatus?: number | string }>(url);
  const t = data.responseData?.translatedText?.trim() ?? '';
  // MyMemory reports quota problems inside a 200 response.
  if (Number(data.responseStatus) !== 200 || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) {
    throw new Error('mymemory: ' + t);
  }
  return t;
}

/** Best short Spanish gloss: up to two Wiktionary senses ("cocina, fogón"), else MyMemory. */
export async function translateWord(word: string): Promise<string> {
  if (!/\s/.test(word.trim())) {
    const terms = await wiktionarySpanish(word).catch(() => []);
    if (terms.length) return terms.slice(0, 2).join(', ');
  }
  return myMemory(word);
}
