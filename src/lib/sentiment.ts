/**
 * On-device, rule-based sentiment for short chat messages.
 *
 * Modelled on VADER (lexicon + negation + intensifiers + "but" shift +
 * normalisation) with additions for meeting chat: emoji scores, Nigerian /
 * West African English particles ("o", "ooo", "abeg", "sha") and a humour
 * rule for repeated 😭, which in this context is usually laughter, not grief.
 */

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export interface SentimentResult {
  /** Normalised compound score in [-1, 1]. */
  score: number;
  label: SentimentLabel;
  /** Message reads as a joke / laughter. */
  humor: boolean;
  /** The words and emoji that moved the score, for explainability. */
  hits: string[];
}

const LEXICON: Record<string, number> = {
  // positive
  good: 2, great: 3, excellent: 3, awesome: 3, amazing: 3, fantastic: 3, wonderful: 3, brilliant: 3,
  nice: 2, cool: 1, fine: 1, ok: 0.5, okay: 0.5, perfect: 3, superb: 3, best: 3, better: 2,
  love: 3, like: 1, enjoy: 2, enjoyed: 2, glad: 2, happy: 3, pleased: 2, delighted: 3, excited: 3,
  thanks: 2, thank: 2, thankyou: 2, grateful: 3, appreciate: 2, appreciated: 2, welcome: 2,
  helpful: 2, useful: 2, clear: 1, insightful: 2, informative: 2, interesting: 2, impressive: 3,
  agree: 1, agreed: 1, yes: 1, yea: 1, yeah: 1, correct: 1, true: 0.5, exactly: 1,
  acceptable: 2, approachable: 2, easy: 1, easier: 1, smooth: 1, well: 1, congratulations: 3, congrats: 3,
  hope: 1.5, hoping: 1.5, hopeful: 2, support: 1, supportive: 2, success: 2, successful: 2, win: 2,
  kudos: 3, bravo: 3, wow: 2, yay: 2, lol: 1.5, haha: 1.5, hahaha: 2, lmao: 2, funny: 1.5,
  amen: 1, blessed: 2, interested: 1, ready: 1, fair: 1, beautiful: 3, recommend: 2,
  // negative
  bad: -2, worse: -2, worst: -3, terrible: -3, awful: -3, horrible: -3, poor: -2, sad: -2,
  problem: -2, problems: -2, issue: -1, issues: -1, challenge: -1, challenges: -1, difficult: -1, hard: -1,
  wrong: -2, error: -2, fail: -2, failed: -2, failure: -2, broken: -2, bug: -1,
  confused: -2, confusing: -2, unclear: -2, lost: -1, lose: -2, loose: -1, losing: -2,
  distracting: -2, distracted: -2, annoying: -2, annoyed: -2, frustrating: -2, frustrated: -2,
  angry: -3, upset: -2, disappointed: -2, disappointing: -2, worried: -2, worry: -1, concern: -1, concerned: -1,
  delay: -1, delayed: -1, late: -1, slow: -1, stuck: -2, missing: -1, missed: -1, forget: -1, forgot: -1,
  avoid: -1, unfortunately: -2, sorry: -1, bored: -2, boring: -2, tired: -1, waste: -2, useless: -2,
  hate: -3, disagree: -1, unfair: -2, complain: -2, complaint: -2, noise: -1, noisy: -1,
  lag: -1, lagging: -1, freezing: -1, frozen: -1, inaudible: -2, mute: -0.5, deletes: -1, deleted: -1,
};

const EMOJI: Record<string, number> = {
  '👍': 2, '👏': 2, '🙌': 2, '🙏': 1.5, '❤️': 3, '❤': 3, '💯': 2, '🔥': 2, '🎉': 3, '✅': 1, '💪': 2,
  '😀': 2, '😃': 2, '😄': 2, '😁': 2, '😊': 2, '🙂': 1, '😍': 3, '🥰': 3, '😎': 1, '🤩': 3,
  '😂': 1.5, '🤣': 1.5, '😆': 1.5, '😅': 0.5, '😉': 1,
  '👎': -2, '😞': -2, '😔': -2, '😟': -2, '🙁': -1.5, '☹️': -2, '😢': -2, '😭': -2, '😡': -3, '😠': -3,
  '🤬': -3, '😤': -1.5, '😩': -2, '😫': -2, '🙄': -1, '😒': -1, '🤦': -1.5, '😕': -1, '😬': -0.5,
};
const LAUGH_EMOJI = new Set(['😂', '🤣', '😆', '😅']);
const LAUGH_WORDS = new Set(['lol', 'haha', 'hahaha', 'lmao', 'lmfao', 'rofl', 'hehe']);

const NEGATIONS = new Set([
  'not', 'no', 'never', 'none', 'nobody', 'nothing', 'neither', 'nor', 'without', 'hardly',
  "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't", "can't", 'cannot', "couldn't",
  "won't", "wouldn't", "shouldn't", "haven't", "hasn't", "hadn't", 'dont', 'doesnt', 'didnt', 'isnt',
  'cant', 'wont', 'havent', 'hasnt', 'aint',
]);
const BOOSTERS: Record<string, number> = {
  very: 0.3, really: 0.3, so: 0.3, extremely: 0.5, super: 0.4, totally: 0.3, absolutely: 0.4,
  too: 0.2, much: 0.2, highly: 0.4, truly: 0.3, quite: 0.15, slightly: -0.3, somewhat: -0.2, abit: -0.2,
};
/** Discourse particles that add emphasis but carry no polarity of their own. */
const isParticle = (w: string) => /^o+h?$/.test(w) || w === 'sha' || w === 'jare' || w === 'abeg' || w === 'biko';

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const EMOJI_RE = /\p{Extended_Pictographic}️?/gu;
/** VADER's alpha: keeps compound in (-1, 1) and saturates sensibly for short texts. */
const ALPHA = 15;

const lookup = (w: string): number | undefined => {
  if (w in LEXICON) return LEXICON[w];
  // "soooo goood" -> "so good"
  const squeezed = w.replace(/(.)\1{2,}/g, '$1$1');
  if (squeezed in LEXICON) return LEXICON[squeezed];
  const single = w.replace(/(.)\1+/g, '$1');
  if (single in LEXICON) return LEXICON[single];
  return undefined;
};

export function analyzeSentiment(raw: string): SentimentResult {
  const text = raw.replace(URL_RE, ' ');
  const emojis = text.match(EMOJI_RE) ?? [];
  const words = text
    .replace(EMOJI_RE, ' ')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^a-z']+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);

  const hits: string[] = [];
  const scores: number[] = [];
  let negativeWordHit = false;
  let emphasis = 0;
  let butIndex = -1;

  words.forEach((w, i) => {
    if (w === 'but' && butIndex < 0) butIndex = scores.length;
    if (isParticle(w)) {
      emphasis += 0.1;
      return;
    }
    const base = lookup(w);
    if (base === undefined || base === 0 || NEGATIONS.has(w)) return;

    let s = base;
    const prev = words[i - 1];
    if (prev && prev in BOOSTERS) s += Math.sign(s) * BOOSTERS[prev];
    const window = words.slice(Math.max(0, i - 3), i);
    if (window.some((p) => NEGATIONS.has(p))) s *= -0.74;
    if (s < 0) negativeWordHit = true;
    scores.push(s);
    hits.push(w);
  });

  // VADER "but" rule: what follows "but" outweighs what came before.
  if (butIndex >= 0) {
    for (let i = 0; i < scores.length; i++) scores[i] *= i < butIndex ? 0.5 : 1.5;
  }

  const crying = emojis.filter((e) => e.startsWith('😭')).length;
  const laughter = emojis.some((e) => LAUGH_EMOJI.has(e.replace('️', ''))) || words.some((w) => LAUGH_WORDS.has(w));
  const humor = laughter || (crying >= 2 && !negativeWordHit);

  for (const e of emojis) {
    const key = e.replace('️', '');
    let s = EMOJI[e] ?? EMOJI[key];
    if (s === undefined) continue;
    if (key === '😭' && humor) s = 1; // laughing-crying, not distress
    scores.push(s);
    hits.push(key);
  }

  let sum = scores.reduce((a, b) => a + b, 0);
  if (sum !== 0) {
    const bangs = Math.min((raw.match(/!/g) ?? []).length, 4);
    sum += Math.sign(sum) * (bangs * 0.292 + Math.min(emphasis, 0.3));
  }
  const score = sum / Math.sqrt(sum * sum + ALPHA);
  const label: SentimentLabel = score >= 0.05 ? 'positive' : score <= -0.05 ? 'negative' : 'neutral';
  return { score: Math.round(score * 1000) / 1000, label, humor, hits };
}
