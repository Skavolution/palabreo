/** Offline word → emoji using emojilib's keyword table. */
interface EmojiIndex {
  /** The emoji's own name ("house", "red apple"): reliable. */
  names: Map<string, string>;
  /** Loose tags ("room" is a tag of 🏥): only for the whole word the user typed. */
  tags: Map<string, string>;
}
let indexPromise: Promise<EmojiIndex> | null = null;

function loadIndex() {
  indexPromise ??= import('emojilib').then((m) => {
    const table = (m.default ?? m) as Record<string, string[]>;
    const names = new Map<string, string>();
    const tags = new Map<string, string>();
    for (const [emoji, keywords] of Object.entries(table)) {
      keywords.forEach((k, i) => {
        const key = k.toLowerCase().replace(/_/g, ' ');
        const target = i === 0 ? names : tags;
        if (!target.has(key)) target.set(key, emoji);
      });
    }
    return { names, tags };
  });
  return indexPromise;
}

export async function emojiFor(word: string, namesOnly = false): Promise<string> {
  const { names, tags } = await loadIndex();
  const w = word.toLowerCase().trim();
  for (const key of [w, w.replace(/s$/, '')]) {
    const hit = names.get(key) ?? (namesOnly ? undefined : tags.get(key));
    if (hit) return hit;
  }
  return '';
}
