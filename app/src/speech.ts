import { getSettings } from './settings';

/**
 * Pronunciation: play the dictionary's native mp3 when the card has one (same voice everywhere,
 * cached offline), otherwise the device's English TTS voice — preferring natural/cloud voices.
 */

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve([]);
    const now = speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    // The list loads asynchronously on many browsers; speaking before it arrives uses the
    // system default voice (often Spanish on a Spanish device).
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 600);
  });
}

export async function englishVoices(): Promise<SpeechSynthesisVoice[]> {
  return (await loadVoices()).filter((v) => /^en/i.test(v.lang));
}

function bestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const score = (v: SpeechSynthesisVoice) =>
    (v.localService === false ? 5 : 0) +
    (/google/i.test(v.name) ? 4 : 0) +
    (/natural|neural|enhanced|premium/i.test(v.name) ? 4 : 0) +
    (/^en-US/i.test(v.lang) ? 2 : /^en-GB/i.test(v.lang) ? 1 : 0);
  return [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export async function speakText(text: string): Promise<boolean> {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  const voices = await englishVoices();
  const { voiceURI } = getSettings();
  const voice = voices.find((v) => v.voiceURI === voiceURI) ?? bestVoice(voices);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? 'en-US';
  if (voice) u.voice = voice;
  u.rate = 0.95;
  speechSynthesis.speak(u);
  return true;
}

let current: HTMLAudioElement | null = null;
export async function speakWord(word: string, audioUrl?: string): Promise<boolean> {
  if (audioUrl) {
    try {
      current?.pause();
      current = new Audio(audioUrl);
      await current.play();
      return true;
    } catch {
      /* offline and not cached, or blocked: fall back to TTS */
    }
  }
  return speakText(word);
}
