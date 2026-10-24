import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { clockToEpoch, extractMeetingTitle, extractMessages, extractRoster, getMeetingCode, isInCall } from '@/lib/meet-dom';
import type { CaptureStatus, ToBackground, ToContent } from '@/lib/messaging';

const TICK_MS = 2000;
const ROSTER_EVERY_MS = 15_000;
/** Consecutive ticks out of the call before we treat it as ended (rides out UI re-renders). */
const END_AFTER_TICKS = 3;

interface Session {
  meetingId: string;
  startedAt: number;
  code: string;
  title: string;
}

export default defineContentScript({
  matches: ['https://meet.google.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    let session: Session | null = null;
    let starting = false;
    /** Set after "End & analyse now" so capture doesn't restart until you leave the call. */
    let holdUntilLeave = false;
    let firstScan = true;
    let missedTicks = 0;
    let lastRosterPush = 0;
    const sent = new Set<string>();
    const people = new Set<string>();

    const send = <T = unknown>(msg: ToBackground): Promise<T | undefined> =>
      ctx.isInvalid ? Promise.resolve(undefined) : (browser.runtime.sendMessage(msg) as Promise<T>).catch(() => undefined);

    async function start(code: string) {
      starting = true;
      const res = await send<{ meetingId: string; startedAt: number; knownIds: string[] }>({
        type: 'session:start',
        meetingCode: code,
        title: extractMeetingTitle(document, code),
        startedAt: Date.now(),
      });
      starting = false;
      if (!res?.meetingId) return;
      session = { meetingId: res.meetingId, startedAt: res.startedAt, code, title: extractMeetingTitle(document, code) };
      res.knownIds.forEach((id) => sent.add(id));
      firstScan = true;
      missedTicks = 0;
    }

    async function end() {
      if (!session) return;
      const { meetingId } = session;
      session = null;
      sent.clear();
      people.clear();
      await send({ type: 'session:end', meetingId, endedAt: Date.now() });
    }

    function scanMessages(s: Session) {
      const now = Date.now();
      const fresh = extractMessages(document).filter((m) => !sent.has(m.id));
      if (!fresh.length) {
        firstScan = false;
        return;
      }
      const messages = fresh.map((m) => {
        // Messages already on screen at first scan arrived earlier; trust Meet's clock label for those.
        let at = now;
        if (firstScan && m.clock) {
          const e = clockToEpoch(m.clock, now);
          if (e !== undefined && e <= now) at = e;
        }
        sent.add(m.id);
        people.add(m.sender.toLowerCase());
        return { id: m.id, sender: m.sender, text: m.text, t: Math.max(0, (at - s.startedAt) / 1000) };
      });
      firstScan = false;
      void send({ type: 'session:messages', meetingId: s.meetingId, messages });
    }

    function scanRoster(s: Session) {
      const now = Date.now();
      if (now - lastRosterPush < ROSTER_EVERY_MS) return;
      lastRosterPush = now;
      const names = extractRoster(document);
      names.forEach((n) => people.add(n.toLowerCase()));
      if (names.length) void send({ type: 'session:roster', meetingId: s.meetingId, names, t: now });
    }

    async function tick() {
      const code = getMeetingCode(location.pathname);
      const inCall = !!code && isInCall(document);
      if (!session) {
        if (!inCall) holdUntilLeave = false;
        else if (!starting && !holdUntilLeave) await start(code!);
        return;
      }
      if (!inCall || code !== session.code) {
        if (++missedTicks >= END_AFTER_TICKS) await end();
        return;
      }
      missedTicks = 0;
      scanMessages(session);
      scanRoster(session);
    }

    ctx.setInterval(() => void tick(), TICK_MS);

    browser.runtime.onMessage.addListener((msg: ToContent, _sender, sendResponse) => {
      if (msg.type === 'status') {
        const code = getMeetingCode(location.pathname);
        const status: CaptureStatus = {
          inMeeting: !!code && isInCall(document),
          recording: !!session,
          meetingId: session?.meetingId,
          meetingCode: code ?? undefined,
          title: session?.title,
          messages: sent.size,
          people: people.size,
        };
        sendResponse(status);
      } else if (msg.type === 'end-now') {
        holdUntilLeave = true;
        void end().then(() => sendResponse({ ok: true }));
        return true;
      }
      return undefined;
    });
  },
});
