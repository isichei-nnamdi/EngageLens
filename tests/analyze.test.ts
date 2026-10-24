import { describe, expect, it } from 'vitest';
import { analyzeMeeting, describeLink, isQuestion, isRequest, resolveMention } from '../src/lib/analyze';
import { buildInsights } from '../src/lib/insights';
import { meetingFromSbv } from '../src/lib/sbv';
import type { Meeting } from '../src/lib/types';
import { SAMPLE, SAMPLE_NAME } from './fixtures';

const sample = (host?: string) => ({ ...meetingFromSbv(SAMPLE_NAME, SAMPLE), hostName: host });

describe('analyzeMeeting on the sample chat', () => {
  const r = analyzeMeeting(sample('Augustus Isichei'));

  it('ranks participants by messages', () => {
    expect(r.totals).toMatchObject({ messages: 40, chatters: 15, attendees: 15, silent: 0, links: 5 });
    expect(r.participants.slice(0, 3).map((p) => [p.name, p.messages])).toEqual([
      ['aliyu omeiza', 14],
      ['Augustus Isichei', 6],
      ['Oluwatoyin Adelakun-Adeyemo', 5],
    ]);
    expect(r.participants[0].share).toBeCloseTo(0.35);
    expect(r.participants[0].level).toBe('Highly active');
    expect(r.participants.find((p) => p.name === 'Samuel Ubaru')?.level).toBe('Occasional');
    expect(r.participants.find((p) => p.name === 'Augustus Isichei')?.isHost).toBe(true);
  });

  it('resolves @mentions, including titles like "@Dr Emeka"', () => {
    const m = r.messages.find((x) => x.text.includes('@Dr Emeka'))!;
    expect(m.mentions).toEqual(['Emeka Ogbuju', 'Augustus Isichei']);
  });

  it('flags the link request addressed to the host as needing follow-up', () => {
    const f = r.followUps.find((x) => x.message.text.includes('Kindly share here sir @Augustus'))!;
    expect(f.directedAtHost).toBe(true);
    expect(f.status).toBe('needs-follow-up');
  });

  it('marks a reshare request answered when someone posts the link', () => {
    const f = r.followUps.find((x) => x.message.text.startsWith('Please reshare'))!;
    expect(f).toMatchObject({ status: 'likely-addressed', addressedBy: 'Obaje Williams' });
  });

  it('does not treat a screen-share question as a link request', () => {
    const f = r.followUps.find((x) => x.message.text.startsWith('Did you forget to share your screen'))!;
    expect(f).toMatchObject({ type: 'question', status: 'likely-addressed', addressedBy: 'aliyu omeiza' });
  });

  it("skips the host's own questions", () => {
    expect(r.followUps.some((f) => f.message.sender === 'Augustus Isichei')).toBe(false);
  });

  it('groups the same Google Doc shared twice', () => {
    expect(r.resources).toHaveLength(4);
    const doc = r.resources[0];
    expect(doc.label).toBe('Google Doc');
    expect(doc.shares.map((s) => s.name)).toEqual(['Emeka Ogbuju', 'Obaje Williams']);
  });

  it('finds the long quiet stretch', () => {
    const longest = Math.max(...r.quietGaps.map((g) => g.to - g.from));
    expect(Math.round(longest / 60)).toBe(31);
  });

  it('builds a timeline that covers every message', () => {
    expect(r.timeline.reduce((n, b) => n + b.count, 0)).toBe(40);
  });

  it('classifies the overall mood as mostly positive', () => {
    expect(r.sentiment.label).toBe('Mostly positive');
    expect(r.sentiment.positive + r.sentiment.neutral + r.sentiment.negative).toBe(36); // 4 link-only messages excluded
  });

  it('produces plain-language insights', () => {
    const text = buildInsights(r).map((i) => i.text).join('\n');
    expect(text).toContain('aliyu omeiza sent 35% of all messages');
    expect(text).toContain('addressed to you');
    expect(text).toContain('The same Google Doc was shared 2 times');
  });
});

describe('roster (live capture)', () => {
  it('lists attendees who never chatted as Silent', () => {
    const m: Meeting = {
      id: 'x', title: 't', source: 'live', status: 'ended', createdAt: 0, updatedAt: 0,
      messages: [{ id: '1', sender: 'Ada Obi', text: 'Hello all', t: 10 }],
      roster: [{ name: 'Ada Obi', firstSeen: 0, lastSeen: 600 }, { name: 'Tunde Bello', firstSeen: 0, lastSeen: 600 }],
    };
    const r = analyzeMeeting(m);
    expect(r.totals).toMatchObject({ attendees: 2, chatters: 1, silent: 1 });
    expect(r.participants.find((p) => p.name === 'Tunde Bello')).toMatchObject({ level: 'Silent', inRoster: true });
  });
});

describe('helpers', () => {
  it('detects questions and requests', () => {
    expect(isQuestion('What group? MIT or UG?')).toBe(true);
    expect(isQuestion('Are you supervising both sets')).toBe(true);
    expect(isQuestion('The screen is shared')).toBe(false);
    expect(isRequest('Please reshare the document')).toBe(true);
    expect(isRequest('Share the project repository Google doc.')).toBe(true);
    expect(isRequest('I am yet to be added to any of the group')).toBe(true);
    expect(isRequest('We are seeing it')).toBe(false);
  });

  it('labels common link types', () => {
    expect(describeLink('https://forms.gle/abc').label).toBe('Google Form');
    expect(describeLink('https://chat.whatsapp.com/xyz').label).toBe('WhatsApp group invite');
    expect(describeLink('https://example.org/page').label).toBe('example.org');
  });

  it('leaves ambiguous mentions unresolved', () => {
    expect(resolveMention('Emeka', ['Emeka Ogbuju', 'Emeka Nwosu'])).toBe('Emeka');
    expect(resolveMention('Prof', ['Emeka Ogbuju'])).toBe('Prof');
  });
});
