import type { Meeting, MeetingSummary } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** 3725 → "1:02:05", 125 → "2:05". */
export function formatOffset(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** 7562 → "2h 6m", 540 → "9m". */
export function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

type Timed = Pick<Meeting, 'startedAt' | 'wallClock' | 'timezoneLabel'> | MeetingSummary;

const zoneOpts = (m: Timed): Intl.DateTimeFormatOptions => (m.wallClock ? { timeZone: 'UTC' } : {});

/** Clock time of a message, or its offset when the meeting start is unknown. */
export function formatMessageTime(m: Timed, t: number): string {
  if (m.startedAt === undefined) return formatOffset(t);
  return new Date(m.startedAt + t * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', ...zoneOpts(m) });
}

export function formatMeetingDate(m: Timed): string {
  if (m.startedAt === undefined) return 'Date unknown';
  const s = new Date(m.startedAt).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', ...zoneOpts(m),
  });
  return m.wallClock && m.timezoneLabel ? `${s} ${m.timezoneLabel}` : s;
}

export const percent = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

export const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
