/**
 * CMU Pronouncing Dictionary (offline, ~134k words) → American IPA.
 * Loaded lazily so the ~3 MB table is its own chunk, cached by the service worker.
 */

const VOWELS: Record<string, string> = {
  AA: 'ɑː', AE: 'æ', AH: 'ʌ', AO: 'ɔː', AW: 'aʊ', AY: 'aɪ', EH: 'ɛ', ER: 'ɜr', EY: 'eɪ',
  IH: 'ɪ', IY: 'iː', OW: 'oʊ', OY: 'ɔɪ', UH: 'ʊ', UW: 'uː',
};
const CONSONANTS: Record<string, string> = {
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'g', HH: 'h', JH: 'dʒ', K: 'k', L: 'l', M: 'm',
  N: 'n', NG: 'ŋ', P: 'p', R: 'r', S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};
// Two-consonant clusters that may start an English syllable (for placing the stress mark).
const ONSETS = new Set([
  'P R', 'P L', 'B R', 'B L', 'T R', 'D R', 'K R', 'K L', 'G R', 'G L', 'F R', 'F L', 'TH R', 'SH R',
  'S P', 'S T', 'S K', 'S M', 'S N', 'S L', 'S W', 'T W', 'K W', 'D W', 'P Y', 'B Y', 'K Y', 'M Y', 'F Y', 'HH Y',
]);

/** "K IH1 CH AH0 N" → "/ˈkɪtʃən/" */
export function arpabetToIpa(arpabet: string): string {
  const phones = arpabet.trim().split(/\s+/);
  const out: string[] = [];
  phones.forEach((ph, i) => {
    const m = ph.match(/^([A-Z]+)([012])?$/);
    if (!m) return;
    const [, base, stress] = m;
    if (!(base in VOWELS)) {
      out.push(CONSONANTS[base] ?? base.toLowerCase());
      return;
    }
    let sym = VOWELS[base];
    if (stress === '0') sym = base === 'AH' ? 'ə' : base === 'ER' ? 'ər' : sym.replace('ː', '');
    if (stress === '1' || stress === '2') {
      const mark = stress === '1' ? 'ˈ' : 'ˌ';
      // Move the mark back over the syllable onset (max two consonants, if a legal cluster).
      const prev = phones.slice(0, i);
      let back = 0;
      const isCons = (p?: string) => !!p && !/[012]$/.test(p);
      if (isCons(prev[prev.length - 1])) {
        back = 1;
        if (isCons(prev[prev.length - 2]) && ONSETS.has(`${prev[prev.length - 2]} ${prev[prev.length - 1]}`)) back = 2;
      }
      // Only stress-mark polysyllabic words or secondary stress; "/kæt/" reads better than "/ˈkæt/".
      const vowelCount = phones.filter((p) => /[012]$/.test(p)).length;
      if (vowelCount > 1) out.splice(out.length - back, 0, mark);
    }
    out.push(sym);
  });
  return `/${out.join('')}/`;
}

let dictPromise: Promise<Record<string, string>> | null = null;
function loadDict() {
  dictPromise ??= import('cmu-pronouncing-dictionary').then((m) => m.dictionary);
  return dictPromise;
}

export async function cmuIpa(word: string): Promise<string> {
  const dict = await loadDict();
  const key = word.toLowerCase().replace(/[^a-z']/g, '');
  const arpa = dict[key];
  return arpa ? arpabetToIpa(arpa) : '';
}

/** Word-by-word IPA for a sentence: "/aɪ/ /drɪŋk/ /ˈwɔːtər/". Unknown words are skipped. */
export async function sentenceIpaWords(sentence: string): Promise<string> {
  const dict = await loadDict();
  const words = sentence.toLowerCase().match(/[a-z']+/g) ?? [];
  const parts = words.map((w) => (dict[w] ? arpabetToIpa(dict[w]) : ''));
  return parts.filter(Boolean).length >= words.length * 0.8 ? parts.filter(Boolean).join(' ') : '';
}
