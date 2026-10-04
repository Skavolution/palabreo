export interface Settings {
  /** Optional Cloudflare Worker that proxies CORS-blocked sources and holds paid-AI keys. */
  proxyUrl: string;
  proxyToken: string;
  /** Fill gaps the free sources left with paid AI (needs the Worker). */
  aiFallback: boolean;
  pexelsKey: string;
  pixabayKey: string;
  theme: 'auto' | 'light' | 'dark';
  voiceURI: string;
}

const DEFAULTS: Settings = {
  proxyUrl: '', proxyToken: '', aiFallback: false, pexelsKey: '', pixabayKey: '', theme: 'auto', voiceURI: '',
};
const KEY = 'palabreo-settings';

export function getSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: settings live for this session only */
  }
  return next;
}
