import type { Report } from './analyze';
import { formatDuration, formatMessageTime, percent } from './format';

export interface Insight {
  tone: 'info' | 'attention' | 'good';
  text: string;
}

/** Plain-language takeaways, most actionable first. */
export function buildInsights(r: Report): Insight[] {
  const out: Insight[] = [];
  const { totals: t } = r;
  if (!t.messages) return [{ tone: 'info', text: 'No chat messages were captured for this meeting.' }];

  const open = r.followUps.filter((f) => f.status === 'needs-follow-up');
  const forHost = open.filter((f) => f.directedAtHost).length;
  if (open.length) {
    out.push({
      tone: 'attention',
      text: `${open.length} question${open.length > 1 ? 's or requests' : ' or request'} got no reply in the chat${forHost ? `, including ${forHost} addressed to you` : ''}.`,
    });
  }

  if (t.silent) {
    out.push({ tone: 'attention', text: `${t.silent} of ${t.attendees} attendees never used the chat.` });
  }

  const top = r.participants[0];
  if (top && t.chatters >= 3 && top.share >= 0.25) {
    out.push({ tone: 'info', text: `${top.name} sent ${percent(top.share)} of all messages (${top.messages} of ${t.messages}).` });
  }

  const once = r.participants.filter((p) => p.messages === 1).length;
  if (once >= 3 && once / Math.max(t.chatters, 1) >= 0.4) {
    out.push({ tone: 'info', text: `${once} of ${t.chatters} people who chatted posted only once.` });
  }

  const longest = [...r.quietGaps].sort((a, b) => b.to - b.from - (a.to - a.from))[0];
  if (longest) {
    out.push({
      tone: 'info',
      text: `The chat went quiet for ${formatDuration(longest.to - longest.from)} (${formatMessageTime(r.meeting, longest.from)}–${formatMessageTime(r.meeting, longest.to)}).`,
    });
  }

  const peak = [...r.timeline].sort((a, b) => b.count - a.count)[0];
  if (peak && peak.count >= 3) {
    out.push({
      tone: 'good',
      text: `Busiest moment: ${formatMessageTime(r.meeting, peak.start)}–${formatMessageTime(r.meeting, peak.end)}, with ${peak.count} messages from ${peak.senders} ${peak.senders === 1 ? 'person' : 'people'}.`,
    });
  }

  const reshared = r.resources.filter((x) => x.shares.length > 1);
  for (const res of reshared.slice(0, 2)) {
    out.push({ tone: 'attention', text: `The same ${res.label} was shared ${res.shares.length} times, so people may have missed it the first time.` });
  }

  const s = r.sentiment;
  out.push({
    tone: s.label.includes('egative') ? 'attention' : s.label.includes('ositive') ? 'good' : 'info',
    text: `Overall mood was ${s.label.toLowerCase()}: ${s.positive} positive, ${s.neutral} neutral and ${s.negative} negative messages.`,
  });
  return out;
}
