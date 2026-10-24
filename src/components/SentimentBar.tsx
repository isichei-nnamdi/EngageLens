import type { Report } from '@/lib/analyze';
import { percent } from '@/lib/format';

/** Share of messages by polarity: one stacked bar, diverging colours, labelled legend. */
export function SentimentBar({ sentiment }: { sentiment: Report['sentiment'] }) {
  const total = sentiment.positive + sentiment.neutral + sentiment.negative;
  if (!total) return <p className="muted">No messages to score.</p>;
  const segments = [
    { key: 'positive', label: 'Positive', n: sentiment.positive },
    { key: 'neutral', label: 'Neutral', n: sentiment.neutral },
    { key: 'negative', label: 'Negative', n: sentiment.negative },
  ].filter((s) => s.n > 0);

  return (
    <div className="sent-bar-wrap">
      <div className="sent-bar" role="img" aria-label={segments.map((s) => `${s.label} ${s.n}`).join(', ')}>
        {segments.map((s) => {
          const share = s.n / total;
          return (
            <div key={s.key} className={`sent-seg seg-${s.key}`} style={{ flexGrow: s.n }} title={`${s.label}: ${s.n} (${percent(share)})`}>
              {share >= 0.12 && <span className="num">{percent(share)}</span>}
            </div>
          );
        })}
      </div>
      <ul className="legend">
        {segments.map((s) => (
          <li key={s.key}>
            <span className={`swatch seg-${s.key}`} aria-hidden="true" />
            {s.label} <span className="num muted">{s.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
