import { describe, expect, it } from 'vitest';
import { analyzeMeeting } from '../src/lib/analyze';
import { messagesCsv, participantsCsv, textSummary } from '../src/lib/export';
import { meetingFromSbv } from '../src/lib/sbv';
import { SAMPLE, SAMPLE_NAME } from './fixtures';

const r = analyzeMeeting({ ...meetingFromSbv(SAMPLE_NAME, SAMPLE), hostName: 'Augustus Isichei' });

/** Minimal RFC 4180 reader, enough to check our own output round-trips. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = csv.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\r' && s[i + 1] === '\n') {
      row.push(field), rows.push(row), (row = []), (field = ''), i++;
    } else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

describe('exports', () => {
  it('writes one CSV row per participant and message, keeping multi-line text intact', () => {
    expect(parseCsv(participantsCsv(r))).toHaveLength(16);
    const rows = parseCsv(messagesCsv(r));
    expect(rows).toHaveLength(41);
    expect(rows.every((x) => x.length === rows[0].length)).toBe(true);
    expect(rows.find((x) => x[3].startsWith('For my group'))?.[3]).toContain('\n\nI find WhatsApp distracting');
  });

  it('neutralises spreadsheet formulas in chat text', () => {
    const evil = analyzeMeeting({ ...r.meeting, messages: [{ id: 'a', sender: 'X', text: '=HYPERLINK("http://bad")', t: 1 }] });
    expect(messagesCsv(evil)).toContain(`"'=HYPERLINK(""http://bad"")"`);
  });

  it('summarises follow-ups and links in plain text', () => {
    const s = textSummary(r);
    expect(s).toContain('40 chat messages from 15 people');
    expect(s).toContain('Needs follow-up (4)');
    expect(s).toContain('WhatsApp group invite');
  });
});
