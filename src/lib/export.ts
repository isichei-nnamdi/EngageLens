import type { Report } from './analyze';
import { formatDuration, formatMeetingDate, formatMessageTime, formatOffset, percent } from './format';

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Quote, and neutralise spreadsheet formula injection from chat text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const toCsv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');

export function participantsCsv(r: Report): string {
  return toCsv([
    ['Name', 'Engagement', 'Messages', 'Share of messages', 'Words', 'Questions', 'Links shared', 'Mentioned by others', 'Avg sentiment', 'First message', 'Last message', 'Seen in call'],
    ...r.participants.map((p) => [
      p.name, p.level, p.messages, percent(p.share, 1), p.words, p.questions, p.links, p.mentionsReceived,
      p.sentiment ?? '', p.firstT === null ? '' : formatMessageTime(r.meeting, p.firstT),
      p.lastT === null ? '' : formatMessageTime(r.meeting, p.lastT), p.inRoster ? 'yes' : '',
    ]),
  ]);
}

export function messagesCsv(r: Report): string {
  return toCsv([
    ['Time', 'Offset', 'Sender', 'Message', 'Type', 'Sentiment', 'Score', 'Question', 'Request', 'Mentions', 'Links'],
    ...r.messages.map((m) => [
      formatMessageTime(r.meeting, m.t), formatOffset(m.t), m.sender, m.text, m.kind, m.sentiment.label, m.sentiment.score,
      m.isQuestion ? 'yes' : '', m.isRequest ? 'yes' : '', m.mentions.join('; '), m.links.join(' '),
    ]),
  ]);
}

/** Plain-text digest for pasting into email, Slack or Google Chat. */
export function textSummary(r: Report): string {
  const { totals: t, sentiment: s } = r;
  const lines = [
    `EngageLens summary: ${r.meeting.title}`,
    `${formatMeetingDate(r.meeting)} · ${formatDuration(r.durationSec)}`,
    '',
    `• ${t.messages} chat messages from ${t.chatters} people${t.silent ? ` (${t.silent} attendees never chatted)` : ''}`,
    `• Mood: ${s.label} (${s.positive} positive, ${s.neutral} neutral, ${s.negative} negative)`,
    `• Most active: ${r.participants.filter((p) => p.messages).slice(0, 3).map((p) => `${p.name} (${p.messages})`).join(', ')}`,
  ];
  const open = r.followUps.filter((f) => f.status === 'needs-follow-up');
  if (open.length) {
    lines.push('', `Needs follow-up (${open.length}):`);
    for (const f of open) lines.push(`  - ${f.message.sender}: "${f.message.text.replace(/\s+/g, ' ').slice(0, 140)}"`);
  }
  if (r.resources.length) {
    lines.push('', 'Links shared:');
    for (const res of r.resources) lines.push(`  - ${res.label} (${res.shares[0].name}): ${res.url}`);
  }
  return lines.join('\n');
}

export function download(fileName: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
