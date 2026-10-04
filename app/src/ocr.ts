/**
 * Textbook page photo → word list, fully in the browser with Tesseract.js (free).
 * Language data (~10 MB) downloads the first time and is cached afterwards.
 */

export interface Extracted {
  title: string;
  words: { en: string; es?: string }[];
}

export async function ocrImage(image: Blob, onProgress?: (pct: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng+spa', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

// Short function words that show up in exercise instructions, not vocabulary lists.
const NOISE = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'is', 'are', 'it', 'you', 'your',
  'i', 'we', 'they', 'he', 'she', 'my', 'this', 'that', 'page', 'unit', 'lesson', 'exercise', 'listen', 'repeat',
  'look', 'read', 'write', 'match', 'complete', 'answer', 'practice', 'vocabulary', 'pair', 'work',
]);

const TITLE_RE = /\b(unit|unidad|lesson|lecci[oó]n)\s*[\dA-Z]+\b/gi;

/**
 * Clean raw OCR text into candidate vocabulary. Understands common textbook layouts:
 *   "1. kitchen"   "kitchen – cocina"   "kitchen: cocina"   "kitchen = cocina"   "a) bedroom"
 * Long lines (instructions, sentences) are dropped; the user confirms the list anyway.
 */
export function parseVocabulary(text: string): Extracted {
  const titleParts = [...new Set((text.match(TITLE_RE) ?? []).map((t) => t.replace(/\s+/g, ' ').trim()))];
  const seen = new Set<string>();
  const words: Extracted['words'] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    // A line can hold several columns separated by wide gaps or bullets.
    for (const chunk of rawLine.split(/\s{3,}|\s[•·|]\s/)) {
      let line = chunk
        .replace(/^[\s\d]+[.)\]:-]?\s+/, '') // "1. " "12) "
        .replace(/^[a-hA-H][.)]\s+/, '') // "a) "
        .replace(/^[•·*–—-]\s*/, '')
        .trim();
      if (!line) continue;

      let es: string | undefined;
      const pair = line.match(/^(.+?)\s*(?:[–—=:]|\s-\s)\s*(.+)$/);
      if (pair) {
        line = pair[1].trim();
        es = pair[2].replace(/[^\p{L}\s,'-]/gu, '').trim() || undefined;
      }
      const en = line.replace(/[^A-Za-z\s'-]/g, '').replace(/\s+/g, ' ').trim();
      if (!en || en.length < 2) continue;
      const n = en.split(' ').length;
      if (n > 4) continue; // a sentence or an instruction, not a vocabulary item
      if (n === 1 && NOISE.has(en.toLowerCase())) continue;
      if (TITLE_RE.test(en)) { TITLE_RE.lastIndex = 0; continue; }
      TITLE_RE.lastIndex = 0;
      const key = en.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(es ? { en: key, es } : { en: key });
    }
  }
  return { title: titleParts.join(' – '), words };
}
