import React from 'react';

/**
 * Estado del análisis (idle | analyzing | analyze_error | analyze_success).
 * Solo visible cuando hay relevancia (analyzing, error, success).
 * idle no se muestra para no redundar.
 */
const STATE_CONFIG = {
  idle: {
    label: '',
    icon: '',
    className: '',
    hidden: true,
  },
  analyzing: {
    label: 'Analizando…',
    icon: '⋯',
    className: 'bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/50 animate-pulse',
    hidden: false,
  },
  analyze_error: {
    label: 'Error al analizar',
    icon: '!',
    className: 'bg-[var(--danger-muted)] text-[var(--danger)] border-[var(--danger)]/40',
    hidden: false,
  },
  analyze_success: {
    label: 'Análisis completado',
    icon: '✓',
    className: 'bg-[var(--success-muted)] text-[var(--success)] border-[var(--success)]/40',
    hidden: false,
  },
};

export function AnalyzeStateBadge({ status }) {
  const config = STATE_CONFIG[status] || STATE_CONFIG.idle;
  if (config.hidden || !config.label) return null;
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
