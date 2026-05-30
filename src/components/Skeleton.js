import React from 'react';

/* ── Skeleton shimmer ─────────────────────────────────────────────────────── */
const shimmerStyle = {
  background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.4s ease infinite',
  borderRadius: 6,
};

export function Skeleton({ w = '100%', h = 16, r = 6, mb = 0 }) {
  return (
    <div style={{ ...shimmerStyle, width: w, height: h, borderRadius: r, marginBottom: mb, flexShrink: 0 }} />
  );
}

/* ── Stat card skeleton ──────────────────────────────────────────────────── */
export function StatSkeleton() {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,.07)', borderRadius: 17, padding: '17px 18px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
      <Skeleton w={36} h={36} r={9} mb={12} />
      <Skeleton w="55%" h={22} r={5} mb={7} />
      <Skeleton w="75%" h={12} r={4} />
    </div>
  );
}

/* ── Stats row skeleton ──────────────────────────────────────────────────── */
export function StatsSkeleton({ count = 4 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 13, marginBottom: 18 }}>
      {Array.from({ length: count }, (_, i) => <StatSkeleton key={i} />)}
    </div>
  );
}

/* ── Table row skeleton ──────────────────────────────────────────────────── */
export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div>
      {/* header */}
      <div style={{ display: 'flex', gap: 14, padding: '10px 14px', borderBottom: '1.5px solid rgba(0,0,0,.07)', marginBottom: 2 }}>
        {Array.from({ length: cols }, (_, i) => <Skeleton key={i} w={`${60 + i * 10}px`} h={10} />)}
      </div>
      {/* rows */}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, padding: '14px', borderBottom: '1px solid rgba(0,0,0,.04)', alignItems: 'center' }}>
          {Array.from({ length: cols }, (_, j) => (
            <Skeleton key={j} w={j === 1 ? '30%' : `${55 + j * 12}px`} h={13} r={5} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Card skeleton ───────────────────────────────────────────────────────── */
export function CardSkeleton({ lines = 3 }) {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,.07)', borderRadius: 17, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
      <Skeleton w="40%" h={16} r={5} mb={12} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} w={`${100 - i * 15}%`} h={12} r={4} mb={8} />
      ))}
    </div>
  );
}

/* ── Page loader (full page with skeletons) ──────────────────────────────── */
export function PageLoader({ stats = 4, table = true, cards = 0 }) {
  return (
    <div style={{ padding: '22px 24px', animation: 'fadeIn .2s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Skeleton w={160} h={20} r={5} mb={8} />
          <Skeleton w={220} h={13} r={4} />
        </div>
        <Skeleton w={110} h={34} r={9} />
      </div>

      {stats > 0 && <StatsSkeleton count={stats} />}

      {cards > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards}, 1fr)`, gap: 14, marginBottom: 16 }}>
          {Array.from({ length: cards }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {table && (
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,.07)', borderRadius: 17, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
          <TableSkeleton />
        </div>
      )}
    </div>
  );
}

/* ── Inline spinner (tiny) ───────────────────────────────────────────────── */
export function InlineSpinner({ size = 18, color = 'var(--blue)' }) {
  return (
    <div style={{ width: size, height: size, border: `2px solid ${color}22`, borderTopColor: color, borderRadius: '50%', animation: 'spin .65s linear infinite', flexShrink: 0 }} />
  );
}

/* ── Hub app card skeleton ───────────────────────────────────────────────── */
export function AppCardSkeleton() {
  return (
    <div style={{ borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(0,0,0,.07)', boxShadow: '0 4px 16px rgba(0,0,0,.07)' }}>
      <div style={{ ...shimmerStyle, height: 148 }} />
      <div style={{ background: '#fff', padding: '16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 13 }}>
          {[0,1,2,3].map(i => <div key={i} style={{ ...shimmerStyle, height: 50, borderRadius: 9 }} />)}
        </div>
        <div style={{ ...shimmerStyle, height: 40, borderRadius: 9 }} />
      </div>
    </div>
  );
}

/* ── Hub summary card skeleton ───────────────────────────────────────────── */
export function SumCardSkeleton() {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,.07)', borderRadius: 17, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
      <div style={{ ...shimmerStyle, width: 38, height: 38, borderRadius: 10, marginBottom: 12 }} />
      <Skeleton w="60%" h={20} r={5} mb={7} />
      <Skeleton w="80%" h={11} r={4} mb={5} />
      <Skeleton w="65%" h={10} r={4} />
    </div>
  );
}

export const shimmerKeyframes = `
  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;
