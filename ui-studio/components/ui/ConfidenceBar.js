import React from 'react';

/**
 * ConfidenceBar — barra de confianza 0–100
 */
export function ConfidenceBar({ value = 0, className = '' }) {
  const pct = Math.round(Math.max(0, Math.min(100, value * 100)));
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-[var(--text-secondary)] w-8">{pct}%</span>
    </div>
  );
}
