import { getSettings } from '../settings';

/**
 * Fetch JSON from a public API. If the browser blocks it (CORS) or the network fails and a
 * Worker proxy is configured in Ajustes, retry once through the proxy.
 */
export async function getJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  try {
    const r = await fetch(url, init);
    if (r.status === 404) throw new NotFound(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof NotFound) throw e;
    const { proxyUrl, proxyToken } = getSettings();
    if (!proxyUrl) throw e;
    // The proxy's own token takes the Authorization header, so a source key (Pexels) rides along separately.
    const sourceKey = new Headers(init?.headers).get('Authorization');
    const r = await fetch(`${proxyUrl.replace(/\/$/, '')}/fetch?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${proxyToken}`, ...(sourceKey ? { 'X-Pexels-Key': sourceKey } : {}) },
    });
    if (r.status === 404) throw new NotFound(url);
    if (!r.ok) throw new Error(`proxy HTTP ${r.status} ${url}`);
    return (await r.json()) as T;
  }
}

export class NotFound extends Error {}

/** Run a lookup and turn any failure into `null`, so one dead source never blocks a card. */
export async function soft<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}
