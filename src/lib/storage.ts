import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, type Meeting, type MeetingSummary, type Settings } from './types';

const INDEX_KEY = 'meetings:index';
const SETTINGS_KEY = 'settings';
const meetingKey = (id: string) => `meeting:${id}`;

export const toSummary = (m: Meeting): MeetingSummary => ({
  id: m.id,
  title: m.title,
  source: m.source,
  status: m.status,
  startedAt: m.startedAt,
  wallClock: m.wallClock,
  timezoneLabel: m.timezoneLabel,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
  messageCount: m.messages.length,
  peopleCount: new Set([...m.messages.map((x) => x.sender.toLowerCase()), ...m.roster.map((r) => r.name.toLowerCase())]).size,
});

export async function listMeetings(): Promise<MeetingSummary[]> {
  const res = await browser.storage.local.get(INDEX_KEY);
  const index = (res[INDEX_KEY] as MeetingSummary[] | undefined) ?? [];
  return [...index].sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt));
}

export async function getMeeting(id: string): Promise<Meeting | undefined> {
  const res = await browser.storage.local.get(meetingKey(id));
  return res[meetingKey(id)] as Meeting | undefined;
}

export async function saveMeeting(meeting: Meeting): Promise<void> {
  const index = (await listMeetings()).filter((s) => s.id !== meeting.id);
  index.push(toSummary(meeting));
  await browser.storage.local.set({ [meetingKey(meeting.id)]: meeting, [INDEX_KEY]: index });
}

export async function deleteMeeting(id: string): Promise<void> {
  const index = (await listMeetings()).filter((s) => s.id !== id);
  await browser.storage.local.remove(meetingKey(id));
  await browser.storage.local.set({ [INDEX_KEY]: index });
}

export async function getSettings(): Promise<Settings> {
  const res = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((res[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Re-run `cb` whenever stored meetings change (e.g. a live capture is writing). */
export function onMeetingsChanged(cb: () => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && Object.keys(changes).some((k) => k === INDEX_KEY || k.startsWith('meeting:'))) cb();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
