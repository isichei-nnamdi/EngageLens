import { describe, expect, it } from 'vitest';
import { meetingFromSbv, parseSbv, parseSbvFileName } from '../src/lib/sbv';
import { SAMPLE, SAMPLE_NAME } from './fixtures';

describe('parseSbv', () => {
  const messages = parseSbv(SAMPLE);

  it('reads every cue in the sample export', () => {
    expect(messages).toHaveLength(40);
    expect(new Set(messages.map((m) => m.sender)).size).toBe(15);
  });

  it('parses timing and sender', () => {
    expect(messages[0]).toMatchObject({ sender: 'Emeka Ogbuju', t: 589.665 });
    expect(messages.at(-1)?.sender).toBe('aliyu omeiza');
    expect(messages.at(-1)?.t).toBeCloseTo(7502.673, 3);
  });

  it('keeps multi-line messages, including blank lines, in one message', () => {
    const m = messages.find((x) => x.text.startsWith('For my group it has been.'))!;
    expect(m.sender).toBe('Oluwatoyin Adelakun-Adeyemo');
    expect(m.text).toContain('\n\nI find WhatsApp distracting');
    expect(m.text).toContain('loose all the chats and documents shared');
  });

  it('splits sender on the first ": " only, so URLs survive', () => {
    const m = messages.find((x) => x.text.startsWith('undergraduate supervisors whatsapp group'))!;
    expect(m.text).toBe('undergraduate supervisors whatsapp group: https://chat.whatsapp.com/KVAjVjMeyw53OBBPpEJWGf');
  });

  it('handles CRLF line endings and a BOM', () => {
    const crlf = '﻿0:00:01.000,0:00:04.000\r\nAda: Hello\r\n\r\n0:00:05.500,0:00:08.500\r\nBola: Hi: there\r\n';
    expect(parseSbv(crlf)).toEqual([
      { id: 'sbv-0', sender: 'Ada', text: 'Hello', t: 1 },
      { id: 'sbv-1', sender: 'Bola', text: 'Hi: there', t: 5.5 },
    ]);
  });
});

describe('parseSbvFileName', () => {
  it('recovers the title, wall-clock start and timezone', () => {
    const info = parseSbvFileName(SAMPLE_NAME);
    expect(info.title).toBe('UG and PG Project Supervision: Orientation and Expectations');
    expect(new Date(info.startedAt!).toISOString()).toBe('2026-10-23T17:52:00.000Z');
    expect(info.timezoneLabel).toBe('WAT');
  });

  it('falls back gracefully for renamed files', () => {
    expect(parseSbvFileName('chat.sbv')).toEqual({ title: 'chat' });
  });
});

describe('meetingFromSbv', () => {
  it('gives the same id for the same file, so re-imports replace', () => {
    expect(meetingFromSbv(SAMPLE_NAME, SAMPLE).id).toBe(meetingFromSbv(SAMPLE_NAME, SAMPLE).id);
    expect(meetingFromSbv(SAMPLE_NAME, SAMPLE + ' ').id).not.toBe(meetingFromSbv(SAMPLE_NAME, SAMPLE).id);
  });
});
