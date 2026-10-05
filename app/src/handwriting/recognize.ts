import { getSettings } from '../settings';
import { aiRecognize } from '../ai';
import { GOOGLE_HANDWRITING_URL, googleRequestBody, parseGoogleResponse, type Ink } from './ink';

/**
 * Read handwriting, cheapest first:
 *  1. the browser's own recognizer (offline; only some Chrome builds have it),
 *  2. Google's free handwriting engine, sent the strokes (direct, or through the Worker if blocked),
 *  3. Claude vision through the Worker — only if "Completar con IA" is on.
 */
export type Recognizer = (ink: Ink, image: () => Promise<Blob | null>) => Promise<string[]>;

export class OfflineError extends Error {}

export async function recognizeWith(recognizers: Recognizer[], ink: Ink, image: () => Promise<Blob | null>): Promise<string[]> {
  let lastError: unknown = null;
  for (const r of recognizers) {
    try {
      const out = await r(ink, image);
      if (out.length) return out;
    } catch (e) {
      lastError = e;
    }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError();
  throw lastError ?? new Error('handwriting: no result');
}

export function recognizeInk(ink: Ink, image: () => Promise<Blob | null>): Promise<string[]> {
  return recognizeWith([nativeRecognizer, googleRecognizer, claudeRecognizer], ink, image);
}

/* ---------- 1. Handwriting Recognition API (navigator.createHandwritingRecognizer) ---------- */
interface NativeDrawing {
  addStroke(s: unknown): void;
  getPrediction(): Promise<{ text: string }[]>;
}
interface NativeRecognizer {
  startDrawing(hints: Record<string, unknown>): NativeDrawing;
  finish?(): void;
}
type NavigatorWithHw = Navigator & { createHandwritingRecognizer?: (c: { languages: string[] }) => Promise<NativeRecognizer> };
type StrokeCtor = new () => { addPoint(p: { x: number; y: number; t: number }): void };

export const nativeRecognizer: Recognizer = async (ink) => {
  const nav = navigator as NavigatorWithHw;
  const Stroke = (globalThis as unknown as { HandwritingStroke?: StrokeCtor }).HandwritingStroke;
  if (!nav.createHandwritingRecognizer || !Stroke) return [];
  const rec = await nav.createHandwritingRecognizer({ languages: ['en'] });
  try {
    const drawing = rec.startDrawing({ recognitionType: 'text', inputType: 'stylus', alternatives: 6 });
    for (const [xs, ys, ts] of ink.strokes) {
      const s = new Stroke();
      xs.forEach((x, i) => s.addPoint({ x, y: ys[i], t: ts[i] }));
      drawing.addStroke(s);
    }
    return (await drawing.getPrediction()).map((p) => p.text.trim()).filter(Boolean);
  } finally {
    rec.finish?.();
  }
};

/* ---------- 2. Google handwriting (free, no key) ---------- */
export const googleRecognizer: Recognizer = async (ink) => {
  const body = JSON.stringify(googleRequestBody(ink));
  try {
    const r = await fetch(GOOGLE_HANDWRITING_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return parseGoogleResponse(await r.json());
  } catch (e) {
    const { proxyUrl, proxyToken } = getSettings();
    if (!proxyUrl) throw e;
    const r = await fetch(`${proxyUrl.replace(/\/$/, '')}/handwriting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${proxyToken}` },
      body,
    });
    if (!r.ok) throw new Error(`proxy HTTP ${r.status}`);
    return parseGoogleResponse(await r.json());
  }
};

/* ---------- 3. Claude vision (paid fallback, opt-in) ---------- */
export const claudeRecognizer: Recognizer = async (_ink, image) => {
  const { aiFallback, proxyUrl } = getSettings();
  if (!aiFallback || !proxyUrl) return [];
  const png = await image();
  return png ? aiRecognize(png) : [];
};
