import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import type { EngagementLevel } from '@/lib/analyze';
import { initials } from '@/lib/format';
import type { SentimentLabel } from '@/lib/sentiment';

export function Section({ id, title, subtitle, actions, children }: {
  id?: string; title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="section card" id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <header className="section-head">
        <div>
          <h2 id={id ? `${id}-h` : undefined}>{title}</h2>
          {subtitle && <p className="muted section-sub">{subtitle}</p>}
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function StatTile({ label, value, detail, tone }: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'attention' | 'good' }) {
  return (
    <div className={`stat card ${tone ?? ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail && <div className="stat-detail muted">{detail}</div>}
    </div>
  );
}

const SENTIMENT_TEXT: Record<SentimentLabel, string> = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };

export function SentimentChip({ label, score, humor }: { label: SentimentLabel; score?: number | null; humor?: boolean }) {
  return (
    <span className={`chip chip-${label}`} title={score !== undefined && score !== null ? `Score ${score.toFixed(2)} (−1 to +1)` : undefined}>
      <span className="chip-dot" aria-hidden="true" />
      {SENTIMENT_TEXT[label]}
      {humor && <span aria-label="humour"> · 😄</span>}
    </span>
  );
}

export const scoreToLabel = (s: number): SentimentLabel => (s >= 0.05 ? 'positive' : s <= -0.05 ? 'negative' : 'neutral');

export function LevelBadge({ level }: { level: EngagementLevel }) {
  const cls = { 'Highly active': 'lvl-high', Active: 'lvl-active', Occasional: 'lvl-occ', Silent: 'lvl-silent' }[level];
  return <span className={`badge ${cls}`}>{level}</span>;
}

const hueFor = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" style={{ ['--h' as string]: hueFor(name) }} aria-hidden="true">
      {initials(name) || '?'}
    </span>
  );
}

const LINK_SPLIT = /(\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+)/gi;

/** Render chat text with clickable links; React escapes everything else. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(LINK_SPLIT);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p.startsWith('http') ? p : `https://${p}`} target="_blank" rel="noopener noreferrer" className="msg-link">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Track an element's content width for charts that lay out in pixels. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
