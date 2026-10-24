import { useEffect, useRef, useState } from 'react';
import { formatMeetingDate } from '@/lib/format';
import { meetingFromSbv } from '@/lib/sbv';
import { deleteMeeting, getSettings, listMeetings, onMeetingsChanged, saveMeeting, saveSettings } from '@/lib/storage';
import type { MeetingSummary, Settings } from '@/lib/types';

export function Library() {
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = () => listMeetings().then(setMeetings);
    load();
    getSettings().then(setSettings);
    return onMeetingsChanged(load);
  }, []);

  async function importFiles(files: FileList | File[]) {
    setError('');
    const list = [...files];
    const bad = list.filter((f) => !/\.sbv$/i.test(f.name));
    if (bad.length) setError(`Skipped ${bad.map((f) => f.name).join(', ')}. Only Google Meet chat files (.sbv) can be imported.`);
    let lastId = '';
    const myName = (await getSettings()).myName;
    for (const f of list.filter((x) => /\.sbv$/i.test(x.name))) {
      const m = meetingFromSbv(f.name, await f.text());
      if (!m.messages.length) {
        setError(`${f.name} has no chat messages we could read.`);
        continue;
      }
      if (myName && m.messages.some((x) => x.sender.toLowerCase() === myName.toLowerCase())) m.hostName = myName;
      await saveMeeting(m);
      lastId = m.id;
    }
    if (lastId && list.length === 1) location.hash = `#/report/${encodeURIComponent(lastId)}`;
  }

  async function updateSettings(patch: Partial<Settings>) {
    setSettings(await saveSettings(patch));
  }

  return (
    <div className="library">
      <div
        className={`dropzone card ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          importFiles(e.dataTransfer.files);
        }}
      >
        <div>
          <h2>Analyse a past meeting</h2>
          <p className="muted">
            Drop a Google Meet chat file here. Meet saves it as <code>… - Chat.sbv</code> next to the recording in Google Drive (Meet
            Recordings folder).
          </p>
        </div>
        <button className="btn primary" onClick={() => fileInput.current?.click()}>Choose .sbv file</button>
        <input ref={fileInput} type="file" accept=".sbv" multiple hidden onChange={(e) => e.target.files && importFiles(e.target.files)} />
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="card how">
        <h2>Live meetings</h2>
        <p className="muted">
          Join a call on <strong>meet.google.com</strong> and open the chat panel once. EngageLens records the chat and who is in the call,
          then opens the report as soon as you leave.
        </p>
        {settings && (
          <div className="settings">
            <label>
              <span>Your name in Google Meet</span>
              <input
                className="input"
                defaultValue={settings.myName}
                placeholder="Exactly as it appears in Meet"
                onBlur={(e) => updateSettings({ myName: e.target.value.trim() })}
              />
              <small className="muted">Meet shows your own messages as “You”. This replaces it and flags requests addressed to you.</small>
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.autoOpenReport} onChange={(e) => updateSettings({ autoOpenReport: e.target.checked })} />
              Open the report automatically when a call ends
            </label>
          </div>
        )}
      </div>

      <section className="meetings">
        <h2>Your meetings</h2>
        {meetings === null ? (
          <p className="muted">Loading…</p>
        ) : meetings.length === 0 ? (
          <p className="muted card empty">No meetings yet. Import an .sbv file above or join a Google Meet call.</p>
        ) : (
          <ul className="meeting-list">
            {meetings.map((m) => (
              <li key={m.id} className="card meeting-row">
                <a href={`#/report/${encodeURIComponent(m.id)}`} className="meeting-link">
                  <strong>{m.title}</strong>
                  <span className="muted">
                    {formatMeetingDate(m)} · <span className="num">{m.messageCount}</span> messages · <span className="num">{m.peopleCount}</span> people
                  </span>
                </a>
                <span className="badge">{m.source === 'live' ? 'Live capture' : 'Imported'}</span>
                {m.status === 'recording' && <span className="badge live">Recording</span>}
                <button
                  className="btn ghost sm danger"
                  aria-label={`Delete ${m.title}`}
                  onClick={() => confirm(`Delete “${m.title}”? This can’t be undone.`) && deleteMeeting(m.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
