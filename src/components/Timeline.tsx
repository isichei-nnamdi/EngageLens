import { useState } from 'react';
import type { Report } from '@/lib/analyze';
import { formatDuration, formatMessageTime } from '@/lib/format';
import { useWidth } from './ui';

const H = 220;
const M = { top: 16, right: 12, bottom: 28, left: 32 };

const niceMax = (v: number) => {
  if (v <= 4) return Math.max(v, 1);
  const step = v <= 10 ? 2 : v <= 25 ? 5 : 10;
  return Math.ceil(v / step) * step;
};

/** Messages per time bucket, single series, with quiet periods shaded. */
export function Timeline({ report }: { report: Report }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { timeline, quietGaps, meeting, durationSec } = report;
  if (!timeline.length) return null;

  const innerW = width - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const maxY = niceMax(Math.max(...timeline.map((b) => b.count)));
  const ticks = maxY <= 4 ? Array.from({ length: maxY + 1 }, (_, i) => i) : [0, maxY / 2, maxY];
  const x = (t: number) => M.left + (t / durationSec) * innerW;
  const y = (v: number) => M.top + innerH - (v / maxY) * innerH;
  const band = innerW / timeline.length;
  const barW = Math.max(2, Math.min(24, band - 2));

  // ~6 time labels regardless of width.
  const labelEvery = Math.max(1, Math.ceil(timeline.length / Math.max(2, Math.floor(innerW / 90))));
  const hovered = hover !== null ? timeline[hover] : null;

  return (
    <div className="timeline" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={`Chat messages per ${report.bucketSec / 60}-minute interval`}>
        {quietGaps.map((g, i) => (
          <g key={i}>
            <rect x={x(g.from)} y={M.top} width={Math.max(1, x(g.to) - x(g.from))} height={innerH} fill="var(--quiet-wash)" />
            {x(g.to) - x(g.from) > 64 && (
              <text x={(x(g.from) + x(g.to)) / 2} y={M.top + 12} textAnchor="middle" className="axis-label">
                Quiet · {formatDuration(g.to - g.from)}
              </text>
            )}
          </g>
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
            <text x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="axis-label num">
              {v}
            </text>
          </g>
        ))}
        {timeline.map((b, i) => {
          const cx = M.left + band * i + band / 2;
          const h = y(0) - y(b.count);
          const r = Math.min(4, h, barW / 2);
          const x0 = cx - barW / 2;
          const top = y(b.count);
          return (
            <g key={b.start}>
              {b.count > 0 && (
                <path
                  d={`M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${y(0)} Z`}
                  fill="var(--series-1)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="axis-label num">
                  {formatMessageTime(meeting, b.start)}
                </text>
              )}
              <rect
                x={M.left + band * i}
                y={M.top}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && hover !== null && (
        <div
          className="tooltip"
          style={{ left: Math.min(width - 180, Math.max(0, M.left + band * hover + band / 2 - 90)), top: Math.max(0, y(hovered.count) - 64) }}
          role="status"
        >
          <strong className="num">
            {formatMessageTime(meeting, hovered.start)}–{formatMessageTime(meeting, hovered.end)}
          </strong>
          <div className="num">
            {hovered.count} message{hovered.count === 1 ? '' : 's'} · {hovered.senders} {hovered.senders === 1 ? 'person' : 'people'}
          </div>
        </div>
      )}
    </div>
  );
}
