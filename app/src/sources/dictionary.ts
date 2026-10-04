import { getJson } from './http';

/** Free Dictionary API — https://dictionaryapi.dev (no key). */
export interface DictResult {
  ipa: string;
  audioUrl: string;
  pos: string;
  example: string;
}

interface ApiEntry {
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: { partOfSpeech?: string; definitions?: { example?: string }[] }[];
}

const POS_ES: Record<string, string> = {
  noun: 'sustantivo', verb: 'verbo', adjective: 'adjetivo', adverb: 'adverbio', pronoun: 'pronombre',
  preposition: 'preposición', conjunction: 'conjunción', interjection: 'interjección', determiner: 'determinante',
  article: 'artículo', numeral: 'número', phrase: 'frase',
};
export const posToSpanish = (p: string) => POS_ES[p.toLowerCase()] ?? p;

export function parseDictionary(entries: ApiEntry[]): DictResult {
  const phonetics = entries.flatMap((e) => e.phonetics ?? []);
  // Prefer American audio, then any audio.
  const audio =
    phonetics.find((p) => p.audio && /-us\.mp3$/.test(p.audio))?.audio ||
    phonetics.find((p) => p.audio)?.audio ||
    '';
  const ipaRaw = entries.find((e) => e.phonetic)?.phonetic || phonetics.find((p) => p.text)?.text || '';
  const meanings = entries.flatMap((e) => e.meanings ?? []);
  const example =
    meanings
      .flatMap((m) => m.definitions ?? [])
      .map((d) => d.example ?? '')
      .find((ex) => ex.split(' ').length >= 4) ?? '';
  return {
    ipa: normalizeIpa(ipaRaw),
    audioUrl: audio.startsWith('//') ? 'https:' + audio : audio,
    pos: meanings[0]?.partOfSpeech ? posToSpanish(meanings[0].partOfSpeech) : '',
    example: example ? capitalize(example) : '',
  };
}

export function normalizeIpa(s: string): string {
  const t = s.trim().replace(/^[/[]|[/\]]$/g, '');
  return t ? `/${t}/` : '';
}

const capitalize = (s: string) => {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.');
};

export async function lookupDictionary(word: string): Promise<DictResult> {
  const data = await getJson<ApiEntry[]>(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
  );
  return parseDictionary(data);
}
