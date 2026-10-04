import { getJson } from './http';

/** Tatoeba — real, human-translated example sentences (CC BY 2.0 FR). */
export interface Example {
  en: string;
  es: string;
}

interface ApiSentence {
  text?: string;
  lang?: string;
  translations?: ApiSentence[][] | ApiSentence[];
}

/**
 * Choose the most learner-friendly pair: contains the word as a whole word, has a Spanish
 * translation, and is short but not trivial (prefer 4–12 words).
 */
export function pickExample(word: string, results: ApiSentence[]): Example | null {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  const pairs: Example[] = [];
  for (const r of results) {
    if (!r.text || !re.test(r.text)) continue;
    const trans = (r.translations ?? []).flat() as ApiSentence[];
    const es = trans.find((t) => t.lang === 'spa' && t.text)?.text;
    if (es) pairs.push({ en: r.text.trim(), es: es.trim() });
  }
  const score = (p: Example) => {
    const n = p.en.split(/\s+/).length;
    return n >= 4 && n <= 12 ? n : 100 + Math.abs(n - 8);
  };
  pairs.sort((a, b) => score(a) - score(b));
  return pairs[0] ?? null;
}

export async function findExample(word: string): Promise<Example | null> {
  const url =
    'https://tatoeba.org/eng/api_v0/search?from=eng&to=spa&orphans=no&unapproved=no&sort=relevance&query=' +
    encodeURIComponent(`="${word}"`);
  const data = await getJson<{ results?: ApiSentence[] }>(url);
  return pickExample(word, data.results ?? []);
}
