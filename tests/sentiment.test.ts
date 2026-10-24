import { describe, expect, it } from 'vitest';
import { analyzeSentiment } from '../src/lib/sentiment';

const label = (s: string) => analyzeSentiment(s).label;

describe('analyzeSentiment', () => {
  it('scores plain positive and negative messages', () => {
    expect(label('This was really helpful, thank you!')).toBe('positive');
    expect(label('I find WhatsApp distracting and I personally avoid it')).toBe('negative');
    expect(label('We use Google chat group')).toBe('neutral');
  });

  it('handles negation', () => {
    expect(label('This is not good')).toBe('negative');
    expect(label("I hope that's not a problem")).toBe('positive');
  });

  it('weights the clause after "but"', () => {
    expect(label('The session was good but the audio was terrible')).toBe('negative');
  });

  it('scores emoji, and reads repeated 😭 as laughter when nothing negative is said', () => {
    expect(label('👍')).toBe('positive');
    expect(label('😡')).toBe('negative');
    const joke = analyzeSentiment('Origination of WhatsApp groups 😭😭😭');
    expect(joke.humor).toBe(true);
    expect(joke.label).toBe('positive');
    const sad = analyzeSentiment('I lost all my work 😭😭');
    expect(sad.humor).toBe(false);
    expect(sad.label).toBe('negative');
  });

  it('treats Nigerian English particles as emphasis, not sentiment', () => {
    expect(label('I don’t use WhatsApp o')).toBe('neutral');
    expect(analyzeSentiment('This is good ooo').score).toBeGreaterThan(analyzeSentiment('This is good').score);
  });

  it('ignores URLs', () => {
    expect(label('https://docs.google.com/document/d/bad-terrible-awful/edit')).toBe('neutral');
  });

  it('keeps scores in [-1, 1]', () => {
    const s = analyzeSentiment('great great great amazing awesome excellent!!!! 🎉🎉🎉').score;
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThan(0.9);
  });
});
