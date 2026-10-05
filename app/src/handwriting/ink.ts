/** Ink captured on the pad: each stroke is parallel arrays of x, y (px) and t (ms since the first stroke). */
export type Stroke = [xs: number[], ys: number[], ts: number[]];
export interface Ink {
  strokes: Stroke[];
  width: number;
  height: number;
}

export const GOOGLE_HANDWRITING_URL =
  'https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8';

/** Body for Google's handwriting recognizer (the engine behind Gboard's handwriting keyboard). */
export function googleRequestBody(ink: Ink, language = 'en') {
  return {
    options: 'enable_pre_space',
    requests: [
      {
        writing_guide: { writing_area_width: Math.round(ink.width), writing_area_height: Math.round(ink.height) },
        ink: ink.strokes.map(([xs, ys, ts]) => [xs.map(Math.round), ys.map(Math.round), ts.map(Math.round)]),
        language,
        max_num_results: 8,
        max_completions: 0,
      },
    ],
  };
}

/** `["SUCCESS", [["id", ["kitchen", "kitchem", …], …]]]` → candidates, best first. */
export function parseGoogleResponse(data: unknown): string[] {
  if (!Array.isArray(data) || data[0] !== 'SUCCESS') throw new Error('handwriting: ' + JSON.stringify(data).slice(0, 120));
  const first = (data[1] as unknown[] | undefined)?.[0] as unknown[] | undefined;
  const cands = first?.[1];
  return Array.isArray(cands) ? cands.filter((c): c is string => typeof c === 'string' && !!c.trim()).map((c) => c.trim()) : [];
}

export const hasInk = (ink: Ink) => ink.strokes.some(([xs]) => xs.length > 1);
