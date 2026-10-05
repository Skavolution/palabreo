export type HandwritingVerdict =
  | { kind: 'correct'; read: string }
  /** Best reading differs, but the expected word is one of the recognizer's close alternatives. */
  | { kind: 'close'; read: string }
  | { kind: 'wrong'; read: string };

const norm = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ');

/**
 * Forgiving but honest: handwriting is ambiguous ("rn" vs "m"), so if the right word is among the
 * top alternatives we accept it and show what we read. Otherwise it's a miss.
 */
export function gradeHandwriting(candidates: string[], expected: string, alternatives = 5): HandwritingVerdict {
  const read = candidates[0] ?? '';
  const target = norm(expected);
  if (read && norm(read) === target) return { kind: 'correct', read };
  if (candidates.slice(1, 1 + alternatives).some((c) => norm(c) === target)) return { kind: 'close', read };
  return { kind: 'wrong', read };
}
