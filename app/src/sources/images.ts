import { getSettings } from '../settings';
import { getJson, soft } from './http';

/** Free image search. Openverse works with no key; Pexels / Pixabay join in if you add a free key. */
export interface ImageCandidate {
  thumb: string;
  full: string;
  credit: string;
  source: 'openverse' | 'pexels' | 'pixabay';
}

interface OpenverseResp { results?: { url: string; thumbnail?: string; creator?: string; license?: string }[] }
interface PexelsResp { photos?: { src: { medium: string; large: string }; photographer: string }[] }
interface PixabayResp { hits?: { previewURL: string; webformatURL: string; user: string }[] }

export function parseOpenverse(d: OpenverseResp): ImageCandidate[] {
  return (d.results ?? []).map((r) => ({
    thumb: r.thumbnail || r.url,
    full: r.url,
    credit: `${r.creator ?? 'Openverse'} · ${(r.license ?? 'cc').toUpperCase()}`,
    source: 'openverse',
  }));
}
export function parsePexels(d: PexelsResp): ImageCandidate[] {
  return (d.photos ?? []).map((p) => ({ thumb: p.src.medium, full: p.src.large, credit: `${p.photographer} · Pexels`, source: 'pexels' }));
}
export function parsePixabay(d: PixabayResp): ImageCandidate[] {
  return (d.hits ?? []).map((h) => ({ thumb: h.previewURL, full: h.webformatURL, credit: `${h.user} · Pixabay`, source: 'pixabay' }));
}

export async function searchImages(word: string, perSource = 6): Promise<ImageCandidate[]> {
  const q = encodeURIComponent(word);
  const { pexelsKey, pixabayKey } = getSettings();
  const jobs: Promise<ImageCandidate[] | null>[] = [];
  if (pixabayKey) {
    jobs.push(soft(getJson<PixabayResp>(
      `https://pixabay.com/api/?key=${pixabayKey}&q=${q}&safesearch=true&per_page=${Math.max(3, perSource)}&image_type=all`,
    ).then(parsePixabay)));
  }
  if (pexelsKey) {
    jobs.push(soft(getJson<PexelsResp>(`https://api.pexels.com/v1/search?per_page=${perSource}&query=${q}`, {
      headers: { Authorization: pexelsKey },
    }).then(parsePexels)));
  }
  jobs.push(soft(getJson<OpenverseResp>(
    `https://api.openverse.org/v1/images/?page_size=${perSource}&mature=false&q=${q}`,
  ).then(parseOpenverse)));
  const lists = await Promise.all(jobs);
  return lists.flatMap((l) => l ?? []).slice(0, perSource * 2);
}
