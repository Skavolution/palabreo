import { getSettings } from './settings';
import type { CardContent } from './types';

/** Client for the optional paid-AI fallback in the Worker (see ../worker). */
async function call<T>(path: string, body: unknown): Promise<T> {
  const { proxyUrl, proxyToken } = getSettings();
  if (!proxyUrl) throw new Error('No hay Worker configurado en Ajustes.');
  const r = await fetch(`${proxyUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${proxyToken}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Worker ${path}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Ask the AI for only the fields the free sources could not fill. */
export function aiFill(card: Partial<CardContent>, fields: (keyof CardContent)[]): Promise<Partial<CardContent>> {
  return call('/enrich', { card, fields });
}

/** Read a textbook page photo with Claude vision (when free OCR is not good enough). */
export async function aiExtract(image: Blob): Promise<{ title: string; words: { en: string; es?: string }[] }> {
  const data = await blobToBase64(image);
  return call('/extract', { mediaType: image.type || 'image/jpeg', data });
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(b);
  });
}
