import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { SELF_LABELS } from '@/lib/meet-dom';
import type { ToBackground } from '@/lib/messaging';
import { getMeeting, getSettings, saveMeeting } from '@/lib/storage';
import type { Meeting } from '@/lib/types';

/** A refresh or brief disconnect within this window resumes the same session. */
const RESUME_WINDOW_MS = 15 * 60 * 1000;
const activeKey = (code: string) => `active:${code}`;
const tabKey = (tabId: number) => `tab:${tabId}`;

// Serialise read-modify-write cycles so concurrent messages can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
};

async function update(id: string, fn: (m: Meeting) => void | Promise<void>) {
  const m = await getMeeting(id);
  if (!m) return;
  await fn(m);
  m.updatedAt = Date.now();
  await saveMeeting(m);
}

const reportUrl = (id: string) => browser.runtime.getURL(`/dashboard.html#/report/${encodeURIComponent(id)}`);

async function startSession(msg: Extract<ToBackground, { type: 'session:start' }>, tabId?: number) {
  const active = (await browser.storage.local.get(activeKey(msg.meetingCode)))[activeKey(msg.meetingCode)] as
    | { id: string; updatedAt: number }
    | undefined;
  let meeting = active && Date.now() - active.updatedAt < RESUME_WINDOW_MS ? await getMeeting(active.id) : undefined;
  if (meeting) {
    meeting.status = 'recording';
  } else {
    const settings = await getSettings();
    meeting = {
      id: `live-${msg.meetingCode}-${msg.startedAt}`,
      title: msg.title,
      source: 'live',
      status: 'recording',
      startedAt: msg.startedAt,
      meetingCode: msg.meetingCode,
      hostName: settings.myName || undefined,
      messages: [],
      roster: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  await saveMeeting(meeting);
  await browser.storage.local.set({ [activeKey(msg.meetingCode)]: { id: meeting.id, updatedAt: Date.now() } });
  if (tabId !== undefined) await browser.storage.session.set({ [tabKey(tabId)]: meeting.id });
  return { meetingId: meeting.id, startedAt: meeting.startedAt!, knownIds: meeting.messages.map((m) => m.id) };
}

async function endSession(meetingId: string, endedAt: number) {
  let ended = false;
  await update(meetingId, (m) => {
    if (m.status === 'ended') return;
    m.status = 'ended';
    m.durationSec = Math.max(m.durationSec ?? 0, (endedAt - (m.startedAt ?? endedAt)) / 1000);
    ended = true;
  });
  const m = await getMeeting(meetingId);
  if (m?.meetingCode) await browser.storage.local.remove(activeKey(m.meetingCode));
  if (ended && m && (m.messages.length || m.roster.length) && (await getSettings()).autoOpenReport) {
    await browser.tabs.create({ url: reportUrl(meetingId) });
  }
}

async function handle(msg: ToBackground, tabId?: number): Promise<unknown> {
  switch (msg.type) {
    case 'session:start':
      return startSession(msg, tabId);

    case 'session:messages': {
      const settings = await getSettings();
      const self = msg.selfName || settings.myName || 'You';
      await update(msg.meetingId, (m) => {
        const known = new Set(m.messages.map((x) => x.id));
        for (const x of msg.messages) {
          if (known.has(x.id)) continue;
          m.messages.push({ ...x, sender: SELF_LABELS.has(x.sender.toLowerCase()) ? self : x.sender });
          known.add(x.id);
        }
        m.hostName ??= self;
        m.durationSec = Math.max(m.durationSec ?? 0, (Date.now() - (m.startedAt ?? Date.now())) / 1000);
      });
      if (msg.meetingId.startsWith('live-')) {
        const code = (await getMeeting(msg.meetingId))?.meetingCode;
        if (code) await browser.storage.local.set({ [activeKey(code)]: { id: msg.meetingId, updatedAt: Date.now() } });
      }
      return { ok: true };
    }

    case 'session:roster':
      await update(msg.meetingId, (m) => {
        const t = Math.max(0, (msg.t - (m.startedAt ?? msg.t)) / 1000);
        for (const name of msg.names) {
          const r = m.roster.find((x) => x.name.toLowerCase() === name.toLowerCase());
          if (r) r.lastSeen = t;
          else m.roster.push({ name, firstSeen: t, lastSeen: t });
        }
        m.durationSec = Math.max(m.durationSec ?? 0, t);
      });
      return { ok: true };

    case 'session:end':
      await endSession(msg.meetingId, msg.endedAt);
      return { ok: true };

    case 'open-report':
      await browser.tabs.create({ url: reportUrl(msg.meetingId) });
      return { ok: true };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
    enqueue(() => handle(msg, sender.tab?.id)).then(sendResponse, (err) => sendResponse({ error: String(err) }));
    return true; // keep the channel open for the async response
  });

  // Closing the Meet tab ends the call from our point of view.
  browser.tabs.onRemoved.addListener((tabId) => {
    enqueue(async () => {
      const id = (await browser.storage.session.get(tabKey(tabId)))[tabKey(tabId)] as string | undefined;
      if (!id) return;
      await browser.storage.session.remove(tabKey(tabId));
      await endSession(id, Date.now());
    });
  });
});
