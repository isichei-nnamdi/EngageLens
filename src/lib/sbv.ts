import type { ChatMessage, Meeting } from './types';

const CUE_TIMING = /^(\d+):(\d{2}):(\d{2})[.,](\d{1,3}),\d+:\d{2}:\d{2}[.,]\d{1,3}\s*$/;

/**
 * Parse a Google Meet chat export (.sbv).
 *
 * Each cue is a timing line followed by "Sender: message". A message can span
 * several lines *including blank ones*, so cues are split on timing lines,
 * never on blank lines.
 */
export function parseSbv(content: string): ChatMessage[] {
  const lines = content.replace(/^﻿/, '').split(/\r?\n/);
  const messages: ChatMessage[] = [];
  let current: { t: number; body: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const body = current.body.join('\n').trim();
    if (body) {
      const sep = body.indexOf(': ');
      const sender = sep > 0 ? body.slice(0, sep).trim() : 'Unknown';
      const text = sep > 0 ? body.slice(sep + 2).trim() : body;
      messages.push({ id: `sbv-${messages.length}`, sender, text, t: current.t });
    }
    current = null;
  };

  for (const line of lines) {
    const m = CUE_TIMING.exec(line);
    if (m) {
      flush();
      const [, h, min, s, ms] = m;
      current = { t: +h * 3600 + +min * 60 + +s + +ms.padEnd(3, '0') / 1000, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  flush();
  return messages;
}

export interface SbvFileInfo {
  title: string;
  startedAt?: number;
  timezoneLabel?: string;
}

/**
 * Meet names exports "<Title> - YYYY_MM_DD HH_MM TZ - Chat.sbv" and replaces
 * characters that are illegal in filenames (like ":") with "_".
 */
export function parseSbvFileName(fileName: string): SbvFileInfo {
  let base = fileName.replace(/\.sbv$/i, '').replace(/\s*-\s*Chat$/i, '');
  const info: SbvFileInfo = { title: '' };
  const date = /\s*-\s*(\d{4})_(\d{2})_(\d{2}) (\d{2})_(\d{2})(?: ([A-Za-z+\-0-9]+))?$/.exec(base);
  if (date) {
    const [match, y, mo, d, h, mi, tz] = date;
    info.startedAt = Date.UTC(+y, +mo - 1, +d, +h, +mi);
    info.timezoneLabel = tz;
    base = base.slice(0, base.length - match.length);
  }
  info.title = base.replace(/_ /g, ': ').trim() || 'Imported Google Meet chat';
  return info;
}

/** FNV-1a, so re-importing the same file replaces rather than duplicates it. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function meetingFromSbv(fileName: string, content: string, now = Date.now()): Meeting {
  const info = parseSbvFileName(fileName);
  return {
    id: `sbv-${hashString(fileName + '\n' + content)}`,
    title: info.title,
    source: 'sbv',
    status: 'ended',
    startedAt: info.startedAt,
    wallClock: info.startedAt !== undefined,
    timezoneLabel: info.timezoneLabel,
    fileName,
    messages: parseSbv(content),
    roster: [],
    createdAt: now,
    updatedAt: now,
  };
}
