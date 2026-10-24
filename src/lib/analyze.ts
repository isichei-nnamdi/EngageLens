import { analyzeSentiment, type SentimentResult } from './sentiment';
import type { ChatMessage, Meeting } from './types';

export type MessageKind = 'text' | 'link' | 'reaction';
export type EngagementLevel = 'Highly active' | 'Active' | 'Occasional' | 'Silent';

export interface AnalyzedMessage extends ChatMessage {
  sentiment: SentimentResult;
  kind: MessageKind;
  words: number;
  links: string[];
  /** Participant names this message @mentions (resolved where possible). */
  mentions: string[];
  isQuestion: boolean;
  isRequest: boolean;
}

export interface ParticipantStats {
  name: string;
  messages: number;
  words: number;
  /** Fraction of all messages, 0–1. */
  share: number;
  firstT: number | null;
  lastT: number | null;
  /** Mean compound sentiment of their text messages, or null if none. */
  sentiment: number | null;
  questions: number;
  links: number;
  mentionsReceived: number;
  level: EngagementLevel;
  /** Seen in the call roster (live capture only). */
  inRoster: boolean;
  isHost: boolean;
}

export interface FollowUp {
  message: AnalyzedMessage;
  type: 'question' | 'request';
  status: 'needs-follow-up' | 'likely-addressed';
  /** Who appears to have responded, when addressed. */
  addressedBy?: string;
  directedAt: string[];
  directedAtHost: boolean;
}

export interface Resource {
  url: string;
  label: string;
  domain: string;
  shares: { name: string; t: number }[];
}

export interface TimelineBucket {
  start: number;
  end: number;
  count: number;
  senders: number;
}

export interface Report {
  meeting: Meeting;
  messages: AnalyzedMessage[];
  participants: ParticipantStats[];
  timeline: TimelineBucket[];
  bucketSec: number;
  quietGaps: { from: number; to: number }[];
  followUps: FollowUp[];
  resources: Resource[];
  durationSec: number;
  sentiment: {
    mean: number;
    /** 0–100 for display: 50 is neutral. */
    mood: number;
    label: 'Positive' | 'Mostly positive' | 'Neutral' | 'Mixed' | 'Mostly negative' | 'Negative';
    positive: number;
    neutral: number;
    negative: number;
    topPositive: AnalyzedMessage[];
    topNegative: AnalyzedMessage[];
  };
  totals: {
    messages: number;
    chatters: number;
    attendees: number;
    silent: number;
    links: number;
    questions: number;
    needsFollowUp: number;
    /** Share of messages sent by the most active participant. */
    topShare: number;
  };
}

export interface AnalyzeOptions {
  /** Gap between messages that counts as a quiet period. Default 10 min. */
  quietGapSec?: number;
  /** Window in which a reply counts as addressing a request. Default 5 min. */
  replyWindowSec?: number;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi;
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}️‍\s\p{P}]+$/u;
const QUESTION_START =
  /^(what|why|how|when|where|who|whom|whose|which|can|could|would|will|shall|should|is|are|am|was|were|do|does|did|have|has|had|may|might|any|anyone|anybody)\b/i;
const REQUEST_RE =
  /\b(please|pls|plz|kindly|abeg|could you|can you|would you|can someone|help me|i need|waiting to be added|not been added|yet to be added|add me|send (?:me|us)|share (?:the|your|it|this|that)|reshare|re-share|resend|repost)\b|^(?:share|send|post|drop|add|resend|reshare)\b/i;
const SHARE_REQUEST_RE = /\b(share|reshare|re-share|link|doc|document|send|resend|repost|slides?|form|file)\b/i;
const MENTION_RE = /@([A-Za-z][\w.'-]*(?:\s+[A-Z][\w.'-]*)?)/g;
const TITLES = new Set(['dr', 'prof', 'mr', 'mrs', 'ms', 'miss', 'engr', 'sir', 'ma', 'madam', 'pastor', 'rev', 'barr']);

const normalizeName = (n: string) => n.trim().replace(/\s+/g, ' ');
const nameKey = (n: string) => normalizeName(n).toLowerCase();
const nameTokens = (n: string) =>
  nameKey(n)
    .replace(/[().,]/g, ' ')
    .split(' ')
    .filter((t) => t && !TITLES.has(t.replace(/\.$/, '')));

/** Map "@Dr Emeka" → "Emeka Ogbuju" when exactly one participant matches. */
export function resolveMention(raw: string, names: string[]): string {
  const tokens = nameTokens(raw);
  if (!tokens.length) return raw;
  const candidates = names.filter((n) => {
    const nt = nameTokens(n);
    return tokens.every((t) => nt.includes(t));
  });
  if (candidates.length === 1) return candidates[0];
  // "@Augustus Please": retry with only the first token.
  if (tokens.length > 1) {
    const first = names.filter((n) => nameTokens(n).includes(tokens[0]));
    if (first.length === 1) return first[0];
  }
  return raw;
}

export function extractLinks(text: string): string[] {
  return (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ''));
}

export function describeLink(url: string): { label: string; domain: string } {
  let host = '';
  let path = '';
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    host = u.hostname.replace(/^www\./, '');
    path = u.pathname;
  } catch {
    return { label: 'Link', domain: url };
  }
  const known: [RegExp, string][] = [
    [/^docs\.google\.com\/document/, 'Google Doc'],
    [/^docs\.google\.com\/spreadsheets/, 'Google Sheet'],
    [/^docs\.google\.com\/presentation/, 'Google Slides'],
    [/^docs\.google\.com\/forms|^forms\.gle/, 'Google Form'],
    [/^drive\.google\.com/, 'Google Drive file'],
    [/^meet\.google\.com/, 'Google Meet link'],
    [/^chat\.whatsapp\.com/, 'WhatsApp group invite'],
    [/^(wa\.me|api\.whatsapp\.com)/, 'WhatsApp chat'],
    [/^(youtube\.com|youtu\.be)/, 'YouTube video'],
    [/^github\.com/, 'GitHub'],
    [/^(zoom\.us|[\w-]+\.zoom\.us)/, 'Zoom link'],
    [/^t\.me/, 'Telegram link'],
    [/^(bit\.ly|tinyurl\.com)/, 'Short link'],
  ];
  const key = host + path;
  for (const [re, label] of known) if (re.test(key)) return { label, domain: host };
  return { label: host, domain: host };
}

/** Collapse URL variants (fragments, tab params) so the same doc counts once. */
const canonicalUrl = (url: string) => {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const docId = /\/d\/([\w-]+)/.exec(u.pathname);
    if (u.hostname.endsWith('google.com') && docId) return `${u.hostname}/d/${docId[1]}`;
    return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '') + u.search;
  } catch {
    return url;
  }
};

export function isQuestion(text: string): boolean {
  const t = text.replace(URL_RE, '').trim();
  if (!t) return false;
  return t.includes('?') || QUESTION_START.test(t);
}

export function isRequest(text: string): boolean {
  return REQUEST_RE.test(text.replace(URL_RE, '').trim());
}

function analyzeMessage(m: ChatMessage, names: string[]): AnalyzedMessage {
  const links = extractLinks(m.text);
  const withoutLinks = m.text.replace(URL_RE, '').trim();
  const kind: MessageKind = !withoutLinks && links.length ? 'link' : EMOJI_ONLY_RE.test(m.text.trim()) ? 'reaction' : 'text';
  const mentions = [...m.text.matchAll(MENTION_RE)].map((x) => resolveMention(x[1].replace(/[,.:;!?]+$/, ''), names));
  return {
    ...m,
    sender: normalizeName(m.sender),
    sentiment: analyzeSentiment(m.text),
    kind,
    words: withoutLinks ? withoutLinks.split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w)).length : 0,
    links,
    mentions,
    isQuestion: kind === 'text' && isQuestion(m.text),
    isRequest: kind === 'text' && isRequest(m.text),
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function analyzeMeeting(meeting: Meeting, opts: AnalyzeOptions = {}): Report {
  const quietGapSec = opts.quietGapSec ?? 600;
  const replyWindowSec = opts.replyWindowSec ?? 300;

  const sorted = [...meeting.messages].sort((a, b) => a.t - b.t);

  // Merge names case-insensitively, keeping the first spelling seen.
  const display = new Map<string, string>();
  for (const n of [...meeting.roster.map((r) => r.name), ...sorted.map((m) => m.sender)]) {
    const k = nameKey(n);
    if (k && !display.has(k)) display.set(k, normalizeName(n));
  }
  const names = [...display.values()];
  const canonical = (n: string) => display.get(nameKey(n)) ?? normalizeName(n);
  const hostKey = meeting.hostName ? nameKey(meeting.hostName) : '';

  const messages = sorted.map((m) => {
    const a = analyzeMessage(m, names);
    a.sender = canonical(a.sender);
    a.mentions = a.mentions.map((x) => (display.has(nameKey(x)) ? canonical(x) : x));
    return a;
  });

  const lastT = messages.length ? messages[messages.length - 1].t : 0;
  const rosterEnd = Math.max(0, ...meeting.roster.map((r) => r.lastSeen));
  const durationSec = Math.max(meeting.durationSec ?? 0, lastT + 60, rosterEnd);

  // ---- participants
  const stats = new Map<string, ParticipantStats>();
  const ensure = (name: string) => {
    const k = nameKey(name);
    let s = stats.get(k);
    if (!s) {
      s = {
        name: canonical(name), messages: 0, words: 0, share: 0, firstT: null, lastT: null, sentiment: null,
        questions: 0, links: 0, mentionsReceived: 0, level: 'Silent', inRoster: false, isHost: k === hostKey,
      };
      stats.set(k, s);
    }
    return s;
  };
  for (const r of meeting.roster) ensure(r.name).inRoster = true;
  const sentimentBySender = new Map<string, number[]>();
  for (const m of messages) {
    const s = ensure(m.sender);
    s.messages++;
    s.words += m.words;
    s.firstT ??= m.t;
    s.lastT = m.t;
    if (m.isQuestion) s.questions++;
    s.links += m.links.length;
    if (m.kind !== 'link') {
      const k = nameKey(m.sender);
      sentimentBySender.set(k, [...(sentimentBySender.get(k) ?? []), m.sentiment.score]);
    }
    for (const who of new Set(m.mentions)) {
      if (display.has(nameKey(who)) && nameKey(who) !== nameKey(m.sender)) ensure(who).mentionsReceived++;
    }
  }
  const total = messages.length;
  const chatters = [...stats.values()].filter((s) => s.messages > 0);
  const avgPerChatter = chatters.length ? total / chatters.length : 0;
  for (const [k, s] of stats) {
    s.share = total ? s.messages / total : 0;
    const sc = sentimentBySender.get(k);
    s.sentiment = sc?.length ? Math.round(mean(sc) * 1000) / 1000 : null;
    s.level =
      s.messages === 0 ? 'Silent'
      : s.messages >= Math.max(3, 2 * avgPerChatter) ? 'Highly active'
      : s.messages >= 2 ? 'Active'
      : 'Occasional';
  }
  const participants = [...stats.values()].sort(
    (a, b) => b.messages - a.messages || b.words - a.words || a.name.localeCompare(b.name),
  );

  // ---- timeline
  const bucketSec = durationSec > 3 * 3600 ? 900 : durationSec > 90 * 60 ? 300 : durationSec > 30 * 60 ? 180 : 60;
  const timeline: TimelineBucket[] = [];
  for (let start = 0; start < durationSec; start += bucketSec) {
    const inBucket = messages.filter((m) => m.t >= start && m.t < start + bucketSec);
    timeline.push({ start, end: start + bucketSec, count: inBucket.length, senders: new Set(inBucket.map((m) => m.sender)).size });
  }

  const quietGaps: { from: number; to: number }[] = [];
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].t - messages[i - 1].t >= quietGapSec) quietGaps.push({ from: messages[i - 1].t, to: messages[i].t });
  }

  // ---- follow-ups: questions & requests, and whether anyone responded
  const followUps: FollowUp[] = [];
  messages.forEach((m, i) => {
    if (!m.isQuestion && !m.isRequest) return;
    if (hostKey && nameKey(m.sender) === hostKey) return; // the host's own questions aren't follow-ups for the host
    const directedAt = [...new Set(m.mentions.filter((x) => nameKey(x) !== nameKey(m.sender)))];
    const others = messages
      .slice(i + 1)
      .filter((x) => x.t - m.t <= (directedAt.length ? 2 * replyWindowSec : replyWindowSec))
      .filter((x) => nameKey(x.sender) !== nameKey(m.sender));
    const wantsShare = m.isRequest && !m.isQuestion && SHARE_REQUEST_RE.test(m.text) && !/screen/i.test(m.text);
    const askerTokens = nameTokens(m.sender);

    // Heuristic, chat-only: a verbal answer on the call can't be seen here.
    let responder: AnalyzedMessage | undefined;
    if (wantsShare) {
      responder = others.find((x) => x.links.length);
    } else if (directedAt.length) {
      const targets = new Set(directedAt.map(nameKey));
      responder = others.find((x) => targets.has(nameKey(x.sender)));
    } else {
      const next = messages[i + 1];
      responder = others.find(
        (x) =>
          x.kind !== 'reaction' &&
          ((hostKey && nameKey(x.sender) === hostKey) ||
            x.mentions.some((who) => nameTokens(who).some((t) => askerTokens.includes(t))) ||
            (x === next && x.t - m.t <= 120)),
      );
    }
    followUps.push({
      message: m,
      type: m.isQuestion ? 'question' : 'request',
      status: responder ? 'likely-addressed' : 'needs-follow-up',
      addressedBy: responder?.sender,
      directedAt,
      directedAtHost: !!hostKey && directedAt.some((d) => nameKey(d) === hostKey),
    });
  });

  // ---- shared resources
  const resMap = new Map<string, Resource>();
  for (const m of messages) {
    for (const url of m.links) {
      const key = canonicalUrl(url);
      let r = resMap.get(key);
      if (!r) {
        r = { url, ...describeLink(url), shares: [] };
        resMap.set(key, r);
      }
      r.shares.push({ name: m.sender, t: m.t });
    }
  }
  const resources = [...resMap.values()].sort((a, b) => a.shares[0].t - b.shares[0].t);

  // ---- sentiment
  const scored = messages.filter((m) => m.kind !== 'link');
  const meanScore = mean(scored.map((m) => m.sentiment.score));
  const positive = scored.filter((m) => m.sentiment.label === 'positive').length;
  const negative = scored.filter((m) => m.sentiment.label === 'negative').length;
  const neutral = scored.length - positive - negative;
  const polar = positive + negative;
  const label: Report['sentiment']['label'] =
    !polar || polar / Math.max(scored.length, 1) < 0.15 ? 'Neutral'
    : positive && negative && Math.min(positive, negative) / polar >= 0.4 ? 'Mixed'
    : meanScore >= 0.25 ? 'Positive'
    : meanScore >= 0.03 ? 'Mostly positive'
    : meanScore <= -0.25 ? 'Negative'
    : meanScore <= -0.03 ? 'Mostly negative'
    : 'Mixed';
  const byScore = [...scored].sort((a, b) => b.sentiment.score - a.sentiment.score);
  const topPositive = byScore.filter((m) => m.sentiment.label === 'positive' && m.kind === 'text').slice(0, 3);
  const topNegative = byScore.filter((m) => m.sentiment.label === 'negative').reverse().slice(0, 3);

  const attendees = participants.length;
  return {
    meeting,
    messages,
    participants,
    timeline,
    bucketSec,
    quietGaps,
    followUps,
    resources,
    durationSec,
    sentiment: {
      mean: Math.round(meanScore * 1000) / 1000,
      mood: Math.round((meanScore + 1) * 50),
      label,
      positive,
      neutral,
      negative,
      topPositive,
      topNegative,
    },
    totals: {
      messages: total,
      chatters: chatters.length,
      attendees,
      silent: participants.filter((p) => p.level === 'Silent').length,
      links: messages.reduce((n, m) => n + m.links.length, 0),
      questions: messages.filter((m) => m.isQuestion).length,
      needsFollowUp: followUps.filter((f) => f.status === 'needs-follow-up').length,
      topShare: participants[0]?.share ?? 0,
    },
  };
}
