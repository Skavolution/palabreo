import type { Card, Grade, Srs } from './types';

const DAY = 86_400_000;

export function newSrs(now = Date.now()): Srs {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, dueAt: now };
}

/** Simplified SM-2, same rules as the original Palabreo artifact. */
export function gradeCard(srs: Srs | undefined, grade: Grade, now = Date.now()): Srs {
  let { ease, interval, reps, lapses } = srs ?? newSrs(now);
  ease = ease || 2.5;
  if (grade === 'again') {
    return { ease: Math.max(1.3, ease - 0.2), interval: 0, reps: 0, lapses: (lapses || 0) + 1, dueAt: now + 10 * 60_000 };
  }
  if (grade === 'hard') {
    interval = Math.max(1, Math.round((interval || 1) * 1.2));
    ease = Math.max(1.3, ease - 0.15);
  } else if (grade === 'good') {
    interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(interval * ease);
  } else {
    interval = reps === 0 ? 4 : reps === 1 ? 8 : Math.round(interval * ease * 1.3);
    ease += 0.15;
  }
  return { ease, interval, reps: (reps || 0) + 1, lapses: lapses || 0, dueAt: now + interval * DAY };
}

export const isDue = (c: Card, now = Date.now()) => !c.srs || c.srs.dueAt <= now;
export const isMastered = (c: Card) => !!c.srs && c.srs.interval >= 21;
