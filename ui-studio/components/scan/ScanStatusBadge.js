import React from 'react';

/**
 * Estados: searching | detected | ready | low_light | capturing
 */
const STATE_CONFIG = {
  searching: {
    label: 'Buscando llave',
    icon: '○',
    className: 'bg-[var(--border)]/60 text-[var(--text-muted)] border-[var(--border)]',
  },
  detected: {
    label: 'Llave detectada',
    icon: '●',
    className: 'bg-[var(--info-muted)] text-[var(--info)] border-[var(--accent)]/40',
  },
  ready: {
    label: 'Lista para analizar',
    icon: '✓',
    className: 'bg-[var(--success-muted)] text-[var(--success)] border-[var(--success)]/40',
  },
  low_light: {
    label: 'Poca luz',
    icon: '◐',
    className: 'bg-[var(--warning-muted)] text-[var(--warning)] border-[var(--warning)]/40',
  },
  capturing: {
    label: 'Capturando…',
    icon: '⋯',
    className: 'bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/50 animate-pulse',
  },
};

export function ScanStatusBadge({ status }) {
  const config = STATE_CONFIG[status] || STATE_CONFIG.searching;
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${config.className}`}
      role="status"
      aria-live="polite"
    >
      <span className="text-sm" aria-hidden>{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
}
