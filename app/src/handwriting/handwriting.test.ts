import { describe, expect, it } from 'vitest';
import { gradeHandwriting } from './grade';
import { googleRequestBody, hasInk, parseGoogleResponse, type Ink } from './ink';
import { recognizeWith, type Recognizer } from './recognize';

const ink: Ink = { strokes: [[[10.4, 20.6], [30, 31.2], [0, 16.7]]], width: 600.2, height: 180 };

describe('gradeHandwriting', () => {
  it('accepts an exact read, ignoring case, accents and spaces', () => {
    expect(gradeHandwriting(['Kitchen '], 'kitchen')).toEqual({ kind: 'correct', read: 'Kitchen ' });
    expect(gradeHandwriting(['cafe'], 'café').kind).toBe('correct');
    expect(gradeHandwriting(['living  room'], 'living room').kind).toBe('correct');
  });
  it('accepts the word when it is a close alternative, reporting what was read', () => {
    expect(gradeHandwriting(['kitchem', 'kitchen'], 'kitchen')).toEqual({ kind: 'close', read: 'kitchem' });
  });
  it('rejects a misspelling the recognizer is confident about', () => {
    expect(gradeHandwriting(['kichen', 'kicher'], 'kitchen')).toEqual({ kind: 'wrong', read: 'kichen' });
    expect(gradeHandwriting([], 'kitchen')).toEqual({ kind: 'wrong', read: '' });
  });
  it('only looks a few alternatives deep', () => {
    expect(gradeHandwriting(['a', 'b', 'c', 'd', 'e', 'f', 'kitchen'], 'kitchen').kind).toBe('wrong');
  });
});

describe('Google handwriting wire format', () => {
  it('sends rounded strokes with the writing area', () => {
    const body = googleRequestBody(ink);
    expect(body.requests[0].writing_guide).toEqual({ writing_area_width: 600, writing_area_height: 180 });
    expect(body.requests[0].ink).toEqual([[[10, 21], [30, 31], [0, 17]]]);
    expect(body.requests[0].language).toBe('en');
  });
  it('parses candidates and rejects failures', () => {
    expect(parseGoogleResponse(['SUCCESS', [['id', ['kitchen', ' kitchem ', ''], [], {}]]])).toEqual(['kitchen', 'kitchem']);
    expect(() => parseGoogleResponse(['FAILED_TO_PARSE_REQUEST_BODY'])).toThrow();
  });
  it('knows when there is ink', () => {
    expect(hasInk(ink)).toBe(true);
    expect(hasInk({ ...ink, strokes: [[[1], [1], [0]]] })).toBe(false);
  });
});

describe('recognizer chain', () => {
  const noImage = async () => null;
  it('uses the first recognizer that returns something', async () => {
    const calls: string[] = [];
    const empty: Recognizer = async () => { calls.push('native'); return []; };
    const broken: Recognizer = async () => { calls.push('google'); throw new Error('cors'); };
    const ai: Recognizer = async () => { calls.push('claude'); return ['kitchen']; };
    expect(await recognizeWith([empty, broken, ai], ink, noImage)).toEqual(['kitchen']);
    expect(calls).toEqual(['native', 'google', 'claude']);
  });
  it('surfaces the last error when nothing works', async () => {
    const broken: Recognizer = async () => { throw new Error('cors'); };
    await expect(recognizeWith([broken], ink, noImage)).rejects.toThrow('cors');
  });
});
