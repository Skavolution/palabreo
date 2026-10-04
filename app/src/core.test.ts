import { describe, expect, it } from 'vitest';
import { gradeCard, newSrs } from './srs';
import { parseDictionary } from './sources/dictionary';
import { parseWiktionarySpanish } from './sources/translate';
import { pickExample } from './sources/tatoeba';
import { arpabetToIpa, cmuIpa, sentenceIpaWords } from './sources/cmudict';
import { emojiFor } from './sources/emoji';
import { parseOpenverse, parsePixabay } from './sources/images';
import { parseVocabulary } from './ocr';

const DAY = 86_400_000;

describe('SM-2', () => {
  it('follows the original intervals 1 → 6 → ×ease', () => {
    const t = 0;
    let s = gradeCard(newSrs(t), 'good', t);
    expect(s.interval).toBe(1);
    s = gradeCard(s, 'good', t);
    expect(s.interval).toBe(6);
    s = gradeCard(s, 'good', t);
    expect(s.interval).toBe(15);
    expect(s.dueAt).toBe(15 * DAY);
  });
  it('"again" resets and re-shows in 10 minutes', () => {
    const s = gradeCard({ ease: 2.5, interval: 20, reps: 4, lapses: 0, dueAt: 0 }, 'again', 1000);
    expect(s).toMatchObject({ interval: 0, reps: 0, lapses: 1, ease: 2.3, dueAt: 1000 + 600_000 });
  });
  it('ease never drops below 1.3', () => {
    let s = newSrs(0);
    for (let i = 0; i < 20; i++) s = gradeCard(s, 'hard', 0);
    expect(s.ease).toBe(1.3);
  });
});

describe('Free Dictionary parsing', () => {
  it('takes IPA, US audio, Spanish POS and a usable example', () => {
    const r = parseDictionary([
      {
        phonetics: [{ text: '/ˈkɪtʃən/', audio: 'https://x/kitchen-uk.mp3' }, { audio: '//x/kitchen-us.mp3' }],
        meanings: [{ partOfSpeech: 'noun', definitions: [{ example: 'hot' }, { example: 'we ate in the kitchen' }] }],
      },
    ]);
    expect(r).toEqual({
      ipa: '/ˈkɪtʃən/',
      audioUrl: 'https://x/kitchen-us.mp3',
      pos: 'sustantivo',
      example: 'We ate in the kitchen.',
    });
  });
});

describe('Wiktionary translations', () => {
  it('extracts Spanish terms only', () => {
    const wt = [
      '* French: {{t+|fr|cuisine|f}}',
      '* Spanish: {{t+|es|cocina|f}}, {{t|es|fogón|m}}, {{t+|es|cocina|f}}',
      '* Italian: {{t+|it|cucina|f}}',
    ].join('\n');
    expect(parseWiktionarySpanish(wt)).toEqual(['cocina', 'fogón']);
  });
});

describe('Tatoeba example choice', () => {
  it('prefers a short sentence that contains the whole word and has Spanish', () => {
    const ex = pickExample('cat', [
      { text: 'Category theory is hard to learn for most people.', translations: [[{ lang: 'spa', text: 'x' }]] },
      { text: 'The cat is sleeping on the sofa right now.', translations: [[{ lang: 'spa', text: 'El gato duerme en el sofá.' }]] },
      { text: 'A cat.', translations: [[{ lang: 'spa', text: 'Un gato.' }]] },
      { text: 'My cat likes fish.', translations: [[{ lang: 'fra', text: 'Mon chat aime le poisson.' }]] },
    ]);
    expect(ex).toEqual({ en: 'The cat is sleeping on the sofa right now.', es: 'El gato duerme en el sofá.' });
  });
});

describe('CMUdict → IPA', () => {
  it('converts ARPAbet with stress placed before the onset', () => {
    expect(arpabetToIpa('K IH1 CH AH0 N')).toBe('/ˈkɪtʃən/');
    expect(arpabetToIpa('W AO1 T ER0')).toBe('/ˈwɔːtər/');
    expect(arpabetToIpa('B Y UW1 T AH0 F AH0 L')).toBe('/ˈbjuːtəfəl/');
    expect(arpabetToIpa('K AE1 T')).toBe('/kæt/');
    expect(arpabetToIpa('S ER0 P R AY1 Z')).toBe('/sərˈpraɪz/');
  });
  it('looks words and sentences up offline', async () => {
    expect(await cmuIpa('House')).toBe('/haʊs/');
    expect(await sentenceIpaWords('I drink water.')).toBe('/aɪ/ /drɪŋk/ /ˈwɔːtər/');
  });
});

describe('emoji', () => {
  it('maps common words', async () => {
    expect(await emojiFor('house')).toBe('🏠');
    expect(await emojiFor('apples')).not.toBe('');
  });
});

describe('image providers', () => {
  it('normalizes results', () => {
    expect(parseOpenverse({ results: [{ url: 'u', thumbnail: 't', creator: 'Ana', license: 'by' }] })).toEqual([
      { thumb: 't', full: 'u', credit: 'Ana · BY', source: 'openverse' },
    ]);
    expect(parsePixabay({ hits: [{ previewURL: 'p', webformatURL: 'w', user: 'Bo' }] })[0].credit).toBe('Bo · Pixabay');
  });
});

describe('OCR vocabulary parsing', () => {
  it('handles numbered lists, pairs, columns, titles and drops instructions', () => {
    const text = [
      'Unit 8   Lesson A',
      'Vocabulary',
      'Listen and repeat the words in the box below with a partner please.',
      '1. kitchen – cocina',
      '2) living room',
      'a) bedroom: dormitorio    b) bathroom',
      '• garden',
      'kitchen',
      '3.',
    ].join('\n');
    const r = parseVocabulary(text);
    expect(r.title).toBe('Unit 8 – Lesson A');
    expect(r.words).toEqual([
      { en: 'kitchen', es: 'cocina' },
      { en: 'living room' },
      { en: 'bedroom', es: 'dormitorio' },
      { en: 'bathroom' },
      { en: 'garden' },
    ]);
  });
});

describe('phrases, pasted lists and imports', async () => {
  const { joinPhraseIpa } = await import('./enrich');
  const { parseWordList } = await import('./views/AddWords');
  const { normalizeImport } = await import('./backup');
  it('joins phrase IPA into one unit', () => {
    expect(joinPhraseIpa('/ˈlɪvɪŋ/ /ruːm/')).toBe('/ˈlɪvɪŋ ruːm/');
    expect(joinPhraseIpa('')).toBe('');
  });
  it('parses pasted lists with optional translations and dedupes', () => {
    expect(parseWordList('kitchen\nbedroom = dormitorio, Kitchen; well-known\tconocido')).toEqual([
      { en: 'kitchen' }, { en: 'bedroom', es: 'dormitorio' }, { en: 'well-known', es: 'conocido' },
    ]);
  });
  it('imports artifact-shaped data, remapping deck ids and keeping SRS', () => {
    const r = normalizeImport({
      decks: [{ id: 'old1', name: 'Unidad 8', emoji: '🏠', color: 'gold' }],
      cards: [
        { id: 'c1', deckId: 'old1', en: 'kitchen', es: 'cocina', imageAssetId: 'x', srs: { ease: 2.6, interval: 6, reps: 2, lapses: 0, dueAt: 5 } },
        { id: 'c2', deckId: 'missing', en: 'orphan' },
      ],
    });
    expect(r.decks).toHaveLength(1);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].deckId).toBe(r.decks[0].id);
    expect(r.cards[0].srs.interval).toBe(6);
    expect(r.cards[0]).not.toHaveProperty('imageAssetId');
  });
});
