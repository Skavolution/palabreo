export type ColorKey = 'accent' | 'gold' | 'coral' | 'indigo' | 'sage';

export interface Deck {
  id: string;
  name: string;
  emoji: string;
  color: ColorKey;
  category?: string;
  createdAt: number;
}

export interface Srs {
  ease: number;
  interval: number; // days
  reps: number;
  lapses: number;
  dueAt: number; // epoch ms
}

/** Fields a card can have; anything empty is a "gap" the enricher can try to fill. */
export interface CardContent {
  en: string;
  es: string;
  ipa: string;
  pos: string;
  emoji: string;
  example: string;
  exampleEs: string;
  exampleIpaWords: string;
  exampleIpaNative: string;
  imageUrl: string;
  imageCredit: string;
  audioUrl: string;
}

export interface Card extends CardContent {
  id: string;
  deckId: string;
  createdAt: number;
  srs: Srs;
}

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export const EMPTY_CONTENT: CardContent = {
  en: '', es: '', ipa: '', pos: '', emoji: '', example: '', exampleEs: '',
  exampleIpaWords: '', exampleIpaNative: '', imageUrl: '', imageCredit: '', audioUrl: '',
};
