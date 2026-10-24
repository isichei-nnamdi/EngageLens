import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { formatMeetingDate } from '@/lib/format';
import type { CaptureStatus, ToBackground, ToContent } from '@/lib/messaging';
import { getSettings, listMeetings } from '@/lib/storage';
import type { MeetingSummary } from '@/lib/types';
import '@/styles/theme.css';
import './popup.css';

type TabState =
  | { kind: 'loading' }
  | { kind: 'not-meet' }
  | { kind: 'needs-reload' }
  | { kind: 'meet'; tabId: number; status: CaptureStatus };

const dashboardUrl = (hash = '') => browser.runtime.getURL(`/dashboard.html${hash}`);

function Popup() {
  const [tab, setTab] = useState<TabState>({ kind: 'loading' });
  const [recent, setRecent] = useState<MeetingSummary[]>([]);

  const refresh = async () => {
    const [active] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!active?.id || !active.url?.startsWith('https://meet.google.com/')) return setTab({ kind: 'not-meet' });
    try {
      const status = (await browser.tabs.sendMessage(active.id, { type: 'status' } satisfies ToContent)) as CaptureStatus | undefined;
      setTab(status ? { kind: 'meet', tabId: active.id, status } : { kind: 'needs-reload' });
    } catch {
      setTab({ kind: 'needs-reload' }); // tab was open before the extension was installed or updated
    }
  };

  useEffect(() => {
    refresh();
    listMeetings().then((m) => setRecent(m.slice(0, 3)));
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  const open = (hash = '') => {
    browser.tabs.create({ url: dashboardUrl(hash) });
    window.close();
  };

  const endNow = async (tabId: number, meetingId: string) => {
    await browser.tabs.sendMessage(tabId, { type: 'end-now' } satisfies ToContent);
    // The background opens the report itself when auto-open is on.
    if (!(await getSettings()).autoOpenReport) await browser.runtime.sendMessage({ type: 'open-report', meetingId } satisfies ToBackground);
    window.close();
  };

  return (
    <div className="popup">
      <header>
        <img src="/icon/48.png" alt="" width={28} height={28} />
        <div>
          <strong>EngageLens</strong>
          <div className="muted small">Chat Analytics for Google Meet</div>
        </div>
      </header>

      <section className="status card">
        {tab.kind === 'loading' && <p className="muted">Checking this tab…</p>}
        {tab.kind === 'not-meet' && (
          <p>
            Open a <strong>Google Meet</strong> call and EngageLens will capture its chat automatically.
          </p>
        )}
        {tab.kind === 'needs-reload' && (
          <>
            <p>Reload this Meet tab so EngageLens can start capturing.</p>
            <button className="btn" onClick={() => browser.tabs.reload()}>Reload tab</button>
          </>
        )}
        {tab.kind === 'meet' && !tab.status.inMeeting && !tab.status.recording && (
          <p>Join the call to start capturing. Open the chat panel once so messages can be read.</p>
        )}
        {tab.kind === 'meet' && tab.status.recording && (
          <>
            <p className="recording">
              <span className="dot" aria-hidden="true" /> Capturing chat
            </p>
            <p className="counts">
              <span className="num">{tab.status.messages}</span> messages · <span className="num">{tab.status.people}</span> people seen
            </p>
            {tab.status.messages === 0 && <p className="muted small">No messages yet. Open the chat panel (💬) in Meet.</p>}
            <div className="row">
              <button className="btn" onClick={() => open(`#/report/${encodeURIComponent(tab.status.meetingId!)}`)}>Live report</button>
              <button className="btn primary" onClick={() => endNow(tab.tabId, tab.status.meetingId!)}>End & analyse</button>
            </div>
          </>
        )}
      </section>

      {recent.length > 0 && (
        <section>
          <h2>Recent</h2>
          <ul className="recent">
            {recent.map((m) => (
              <li key={m.id}>
                <button className="recent-item" onClick={() => open(`#/report/${encodeURIComponent(m.id)}`)}>
                  <span className="title">{m.title}</span>
                  <span className="muted small">{formatMeetingDate(m)} · {m.messageCount} msgs</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer>
        <button className="btn primary wide" onClick={() => open()}>Open EngageLens</button>
        <button className="btn wide" onClick={() => open()}>Import .sbv file</button>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
