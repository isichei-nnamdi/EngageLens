import { useEffect, useMemo, useState } from 'react';
import { analyzeMeeting, type ParticipantStats } from '@/lib/analyze';
import { download, messagesCsv, participantsCsv, safeFileName, textSummary } from '@/lib/export';
import { formatDuration, formatMeetingDate, formatMessageTime, percent } from '@/lib/format';
import { buildInsights } from '@/lib/insights';
import { getMeeting, onMeetingsChanged, saveMeeting } from '@/lib/storage';
import type { Meeting } from '@/lib/types';
import { SentimentBar } from './SentimentBar';
import { Timeline } from './Timeline';
import { Avatar, LevelBadge, Linkified, scoreToLabel, Section, SentimentChip, StatTile } from './ui';

type SortKey = 'messages' | 'name' | 'words' | 'questions' | 'sentiment' | 'firstT';

export function Report({ meetingId }: { meetingId: string }) {
  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const load = () => getMeeting(meetingId).then((m) => alive && setMeeting(m ?? null));
    load();
    const off = onMeetingsChanged(load);
    return () => {
      alive = false;
      off();
    };
  }, [meetingId]);

  if (meeting === undefined) return <p className="muted pad">Loading…</p>;
  if (meeting === null)
    return (
      <div className="pad">
        <p>This meeting is no longer saved.</p>
        <a href="#/" className="btn">← All meetings</a>
      </div>
    );
  return <ReportView meeting={meeting} />;
}

function ReportView({ meeting }: { meeting: Meeting }) {
  const report = useMemo(() => analyzeMeeting(meeting), [meeting]);
  const insights = useMemo(() => buildInsights(report), [report]);
  const [copied, setCopied] = useState(false);
  const { totals: t, sentiment: s } = report;
  const base = safeFileName(meeting.title);

  useEffect(() => {
    document.title = `${meeting.title} · EngageLens`;
  }, [meeting.title]);

  const setHost = async (name: string) => {
    await saveMeeting({ ...meeting, hostName: name || undefined, updatedAt: Date.now() });
  };
  const copySummary = async () => {
    await navigator.clipboard.writeText(textSummary(report));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="report">
      <header className="report-head">
        <a href="#/" className="btn ghost sm back">← All meetings</a>
        <div className="report-title-row">
          <div>
            <h1>{meeting.title}</h1>
            <p className="muted meta">
              {formatMeetingDate(meeting)} · {formatDuration(report.durationSec)} ·{' '}
              {meeting.source === 'live' ? 'Captured live' : `Imported from ${meeting.fileName ?? '.sbv'}`}{' '}
              {meeting.status === 'recording' && <span className="badge live">Updating live</span>}
            </p>
          </div>
          <div className="actions no-print">
            <button className="btn" onClick={copySummary}>{copied ? 'Copied ✓' : 'Copy summary'}</button>
            <button className="btn" onClick={() => download(`${base} - participants.csv`, participantsCsv(report))}>Participants CSV</button>
            <button className="btn" onClick={() => download(`${base} - messages.csv`, messagesCsv(report))}>Messages CSV</button>
            <button className="btn primary" onClick={() => window.print()}>Save as PDF</button>
          </div>
        </div>
        <label className="host-pick no-print">
          <span className="muted">You are</span>
          <select value={meeting.hostName ?? ''} onChange={(e) => setHost(e.target.value)}>
            <option value="">Choose yourself to flag requests aimed at you</option>
            {report.participants.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="stats">
        <StatTile label="Messages" value={<span className="num">{t.messages}</span>} detail={`${t.questions} question${t.questions === 1 ? '' : 's'}`} />
        <StatTile
          label="People who chatted"
          value={<span className="num">{t.chatters}</span>}
          detail={meeting.roster.length ? `of ${t.attendees} attendees · ${t.silent} silent` : 'Attendance needs live capture'}
        />
        <StatTile
          label="Mood"
          value={s.label}
          detail={<span className="num">{s.mood}/100 · {s.positive}+ / {s.negative}−</span>}
          tone={s.label.includes('egative') ? 'attention' : s.label.includes('ositive') ? 'good' : undefined}
        />
        <StatTile
          label="Needs follow-up"
          value={<span className="num">{t.needsFollowUp}</span>}
          detail={`${report.followUps.length} questions & requests`}
          tone={t.needsFollowUp ? 'attention' : undefined}
        />
        <StatTile label="Links shared" value={<span className="num">{t.links}</span>} detail={`${report.resources.length} unique`} />
        <StatTile
          label="Top contributor"
          value={<span className="num">{percent(t.topShare)}</span>}
          detail={report.participants[0]?.name ?? 'No messages yet'}
        />
      </div>

      <Section title="Key takeaways">
        <ul className="insights">
          {insights.map((i, k) => (
            <li key={k} className={`insight ${i.tone}`}>
              <span className="insight-icon" aria-hidden="true">{i.tone === 'attention' ? '!' : i.tone === 'good' ? '✓' : 'i'}</span>
              {i.text}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="timeline"
        title="Chat activity over time"
        subtitle={`Messages per ${report.bucketSec / 60}-minute interval. Shaded areas are quiet periods of 10 minutes or more.`}
      >
        <Timeline report={report} />
      </Section>

      <ParticipantsSection participants={report.participants} meeting={meeting} hasRoster={meeting.roster.length > 0} />

      <div className="two-col">
        <Section id="sentiment" title="Sentiment" subtitle="Scored on this device, per message. Link-only messages are excluded.">
          <SentimentBar sentiment={s} />
          <div className="quotes">
            <QuoteList title="Most positive" items={s.topPositive} meeting={meeting} />
            <QuoteList title="Most negative" items={s.topNegative} meeting={meeting} />
          </div>
        </Section>

        <Section
          id="followups"
          title="Questions & requests"
          subtitle="Based on chat only, so anything answered out loud on the call will still show here."
        >
          {report.followUps.length === 0 ? (
            <p className="muted">No questions or requests detected.</p>
          ) : (
            <ul className="followups">
              {[...report.followUps]
                .sort((a, b) => Number(b.directedAtHost) - Number(a.directedAtHost) || (a.status === b.status ? 0 : a.status === 'needs-follow-up' ? -1 : 1))
                .map((f) => (
                  <li key={f.message.id} className={`followup ${f.status}`}>
                    <div className="followup-meta">
                      <span className={`badge ${f.status === 'needs-follow-up' ? 'warn' : 'ok'}`}>
                        {f.status === 'needs-follow-up' ? '● Needs follow-up' : `✓ Reply from ${f.addressedBy}`}
                      </span>
                      <span className="badge">{f.type === 'question' ? 'Question' : 'Request'}</span>
                      {f.directedAtHost && <span className="badge accent">@ You</span>}
                      <span className="muted num">{formatMessageTime(meeting, f.message.t)}</span>
                    </div>
                    <p className="followup-text">
                      <strong>{f.message.sender}:</strong> <Linkified text={f.message.text} />
                    </p>
                  </li>
                ))}
            </ul>
          )}
        </Section>
      </div>

      <Section id="resources" title="Shared resources" subtitle="Duplicate links (e.g. the same Google Doc shared twice) are grouped.">
        {report.resources.length === 0 ? (
          <p className="muted">No links were shared.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Resource</th><th>First shared by</th><th>Time</th><th className="r">Times shared</th></tr>
              </thead>
              <tbody>
                {report.resources.map((r) => (
                  <tr key={r.url}>
                    <td>
                      <a href={r.url} target="_blank" rel="noopener noreferrer">{r.label}</a>
                      <div className="muted url">{r.url}</div>
                    </td>
                    <td>{r.shares[0].name}</td>
                    <td className="num">{formatMessageTime(meeting, r.shares[0].t)}</td>
                    <td className="r num">{r.shares.length}{r.shares.length > 1 && <span className="muted"> · also {[...new Set(r.shares.slice(1).map((x) => x.name))].join(', ')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Transcript report={report} />
      <p className="muted footnote">
        Generated by EngageLens on this device. Sentiment and follow-up detection are automated estimates, so check the quotes before acting on them.
      </p>
    </div>
  );
}

function QuoteList({ title, items, meeting }: { title: string; items: ReturnType<typeof analyzeMeeting>['messages']; meeting: Meeting }) {
  return (
    <div>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">None.</p>
      ) : (
        <ul className="quote-list">
          {items.map((m) => (
            <li key={m.id}>
              <blockquote>{m.text.length > 220 ? `${m.text.slice(0, 220)}…` : m.text}</blockquote>
              <div className="muted small">
                {m.sender} · <span className="num">{formatMessageTime(meeting, m.t)}</span> · <SentimentChip label={m.sentiment.label} score={m.sentiment.score} humor={m.sentiment.humor} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ParticipantsSection({ participants, meeting, hasRoster }: { participants: ParticipantStats[]; meeting: Meeting; hasRoster: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'messages', dir: -1 });
  const [filter, setFilter] = useState<'all' | 'chatted' | 'silent'>('all');
  const maxShare = Math.max(...participants.map((p) => p.share), 0.0001);

  const rows = useMemo(() => {
    const val = (p: ParticipantStats) => {
      const v = p[sort.key];
      return v === null ? -Infinity : v;
    };
    return participants
      .filter((p) => filter === 'all' || (filter === 'chatted' ? p.messages > 0 : p.messages === 0))
      .sort((a, b) => {
        const va = val(a), vb = val(b);
        return (typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
      });
  }, [participants, sort, filter]);

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="th-btn" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : key === 'name' || key === 'firstT' ? 1 : -1 }))}>
        {label}
        {sort.key === key && <span aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span>}
      </button>
    </th>
  );

  return (
    <Section
      id="participants"
      title="Participants"
      subtitle={
        hasRoster
          ? 'Everyone seen in the call. Silent attendees never used the chat.'
          : 'Everyone who used the chat. Silent attendees only appear for meetings captured live.'
      }
      actions={
        hasRoster && (
          <div className="seg-control" role="group" aria-label="Filter participants">
            {(['all', 'chatted', 'silent'] as const).map((f) => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )
      }
    >
      <div className="table-wrap">
        <table className="table participants">
          <thead>
            <tr>
              {th('name', 'Name')}
              <th>Engagement</th>
              {th('messages', 'Messages', 'r')}
              {th('words', 'Words', 'r')}
              {th('questions', 'Questions', 'r')}
              <th className="r">Links</th>
              <th className="r" title="Times other people @mentioned them">Mentioned</th>
              {th('sentiment', 'Sentiment')}
              {th('firstT', 'Active')}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.name} className={p.messages === 0 ? 'silent' : ''}>
                <td>
                  <div className="who">
                    <Avatar name={p.name} />
                    <span>{p.name}</span>
                    {p.isHost && <span className="badge accent">You</span>}
                  </div>
                </td>
                <td><LevelBadge level={p.level} /></td>
                <td className="r">
                  <div className="share">
                    <span className="num">{p.messages}</span>
                    <span className="share-track" aria-hidden="true">
                      <span className="share-fill" style={{ width: `${(p.share / maxShare) * 100}%` }} />
                    </span>
                    <span className="num muted share-pct">{percent(p.share)}</span>
                  </div>
                </td>
                <td className="r num">{p.words}</td>
                <td className="r num">{p.questions}</td>
                <td className="r num">{p.links}</td>
                <td className="r num">{p.mentionsReceived}</td>
                <td>{p.sentiment === null ? <span className="muted">N/A</span> : <SentimentChip label={scoreToLabel(p.sentiment)} score={p.sentiment} />}</td>
                <td className="num muted">
                  {p.firstT === null ? 'N/A' : p.firstT === p.lastT ? formatMessageTime(meeting, p.firstT) : `${formatMessageTime(meeting, p.firstT)}–${formatMessageTime(meeting, p.lastT!)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Transcript({ report }: { report: ReturnType<typeof analyzeMeeting> }) {
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [mood, setMood] = useState('');
  const [onlyQs, setOnlyQs] = useState(false);
  const senders = useMemo(() => report.participants.filter((p) => p.messages).map((p) => p.name).sort(), [report]);
  const rows = report.messages.filter(
    (m) =>
      (!who || m.sender === who) &&
      (!mood || m.sentiment.label === mood) &&
      (!onlyQs || m.isQuestion || m.isRequest) &&
      (!q || `${m.sender} ${m.text}`.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <Section id="transcript" title="Chat transcript" subtitle={`${rows.length} of ${report.messages.length} messages`}>
      <div className="filters no-print">
        <input className="input" type="search" placeholder="Search messages…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search messages" />
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
          <option value="">Everyone</option>
          {senders.map((n) => <option key={n}>{n}</option>)}
        </select>
        <select value={mood} onChange={(e) => setMood(e.target.value)} aria-label="Filter by sentiment">
          <option value="">Any sentiment</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
        <label className="check"><input type="checkbox" checked={onlyQs} onChange={(e) => setOnlyQs(e.target.checked)} /> Questions & requests</label>
      </div>
      <ol className="transcript">
        {rows.map((m) => (
          <li key={m.id}>
            <span className="t num muted">{formatMessageTime(report.meeting, m.t)}</span>
            <Avatar name={m.sender} />
            <div className="body">
              <div className="line1">
                <strong>{m.sender}</strong>
                {m.kind !== 'link' && m.sentiment.label !== 'neutral' && <SentimentChip label={m.sentiment.label} score={m.sentiment.score} humor={m.sentiment.humor} />}
                {m.isQuestion && <span className="badge">Question</span>}
                {!m.isQuestion && m.isRequest && <span className="badge">Request</span>}
              </div>
              <div className="text"><Linkified text={m.text} /></div>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
